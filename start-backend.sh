#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$ROOT_DIR/.venv"
ENV_FILE="$ROOT_DIR/backend/.env"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

PYTHON_BIN="${PYTHON_BIN:-/opt/ohpc/home/jie/.conda/envs/vllm16/bin/python}"
BACKEND_HOST="${BACKEND_HOST:-0.0.0.0}"
BACKEND_PORT="${BACKEND_PORT:-8008}"
BACKEND_RELOAD="${BACKEND_RELOAD:-0}"

if [ ! -x "$PYTHON_BIN" ]; then
  echo "找不到 Python: $PYTHON_BIN"
  echo "可以这样启动：PYTHON_BIN=/你的/python ./start-backend.sh"
  exit 1
fi

if [ ! -x "$VENV_DIR/bin/python" ]; then
  "$PYTHON_BIN" -m venv "$VENV_DIR"
fi

hash_file() {
  "$VENV_DIR/bin/python" - "$1" <<'PY'
import hashlib
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
print(hashlib.sha256(path.read_bytes()).hexdigest())
PY
}

REQ_FILE="$ROOT_DIR/backend/requirements.txt"
REQ_STAMP_FILE="$VENV_DIR/.requirements.sha256"
REQ_HASH="$(hash_file "$REQ_FILE")"
INSTALLED_REQ_HASH=""

if [ -f "$REQ_STAMP_FILE" ]; then
  INSTALLED_REQ_HASH="$(cat "$REQ_STAMP_FILE")"
fi

if [ "$REQ_HASH" != "$INSTALLED_REQ_HASH" ]; then
  "$VENV_DIR/bin/python" -m pip install -r "$REQ_FILE"
  printf '%s\n' "$REQ_HASH" > "$REQ_STAMP_FILE"
else
  echo "backend dependencies unchanged, skipping pip install"
fi

UVICORN_ARGS=(
  app.main:app
  --app-dir "$ROOT_DIR/backend"
  --host "$BACKEND_HOST"
  --port "$BACKEND_PORT"
)

if [ "$BACKEND_RELOAD" = "1" ]; then
  UVICORN_ARGS+=(--reload)
fi

exec "$VENV_DIR/bin/python" -m uvicorn "${UVICORN_ARGS[@]}"
