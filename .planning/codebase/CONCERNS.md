# Codebase Concerns

**Analysis Date:** 2026-03-28

---

## Tech Debt

### Accumulation of @deprecated API Surface

- Issue: 82 `@deprecated` markers exist across production source. Many are load-bearing — callers
  cannot simply delete the deprecated symbols because they may still be read by external plugin
  authors or live in migration paths.
- Files: `src/config/types.tools.ts` (8 deprecated fields), `src/config/types.telegram.ts`,
  `src/config/types.discord.ts`, `src/config/types.base.ts`, `src/plugins/types.ts` (4 deprecated
  type aliases), `src/plugins/runtime/types.ts`, `src/routing/resolve-route.ts`,
  `src/plugin-sdk/index.ts`, `src/gateway/channel-health-monitor.ts`, `src/gateway/client.ts`
- Impact: Every deprecated symbol that remains callable can be invoked by a third-party plugin,
  widening the surface indefinitely. Conditional migration branches in `src/config/io.ts`,
  `src/config/legacy-migrate.ts` etc. must be kept in sync with the deprecated fields or users
  will silently lose config on upgrade.
- Fix approach: Run an explicit deprecation-removal sprint per major version cycle. Emit runtime
  warnings via `src/config/validation.ts` when deprecated keys are detected so operators are
  forced to migrate before removal.

### Legacy Config Migration Sprawl

- Issue: Config migration logic is split across eight files adding up to ~2,500 LOC:
  `src/config/legacy.migrations.part-1.ts` (615 LOC), `src/config/legacy.migrations.part-2.ts`
  (426 LOC), `src/config/legacy.migrations.part-3.ts` (384 LOC), `src/config/legacy.ts`,
  `src/config/legacy.rules.ts`, `src/config/legacy.shared.ts`, `src/config/legacy-web-search.ts`,
  `src/config/legacy-migrate.ts`. Each migration part is independently imported and must be
  independently ordered.
- Impact: Every new config key that gets renamed adds another migration path. Any ordering error
  between parts silently produces a broken config. The multi-part split makes it hard to reason
  about which migration fires at what version.
- Fix approach: Consolidate into a single versioned migration runner (one array of numbered
  migrations) so ordering is explicit and auditable.

### Oversized Core Files

- Issue: 137 production source files in `src/` exceed the 700-LOC style guideline; 47 extension
  files similarly exceed it. The most critical:
  - `src/config/schema.base.generated.ts` — 16,294 LOC (generated but still parsed at startup)
  - `src/agents/pi-embedded-runner/run/attempt.ts` — 3,234 LOC (single-function god-file for
    agent run attempt; mixes model auth, prompt construction, hook dispatch, tool resolution)
  - `src/config/io.ts` — 2,120 LOC
  - `src/memory/qmd-manager.ts` — 2,076 LOC
  - `src/agents/subagent-registry.ts` — 1,806 LOC
  - `src/gateway/server-methods/chat.ts` — 1,754 LOC
  - `extensions/telegram/src/bot-handlers.runtime.ts` — 1,829 LOC
- Impact: Large files have high merge-conflict probability, are harder to test in isolation, and
  make targeted search/edit risky (one change affects multiple responsibilities).
- Fix approach: `run/attempt.ts` is the highest-priority split target; extract prompt-building,
  hook dispatch, and tool-resolution into separate focused modules.

### Test-Environment Guards Leaked Into Production Code

- Issue: 202 occurrences of `process.env.VITEST`, `process.env.NODE_ENV === "test"`, and
  `OPENCLAW_TEST_*` environment variable reads appear in non-test source files.
- Files: `src/infra/restart.ts`, `src/infra/bonjour.ts`, `src/infra/machine-name.ts`,
  `src/infra/env.ts`, `src/infra/update-startup.ts`, `src/infra/gateway-lock.ts`,
  `src/infra/session-maintenance-warning.ts`, `src/memory/manager-sync-ops.ts`,
  `src/config/io.ts`, `src/config/paths.ts`, and others
- Impact: Test-only escape hatches in production code are a maintenance hazard — they may be
  silently triggered by misconfigured CI environments and obscure real runtime bugs.
- Fix approach: Replace inline `process.env.VITEST` guards with a single `isTestEnvironment()`
  utility imported from `src/test-utils/` and co-located with test-utils. The production bundle
  can tree-shake these calls if they are behind a proper boundary module.

### Gaxios Prototype Mutation in Production

- Issue: `src/infra/gaxios-fetch-compat.ts` installs a runtime patch onto `Gaxios.prototype._defaultAdapter`
  to intercept HTTP dispatch. This violates the CLAUDE.md prohibition on prototype mutation.
