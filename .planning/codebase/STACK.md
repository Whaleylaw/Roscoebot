# Technology Stack

**Analysis Date:** 2026-03-28

## Languages

**Primary:**

- TypeScript (strict ESM) - all core CLI, gateway, plugin SDK, and extensions under `src/` and `extensions/`
- Swift - macOS app (`apps/macos/Sources/`) and iOS app (`apps/ios/Sources/`)
- Kotlin - Android app (`apps/android/app/src/main/`)

**Secondary:**

- JavaScript (`.mjs`, `.cjs`) - build scripts and runtime entry points (`scripts/`, `openclaw.mjs`)
- Python - `pyproject.toml` present for auxiliary tooling
- Shell (Bash) - install scripts (`scripts/install-sh-e2e-docker.sh`, etc.)

## Runtime

**Environment:**

- Node.js >=22.14.0 (enforced via `engines` in `package.json`)
- Bun supported as alternate executor for scripts, tests, and dev server; both paths kept in sync

**Package Manager:**

- pnpm 10.32.1 (`packageManager` field in `package.json`)
- Lockfile: `pnpm-lock.yaml` present; `package-lock.json` also present for Node compat
- Workspace: `pnpm-workspace.yaml` with monorepo layout across `src/`, `extensions/`, `apps/`, `ui/`, `packages/`

## Frameworks

**Core Runtime:**

- `hono` 4.12.8 - HTTP framework for the gateway server (pinned via pnpm overrides)
- `express` ^5.2.1 - used by some channel plugins (MS Teams, legacy web surfaces)
- `@hono/node-server` 1.19.10 (override) - Node adapter for Hono

**CLI:**

- `commander` ^14.0.3 - CLI command parsing (`src/cli/`)
- `@clack/prompts` ^1.1.0 - interactive CLI prompts and spinners
- `osc-progress` ^0.3.0 - progress bars (wrapper around clack/prompts)

**Schema & Validation:**

- `zod` ^4.3.6 - config and runtime schema validation throughout
- `@sinclair/typebox` 0.34.48 - tool input schemas, plugin SDK contracts (pinned exact)
- `ajv` ^8.18.0 - JSON Schema validation

**Testing:**

- `vitest` ^4.1.0 - test runner (forks pool only; pool must not change without approval)
- `@vitest/coverage-v8` ^4.1.0 - V8 coverage (70% lines/branches/functions/statements threshold)
- Multiple vitest configs: `vitest.config.ts` (default), `vitest.unit.config.ts`, `vitest.gateway.config.ts`, `vitest.e2e.config.ts`, `vitest.live.config.ts`, `vitest.extensions.config.ts`

**Build:**

- `tsdown` 0.21.4 - primary bundler, configured in `tsdown.config.ts`
- `tsx` ^4.21.0 - TypeScript execution for scripts
- `tsc` - type declarations for plugin SDK DTS (`tsconfig.plugin-sdk.dts.json`)
- `vite` 8.0.1 - control UI build (`ui/`)

**Linting & Formatting:**

- `oxlint` ^1.56.0 with `oxlint-tsgolint` - primary linter (type-aware mode)
- `oxfmt` 0.41.0 - formatter for TypeScript/JavaScript/Markdown

**Control UI (Web):**

- `lit` ^3.3.2 - web components framework for the control UI (`ui/src/`)
- `@lit-labs/signals`, `@lit/context` - Lit extension libraries
- `vite` 8.0.1 - bundler for the UI
- `dompurify` ^3.3.3 - HTML sanitization in UI

## Key Dependencies

**Critical:**

- `@modelcontextprotocol/sdk` 1.27.1 - MCP protocol SDK for tool/agent integrations
- `@agentclientprotocol/sdk` 0.16.1 - ACP protocol SDK for agent spawning/communication
- `@mariozechner/pi-agent-core` 0.61.1 - Pi agent runtime core
- `@mariozechner/pi-ai` 0.61.1 - Pi AI integration
- `@mariozechner/pi-coding-agent` 0.61.1 - Pi coding agent runtime
- `@mariozechner/pi-tui` 0.61.1 - Terminal UI for Pi agents
- `ws` ^8.20.0 - WebSocket server/client for gateway protocol
- `undici` ^7.24.5 - HTTP client (fetch implementation)

