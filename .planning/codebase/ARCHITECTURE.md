# Architecture

**Analysis Date:** 2026-03-28

## Pattern Overview

**Overall:** Plugin-based multi-channel AI gateway

**Key Characteristics:**

- A central gateway server (`src/gateway/`) brokers messages between messaging channels and AI providers via a plugin registry
- All channel integrations are implemented as plugins (`extensions/*`) loaded at runtime against the Plugin SDK contract
- An inbound message triggers routing → session resolution → agent dispatch → reply pipeline → outbound send
- CLI (`src/cli/`) and gateway runtime are distinct entry points sharing the same config and session layers
- Lazy-loading (`*.runtime.ts` boundaries) keeps startup lean and prevents module-singleton collisions

## Layers

**CLI Layer:**

- Purpose: Parse user commands and dispatch to gateway RPC or local side-effects
- Location: `src/cli/`
- Contains: Command modules per sub-command (`src/cli/program/register.*.ts`), option parsers, progress UI
- Depends on: `src/config/`, `src/gateway/` (via RPC), `src/channels/`, `src/commands/`
- Used by: `src/entry.ts` (main binary entrypoint)

**Gateway Server Layer:**

- Purpose: Central runtime — owns HTTP/WS server, channel lifecycle, session management, and plugin services
- Location: `src/gateway/`
- Contains: `server.impl.ts` (startup orchestration), `server-http.ts` (HTTP/WS handler), `server-channels.ts` (channel lifecycle manager), `server-startup.ts`, `server-methods/` (RPC dispatch)
- Depends on: `src/channels/`, `src/plugins/`, `src/agents/`, `src/config/`, `src/routing/`
- Used by: `src/entry.ts`, `src/cli/gateway-cli.ts`

**Channel Plugin Layer:**

- Purpose: Adapter contract between a messaging platform and core dispatch logic
- Location: `extensions/<channel-id>/src/` (runtime code), `src/channels/plugins/` (type contracts)
- Contains: Per-channel plugin implementing `ChannelPlugin<ResolvedAccount, Probe, Audit>` with adapters for lifecycle, messaging, setup, outbound, pairing, etc.
- Depends on: `openclaw/plugin-sdk/*` subpaths only (not `src/**` directly)
- Used by: Gateway channel lifecycle manager at runtime via plugin registry

**Routing Layer:**

- Purpose: Map an inbound `(channel, accountId, peer)` tuple to a session key and agent ID
- Location: `src/routing/`
- Contains: `resolve-route.ts` (main routing function), `bindings.ts`, `session-key.ts`, `account-lookup.ts`
- Depends on: `src/config/`
- Used by: Channel inbound dispatch (`src/auto-reply/dispatch.ts`, channel plugin inbound handlers)

**Agent / AI Execution Layer:**

- Purpose: Run the LLM turn — maintain conversation context, invoke tools, stream reply
- Location: `src/agents/`
- Contains: `pi-embedded-runner/` (embedded agent execution), `tools/` (tool definitions), `auth-profiles/` (provider credential resolution), `skills/` (skill loader), `sandbox/` (execution sandbox)
- Depends on: `src/plugins/` (provider plugins), `src/config/`, `src/memory/`
- Used by: `src/auto-reply/reply/` (reply dispatcher), gateway node invoke endpoints

**Auto-Reply / Dispatch Layer:**

- Purpose: Receive a finalized inbound context, gate it (commands, allowlists), and coordinate the reply lifecycle
- Location: `src/auto-reply/`
- Contains: `dispatch.ts` (main entry), `reply/` (dispatcher, queue, exec, commands), `commands-registry.ts`, `templating.ts`
- Depends on: `src/agents/`, `src/channels/`, `src/routing/`, `src/config/`
- Used by: Channel plugin inbound handlers and gateway WebSocket message events

**Plugin SDK Layer:**

