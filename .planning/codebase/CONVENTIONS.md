# Coding Conventions

**Analysis Date:** 2026-03-28

## Naming Patterns

**Files:**

- `kebab-case` for all source files: `gateway-lock.ts`, `fs-safe.ts`, `backoff.ts`
- `.test.ts` suffix for co-located unit tests: `gateway-lock.test.ts`
- `.e2e.test.ts` suffix for end-to-end tests: `pi-embedded-runner.e2e.test.ts`
- `.live.test.ts` suffix for tests requiring real API keys: `anthropic.setup-token.live.test.ts`
- `.runtime.ts` suffix for lazy-loading boundary modules: see `src/cli/send-runtime/`
- Dot-segmented names indicate compound responsibilities: `provider-usage.fetch.claude.test.ts`, `state-migrations.fs.test.ts`

**Functions:**

- `camelCase` for all functions: `computeBackoff`, `sleepWithAbort`, `createDefaultDeps`
- `createX` prefix for factory functions: `createDefaultDeps`, `createTrackedTempDirs`, `createSubsystemLogger`, `createFixtureSuite`
- `resolveX` prefix for resolution/path functions: `resolveStateDir`, `resolveConfigPath`, `resolveGlobalSingleton`
- `isX` / `hasX` prefix for type guards and boolean checks: `isErrno`, `hasErrnoCode`, `isNixMode`, `isPrivateIpAddress`
- `readX` / `loadX` prefix for reading data: `readErrorName`, `readConfigFileSnapshot`, `loadConfig`
- `formatX` prefix for display/string formatting: `formatErrorMessage`, `formatUncaughtError`, `formatCliCommand`

**Variables:**

- `camelCase` for all variables and parameters
- `UPPER_SNAKE_CASE` for module-level constants: `DEVICE_BOOTSTRAP_TOKEN_TTL_MS`, `REGISTRY_STATE`, `AGENT_EVENT_STATE_KEY`
- Abbreviated names in tight loops or local scope; full descriptive names for exported symbols

**Types and Interfaces:**

- `PascalCase` for types and interfaces: `BackoffPolicy`, `SafeOpenError`, `ChannelPlugin`, `SubsystemLogger`
- `type` keyword preferred over `interface`: `export type BackoffPolicy = { ... }`, `export type CliDeps = { ... }`
- Discriminated union result types use `{ ok: true; ... } | { ok: false; error: string }` pattern
- Error code union types use string literals: `export type SafeOpenErrorCode = "invalid-path" | "not-found" | ...`

**Classes:**

- `PascalCase`, named with a noun or noun phrase: `SafeOpenError`, `GatewayLockError`, `ClawHubRequestError`
- Custom errors append `Error` suffix and extend `Error`; set `this.name` in constructor

## Code Style

**Formatting:**

- Tool: `oxfmt` (Oxlint formatter)
- Check: `pnpm format:check` (`oxfmt --check --threads=1`)
- Fix: `pnpm format` or `pnpm format:fix` (`oxfmt --write`)
- Applied to TypeScript and Markdown

**Linting:**

- Tool: `oxlint` with type-aware rules (`pnpm lint` → `oxlint --type-aware`)
- No `@ts-nocheck` allowed; no disabling `no-explicit-any` at config level
- Inline suppression: `// oxlint-disable-next-line <rule>` (preferred) or `// eslint-disable-next-line <rule>` (legacy)
- Every suppression must include a reason comment above it
- `any` in test harnesses uses `// oxlint-disable-next-line typescript/no-explicit-any`

**TypeScript:**

- `strict: true` mode; `noEmit: true` for type checking
- `module: "NodeNext"` with `moduleResolution: "NodeNext"` — all imports use explicit `.js` extensions
- `import type` used for type-only imports: `import type { CanvasHostServer } from "../canvas-host/server.js"`
- No `@ts-ignore`; use `@ts-expect-error` with justification only when unavoidable
- `unknown` used for untyped external values; casts narrowed explicitly: `(err as { code?: unknown }).code`

## Import Organization

**Order (within a file):**

1. Node built-in modules: `import fs from "node:fs/promises"`, `import path from "node:path"`
2. Third-party packages: `import { defineConfig } from "vitest/config"`
3. Internal project imports: `import { resolveStateDir } from "../config/paths.js"`

**Path Aliases:**

