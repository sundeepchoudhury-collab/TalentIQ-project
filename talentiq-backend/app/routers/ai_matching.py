"""
OpenAI-backed resource matching endpoints.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from typing import Any

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from openai import OpenAI
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AiMatchCache


router = APIRouter(prefix="/api/ai", tags=["ai"])
MEMORY_CACHE: dict[str, dict[str, Any]] = {}
MEMORY_CACHE_MAX = 500


class PositionPayload(BaseModel):
    id: str | None = None
    jobTitle: str | None = None
    grade: str | None = None
    skills: list[str] = Field(default_factory=list)


class ResourcePayload(BaseModel):
    id: str
    grade: str | None = None
    skills: list[str] = Field(default_factory=list)


class ResourceMatchRequest(BaseModel):
    position: PositionPayload
    resources: list[ResourcePayload]


MATCH_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["summary", "recommendation", "matches"],
    "properties": {
        "summary": {"type": "string"},
        "recommendation": {"type": "string"},
        "matches": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    "id",
                    "score",
                    "confidence",
                    "reasoning",
                    "strengths",
                    "gaps",
                ],
                "properties": {
                    "id": {"type": "string"},
                    "score": {"type": "integer", "minimum": 0, "maximum": 100},
                    "confidence": {
                        "type": "string",
                        "enum": ["High", "Medium", "Low"],
                    },
                    "reasoning": {"type": "string"},
                    "strengths": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "gaps": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                },
            },
        },
    },
}

def _normalize_token(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().lower())


def _signature_payload(position: PositionPayload, resources: list[ResourcePayload]) -> dict[str, Any]:
    return {
        "position": {
            "id": _normalize_token(position.id),
            "jobTitle": _normalize_token(position.jobTitle),
            "grade": _normalize_token(position.grade),
            "skills": sorted({_normalize_token(s) for s in position.skills if _normalize_token(s)}),
        },
        "resources": sorted(
            [
                {
                    "id": _normalize_token(r.id),
                    "grade": _normalize_token(r.grade),
                    "skills": sorted({_normalize_token(s) for s in r.skills if _normalize_token(s)}),
                }
                for r in resources
            ],
            key=lambda row: row["id"],
        ),
    }


def _cache_key(position: PositionPayload, resources: list[ResourcePayload], model: str) -> tuple[str, str, str]:
    signature = _signature_payload(position, resources)
    position_signature = json.dumps(signature["position"], sort_keys=True, separators=(",", ":"))
    resource_signature = json.dumps(signature["resources"], sort_keys=True, separators=(",", ":"))
    raw = json.dumps(
        {
            "model": model,
            "position": signature["position"],
            "resources": signature["resources"],
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest(), position_signature, resource_signature


def _remember(cache_key: str, result: dict[str, Any]) -> None:
    if len(MEMORY_CACHE) >= MEMORY_CACHE_MAX:
        MEMORY_CACHE.pop(next(iter(MEMORY_CACHE)))
    MEMORY_CACHE[cache_key] = result


def _cached_response(result: dict[str, Any], source: str) -> dict[str, Any]:
    out = dict(result)
    out["cached"] = True
    out["cache_source"] = source
    out["llm_call_count"] = 0
    return out


def _read_cached_result(db: Session, cache_key: str) -> dict[str, Any] | None:
    if cache_key in MEMORY_CACHE:
        return _cached_response(MEMORY_CACHE[cache_key], "memory")

    row = db.query(AiMatchCache).filter(AiMatchCache.cache_key == cache_key).first()
    if not row:
        return None

    row.last_accessed_at = datetime.utcnow()
    row.access_count = (row.access_count or 0) + 1
    db.commit()
    result = json.loads(row.result_json)
    _remember(cache_key, result)
    return _cached_response(result, "database")


def _write_cached_result(
    db: Session,
    cache_key: str,
    position_signature: str,
    resource_signature: str,
    stage1_model: str,
    stage2_model: str,
    position_id: str | None,
    result: dict[str, Any],
) -> None:
    row = AiMatchCache(
        cache_key=cache_key,
        position_id=position_id,
        position_signature=position_signature,
        resource_signature=resource_signature,
        stage1_model=stage1_model,
        stage2_model=stage2_model,
        result_json=json.dumps(result),
    )
    db.add(row)
    try:
        db.commit()
    except Exception:
        db.rollback()
    _remember(cache_key, result)


def _build_prompt(position: PositionPayload, resources: list[ResourcePayload]) -> str:
    pos_line = "\n".join(
        [
            f"Req ID: {position.id or 'Not specified'}",
            f"Job Title: {position.jobTitle or 'Not specified'}",
            f"Grade Required: {position.grade or 'Not specified'}",
            f"Required Skills: {', '.join(position.skills) or 'Not specified'}",
        ]
    )

    resource_lines = "\n".join(
        [
            (
                f"{r.id} | Grade:{r.grade or '?'} | "
                f"Skills: {', '.join(r.skills[:16])}"
                f"{' [+' + str(len(r.skills) - 16) + ' more]' if len(r.skills) > 16 else ''}"
            )
            for r in resources
        ]
    )

    return f"""You are a senior technical recruiter doing an expert skill match review.

