#!/bin/bash
# Seed agent workspaces and config into the persistent volume.
# Run once on first deploy, or to update agent configs.
# Preserves existing MEMORY.md files (agent state).

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="${OPENCLAW_STATE_DIR:-/data/.openclaw}"
WORKSPACE_BASE="/data/workspaces"

echo "=== Seeding OpenClaw agent configuration ==="

# Copy openclaw.json to the secrets path if not already there
CONFIG_DEST="${OPENCLAW_CONFIG_PATH:-/data/.openclaw/openclaw.json}"
mkdir -p "$(dirname "$CONFIG_DEST")"
if [ ! -f "$CONFIG_DEST" ]; then
    cp "$SCRIPT_DIR/openclaw.json" "$CONFIG_DEST"
    echo "  Created config: $CONFIG_DEST"
else
    echo "  Config exists, skipping: $CONFIG_DEST"
    echo "  To force update, delete it and re-run."
fi

# Seed each agent workspace
for agent_dir in "$SCRIPT_DIR/workspaces"/*/; do
    agent_id=$(basename "$agent_dir")
    dest="$WORKSPACE_BASE/$agent_id"
    mkdir -p "$dest"

    # Copy template files, but NEVER overwrite MEMORY.md (agent's learned state)
    for file in SOUL.md IDENTITY.md AGENTS.md; do
        if [ -f "$agent_dir/$file" ]; then
            cp "$agent_dir/$file" "$dest/$file"
            echo "  [$agent_id] Updated $file"
        fi
    done

    # Only create MEMORY.md if it doesn't exist
    if [ ! -f "$dest/MEMORY.md" ]; then
        cp "$agent_dir/MEMORY.md" "$dest/MEMORY.md"
        echo "  [$agent_id] Created MEMORY.md"
    else
        echo "  [$agent_id] MEMORY.md preserved (existing)"
    fi
done

echo "=== Agent seeding complete ==="
echo "Agents configured:"
ls -1 "$WORKSPACE_BASE"
