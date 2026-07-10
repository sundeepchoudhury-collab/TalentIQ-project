# TalentIQ backend — FastAPI + uvicorn on PostgreSQL
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install dependencies first so this layer is cached unless requirements change.
# psycopg[binary], pandas and openpyxl all ship manylinux wheels, so no
# system build tools are needed on the slim image.
COPY requirements.txt ./
RUN pip install --upgrade pip && \
    pip install --prefer-binary -r requirements.txt

# Application code
COPY . .

EXPOSE 8000

# DATABASE_URL / CORS_ORIGINS / OPENAI_* are provided at runtime (see docker-compose.yml).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