- Files: `src/infra/gaxios-fetch-compat.ts` (lines 301-316)
- Impact: If `gaxios` is ever updated the `_defaultAdapter` method may be renamed or moved,
  silently breaking the patch with no TypeScript error at compile time. The patch is also
  non-idempotent if `installGaxiosFetchCompat()` is called from multiple worker threads.
- Fix approach: Replace with a proper subclass (`class PatchedGaxios extends Gaxios`) or
  constructor option override, as the library exposes `fetchImplementation` in its config.

### `as any` Casts in Production Code

- Issue: 23 occurrences of `as any`, `: any`, or `<any>` in non-test production source.
- Files: `src/gateway/tools-invoke-http.ts` (4 casts), `src/gateway/server.auth.shared.ts` (2
  casts), `src/plugins/hooks.ts` (4 casts around hook handler dispatch), `src/config/types.channels.ts`,
  `src/hooks/bundled/session-memory/transcript.ts`, `src/auto-reply/reply/get-reply-inline-actions.ts`,
  `src/auto-reply/reply/commands-core.ts`
- Impact: Eliminates TypeScript's protection at those call sites; runtime errors escape the type
  checker. Hook dispatch casts in `src/plugins/hooks.ts` are particularly risky because hooks are
  user-provided.
- Fix approach: Replace hook handler casts with a properly typed discriminated union for the hook
  event; replace `as any` in gateway tool dispatch with a proper interface for the tool schema.

---

## Known Bugs

### Typing Loop Calls `onReplyStart` After Run Completes

- Symptoms: When `markRunComplete()` fires before the typing interval fires, the typing loop still
  invokes `onReplyStart` again on the next interval tick, sending a spurious typing indicator to
  the channel.
- Files: `src/auto-reply/reply/typing-persistence.test.ts` (line 37, marked `// BUG:`)
- Trigger: Any reply that completes within 6 seconds (the typing interval) while the dispatch-idle
  flag has not yet been set.
- Workaround: None; the test currently documents the expected (broken) behavior and asserts the
  call count to prevent regression.

### Blockquote-to-Paragraph Produces Triple Newline

- Symptoms: Markdown `> quote\n\nparagraph` is rendered as `quote\n\n\nparagraph` (triple newline)
  rather than double newline by `markdownToIR`.
- Files: `src/markdown/ir.blockquote-spacing.test.ts` (lines 38-40, marked `// BUG:`)
- Trigger: Any message containing a blockquote followed by a paragraph rendered through the
  markdown IR pipeline (affects Telegram, Discord, and other channels using the shared renderer).
- Workaround: None; downstream channel formatters may or may not collapse multiple blank lines.

---

## Security Considerations

### `dangerouslyAllow*` Config Options Exposed to Operators

- Risk: Config keys `dangerouslyAllowPrivateNetwork`, `dangerouslyDisableDeviceAuth`,
  `dangerouslyAllowHostHeaderOriginFallback`, `dangerouslyAllowContainerNamespaceJoin`,
  `dangerouslyAllowReservedContainerTargets`, and `dangerouslyAllowExternalBindSources` are
  publicly documented in `src/config/schema.base.generated.ts` and may be set by any operator
  reading the docs.
- Files: `src/config/schema.base.generated.ts` (lines 434, 3046, 3049, 3052, 10150, 10156),
  `src/infra/net/ssrf.ts` (line 35), `src/infra/net/fetch-guard.ts` (line 42)
- Current mitigation: Keys include the `dangerously` prefix to communicate risk; SSRF guard in
  `src/infra/net/ssrf.ts` enforces DNS pinning when not in bypass mode.
- Recommendations: Require a secondary confirmation mechanism (for example a gateway restart or
  explicit operator acknowledgment) when any `dangerously*` key is activated; log a persistent
  WARNING to gateway logs when such keys are active at runtime.

### Deprecated Proxy Bypass Still Compilable

- Risk: `GuardedFetchOptions.proxy: "env"` and
  `dangerouslyAllowEnvProxyWithoutPinnedDns: true` are marked `@deprecated` but remain
  in the type definition and in the runtime branch at `src/infra/net/fetch-guard.ts:88`. A future
  developer could add a caller without realizing the bypass exists.
- Files: `src/infra/net/fetch-guard.ts` (lines 37-42, 88)
- Current mitigation: Deprecated JSDoc; no callers detected in non-test production code.
- Recommendations: Remove the deprecated fields entirely in the next major version; until then,
  add a runtime log warning when the deprecated path executes.

### Extension Boundary Violation in Telegram Test Support File

