#!/bin/bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

if [ "$(git branch --show-current)" != "deployment" ]; then
  printf 'Run this script from the deployment branch.\n' >&2
  exit 1
fi

if ! command -v cloudflared >/dev/null 2>&1; then
  printf 'cloudflared is required. Install it with: brew install cloudflared\n' >&2
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  printf 'Node.js and npx are required to update the production Worker.\n' >&2
  exit 1
fi

ENV_FILE="$DIR/model-server.env"
if [ ! -f "$ENV_FILE" ]; then
  printf 'Missing %s. Run scripts/start-model-server.sh first.\n' "$ENV_FILE" >&2
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

model_health_status="$(
  printf 'url = "http://127.0.0.1:5001/health"\nheader = "X-ML-Key: %s"\n' "$ML_API_KEY" \
    | curl --config - --silent --show-error --output /dev/null --max-time 5 --write-out '%{http_code}' \
    || true
)"
if [ "$model_health_status" != "200" ]; then
  printf 'The keyed model server is not healthy at 127.0.0.1:5001 (HTTP %s).\n' \
    "${model_health_status:-unavailable}" >&2
  printf 'Start it first with scripts/start-model-server.sh.\n' >&2
  exit 1
fi

unauthenticated_status="$(
  curl --silent --output /dev/null --max-time 5 --write-out '%{http_code}' \
    http://127.0.0.1:5001/health || true
)"
if [ "$unauthenticated_status" != "401" ]; then
  printf 'The model server did not reject an unauthenticated health request (HTTP %s); refusing to expose it.\n' \
    "${unauthenticated_status:-unavailable}" >&2
  exit 1
fi

secrets="$(cd "$DIR/worker" && npx wrangler secret list --env production)"
if ! printf '%s' "$secrets" | grep -q '"name": "ML_API_KEY"'; then
  printf 'ML_API_KEY is not configured as a production Worker secret.\n' >&2
  exit 1
fi

unset ML_API_KEY

LOG_FILE="$(mktemp "${TMPDIR:-/tmp}/reliabilitynet-quick-tunnel.XXXXXX")"
TUNNEL_PID=''
TAIL_PID=''

cleanup() {
  if [ -n "$TAIL_PID" ]; then
    kill "$TAIL_PID" 2>/dev/null || true
    wait "$TAIL_PID" 2>/dev/null || true
  fi
  if [ -n "$TUNNEL_PID" ]; then
    kill "$TUNNEL_PID" 2>/dev/null || true
    wait "$TUNNEL_PID" 2>/dev/null || true
  fi
  rm -f "$LOG_FILE"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

printf 'Starting Cloudflare Quick Tunnel. Keep this terminal open.\n'
cloudflared tunnel --url http://127.0.0.1:5001 --no-autoupdate >"$LOG_FILE" 2>&1 &
TUNNEL_PID=$!
tail -n +1 -f "$LOG_FILE" &
TAIL_PID=$!

TUNNEL_ORIGIN=''
for _ in {1..90}; do
  TUNNEL_ORIGIN="$(grep -Eo 'https://[A-Za-z0-9-]+\.trycloudflare\.com' "$LOG_FILE" | head -n 1 || true)"
  if [ -n "$TUNNEL_ORIGIN" ]; then
    break
  fi
  if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
    printf 'cloudflared exited before providing a tunnel URL.\n' >&2
    exit 1
  fi
  sleep 1
done

if [ -z "$TUNNEL_ORIGIN" ]; then
  printf 'Timed out waiting for Cloudflare to provide a Quick Tunnel URL.\n' >&2
  exit 1
fi

printf 'Updating the production Worker to use the temporary model origin...\n'
(
  cd "$DIR/worker"
  npx wrangler deploy --env production --var "ML_ORIGIN:$TUNNEL_ORIGIN"
)

printf 'Waiting for the deployed Worker to reach the model...\n'
WORKER_ORIGIN='https://reliabilitynet-api-production.rethesmutua.workers.dev'
for _ in {1..30}; do
  worker_status="$(
    curl --silent --output /dev/null --max-time 10 --write-out '%{http_code}' \
      "$WORKER_ORIGIN/api/ml/health" || true
  )"
  if [ "$worker_status" = "200" ]; then
    break
  fi
  sleep 2
done

if [ "${worker_status:-}" != "200" ]; then
  printf 'Worker model health check failed (HTTP %s).\n' "${worker_status:-unavailable}" >&2
  exit 1
fi

printf '\nML tunnel is ready. Test predictions at %s/api/ml/predict/sentiment\n' "$WORKER_ORIGIN"
printf 'Keep this terminal open. Press Ctrl+C to stop the tunnel.\n'
wait "$TUNNEL_PID"