- Purpose: Stable public API surface for extensions; re-exports selected core internals under versioned subpaths
- Location: `src/plugin-sdk/`
- Contains: Barrel re-exports organized by subpath (e.g. `channel-lifecycle.ts`, `channel-inbound`, `routing`, `config-runtime`, etc.)
- Depends on: Core `src/**` internals (re-exports only)
- Used by: All `extensions/*` production code via `openclaw/plugin-sdk/<subpath>`

**Plugin Registry / Runtime Layer:**

- Purpose: Load, validate, and register plugins; expose a unified runtime API to plugins at execution time
- Location: `src/plugins/`
- Contains: `registry.ts` (registration), `runtime/index.ts` (PluginRuntime factory), `loader.ts`, `types.ts`, `services.ts`
- Depends on: `src/channels/`, `src/agents/`, `src/hooks/`, `src/memory/`
- Used by: Gateway server (`server.impl.ts`, `server-plugins.ts`)

**Config Layer:**

- Purpose: Load, validate, migrate, and cache the YAML/JSON5 config file; expose typed snapshots
- Location: `src/config/`
- Contains: `io.ts` (file I/O), `types.ts` (schema types), `validation.ts`, `paths.ts`, `sessions.ts`, `legacy-migrate.ts`
- Depends on: Nothing in `src/` (pure FS + type layer)
- Used by: Nearly every other layer

**Infra Layer:**

- Purpose: Cross-cutting utilities — env, backoff, archive, binaries, bonjour, path helpers, restart, secrets runtime, etc.
- Location: `src/infra/`
- Contains: ~430 files covering env normalization, error formatting, machine identity, heartbeat, skills-remote, update-startup, and more
- Depends on: Node.js built-ins, no circular deps with higher layers
- Used by: All layers above

## Data Flow

**Inbound Message (e.g. Telegram → LLM reply):**

1. Channel plugin receives webhook/polling event (e.g. `extensions/telegram/src/bot-handlers.runtime.ts`)
2. Plugin resolves account, applies allow-from + allowlist gating (`src/channels/plugins/allowlist-match.ts`)
3. Plugin calls `dispatchInboundMessage` or `dispatchInboundMessageWithBufferedDispatcher` (`src/auto-reply/dispatch.ts`)
4. Dispatch layer resolves route via `resolveAgentRoute` (`src/routing/resolve-route.ts`) → gets `sessionKey` + `agentId`
5. Dispatch runs command detection; if a native command matches, it executes and returns early
6. For AI turns, a `ReplyDispatcher` is created and the embedded pi-agent is run (`src/agents/pi-embedded-runner/`)
7. Streaming tokens are fed through `DraftStreamLoop` (`src/channels/draft-stream-loop.ts`) to the channel's streaming adapter
8. Final reply is sent via the channel's outbound adapter; session transcript is persisted

**Outbound Send (CLI `message send`):**

1. CLI `send` command resolves target via `src/cli/outbound-send-mapping.ts`
2. Lazy-loads per-channel send runtime (`src/cli/send-runtime/<channel>.ts`)
3. Calls channel's `sendMessage` with resolved account + recipient

**Plugin Registration (gateway startup):**

1. `startGatewayServer` (`src/gateway/server.impl.ts`) calls `loadOpenClawPlugins`
2. Plugin loader discovers bundled plugins from `dist-runtime/extensions/` and user-installed plugins
3. Each plugin's `openclaw.plugin.json` is read; the plugin entry is dynamically imported
4. Plugin calls `api.channel.register(...)` / `api.provider.register(...)` etc. against the Plugin Registry (`src/plugins/registry.ts`)
5. Gateway channel manager (`src/gateway/server-channels.ts`) starts each registered channel account with backoff

**State Management:**

- Config: loaded from `~/.openclaw/config.json5`; runtime snapshot cached in memory and refreshed on file change via `server-startup.ts` reload handlers
- Sessions: append-only JSONL files under `~/.openclaw/agents/<agentId>/sessions/`
- Channel runtime state: held in a `ChannelRuntimeStore` Map in the gateway process (no persistence)

