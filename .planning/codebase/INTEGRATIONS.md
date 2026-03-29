# External Integrations

**Analysis Date:** 2026-03-28

## AI Model Providers

Each provider is implemented as a bundled plugin under `extensions/<provider>/`. Core provider API key handling lives in `src/agents/` and `src/infra/provider-usage.*.ts`.

**Anthropic:**

- Extension: `extensions/anthropic/` (`@openclaw/anthropic-provider`)
- Vertex variant: `extensions/anthropic-vertex/` (`@openclaw/anthropic-vertex-provider`), uses `@anthropic-ai/vertex-sdk` ^0.14.4
- Auth env vars: `ANTHROPIC_API_KEY`, `ANTHROPIC_API_KEY_1`, `ANTHROPIC_API_KEYS` (comma-separated rotation)
- Claude web provider variant: `src/provider-web.ts`, uses `CLAUDE_AI_SESSION_KEY` / `CLAUDE_WEB_SESSION_KEY` / `CLAUDE_WEB_COOKIE`

**OpenAI:**

- Extension: `extensions/openai/` (`@openclaw/openai-provider`)
- Auth env vars: `OPENAI_API_KEY`, `OPENAI_API_KEY_1`, `OPENAI_API_KEYS` (comma-separated rotation)
- GitHub Copilot proxy: `extensions/copilot-proxy/`, `extensions/github-copilot/`; token helper at `src/plugin-sdk/github-copilot-token.ts`
- Kilocode variant: `extensions/kilocode/`
- OpenCode variants: `extensions/opencode/`, `extensions/opencode-go/`

**Google (Gemini / Vertex):**

- Extension: `extensions/google/` (`@openclaw/google-plugin`)
- Auth: `GEMINI_API_KEY`, `GOOGLE_API_KEY`; Google auth helpers at `src/infra/gemini-auth.ts`
- Vertex support in Anthropic vertex extension and Google extension

**Amazon Bedrock:**

- Extension: `extensions/amazon-bedrock/` (`@openclaw/amazon-bedrock-provider`)
- SDK: `@aws-sdk/client-bedrock` ^3.1014.0 (in root `package.json`)

**Mistral:**

- Extension: `extensions/mistral/` (`@openclaw/mistral-provider`)

**Groq:**

- Extension: `extensions/groq/` (`@openclaw/deepgram-provider` / `@openclaw/groq-provider`)

**xAI (Grok):**

- Extension: `extensions/xai/` (`@openclaw/xai-plugin`)

**DeepSeek:**

- Extension: `extensions/deepseek/`

**Ollama (local):**

- Extension: `extensions/ollama/` (`@openclaw/ollama-provider`)
- Setup helpers: `src/plugin-sdk/ollama-setup.ts`
- Auth: No key required; connects to local Ollama server

**OpenRouter:**

- Extension: `extensions/openrouter/` (`@openclaw/openrouter-provider`)
- Auth: `OPENROUTER_API_KEY`

**Perplexity:**

- Extension: `extensions/perplexity/` (`@openclaw/perplexity-plugin`)
- Auth: `PERPLEXITY_API_KEY`

**Together AI:**

- Extension: `extensions/together/`

**Hugging Face:**

- Extension: `extensions/huggingface/`

**MiniMax:**

- Extension: `extensions/minimax/`
- Auth: `MINIMAX_API_KEY`
- Usage tracking: `src/infra/provider-usage.fetch.minimax.ts`

**Venice AI:**

- Extension: `extensions/venice/`
- Models: `src/agents/venice-models.ts`

**vLLM / SGLang (self-hosted):**

- Extensions: `extensions/vllm/`, `extensions/sglang/`

**VolcEngine / BytePlus / Kimi / Qwen / ModelStudio / Moonshot / Nvidia / Qianfan / Xiaomi / ZAI:**

- Extensions under `extensions/volcengine/`, `extensions/byteplus/`, `extensions/kimi-coding/`, `extensions/qwen-portal-auth/`, `extensions/modelstudio/`, `extensions/moonshot/`, `extensions/nvidia/`, `extensions/qianfan/`, `extensions/xiaomi/`, `extensions/zai/`
- Auth: `ZAI_API_KEY` for ZAI; others use per-extension config