**Infrastructure:**

- `jiti` ^2.6.1 - runtime TypeScript/ESM loading (resolves `openclaw/plugin-sdk/*` via alias)
- `dotenv` ^17.3.1 - env loading from `.env` files
- `chokidar` ^5.0.0 - file watching
- `croner` ^10.0.1 - cron job scheduling
- `uuid` ^13.0.0 - UUID generation
- `yaml` ^2.8.3 - YAML config parsing
- `json5` ^2.2.3 - JSON5 config parsing
- `sharp` ^0.34.5 - image processing (native, built via pnpm onlyBuiltDependencies)
- `sqlite-vec` 0.1.7 - SQLite vector extension for semantic memory (`src/memory/sqlite-vec.ts`)
- `pdfjs-dist` ^5.5.207 - PDF parsing for media understanding
- `playwright-core` 1.58.2 - browser automation for browser-based tools
- `@homebridge/ciao` ^1.3.5 - mDNS/Bonjour service discovery (`src/infra/bonjour*.ts`)
- `@lydell/node-pty` 1.2.0-beta.3 - pseudo-terminal for shell execution (native build)
- `file-type` 21.3.4 - file MIME detection (pinned exact)
- `ipaddr.js` ^2.3.0 - IP address validation/parsing
- `markdown-it` ^14.1.1 - Markdown rendering
- `node-edge-tts` ^1.2.10 - Edge TTS for text-to-speech
- `@mozilla/readability` ^0.6.0 - web content extraction
- `linkedom` ^0.18.12 - lightweight DOM for server-side HTML parsing
- `gaxios` 7.1.4 - Google API HTTP client (pinned exact)

**Optional/Peer:**

- `node-llama-cpp` 3.18.1 - local LLM execution (optional peer dep)
- `@napi-rs/canvas` ^0.1.89 - Canvas API for image generation (optional peer dep)
- `openshell` 0.1.0 - shell sandbox integration (optional dep)

## Configuration

**Environment:**

- Config file: `~/.openclaw/openclaw.json` (primary) or `OPENCLAW_CONFIG_PATH` override
- State dir: `~/.openclaw/` or `OPENCLAW_STATE_DIR` override
- Env loading precedence: process env → `./.env` → `~/.openclaw/.env` → `openclaw.json` `env` block
- Key env vars: `OPENCLAW_GATEWAY_TOKEN`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `DISCORD_BOT_TOKEN`, `SLACK_BOT_TOKEN`/`SLACK_APP_TOKEN` (see `.env.example` for full list)
- Schema generated to `docs/.generated/` via `pnpm config:docs:gen`

**Build:**

- `tsconfig.json` - primary TypeScript config (NodeNext module resolution, strict, ES2023 target)
- `tsconfig.plugin-sdk.dts.json` - plugin SDK declaration emit config
- `tsdown.config.ts` - bundler config
- `vitest.*.config.ts` - per-suite test configs
- `knip.config.ts` - dead code detection config

## Platform Requirements

**Development:**

- Node 22+ (required)
- pnpm 10.32.1 (enforced via `packageManager` field)
- Bun supported as alternate for test/script execution
- SwiftFormat + SwiftLint for macOS/iOS Swift sources
- Gradle for Android app
- Xcodegen for iOS project generation

**Production:**

- Docker (via `Dockerfile`, `docker-compose.yml`)
- Render.com (via `render.yaml`) - Docker runtime, 1 GB disk, persistent volume at `/data`
- Fly.io (via `fly.toml`) - Docker runtime, `shared-cpu-2x`, 2048 MB RAM, region `iad`
- Gateway runs on port 18789 (default) or configurable; health check at `/healthz`
- macOS app distributed via Sparkle (`appcast.xml`) for auto-updates

---

_Stack analysis: 2026-03-28_
