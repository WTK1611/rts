#!/bin/sh
# Startet (oder startet neu) die komplette Dev-Umgebung: Server (tsx watch) + Vite-Client.
set -e

SERVER_PORT="${PORT:-8787}"
CLIENT_PORT="${VITE_PORT:-5173}"

kill_port() {
  PORT="$1"
  PIDS=$(lsof -ti:"$PORT" 2>/dev/null || true)
  if [ -n "$PIDS" ]; then
    echo "[start] killing processes on :$PORT ($PIDS)"
    kill $PIDS 2>/dev/null || true
    sleep 0.3
    PIDS=$(lsof -ti:"$PORT" 2>/dev/null || true)
    if [ -n "$PIDS" ]; then
      echo "[start] forcing SIGKILL on :$PORT ($PIDS)"
      kill -9 $PIDS 2>/dev/null || true
    fi
  fi
}

kill_pattern() {
  LABEL="$1"
  PATTERN="$2"
  PIDS=$(pgrep -f "$PATTERN" 2>/dev/null || true)
  # nie uns selbst killen
  SELF=$$
  PIDS=$(echo "$PIDS" | tr ' ' '\n' | grep -v "^${SELF}$" | tr '\n' ' ')
  if [ -n "$(echo "$PIDS" | tr -d ' ')" ]; then
    echo "[start] killing $LABEL ($PIDS)"
    kill $PIDS 2>/dev/null || true
    sleep 0.3
    PIDS=$(pgrep -f "$PATTERN" 2>/dev/null || true)
    PIDS=$(echo "$PIDS" | tr ' ' '\n' | grep -v "^${SELF}$" | tr '\n' ' ')
    if [ -n "$(echo "$PIDS" | tr -d ' ')" ]; then
      echo "[start] forcing SIGKILL on $LABEL ($PIDS)"
      kill -9 $PIDS 2>/dev/null || true
    fi
  fi
}

kill_port "$SERVER_PORT"
kill_port "$CLIENT_PORT"
# Fallback: Watcher ohne offenen Port (z.B. tsx watch im Restart-Limbo)
kill_pattern "tsx watch server" "tsx watch server/index.ts"
kill_pattern "vite dev"          "node .*vite"
kill_pattern "concurrently dev"  "concurrently .* npm:dev:server"

cd "$(dirname "$0")"
exec npm run dev
