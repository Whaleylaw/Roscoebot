# Codebase Structure

**Analysis Date:** 2026-03-28

## Directory Layout

```
openclaw/                        # repo root
├── src/                         # Core TypeScript source (CLI + gateway runtime)
│   ├── agents/                  # LLM agent execution, model selection, tools, sandbox
│   ├── acp/                     # Agent Control Protocol (ACP) client + control-plane
│   ├── auto-reply/              # Inbound dispatch, reply pipeline, command registry
│   ├── bindings/                # Channel-binding utilities
│   ├── bootstrap/               # Early startup helpers
│   ├── browser/                 # Browser automation (Playwright-based)
│   ├── canvas-host/             # A2UI canvas server (WebSocket)
│   ├── channels/                # Channel abstractions, routing, plugins type contracts
│   │   └── plugins/             # Plugin adapter type definitions + channel catalog
│   ├── cli/                     # All CLI subcommand handlers + program builder
│   │   ├── program/             # Commander wiring: build-program, command-registry, register.*.ts
│   │   └── send-runtime/        # Lazy per-channel send modules (whatsapp, telegram, …)
│   ├── commands/                # User-facing command implementations (onboard, doctor, status, …)
│   ├── config/                  # Config file I/O, schema types, migration, validation
│   ├── context-engine/          # Context pruning & memory injection
│   ├── cron/                    # Cron job scheduling
│   ├── daemon/                  # Daemon install helpers (systemd, launchd)
│   ├── docs/                    # In-process help renderer
│   ├── gateway/                 # HTTP/WS gateway server, channel lifecycle, auth, hooks
│   │   ├── server/              # Gateway server sub-modules (close-reason, health, http-auth, …)
│   │   └── server-methods/      # RPC method dispatch (WebSocket API)
│   ├── hooks/                   # Hook runner, Gmail watcher, bundled hooks
│   │   └── bundled/             # Built-in hook handlers (each dir → handler.ts)
│   ├── i18n/                    # Internationalisation helpers
│   ├── image-generation/        # Image generation provider abstraction
│   ├── infra/                   # Cross-cutting infra utilities (~430 files)
│   ├── interactive/             # Interactive session helpers
│   ├── library.ts               # Programmatic library entry (re-exports for macOS app etc.)
│   ├── entry.ts                 # Binary entry point (openclaw CLI)
│   ├── index.ts                 # Package root export (legacy + library consumers)
│   ├── line/                    # LINE channel core (native, not an extension)
│   ├── link-understanding/      # URL/link metadata extraction
│   ├── logging/                 # Log aggregation, subsystem logger factory
│   ├── markdown/                # Markdown rendering helpers
│   ├── media/                   # Media pipeline (audio, ffmpeg, file context)
│   ├── media-understanding/     # Vision / media-understanding provider abstraction
│   ├── memory/                  # Memory backend abstraction (search, embedding)
│   ├── node-host/               # Remote node host utilities
│   ├── pairing/                 # Device pairing helpers
│   ├── plugin-sdk/              # Public plugin SDK barrel re-exports (one file per subpath)
│   ├── plugins/                 # Plugin loader, registry, runtime factory, provider auth
│   │   └── runtime/             # PluginRuntime factory (creates runtime object injected into plugins)
│   ├── process/                 # Child-process bridge, command queue
│   ├── projects/                # Projects management
│   ├── routing/                 # Session key, account lookup, route resolution, bindings
│   ├── scripts/                 # Build-time scripts used from tsdown/src
│   ├── secrets/                 # Secret resolution, runtime snapshot, gateway auth surfaces
│   ├── security/                # CSP, SSRF policy, external content, exec approvals
│   ├── sessions/                # Session lifecycle, transcript files, archive
│   ├── shared/                  # Shared micro-utilities (lazy-runtime, global-singleton)
│   ├── terminal/                # Table/ANSI output helpers, palette
│   ├── tts/                     # TTS provider abstraction
│   ├── tui/                     # TUI (terminal UI) helpers
│   ├── types/                   # Shared TypeScript types
│   ├── utils/                   # General utility functions
│   ├── web-search/              # Web search provider abstraction
│   └── wizard/                  # Setup wizard prompts
├── extensions/                  # Workspace packages — one per plugin
│   ├── telegram/                # Telegram Bot API plugin
│   ├── discord/                 # Discord plugin
│   ├── slack/                   # Slack plugin
│   ├── whatsapp/                # WhatsApp Web plugin
│   ├── anthropic/               # Anthropic provider plugin
│   ├── openai/                  # OpenAI provider plugin
│   ├── ollama/                  # Ollama local LLM plugin
│   ├── matrix/                  # Matrix protocol plugin
│   ├── msteams/                 # Microsoft Teams plugin
│   ├── signal/                  # Signal plugin
│   ├── <many others>/           # ~80+ channel + provider + tool plugins
│   └── shared/                  # Shared extension utilities (non-plugin workspace package)
├── ui/                          # Control UI (Vite + TypeScript SPA, served by gateway)
│   └── src/                     # UI source: main.ts, styles, i18n, local-storage, ui/
├── apps/                        # Native app targets
│   ├── ios/                     # iOS SwiftUI app
│   ├── android/                 # Android Kotlin app
│   ├── macos/                   # macOS SwiftUI menubar app
│   └── shared/OpenClawKit/      # Shared Swift package (OpenClawKit, OpenClawProtocol, OpenClawChatUI)
├── packages/                    # Additional internal workspace packages
│   ├── clawdbot/                # Clawdbot package
│   └── moltbot/                 # Moltbot package
├── docs/                        # Mintlify documentation source
│   ├── channels/                # Per-channel docs
│   ├── .generated/              # Generated baseline artifacts (config schema, plugin SDK API)
│   └── .i18n/                   # i18n pipeline (glossary, translation memory)
├── scripts/                     # Build, release, packaging, and utility scripts
├── test/                        # Shared test fixtures and helpers
├── test-fixtures/               # Static test fixture files
├── dist/                        # Build output (bundled JS — not committed)
├── dist-runtime/                # Bundled extension build output used at runtime
│   └── extensions/              # One subdirectory per bundled extension
├── assets/                      # Static assets (chrome-extension icons, etc.)
├── skills/                      # Built-in skill definitions
├── vendor/                      # Vendored third-party code
├── .planning/                   # GSD planning documents
│   └── codebase/                # Codebase analysis (ARCHITECTURE.md, STRUCTURE.md, …)
├── .agents/skills/              # Agent skill definitions (pr-maintainer, release, etc.)
├── .pi/                         # Pi extension config and prompts
├── openclaw.mjs                 # Binary shim (delegates to dist/entry.js)
├── package.json                 # Root package (name: openclaw, bin: openclaw)
├── pnpm-workspace.yaml          # Workspace: ., ui, packages/*, extensions/*
├── tsconfig.json                # TypeScript config (strict ESM)
├── tsdown.config.ts             # Build config (tsdown/Rollup — unified entry graph)
└── vitest.config.ts             # Test runner config (primary)
```