**AI Gateway Proxies:**

- Vercel AI Gateway: `extensions/vercel-ai-gateway/`; auth: `AI_GATEWAY_API_KEY`
- Cloudflare AI Gateway: `extensions/cloudflare-ai-gateway/`

## Messaging Channels

All channel plugins live under `extensions/<channel>/` and `src/` for built-in channels.

**Telegram:**

- Extension: `extensions/telegram/` (`@openclaw/telegram`)
- SDK: `grammy` ^1.41.1, `@grammyjs/runner` ^2.0.3, `@grammyjs/transformer-throttler` ^1.2.1
- Auth env: `TELEGRAM_BOT_TOKEN`
- Bot token acquired via @BotFather; supports both polling and webhook modes
- Webhook: configurable via gateway, handled in `extensions/telegram/src/webhook.ts`

**Discord:**

- Extension: `extensions/discord/` (`@openclaw/discord`)
- SDK: `@buape/carbon` 0.0.0-beta (Discord interactions), `@discordjs/voice` ^0.19.2, `discord-api-types` ^0.38.42
- Auth env: `DISCORD_BOT_TOKEN` (raw token, no prefix)
- Dev types: `@grammyjs/types` ^3.25.0 in root devDependencies

**Slack:**

- Extension: `extensions/slack/` (`@openclaw/slack`)
- SDK: `@slack/bolt` ^4.6.0, `@slack/web-api` ^7.15.0
- Auth env: `SLACK_BOT_TOKEN` (`xoxb-...`), `SLACK_APP_TOKEN` (`xapp-...`)
- Mode: Socket Mode

**Microsoft Teams:**

- Extension: `extensions/msteams/` (`@openclaw/msteams`)
- SDK: `@microsoft/teams.api` 2.0.5, `@microsoft/teams.apps` 2.0.5
- Requires webhook ingress; implemented via `express`

**Matrix:**

- Extension: `extensions/matrix/` (`@openclaw/matrix`)
- SDK: `matrix-js-sdk` 41.2.0-rc.0, `@matrix-org/matrix-sdk-crypto-nodejs` ^0.4.0 (native build)
- Supports end-to-end encryption via Rust crypto bindings

**WhatsApp:**

- Extension: `extensions/whatsapp/` (`@openclaw/whatsapp`)
- SDK: `@whiskeysockets/baileys` 7.0.0-rc.9 (native WhatsApp Web protocol)
- Auth: QR code pairing flow; session stored in state dir

**iMessage:**

- Extension: `extensions/imessage/` (`@openclaw/imessage`)
- Mechanism: macOS-only via `imsg` bridge; requires macOS host

**Signal:**

- Extension: `extensions/signal/` (`@openclaw/signal`)
- Mechanism: signal-cli linked device; REST bridge required

**LINE:**

- Extension: `extensions/line/` (`@openclaw/line`)
- SDK: `@line/bot-sdk` ^10.6.0 (in root `package.json`)

**Zalo / ZaloUser:**

- Extensions: `extensions/zalo/`, `extensions/zalouser/`

**Feishu (Lark):**

- Extension: `extensions/feishu/`

**Google Chat:**

- Extension: `extensions/googlechat/`

**Mattermost:**

- Extension: `extensions/mattermost/`
- Auth env: `MATTERMOST_BOT_TOKEN`, `MATTERMOST_URL`

**Twitch:**

- Extension: `extensions/twitch/`
- Auth env: `OPENCLAW_TWITCH_ACCESS_TOKEN` (`oauth:...`)

**IRC:**

- Extension: `extensions/irc/`
- Config: `src/config/schema.irc.ts`

**Nostr:**

- Extension: `extensions/nostr/` (`@openclaw/nostr`)
- SDK: `nostr-tools` ^2.23.3
- Protocol: NIP-04 encrypted DMs

**Tlon (Urbit):**

- Extension: `extensions/tlon/`
- SDK: `@tloncorp/api`, `@tloncorp/tlon-skill` (native builds)

**Nextcloud Talk:**

- Extension: `extensions/nextcloud-talk/`

**Synology Chat:**

- Extension: `extensions/synology-chat/`

## Voice & Speech

**ElevenLabs:**

