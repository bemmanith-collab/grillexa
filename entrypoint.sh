#!/bin/sh
set -e

cd /app/backend
npx prisma migrate deploy

node src/index.js &
NODE_PID=$!

trap 'kill -TERM "$NODE_PID" 2>/dev/null; nginx -s quit 2>/dev/null; exit 0' TERM INT

nginx -g 'daemon off;' &
NGINX_PID=$!

wait "$NGINX_PID"
kill -TERM "$NODE_PID" 2>/dev/null
wait "$NODE_PID" 2>/dev/null