## Directory Purposes

**`src/`:**

- Purpose: All core TypeScript source for the CLI binary and gateway server
- Contains: ~50 top-level subdirectories organized by domain
- Key files: `src/entry.ts` (binary entrypoint), `src/index.ts` (library export), `src/library.ts` (programmatic API)

**`src/cli/`:**

- Purpose: Commander-based CLI wiring; one file per sub-command area
- Contains: `program/` (program builder + command registration), per-command handler files, shared CLI utilities
- Key files: `src/cli/program/build-program.ts`, `src/cli/program/command-registry.ts`, `src/cli/run-main.ts`

**`src/commands/`:**

- Purpose: User-facing command business logic (doctor, onboard, status, setup, sessions, models, etc.)
- Contains: Per-command `.ts` files; each command can have dedicated sub-files (e.g. `doctor-*.ts`)
- Key files: `src/commands/doctor.ts`, `src/commands/onboard.ts`, `src/commands/status.ts`, `src/commands/configure.ts`

**`src/gateway/`:**

- Purpose: The gateway HTTP/WS server and all its sub-systems
- Contains: Server startup, HTTP handler, channel lifecycle, auth, hooks, WebSocket methods, canvas, broadcast
- Key files: `src/gateway/server.impl.ts`, `src/gateway/server-http.ts`, `src/gateway/server-channels.ts`, `src/gateway/server-startup.ts`