- `openclaw/plugin-sdk` — public plugin SDK surface, resolved via tsconfig paths and vitest aliases
- `openclaw/plugin-sdk/<subpath>` — specific SDK subpath imports in extensions
- Extensions must not import from `src/**` directly; they use `openclaw/plugin-sdk/<subpath>`

**Import Style:**

- Named imports preferred; default imports used only for modules that export a single default
- `import type` for type-only imports to avoid runtime overhead
- Mixed type and value imports: `import { type ChannelId, listChannelPlugins } from "..."`

## Error Handling

**Custom Error Classes:**
All domain errors extend `Error` and set `this.name`:

```typescript
export class SafeOpenError extends Error {
  code: SafeOpenErrorCode;
  constructor(code: SafeOpenErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    this.name = "SafeOpenError";
  }
}
```

Located at: `src/infra/fs-safe.ts`, `src/infra/gateway-lock.ts`, `src/config/includes.ts`, etc.

**Result Object Pattern:**
For operations that can succeed or fail without throwing, use discriminated union:

```typescript
type Result = { ok: true; shellEnv: Map<string, string> } | { ok: false; error: string };
```

Used in: `src/infra/shell-env.ts`, `src/pairing/setup-code.ts`, `src/infra/node-pairing.ts`

**Throw vs. Return:**

- Throw custom `Error` subclasses for unexpected or unrecoverable conditions
- Return `{ ok: false, error: string }` for expected failure paths (user error, resource unavailable)
- Re-throw with `{ cause: err }` when wrapping lower-level errors: `throw new SafeOpenError("symlink", "...", { cause: err })`

**Catch Clauses:**

- Use bare `catch` (no binding) when the error value is not needed: `} catch {`
- Use `catch (err)` when re-throwing or inspecting: `} catch (err) { if (isErrno(err)) ... throw err; }`
- Helper `isErrno` in `src/infra/errors.ts` used to check errno-shaped errors

## Logging

**Framework:** Custom `SubsystemLogger` — `src/logging/subsystem.ts`

**Logger Creation:**

```typescript
const log = createSubsystemLogger("gateway");
// Hierarchical: "gateway/heartbeat", "retry-policy", "state-migrations"
```

**Methods:** `log.trace`, `log.debug`, `log.info`, `log.warn`, `log.error`, `log.fatal`

**Structured Metadata:**

```typescript
log.info("message", { key: value, count: n });
```

**When to Log:**

- `info` for lifecycle events (start/stop, connection established)
- `warn` for recoverable issues and unexpected-but-handled conditions
- `error` for unrecoverable errors before throwing or returning failure
- `debug`/`trace` for internals; only emitted when verbose mode is active

## Comments

**When to Comment:**

- Tricky or non-obvious logic: always add a brief inline comment
- Concurrency/race conditions: document the race and why the mitigation works
- Performance choices: explain why a particular approach was chosen
- Type assertions (`as unknown as X`): add a comment explaining why the cast is safe

**JSDoc:**

- Public API functions in `src/plugin-sdk/` use JSDoc
- Internal functions generally do not use JSDoc unless their signature is non-obvious

**Inline Disable Comments:**

- Always explain why a rule is disabled: `// oxlint-disable-next-line preserve-caught-error`

## Function Design

**Size:** Aim for single responsibility; extract helpers for reusable logic. Files kept under ~700 LOC where feasible.

**Parameters:** Complex functions accept a single params object: `function acquireGatewayLock(opts: GatewayLockOptions)`; simple pure functions use positional args: `function computeBackoff(policy: BackoffPolicy, attempt: number)`

**Return Values:** Async functions return `Promise<T>`; never mix sync/async returns. For operations that can fail predictably, return `{ ok: true; ... } | { ok: false; error: string }`.

**Default Parameters:** Injected dependencies use default values for production use, enabling test override:

```typescript
async function runCommand(deps: CliDeps = createDefaultDeps()) { ... }
```

## Module Design

**Exports:** Named exports only; no default exports from non-entry-point files.

**Barrel Files:** Used at directory boundaries (`src/channels/plugins/index.ts`) to re-export a stable public surface. Internal modules import directly from the source file, not the barrel, to avoid circular dependencies.

**Lazy Loading:** Dynamic imports only through dedicated `*.runtime.ts` boundary files. Never mix static and dynamic imports for the same module in production code.

**Singleton State:** Module-level globals use `Symbol.for("openclaw.<key>")` and `resolveGlobalSingleton()` to survive module re-evaluation across workers: `src/infra/agent-events.ts`.

---

_Convention analysis: 2026-03-28_
