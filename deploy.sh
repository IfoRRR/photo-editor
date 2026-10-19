#!/usr/bin/env bash
# Rebuild portfolio gateway with /photo/ demo (needs docker group or sudo).
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose up -d --build nginx portfolio-api
echo "OK → http://127.0.0.1:8081/photo/"
