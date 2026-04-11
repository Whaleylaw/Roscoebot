#!/bin/bash
# Roscoebot entrypoint — seeds config then starts gateway.
# Runs seed-agents.sh to copy latest config from image to persistent volume,
# then launches the OpenClaw gateway.

set -e

echo "=== Roscoebot entrypoint ==="

# Run seed script to update config + agent workspaces on the volume
if [ -f /app/deployment/agents/seed-agents.sh ]; then
    bash /app/deployment/agents/seed-agents.sh
fi

echo "=== Starting OpenClaw gateway ==="
exec node /app/openclaw.mjs gateway --allow-unconfigured --bind lan --port 10000
