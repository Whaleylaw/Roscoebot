#!/bin/bash
# Roscoebot entrypoint — seeds config then starts gateway.
# Always copies the latest config from the Docker image to the persistent volume,
# then launches the OpenClaw gateway.

set -e

echo "========================================"
echo "  Roscoebot entrypoint starting"
echo "========================================"

# Point OpenClaw at the persistent volume for state
export OPENCLAW_STATE_DIR="${OPENCLAW_STATE_DIR:-/data/.openclaw}"
export OPENCLAW_CONFIG_PATH="${OPENCLAW_STATE_DIR}/openclaw.json"
mkdir -p "$OPENCLAW_STATE_DIR"

# Always copy fresh config from image to volume (handles new settings)
echo "Copying config from image to volume..."
cp /app/deployment/agents/openclaw.json "$OPENCLAW_CONFIG_PATH"
echo "  Config written to: $OPENCLAW_CONFIG_PATH"

# Seed agent workspaces (preserves MEMORY.md)
if [ -f /app/deployment/agents/seed-agents.sh ]; then
    echo "Running seed-agents.sh..."
    bash /app/deployment/agents/seed-agents.sh
fi

echo "Config contents:"
cat "$OPENCLAW_CONFIG_PATH" | head -20
echo "..."

echo "========================================"
echo "  Starting OpenClaw gateway"
echo "  Port: 10000, Bind: lan"
echo "========================================"
exec node /app/openclaw.mjs gateway --allow-unconfigured
