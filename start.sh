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

kill_port "$SERVER_PORT"
kill_port "$CLIENT_PORT"

cd "$(dirname "$0")"
exec npm run dev
