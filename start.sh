#!/usr/bin/env bash
# =============================================================================
# TalentIQ launcher (Linux / macOS / Docker)
# -----------------------------------------------------------------------------
# Shell equivalent of start.bat. Starts the FastAPI backend (:8000) and the
# Vite frontend (:5173). Written to double as a Docker ENTRYPOINT:
#   - binds to 0.0.0.0 so the services are reachable from outside a container
#   - forwards SIGTERM/SIGINT to the child processes so `docker stop` is clean
#   - stays in the foreground (does not exit) so it can run as PID 1
#
# Everything is overridable via environment variables (see "Config" below), e.g.
#   SKIP_INSTALL=1 PYTHON_BIN=python3 ./start.sh   # deps baked into the image
#   RUN_FRONTEND=0 ./start.sh                       # backend-only container
# =============================================================================
set -euo pipefail

# --- Resolve the project root (folder this script lives in) ------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR"
BACKEND_DIR="$ROOT/talentiq-backend"
FRONTEND_DIR="$ROOT/talentiq-Frontend"

# --- Config (override with env vars) -----------------------------------------
BACKEND_HOST="${BACKEND_HOST:-0.0.0.0}"     # 0.0.0.0 => reachable from outside the container
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_HOST="${FRONTEND_HOST:-0.0.0.0}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
RUN_BACKEND="${RUN_BACKEND:-1}"             # set 0 to skip the backend
RUN_FRONTEND="${RUN_FRONTEND:-1}"           # set 0 to skip the frontend
SKIP_INSTALL="${SKIP_INSTALL:-0}"           # set 1 when deps are already installed (e.g. baked into image)
PYTHON_BIN="${PYTHON_BIN:-}"                # explicit python (e.g. python3); default: use/create .venv

# --- Pretty output -----------------------------------------------------------
log()  { printf '\n\033[36m>> %s\033[0m\n' "$*"; }
ok()   { printf '   \033[32m[OK]\033[0m %s\n' "$*"; }
warn() { printf '   \033[33m[!]\033[0m %s\n' "$*"; }
err()  { printf '   \033[31m[X]\033[0m %s\n' "$*" >&2; }

# --- Sanity checks -----------------------------------------------------------
[ -f "$BACKEND_DIR/app/main.py" ]     || { err "Backend not found at $BACKEND_DIR"; exit 1; }
[ -f "$FRONTEND_DIR/package.json" ]   || { err "Frontend not found at $FRONTEND_DIR"; exit 1; }
if [ "$RUN_BACKEND" != "1" ] && [ "$RUN_FRONTEND" != "1" ]; then
    err "Nothing to run: both RUN_BACKEND and RUN_FRONTEND are disabled."
    exit 1
fi

# --- Child-process bookkeeping + clean shutdown ------------------------------
PIDS=()
cleanup() {
    trap - TERM INT EXIT
    warn "Shutting down TalentIQ..."
    for pid in "${PIDS[@]:-}"; do
        [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && kill "$pid" 2>/dev/null || true
    done
    wait 2>/dev/null || true
}
trap 'cleanup; exit 143' TERM INT

# --- Backend: resolve python, install deps -----------------------------------
resolve_python() {
    if [ -n "$PYTHON_BIN" ]; then return; fi
    if [ -x "$BACKEND_DIR/.venv/bin/python" ]; then
        PYTHON_BIN="$BACKEND_DIR/.venv/bin/python"; return
    fi
    if [ "$SKIP_INSTALL" = "1" ]; then
        PYTHON_BIN="$(command -v python3 || command -v python || true)"
        [ -n "$PYTHON_BIN" ] || { err "Python not found on PATH."; exit 1; }
        return
    fi
    local base
    base="$(command -v python3 || command -v python || true)"
    [ -n "$base" ] || { err "Python 3.11+ not found. Please install it and retry."; exit 1; }
    log "Creating backend virtual environment (.venv)..."
    "$base" -m venv "$BACKEND_DIR/.venv"
    PYTHON_BIN="$BACKEND_DIR/.venv/bin/python"
}

setup_backend() {
    log "Checking Python environment..."
    resolve_python
    if [ "$SKIP_INSTALL" != "1" ]; then
        if ! "$PYTHON_BIN" -c "import fastapi, uvicorn, sqlalchemy, pandas, openpyxl" >/dev/null 2>&1; then
            log "Installing backend dependencies (one-time)..."
            "$PYTHON_BIN" -m pip install --upgrade pip setuptools wheel
            "$PYTHON_BIN" -m pip install --prefer-binary -r "$BACKEND_DIR/requirements.txt"
        else
            ok "Backend dependencies ready."
        fi
    fi
    if [ -z "${DATABASE_URL:-}" ] && [ ! -f "$BACKEND_DIR/.env" ]; then
        warn "No DATABASE_URL env var and no talentiq-backend/.env found."
        warn "The backend needs a PostgreSQL connection to start."
    fi
}

# --- Frontend: install deps --------------------------------------------------
setup_frontend() {
    log "Checking frontend environment..."
    command -v npm >/dev/null 2>&1 || { err "npm (Node.js) not found. Install Node.js LTS."; exit 1; }
    if [ "$SKIP_INSTALL" != "1" ]; then
        if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
            log "Installing frontend dependencies (one-time)..."
            ( cd "$FRONTEND_DIR" && npm install )
        else
            ok "Frontend dependencies ready."
        fi
    fi
}

# --- Boot --------------------------------------------------------------------
echo "========================================"
echo "          Starting TalentIQ"
echo "========================================"

if [ "$RUN_BACKEND" = "1" ];  then setup_backend;  fi
if [ "$RUN_FRONTEND" = "1" ]; then setup_frontend; fi

if [ "$RUN_BACKEND" = "1" ]; then
    log "Starting backend on ${BACKEND_HOST}:${BACKEND_PORT} ..."
    ( cd "$BACKEND_DIR" && exec "$PYTHON_BIN" -m uvicorn app.main:app \
        --host "$BACKEND_HOST" --port "$BACKEND_PORT" ) &
    PIDS+=("$!")
    ok "Backend PID $!"
fi

if [ "$RUN_FRONTEND" = "1" ]; then
    log "Starting frontend on ${FRONTEND_HOST}:${FRONTEND_PORT} ..."
    ( cd "$FRONTEND_DIR" && exec npm run dev -- \
        --host "$FRONTEND_HOST" --port "$FRONTEND_PORT" ) &
    PIDS+=("$!")
    ok "Frontend PID $!"
fi

echo
ok "TalentIQ is starting."
[ "$RUN_FRONTEND" = "1" ] && echo "   Frontend: http://localhost:${FRONTEND_PORT}"
[ "$RUN_BACKEND"  = "1" ] && echo "   Backend:  http://localhost:${BACKEND_PORT}  (docs at /docs)"
echo "   Press Ctrl+C to stop."
echo

# Wait for the first service to exit, then bring the rest down and exit with
# its status (so the container stops if either process crashes).
set +e
wait -n
EXIT_CODE=$?
set -e
cleanup
exit "$EXIT_CODE"
