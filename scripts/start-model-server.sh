#!/bin/bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

if [ "$(git branch --show-current)" != "deployment" ]; then
  printf 'Run this script from the deployment branch.\n' >&2
  exit 1
fi

ENV_FILE="$DIR/model-server.env"
PYTHON="$DIR/model_env/bin/python"

if [ ! -f "$ENV_FILE" ]; then
  printf 'Missing %s. Create it with a local ML_API_KEY entry first.\n' "$ENV_FILE" >&2
  exit 1
fi

chmod 600 "$ENV_FILE"
set -a
. "$ENV_FILE"
set +a

if [[ ! "${ML_API_KEY:-}" =~ ^[A-Za-z0-9_-]+$ ]]; then
  printf 'ML_API_KEY is missing or must use only letters, numbers, underscores, and hyphens.\n' >&2
  exit 1
fi

if [ ! -x "$PYTHON" ]; then
  printf 'Model Python environment not found at %s.\n' "$PYTHON" >&2
  exit 1
fi

unauthenticated_status="$(
  curl --silent --output /dev/null --max-time 5 --write-out '%{http_code}' \
    http://127.0.0.1:5001/health || true
)"
if [ "$unauthenticated_status" = "200" ]; then
  printf 'A model server is responding without API-key protection; refusing to reuse it.\n' >&2
  printf 'Stop that server and restart it with scripts/start-model-server.sh.\n' >&2
  exit 1
fi

health_status="$(
  printf 'url = "http://127.0.0.1:5001/health"\nheader = "X-ML-Key: %s"\n' "$ML_API_KEY" \
    | curl --config - --silent --show-error --output /dev/null --max-time 5 --write-out '%{http_code}' \
    || true
)"
if [ "$health_status" = "200" ]; then
  printf 'A model server is already responding with key authentication enabled.\n'
  exit 0
fi

if [ -n "$health_status" ] && [ "$health_status" != "000" ]; then
  printf 'Port 5001 is already serving a model API, but the configured key was rejected (HTTP %s).\n' \
    "$health_status" >&2
  printf 'Stop that server and restart it with scripts/start-model-server.sh.\n' >&2
  exit 1
fi

printf 'Starting the protected model server on 127.0.0.1:5001...\n'
exec "$PYTHON" "$DIR/model_server.py"