- Extension: `extensions/elevenlabs/` (`@openclaw/elevenlabs-speech`)
- Auth env: `ELEVENLABS_API_KEY` or `XI_API_KEY` (alias)

**Deepgram:**

- Extension: `extensions/deepgram/` (`@openclaw/deepgram-provider`)
- Auth env: `DEEPGRAM_API_KEY`

**Microsoft Edge TTS (built-in):**

- Package: `node-edge-tts` ^1.2.10 in root `package.json`
- No API key required; uses Edge TTS free endpoint

**Talk Voice:**

- Extension: `extensions/talk-voice/` (no separate package.json found; integrated into core talk config)
- Config: `src/config/talk.ts`, `src/config/talk-defaults.ts`

**Voice Call:**

- Extension: `extensions/voice-call/` (`@openclaw/voice-call`)
- WebSocket-based voice call routing; published to npm

## Web Search Tools

**Brave Search:**

- Extension: `extensions/brave/` (`@openclaw/brave-plugin`)
- Auth env: `BRAVE_API_KEY`

**Tavily:**

- Extension: `extensions/tavily/` (`@openclaw/tavily-plugin`)
- Auth env: `PERPLEXITY_API_KEY` (shared with Perplexity)... check extension for actual key

**Firecrawl:**

- Extension: `extensions/firecrawl/` (`@openclaw/firecrawl-plugin`)
- Auth env: `FIRECRAWL_API_KEY`

**Exa:**

- Extension: `extensions/exa/` (`@openclaw/exa-plugin`)

**DuckDuckGo (built-in):**

- Extension: `extensions/duckduckgo/`
- No API key required

**Perplexity (web search):**

- Extension: `extensions/perplexity/`
- Auth env: `PERPLEXITY_API_KEY`

**Open Prose:**

- Extension: `extensions/open-prose/`

## Image Generation

**fal.ai:**

- Extension: `extensions/fal/` (`@openclaw/fal-provider`)
- SDK: calls fal API directly

**Image generation core:**

- Plugin SDK surface: `src/plugin-sdk/image-generation.ts`, `src/plugin-sdk/image-generation-core.ts`
- Implementation: `src/image-generation/`

## Memory & Persistence

**SQLite (built-in memory):**

- Package: `sqlite-vec` 0.1.7 - vector search extension
- Implementation: `src/memory/sqlite-vec.ts`, `src/memory/manager.ts`
- Storage: flat files + SQLite DB under state dir (`~/.openclaw/`)

**LanceDB (long-term vector memory):**

- Extension: `extensions/memory-lancedb/` (`@openclaw/memory-lancedb`)
- SDK: `@lancedb/lancedb` ^0.27.1
- Uses `openai` ^6.32.0 for embeddings (configurable)
- Published to npm; installable plugin

**JSON file store (core):**

- Plugin SDK surface: `src/plugin-sdk/json-store.ts`
- Sessions: `~/.openclaw/agents/<agentId>/sessions/*.jsonl`
- Config: `~/.openclaw/openclaw.json`
- Credentials: `~/.openclaw/credentials/`

## Observability & Monitoring

**OpenTelemetry:**

- Extension: `extensions/diagnostics-otel/` (`@openclaw/diagnostics-otel`)
- SDK: Full OTel stack - `@opentelemetry/sdk-node`, trace/metrics/logs exporters (OTLP proto)
- Exports to any OTel-compatible backend (configurable endpoint)
- Published to npm

**Logging:**

- Core: `tslog` ^4.10.2 - structured logging library (`src/logger.ts`)
- macOS unified logs: `scripts/clawlog.sh` reads via `/usr/bin/log` subsystem

**Push Notifications (APNS):**

- Implementation: `src/infra/push-apns.ts`, `src/infra/push-apns.relay.ts`
- Protocol: Apple Push Notification Service for iOS/macOS app

## Networking & Discovery

**Bonjour/mDNS:**

- Package: `@homebridge/ciao` ^1.3.5
- Implementation: `src/infra/bonjour*.ts`
- Used for local network gateway discovery

**Tailscale:**

- Implementation: `src/infra/tailscale.ts`, `src/infra/tailnet.ts`
- Gateway can bind to Tailscale network interface; config: `src/config/config.gateway-tailscale-bind.test.ts`

