#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/startup_lib.sh"

assert_eq() {
  local expected="$1"
  local actual="$2"
  local message="$3"
  if [ "$expected" != "$actual" ]; then
    echo "assertion failed: $message"
    echo "expected: $expected"
    echo "actual:   $actual"
    exit 1
  fi
}

test_find_next_free_port_skips_busy_ports() {
  port_is_listening() {
    case "$1" in
      5173|5174) return 0 ;;
      *) return 1 ;;
    esac
  }

  local resolved
  resolved="$(find_next_free_port 5173)"
  assert_eq "5175" "$resolved" "find_next_free_port should skip busy ports"
}

test_resolve_backend_binding_reuses_matching_backend() {
  port_is_listening() {
    [ "$1" = "8008" ]
  }

  is_ai_teacher_backend_running_on_port() {
    [ "$1" = "8008" ]
  }

  local action port
  read -r action port <<<"$(resolve_backend_binding 8008)"
  assert_eq "reuse" "$action" "backend binding should reuse current app backend"
  assert_eq "8008" "$port" "backend binding should keep the occupied app port"
}

test_resolve_backend_binding_moves_when_other_service_occupies_port() {
  port_is_listening() {
    case "$1" in
      8008|8009) return 0 ;;
      *) return 1 ;;
    esac
  }

  is_ai_teacher_backend_running_on_port() {
    return 1
  }

  local action port
  read -r action port <<<"$(resolve_backend_binding 8008)"
  assert_eq "start" "$action" "backend binding should start a new backend when another service occupies the default port"
  assert_eq "8010" "$port" "backend binding should move to the next free port"
}

test_find_next_free_port_skips_busy_ports
test_resolve_backend_binding_reuses_matching_backend
test_resolve_backend_binding_moves_when_other_service_occupies_port

echo "startup_lib tests passed"