**`src/channels/`:**

- Purpose: Channel plugin type contracts, routing helpers, inbound dispatch primitives
- Contains: `plugins/` (type definitions and channel catalog), routing helpers, draft stream loop, run state machine
- Key files: `src/channels/registry.ts`, `src/channels/plugins/types.plugin.ts`, `src/channels/run-state-machine.ts`

**`src/auto-reply/`:**

- Purpose: Inbound message dispatch, command detection, reply queuing and streaming
- Contains: `dispatch.ts` (entry), `reply/` (dispatcher, queue, exec, command-subagents), command registry
- Key files: `src/auto-reply/dispatch.ts`, `src/auto-reply/reply/reply-dispatcher.ts`, `src/auto-reply/commands-registry.ts`

**`src/agents/`:**

- Purpose: LLM execution — model resolution, agent run loop, tools, sandbox, auth profiles
- Contains: `pi-embedded-runner/` (run loop), `tools/` (tool definitions), `sandbox/`, `skills/`, `auth-profiles/`
- Key files: `src/agents/pi-embedded.ts`, `src/agents/pi-embedded-runner/`, `src/agents/model-selection.ts`

**`src/plugin-sdk/`:**

- Purpose: Stable public cross-package API for extensions; one `.ts` per named subpath export
- Contains: Barrel re-exports only; each file maps to a `./plugin-sdk/<name>` package export
- Key files: `src/plugin-sdk/index.ts`, `src/plugin-sdk/channel-lifecycle.ts`, `src/plugin-sdk/routing.ts`

**`src/plugins/`:**

- Purpose: Plugin loader, registry, runtime factory, provider auth, bundled plugin metadata
- Contains: `registry.ts`, `loader.ts`, `types.ts`, `services.ts`, `runtime/` (PluginRuntime factory)
- Key files: `src/plugins/registry.ts`, `src/plugins/runtime/index.ts`, `src/plugins/loader.ts`

**`src/infra/`:**

- Purpose: Low-level shared infrastructure — env, backoff, archive, binaries, bonjour, path, restart, heartbeat, SSRF, etc.
- Contains: ~430 TypeScript files; no circular deps upward
- Key files: `src/infra/env.ts`, `src/infra/backoff.ts`, `src/infra/errors.ts`, `src/infra/restart.ts`

**`extensions/`:**

- Purpose: Workspace packages, one per plugin (channel, provider, tool, etc.)
- Contains: Each has its own `package.json`, `openclaw.plugin.json`, and `src/` with plugin entry
- Key files per extension: `extensions/<id>/src/<id>.ts` (plugin entry), `extensions/<id>/openclaw.plugin.json`

**`ui/`:**

- Purpose: Vite-built SPA served by the gateway as the control UI
- Contains: `src/main.ts` (entry), `src/ui/` (components), `src/i18n/`, `src/styles/`
- Key files: `ui/vite.config.ts`, `ui/src/main.ts`

## Key File Locations

**Entry Points:**

- `src/entry.ts`: Binary entry; spawned as `openclaw <cmd>`
- `src/index.ts`: Package root export for library consumers
- `src/library.ts`: Programmatic API re-exports (macOS app, programmatic use)
- `openclaw.mjs`: Thin wrapper shim pointing to `dist/entry.js`

**Configuration:**

- `src/config/io.ts`: Config file load/write/cache
- `src/config/types.ts`: `OpenClawConfig` TypeScript type
- `src/config/paths.ts`: `resolveStateDir()`, config file path resolution
- `src/config/validation.ts`: JSON Schema validation

**Gateway Core:**

- `src/gateway/server.impl.ts`: `startGatewayServer()` — top-level startup
- `src/gateway/server-http.ts`: HTTP/WS request handler
- `src/gateway/server-channels.ts`: Channel lifecycle (start/stop/restart)
- `src/gateway/server-startup.ts`: Plugin + model catalog initialization

**Routing:**

- `src/routing/resolve-route.ts`: `resolveAgentRoute()` — maps inbound to session key
- `src/routing/session-key.ts`: Session key construction utilities
- `src/routing/bindings.ts`: Config-driven routing bindings

**Plugin System:**