- Risk: `extensions/telegram/src/bot-native-commands.menu-test-support.ts` imports a type
  directly from `../../../src/agents/skills.js`, crossing the extension package boundary into core
  internals. While this file is test support only, it sets a precedent that type-only cross-package
  imports are acceptable.
- Files: `extensions/telegram/src/bot-native-commands.menu-test-support.ts` (line 3)
- Current mitigation: Import is `type`-only; no runtime coupling.
- Recommendations: Expose `SkillCommandSpec` via `openclaw/plugin-sdk/<subpath>` and update the
  import to use the public surface.

---

## Performance Bottlenecks

### Large Generated Config Schema Parsed at Import Time

- Problem: `src/config/schema.base.generated.ts` is 16,294 LOC of TypeBox JSON Schema objects.
  It is statically imported at gateway startup, contributing to cold-start time.
- Files: `src/config/schema.base.generated.ts`
- Cause: Generated schema is not lazy-loaded; any module that imports config validation brings the
  full schema into memory.
- Improvement path: Move to a deferred-import pattern similar to other runtime boundaries
  (`src/shared/lazy-runtime.ts`), loading the schema only when `validateConfig` is called for the
  first time.

### High Fake-Timer Test Count Without Verified Cleanup

- Problem: 532 test locations use `vi.advanceTimersByTime` or `useFakeTimers`. Because
  `--isolate=false` is enforced, leaked fake timers can bleed between suites and cause flaky
  ordering-sensitive failures.
- Files: Distributed across `src/**/*.test.ts`
- Cause: No shared lint rule enforces `afterEach(() => vi.useRealTimers())` or equivalent cleanup.
- Improvement path: Add a global Vitest setup hook that asserts fake timer cleanup; this has been
  flagged as a heap-leak concern in `.agents/skills/openclaw-test-heap-leaks/`.

---

## Fragile Areas

### `src/agents/pi-embedded-runner/run/attempt.ts` (3,234 LOC)

- Files: `src/agents/pi-embedded-runner/run/attempt.ts`
- Why fragile: This single file owns model auth resolution, prompt construction, tool registration,
  hook dispatch, bootstrap budget analysis, image sanitization, streaming, and failover. Any change
  to one concern risks unintended side effects on another. It imports from 40+ other modules.
- Safe modification: Always run the full gateway test suite (`pnpm test`) after changes, not just
  scoped tests. The e2e test `src/agents/pi-embedded-runner/run/attempt.test.ts` (1,998 LOC) is
  the primary regression gate.
- Test coverage: Has a companion test file, but integration test coverage for edge-case model auth
  and hook interactions is thin.

### Subagent Registry (In-Memory Global State)

- Files: `src/agents/subagent-registry.ts` (1,806 LOC), `src/agents/subagent-registry-state.ts`,
  `src/agents/subagent-registry-store.ts`
- Why fragile: The registry is a process-scoped singleton. Tests must call
  `resetSubagentRegistryForTests()` or state bleeds between test suites. Registry mutations during
  active subagent runs can produce race conditions.
- Safe modification: Wrap all mutations in the exported registry API functions; do not directly
  mutate the in-memory store from `server-methods/chat.ts` or other callers.
- Test coverage: Unit tests exist but do not cover concurrent registration of overlapping session
  keys.

### Memory Index Hybrid Search (Three Skipped Tests)

- Files: `src/memory/index.test.ts` (lines 291, 1265, 1274)
- Why fragile: Three integration tests for hybrid vector+keyword search are unconditionally
  skipped with `it.skip`. The actual search path in `src/memory/manager-sync-ops.ts` is exercised
  in production but the test harness does not have a deterministic vector injection strategy.
- Safe modification: Any change to `src/memory/manager-sync-ops.ts` embedding or scoring logic
  must be validated manually or by enabling the live test suite (`OPENCLAW_LIVE_TEST=1`).
- Test coverage gap: High — the skipped tests cover the primary user-visible memory retrieval
  path.

### Telegram Sticker/Fragment E2E Tests Disabled

- Files: `extensions/telegram/src/bot.media.stickers-and-fragments.e2e.test.ts` (lines 22, 73)
- Why fragile: Two sticker-related E2E tests are disabled pending issue #50185 (deterministic
  static sticker fetch injection). The code paths they cover involve media group buffering in
  `extensions/telegram/src/bot-handlers.buffers.ts`.
- Safe modification: Changes to media group flush timing (`MEDIA_GROUP_TIMEOUT_MS`) or the
  `TextFragmentEntry` timer must be manually tested against real Telegram sticker inputs.
- Test coverage gap: Medium — buffering logic has no automated coverage in CI.

---

## Scaling Limits

### `src/config/io.ts` Config Write Lock