**SSH Tunneling:**

- Implementation: `src/infra/ssh-tunnel.ts`, `src/infra/ssh-config.ts`
- Used for remote gateway access

## Platform & Agent Protocols

**Model Context Protocol (MCP):**

- SDK: `@modelcontextprotocol/sdk` 1.27.1
- Config: `src/config/mcp-config.ts`
- MCP server/tool integration in agent pipeline

**Agent Client Protocol (ACP):**

- SDK: `@agentclientprotocol/sdk` 0.16.1
- Entry: `extensions/acpx/`
- Implementation: `src/acp/`, `src/plugin-sdk/acp-runtime.ts`

**Pi Agent (embedded):**

- SDK: `@mariozechner/pi-agent-core` 0.61.1, `@mariozechner/pi-ai` 0.61.1, `@mariozechner/pi-coding-agent` 0.61.1, `@mariozechner/pi-tui` 0.61.1
- Implementation: `src/agents/pi-embedded-runner/`

## Authentication & Identity

**Custom token/password auth:**

- Gateway auth: bearer token (`OPENCLAW_GATEWAY_TOKEN`) or password (`OPENCLAW_GATEWAY_PASSWORD`)
- Implementation: `src/gateway/auth.ts`, `src/gateway/auth-config-utils.ts`
- Device pairing: `src/infra/device-pairing.ts`, `src/infra/pairing-token.ts`
- Credentials stored: `~/.openclaw/credentials/`

**Provider OAuth / API key flows:**

- API key auth: `src/plugin-sdk/provider-auth-api-key.ts`
- Login-based auth: `src/plugin-sdk/provider-auth-login.ts`
- Google auth: `src/infra/gemini-auth.ts`

## CI/CD & Deployment

**Hosting:**

- Render.com (via `render.yaml`): Docker runtime, web service, 1 GB persistent disk
- Fly.io (via `fly.toml`): Docker runtime, `shared-cpu-2x`, 2 GB RAM, persistent `/data` volume
- Self-hosted Docker (via `docker-compose.yml`): gateway + CLI containers, ports 18789/18790

**CI Pipeline:**

- GitHub Actions (`.github/` directory; workflows not directly read but referenced by `labeler.yml`)
- Pre-commit hooks: `prek install` (same checks as CI); hooks in `git-hooks/`

**Mobile:**

- iOS: Xcode/xcodegen, App Store/TestFlight distribution via `scripts/ios-beta-release.sh`
- Android: Gradle, Play Store AAB via `scripts/build-release-aab.ts`
- macOS: Sparkle auto-update via `appcast.xml`

## Webhooks & Callbacks

**Incoming Webhooks:**

- Telegram: `/webhook` endpoint via `extensions/telegram/src/webhook.ts`; registered with Telegram Bot API
- Microsoft Teams: HTTP webhooks via Teams SDK (`extensions/msteams/`)
- LINE: webhook endpoint via `@line/bot-sdk`
- General webhook ingress: `src/plugin-sdk/webhook-ingress.ts`, `src/plugin-sdk/webhook-path.ts`

**Outgoing Webhooks / Hooks:**

- Agent hooks system: `src/hooks/`, configurable in `openclaw.json` `hooks` block
- MCP tool calls go outbound to configured MCP servers

## Environment Configuration

**Required for operation (one provider minimum):**

- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GEMINI_API_KEY`

**Gateway auth (recommended if binding beyond loopback):**

- `OPENCLAW_GATEWAY_TOKEN`

**Channel tokens (per enabled channel):**

- `TELEGRAM_BOT_TOKEN`, `DISCORD_BOT_TOKEN`, `SLACK_BOT_TOKEN` + `SLACK_APP_TOKEN`

**Optional tool/service keys:**

- `BRAVE_API_KEY`, `PERPLEXITY_API_KEY`, `FIRECRAWL_API_KEY`, `ELEVENLABS_API_KEY`, `DEEPGRAM_API_KEY`

**Secrets location:**

- Runtime secrets in `~/.openclaw/credentials/`
- Config with inline secrets: `~/.openclaw/openclaw.json`
- Env file: `~/.openclaw/.env` or `./.env` (see `.env.example` for full list)

---

_Integration audit: 2026-03-28_