- `src/plugins/registry.ts`: `OpenClawPluginApi` implementation
- `src/plugins/runtime/index.ts`: `createPluginRuntime()` factory
- `src/plugins/loader.ts`: Plugin discovery and loading

**Testing:**

- `src/test-helpers/`: Shared test helpers and mocks
- `src/gateway/test-helpers.ts`, `src/gateway/test-with-server.ts`: Gateway test harness
- `test/`: Additional shared fixtures

## Naming Conventions

**Files:**

- Flat kebab-case: `server-channels.ts`, `resolve-route.ts`
- Domain prefix for related files: `server-startup.ts`, `server-http.ts`, `server-plugins.ts`
- `.runtime.ts` suffix: lazy-load boundary module (dynamic import target only)
- `.test.ts` suffix: co-located unit/integration tests
- `.e2e.test.ts` suffix: end-to-end tests
- `.live.test.ts` suffix: tests requiring live API keys

**Directories:**

- kebab-case matching domain name: `auto-reply/`, `canvas-host/`, `plugin-sdk/`
- Extension/plugin IDs are lowercase kebab: `extensions/amazon-bedrock/`, `extensions/msteams/`

**Exports:**

- Plugin SDK subpaths follow `openclaw/plugin-sdk/<kebab-name>` pattern matching filename in `src/plugin-sdk/`
- Bundled extension IDs match `extensions/<id>` directory name and `openclaw.plugin.json:id`

## Where to Add New Code

**New Core Feature (gateway behavior, new system):**

- Primary code: `src/<domain>/` (new subdirectory if warranted)
- Tests: colocated `src/<domain>/<file>.test.ts`
- If it needs a lazy-load boundary: create `src/<domain>/<module>.runtime.ts` and add it as a stable dist entry in `tsdown.config.ts`

**New CLI Subcommand:**

- Handler: `src/commands/<command-name>.ts`
- Registration: add to `src/cli/program/register.<group>.ts` (or create a new `register.<command>.ts`)
- Wire into `src/cli/program/command-registry.ts`

**New Channel Plugin:**

- Directory: `extensions/<channel-id>/`
- Required files: `package.json`, `openclaw.plugin.json`, `src/<channel-id>.ts` (plugin entry)
- Import SDK: `openclaw/plugin-sdk/*` only — never `../../src/`
- Register in `dist-runtime/extensions/` after build

**New Provider Plugin:**

- Same structure as channel plugin; implement `ProviderPlugin` type from `openclaw/plugin-sdk`
- Register via `api.provider.register(...)` in plugin entry function

**New Plugin SDK Subpath:**

- Add `src/plugin-sdk/<subpath>.ts` barrel file re-exporting from `src/<domain>/`
- Add corresponding export to `package.json` `"exports"` map
- Add to `scripts/lib/plugin-sdk-entries.mjs` build entry list

**Shared Utilities:**

- Small cross-cutting helpers: `src/infra/` (if infrastructure-level) or `src/shared/` (if higher-level)
- Channel-specific shared code: `extensions/shared/src/`

## Special Directories

**`dist/`:**

- Purpose: Compiled output from `pnpm build` (tsdown)
- Generated: Yes
- Committed: No (except `openclaw.mjs` shim)

**`dist-runtime/extensions/`:**

- Purpose: Bundled extension build artifacts loaded at gateway runtime
- Generated: Yes (per-extension build)
- Committed: Yes (pre-built bundles are shipped with the npm package)

**`docs/.generated/`:**

- Purpose: Generated baseline artifacts — config schema JSON, plugin SDK API surface
- Generated: Yes (`pnpm config:docs:gen`, `pnpm plugin-sdk:api:gen`)
- Committed: Yes (drift-checked in CI)

**`docs/.i18n/`:**

- Purpose: i18n pipeline for zh-CN translation (glossary, translation memory)
- Generated: Partially (`zh-CN.tm.jsonl` is generated)
- Committed: Yes (glossary is hand-maintained; TM is generated)

**`.agents/skills/`:**

- Purpose: Agent skill definition files for maintainer workflows (PR, release, GHSA, smoke tests)
- Generated: No
- Committed: Yes

**`.planning/codebase/`:**

- Purpose: GSD codebase analysis documents
- Generated: Yes (by GSD map-codebase)
- Committed: Yes

---

_Structure analysis: 2026-03-28_