- Current capacity: Single-process advisory lock via `src/infra/fs-pinned-write-helper.ts`.
- Limit: Concurrent gateway processes (multi-agent or test workers) writing config simultaneously
  can produce interleaved writes. The lock is advisory and does not work across OS-level process
  boundaries under high concurrency.
- Scaling path: Move to a SQLite-backed config store (which provides OS-level locking) or add an
  explicit IPC queue for config writes.

### `src/memory/qmd-manager.ts` Synchronous File Walk

- Current capacity: Functional up to several thousand memory files.
- Limit: `qmd-manager.ts` (2,076 LOC) performs synchronous directory walks when building the
  memory index. Large agent deployments with thousands of memory entries will see startup latency
  grow linearly.
- Scaling path: Convert the walk to an incremental inotify/fs.watch approach; the infrastructure
  exists in `src/infra/fs-safe.ts`.

---

## Dependencies at Risk

### `@buape/carbon` — Beta Pinned Version

- Risk: The Discord extension pins `@buape/carbon` at a pre-release timestamp version
  `0.0.0-beta-20260317045421`. CLAUDE.md explicitly forbids updating this dependency ("Never
  update the Carbon dependency").
- Files: `extensions/discord/package.json` (line 7)
- Impact: Security patches and API fixes in Carbon cannot be applied without explicit operator
  consent. If Discord changes its interaction API, the extension may break with no upgrade path.
- Migration plan: No migration plan is documented. Coordinate with maintainers before any upgrade.

### `@mariozechner/pi-*` — Exact Pinned External SDK

- Risk: Four pi-agent packages (`pi-agent-core`, `pi-ai`, `pi-coding-agent`, `pi-tui`) are pinned
  at exact versions (`0.61.1`) with no range. These are the core agent execution primitives.
- Files: `package.json` (dependencies block)
- Impact: A critical security fix in these packages cannot be applied automatically; every bump
  requires deliberate version testing of `src/agents/pi-embedded-runner/` code paths.
- Migration plan: Establish a validation test matrix for pi-agent upgrades before allowing minor
  version ranges.

### `hono` / `@hono/node-server` — Overridden Exact Versions

- Risk: Both are pinned in `pnpm.overrides` at exact versions (`4.12.8`, `1.19.10`). Any
  transitive dependency that depends on a newer hono version will be silently downgraded.
- Files: `package.json` (`pnpm.overrides` block)
- Impact: Gateway HTTP handling (`src/gateway/server.impl.ts`) could silently lose upstream
  security patches if the pinned versions are not monitored.
- Migration plan: Schedule a periodic review (every 30 days) of `hono` changelog for security
  fixes; use `pnpm audit` as a signal.

---

## Missing Critical Features

### No Public Audit Trail for `dangerously*` Config Activations

- Problem: When an operator enables `dangerouslyDisableDeviceAuth` or any other bypass key, no
  persistent log entry or audit event is emitted.
- Blocks: SOC2/security audit traceability for high-risk config changes.

---

## Test Coverage Gaps

### Agent Run Attempt Hook Dispatch

- What's not tested: The `as any` hook handler invocations in `src/plugins/hooks.ts`
  (lines 748, 813) are not covered by typed integration tests. Malformed hook results can crash
  the agent loop silently.
- Files: `src/plugins/hooks.ts`
- Risk: A plugin returning an unexpected shape from a `beforeAgentStart` or `beforePromptBuild`
  hook will cause untyped runtime errors in production.
- Priority: High

### Memory Hybrid Search (Skipped Tests)

- What's not tested: Vector + keyword hybrid scoring in `src/memory/manager-sync-ops.ts` embedding
  path, including zero-embedding fallback and `minScore` threshold enforcement.
- Files: `src/memory/index.test.ts` (skipped: lines 291, 1265, 1274)
- Risk: Search result quality regressions after embedding model changes go undetected until
  production user reports.
- Priority: High

### Telegram Media Group Buffer Timers

- What's not tested: `TextFragmentEntry.timer` lifecycle in
  `extensions/telegram/src/bot-handlers.buffers.ts`; the `MEDIA_GROUP_TIMEOUT_MS` flush path
  under concurrent media group arrivals.
- Files: `extensions/telegram/src/bot.media.stickers-and-fragments.e2e.test.ts` (issue #50185)
- Risk: Silent message drops or double-deliveries when Telegram sends sticker media groups.
- Priority: Medium

### Typing Persistence Bug Path

- What's not tested beyond the documented bug: What happens when the dispatch-idle signal fires
  during a mid-interval typing cycle.
- Files: `src/auto-reply/reply/typing-persistence.test.ts`
- Risk: Users see a frozen or double typing indicator in channels.
- Priority: Medium

---

_Concerns audit: 2026-03-28_
