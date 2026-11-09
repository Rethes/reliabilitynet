#!/bin/bash
set -euo pipefail

CONFIG="${CLOUDFLARED_CONFIG:-$HOME/.cloudflared/reliabilitynet-model.yml}"

if ! command -v cloudflared >/dev/null 2>&1; then
  printf 'cloudflared is required. Install it with: brew install cloudflared\n' >&2
  exit 1
fi

if [ -z "${ML_API_KEY:-}" ]; then
  printf 'ML_API_KEY must be set before exposing the model service through a tunnel.\n' >&2
  exit 1
fi

if [ ! -f "$CONFIG" ]; then
  printf 'Tunnel config not found: %s\n' "$CONFIG" >&2
  printf 'Copy deployment/cloudflared/config.yml.example and replace its placeholders.\n' >&2
  exit 1
fi

if ! curl --silent --show-error --output /dev/null --max-time 3 \
  http://127.0.0.1:5001/health; then
  printf 'Model server is not responding at http://127.0.0.1:5001.\n' >&2
  exit 1
fi

cloudflared tunnel --config "$CONFIG" ingress validate
exec cloudflared tunnel --config "$CONFIG" run