OPEN POSITION:
{pos_line}

BENCH RESOURCES (format: Resource ID | Grade | Skills):
{resource_lines}

Evaluate each resource and identify the best matches for this position. Go beyond keyword matching:
- Treat skill synonyms as equivalent, for example JS = JavaScript, React = ReactJS, ML = Machine Learning.
- Recognize when a broader skill implies a narrower one, for example Full Stack covers frontend and backend.
- Account for grade proximity. Within 2 levels is acceptable.
- Note skill gaps clearly, but do not penalize for skills not commonly listed alongside the core skills.

Rules:
- Only include resources with score >= 30.
- Sort matches by score descending.
- Limit to the top 15 matches.
- confidence must be High for scores >= 80, Medium for scores >= 60, and Low for scores < 60.
- score is 0-100.
- Keep summary, recommendation, reasoning, strengths, and gaps concise.
"""


def _parse_json_text(text: str) -> dict[str, Any]:
    cleaned = re.sub(r"```(?:json)?|```", "", text, flags=re.IGNORECASE).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"OpenAI returned invalid JSON: {text[:200]}",
        ) from exc


def _call_structured(client: OpenAI, model: str, system: str, prompt: str, schema_name: str, schema: dict[str, Any], max_output_tokens: int) -> dict[str, Any]:
    response = client.responses.create(
        model=model,
        input=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        text={
            "format": {
                "type": "json_schema",
                "name": schema_name,
                "schema": schema,
                "strict": True,
            }
        },
        max_output_tokens=max_output_tokens,
    )
    return _parse_json_text(response.output_text)


@router.post("/resource-matches")
def create_resource_matches(payload: ResourceMatchRequest, db: Session = Depends(get_db)):
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="OPENAI_API_KEY is not configured in talentiq-backend/.env",
        )

    if not payload.position.skills:
        return {"summary": "", "recommendation": "", "matches": [], "skipped": True, "skip_reason": "Position has no skills.", "llm_call_count": 0}

    if not payload.resources:
        return {"summary": "", "recommendation": "", "matches": [], "llm_call_count": 0}

    # OPENAI_MODEL is the public setting documented in .env.example. Keep the
    # older names as compatibility fallbacks for installations configured on
    # another computer.
    model = (
        os.getenv("OPENAI_STAGE1_MODEL")
        or os.getenv("OPENAI_MODEL")
        or os.getenv("OPENAI_SIMPLE_MODEL")
        or "gpt-5-mini"
    )
    cache_key, position_signature, resource_signature = _cache_key(payload.position, payload.resources, model)
    cached = _read_cached_result(db, cache_key)
    if cached:
        return cached

    client = OpenAI(api_key=api_key)

    try:
        parsed = _call_structured(
            client,
            model,
            "Return only structured JSON matching the provided schema. Use only resource IDs present in the input.",
            _build_prompt(payload.position, payload.resources),
            "resource_match_result",
            MATCH_SCHEMA,
            1600,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"OpenAI request failed: {exc}") from exc

    valid_ids = {r.id for r in payload.resources}
    matches = [
        match
        for match in parsed.get("matches", [])
        if str(match.get("id")) in valid_ids
    ]

    result = {
        "summary": parsed.get("summary", ""),
        "recommendation": parsed.get("recommendation", ""),
        "matches": matches,
        "cached": False,
        "cache_source": None,
        "stage1_model": model,
        "stage2_model": None,
        "stage1_candidate_count": len(payload.resources),
        "stage2_candidate_count": 0,
        "llm_call_count": 1,
    }
    _write_cached_result(
        db,
        cache_key,
        position_signature,
        resource_signature,
        model,
        "none",
        payload.position.id,
        result,
    )
    return result
