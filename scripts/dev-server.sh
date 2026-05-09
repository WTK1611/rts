#!/bin/sh
PORT="${PORT:-8787}"
PIDS=$(lsof -ti:"$PORT" 2>/dev/null)
if [ -n "$PIDS" ]; then
  echo "[dev:server] killing previous server on :$PORT (PIDs: $PIDS)"
  kill -9 $PIDS 2>/dev/null
  sleep 0.3
fi
exec npx tsx watch server/index.ts