## Key Abstractions

**ChannelPlugin:**

- Purpose: Full adapter contract a messaging channel must implement
- Examples: `extensions/telegram/src/bot.ts`, `extensions/discord/src/discord.ts`, `extensions/slack/src/slack.ts`
- Pattern: Export default implementing `ChannelPlugin<ResolvedAccount, Probe, Audit>` with named adapter objects

**OpenClawPluginApi (plugin registration API):**

- Purpose: Injected `api` object passed to each plugin's entry function; used to register channels, providers, CLI commands, hooks, tools
- Examples: `src/plugins/registry.ts` (implementation), `src/plugins/types.ts` (type)
- Pattern: `api.channel.register(plugin)`, `api.provider.register(providerPlugin)`, `api.cli.register(registrar)`

**PluginRuntime:**

- Purpose: Runtime services injected into plugin execution context (agent, channel, config, tools, media, tts, etc.)
- Examples: `src/plugins/runtime/index.ts` (factory), `src/plugins/runtime/types.ts` (type)
- Pattern: Lazy-loaded facade; `createLazyRuntimeMethod` wraps each capability so the heavy module is only loaded when first called

**ReplyDispatcher:**

- Purpose: Manages reply lifecycle — buffering, typing indicators, concurrency, streaming updates
- Examples: `src/auto-reply/reply/reply-dispatcher.ts`
- Pattern: Created per inbound message; `markComplete()` + `waitForIdle()` on every exit path (enforced by `withReplyDispatcher`)

**DraftStreamLoop:**

- Purpose: Throttled streaming message updater for channels that support live-edit
- Examples: `src/channels/draft-stream-loop.ts`
- Pattern: Call `update(text)` on each token chunk; call `flush()` + `stop()` when complete

## Entry Points

**Binary Entry (`openclaw.mjs` → `dist/entry.js`):**

- Location: `src/entry.ts`
- Triggers: `openclaw <command>` invocations
- Responsibilities: Profile/env setup, respawn logic (container / profile switch), then delegates to `runCli`

**CLI Runner:**

- Location: `src/cli/run-main.ts`
- Triggers: Called from `src/entry.ts` after env setup
- Responsibilities: Build Commander program, register sub-commands, parse argv, execute matched command

**Gateway Server Start:**

- Location: `src/gateway/server.impl.ts` (`startGatewayServer`)
- Triggers: `openclaw gateway run` CLI command or programmatic import
- Responsibilities: Load config, load plugins, start HTTP/WS server, start channel runtimes, wire health monitor and cron

**Library Export (`dist/index.js`):**

- Location: `src/index.ts`
- Triggers: `import "openclaw"` from external code or macOS app
- Responsibilities: Lazy-load and re-export selected helper functions for programmatic use

## Error Handling

**Strategy:** Structured error propagation with per-layer recovery; channels restart with exponential backoff on crash

**Patterns:**

- Channel lifecycle: `CHANNEL_RESTART_POLICY` backoff in `src/gateway/server-channels.ts`; up to `MAX_RESTART_ATTEMPTS = 10` before giving up
- Reply dispatch: `withReplyDispatcher` ensures dispatcher cleanup even on exception
- Gateway startup: Non-fatal plugin load errors are logged but do not abort startup
- CLI: Exit-code-aware error formatter via `src/infra/errors.ts` (`formatUncaughtError`)

## Cross-Cutting Concerns

**Logging:** `src/logger.ts` / `src/logging/subsystem.ts` — `createSubsystemLogger(name)` returns a tagged logger; piped through `src/logging/` aggregation
**Validation:** Config validated via JSON Schema + custom validators in `src/config/validation.ts`; plugin registration validated in `src/plugins/registry.ts`
**Authentication:** Gateway HTTP auth via `src/gateway/auth.ts`; channel pairing via `src/channels/plugins/` pairing adapters; device pair tokens in `extensions/device-pair/`

---

_Architecture analysis: 2026-03-28_
