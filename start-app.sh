#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_DIR="$ROOT_DIR/.runtime"
ENV_FILE="$ROOT_DIR/backend/.env"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/startup_lib.sh"

BACKEND_PORT="${BACKEND_PORT:-8008}"
BACKEND_RELOAD="${BACKEND_RELOAD:-0}"
FRONTEND_MODE="${FRONTEND_MODE:-dev}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
FRONTEND_PREVIEW_PORT="${FRONTEND_PREVIEW_PORT:-4173}"

if [ "$FRONTEND_MODE" = "preview" ]; then
  preferred_frontend_port="$FRONTEND_PREVIEW_PORT"
else
  preferred_frontend_port="$FRONTEND_PORT"
fi

read -r backend_action resolved_backend_port <<<"$(resolve_backend_binding "$BACKEND_PORT")"
resolved_frontend_port="$(find_next_free_port "$preferred_frontend_port")"
lan_ip="$(get_first_lan_ip)"

backend_pid=""
backend_started="0"

cleanup() {
  if [ "$backend_started" = "1" ] && [ -n "$backend_pid" ]; then
    kill "$backend_pid" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

mkdir -p "$RUNTIME_DIR"

if [ "$backend_action" = "reuse" ]; then
  echo "backend already running on port $resolved_backend_port, reusing it"
else
  echo "starting backend on port $resolved_backend_port"
  BACKEND_PORT="$resolved_backend_port" BACKEND_RELOAD="$BACKEND_RELOAD" \
    "$ROOT_DIR/start-backend.sh" >"$RUNTIME_DIR/backend.log" 2>&1 &
  backend_pid="$!"
  backend_started="1"

  if ! wait_for_url "http://127.0.0.1:$resolved_backend_port/" 30; then
    echo "backend did not become ready, check $RUNTIME_DIR/backend.log"
    exit 1
  fi
fi

if [ "$preferred_frontend_port" != "$resolved_frontend_port" ]; then
  echo "frontend preferred port $preferred_frontend_port is busy, using $resolved_frontend_port instead"
fi

write_runtime_env "$RUNTIME_DIR/backend.env" \
  BACKEND_PORT "$resolved_backend_port" \
  BACKEND_STATUS "$backend_action"

write_runtime_env "$RUNTIME_DIR/frontend.env" \
  FRONTEND_MODE "$FRONTEND_MODE" \
  FRONTEND_PORT "$resolved_frontend_port" \
  VITE_API_PORT "${VITE_API_PORT:-$resolved_backend_port}"

echo
echo "AI Teacher Classroom"
echo "frontend: http://127.0.0.1:$resolved_frontend_port"
echo "backend:  http://127.0.0.1:$resolved_backend_port"
echo "LAN:      http://$lan_ip:$resolved_frontend_port"
if [ "$backend_started" = "1" ]; then
  echo "backend log: $RUNTIME_DIR/backend.log"
fi
echo

if [ "$FRONTEND_MODE" = "preview" ]; then
  FRONTEND_PREVIEW_PORT="$resolved_frontend_port" \
    VITE_API_PORT="${VITE_API_PORT:-$resolved_backend_port}" \
    "$ROOT_DIR/start-frontend.sh"
else
  FRONTEND_PORT="$resolved_frontend_port" \
    VITE_API_PORT="${VITE_API_PORT:-$resolved_backend_port}" \
    "$ROOT_DIR/start-frontend.sh"
fi
