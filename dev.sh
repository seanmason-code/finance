#!/bin/bash
cd "$(dirname "$0")"

# Kill background jobs when you Ctrl+C
trap 'kill $(jobs -p) 2>/dev/null' EXIT

echo "Starting Finance dev server..."
python3 server.py &

sleep 1

echo "Starting live reload on http://localhost:3000"
browser-sync start \
  --proxy "localhost:8090" \
  --files "*.html,css/**,js/**" \
  --no-notify \
  --open
