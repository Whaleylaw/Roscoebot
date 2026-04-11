#!/bin/bash
# Seed agent workspaces and config into the persistent volume.
# Run once on first deploy, or to update agent configs.
# Preserves existing MEMORY.md files (agent state).

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="${OPENCLAW_STATE_DIR:-/data/.openclaw}"
WORKSPACE_BASE="/data/workspaces"
AUTH_DIR="$DATA_DIR/agents/main/agent"
AUTH_FILE="$AUTH_DIR/auth-profiles.json"

echo "=== Seeding OpenClaw agent configuration ==="

# Copy openclaw.json to the secrets path if not already there
CONFIG_DEST="${OPENCLAW_CONFIG_PATH:-/data/.openclaw/openclaw.json}"
mkdir -p "$(dirname "$CONFIG_DEST")"
# Always update config from repo (models/agents may have changed)
cp "$SCRIPT_DIR/openclaw.json" "$CONFIG_DEST"
echo "  Updated config: $CONFIG_DEST"

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

# --- OpenAI Codex OAuth first-boot check ---
# If no auth-profiles.json exists (or it has no openai-codex profile),
# run the interactive OAuth login flow. On a remote/VPS environment,
# OpenClaw shows a URL to open in your local browser, then you paste
# the redirect URL back.

check_codex_auth() {
    if [ ! -f "$AUTH_FILE" ]; then
        return 1
    fi
    # Check if auth file contains an openai-codex profile
    if command -v python3 >/dev/null 2>&1; then
        python3 -c "
import json, sys
try:
    data = json.load(open('$AUTH_FILE'))
    profiles = data.get('profiles', {})
    has_codex = any('openai-codex' in k for k in profiles)
    sys.exit(0 if has_codex else 1)
except:
    sys.exit(1)
" 2>/dev/null
        return $?
    fi
    # Fallback: simple grep
    grep -q "openai-codex" "$AUTH_FILE" 2>/dev/null
    return $?
}

mkdir -p "$AUTH_DIR"

if check_codex_auth; then
    echo ""
    echo "=== OpenAI Codex OAuth: already configured ==="
    echo "  Auth file: $AUTH_FILE"
else
    echo ""
    echo "=============================================="
    echo "  FIRST BOOT: OpenAI Codex OAuth Required"
    echo "=============================================="
    echo ""
    echo "  Models are set to openai-codex/gpt-5.4."
    echo "  Running interactive OAuth login..."
    echo "  A URL will be shown — open it in your"
    echo "  local browser, sign in with ChatGPT,"
    echo "  then paste the redirect URL back here."
    echo ""
    echo "  If running headless (no TTY), set"
    echo "  SKIP_OAUTH_SETUP=1 and manually run:"
    echo "    openclaw models auth login --provider openai-codex"
    echo ""

    if [ "${SKIP_OAUTH_SETUP:-0}" = "1" ]; then
        echo "  SKIP_OAUTH_SETUP=1 — skipping OAuth flow."
        echo "  WARNING: Agents will fail until OAuth is configured."
        echo "  Run manually: openclaw models auth login --provider openai-codex"
    else
        # Run the OAuth login flow
        # This is interactive — needs TTY on Render shell
        openclaw models auth login --provider openai-codex --set-default || {
            echo ""
            echo "  OAuth flow failed or was skipped."
            echo "  You can retry later with:"
            echo "    openclaw models auth login --provider openai-codex"
            echo ""
            echo "  Continuing boot without auth..."
        }
    fi
fi
