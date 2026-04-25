#!/usr/bin/env bash

port_is_listening() {
  local port="$1"
  ss -ltn "( sport = :$port )" 2>/dev/null | tail -n +2 | grep -q LISTEN
}

find_next_free_port() {
  local port="$1"
  while port_is_listening "$port"; do
    port=$((port + 1))
  done
  printf '%s\n' "$port"
}

is_ai_teacher_backend_running_on_port() {
  local port="$1"
  local response

  response="$(curl -fsS --max-time 2 "http://127.0.0.1:$port/" 2>/dev/null || true)"
  grep -q '"app":"AI Teacher Classroom"' <<<"$response"
}

resolve_backend_binding() {
  local preferred_port="$1"

  if ! port_is_listening "$preferred_port"; then
    printf 'start %s\n' "$preferred_port"
    return 0
  fi

  if is_ai_teacher_backend_running_on_port "$preferred_port"; then
    printf 'reuse %s\n' "$preferred_port"
    return 0
  fi

  printf 'start %s\n' "$(find_next_free_port "$((preferred_port + 1))")"
}

get_first_lan_ip() {
  local lan_ip
  lan_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  printf '%s\n' "${lan_ip:-127.0.0.1}"
}

wait_for_url() {
  local url="$1"
  local max_attempts="${2:-30}"
  local attempt=0

  while [ "$attempt" -lt "$max_attempts" ]; do
    if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 1
  done

  return 1
}

write_runtime_env() {
  local output_file="$1"
  shift

  mkdir -p "$(dirname "$output_file")"
  : > "$output_file"

  while [ "$#" -ge 2 ]; do
    printf '%s=%q\n' "$1" "$2" >> "$output_file"
    shift 2
  done
}
