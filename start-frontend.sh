#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
ENV_FILE="$ROOT_DIR/backend/.env"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "找不到 npm，请先安装 Node.js 和 npm"
  exit 1
fi

FRONTEND_HOST="${FRONTEND_HOST:-0.0.0.0}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
FRONTEND_PREVIEW_PORT="${FRONTEND_PREVIEW_PORT:-4173}"
FRONTEND_MODE="${FRONTEND_MODE:-dev}"

if [ -z "${VITE_API_BASE_URL:-}" ] && [ -z "${VITE_API_PORT:-}" ] && [ -n "${BACKEND_PORT:-}" ]; then
  export VITE_API_PORT="$BACKEND_PORT"
fi

hash_file() {
  node -e "const crypto = require('crypto'); const fs = require('fs'); process.stdout.write(crypto.createHash('sha256').update(fs.readFileSync(process.argv[1])).digest('hex'));" "$1"
}

LOCK_FILE="$FRONTEND_DIR/package-lock.json"
LOCK_STAMP_FILE="$FRONTEND_DIR/node_modules/.package-lock.sha256"
LOCK_HASH="$(hash_file "$LOCK_FILE")"
INSTALLED_LOCK_HASH=""

if [ -f "$LOCK_STAMP_FILE" ]; then
  INSTALLED_LOCK_HASH="$(cat "$LOCK_STAMP_FILE")"
fi

if [ ! -d "$FRONTEND_DIR/node_modules" ] || [ "$LOCK_HASH" != "$INSTALLED_LOCK_HASH" ]; then
  npm ci --prefix "$FRONTEND_DIR"
  printf '%s\n' "$LOCK_HASH" > "$LOCK_STAMP_FILE"
else
  echo "frontend dependencies unchanged, skipping npm ci"
fi

if [ "$FRONTEND_MODE" = "preview" ]; then
  npm run build --prefix "$FRONTEND_DIR"
  exec npm run preview --prefix "$FRONTEND_DIR" -- --host "$FRONTEND_HOST" --port "$FRONTEND_PREVIEW_PORT" --strictPort
fi

if [ "$FRONTEND_MODE" != "dev" ]; then
  echo "不支持的 FRONTEND_MODE: $FRONTEND_MODE"
  echo "可选值：dev、preview"
  exit 1
fi

exec npm run dev --prefix "$FRONTEND_DIR" -- --host "$FRONTEND_HOST" --port "$FRONTEND_PORT" --strictPort
