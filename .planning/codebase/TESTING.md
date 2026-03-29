# Testing Patterns

**Analysis Date:** 2026-03-28

## Test Framework

**Runner:**

- Vitest (multiple configs, see below)
- Config: `vitest.config.ts` (base), `vitest.unit.config.ts`, `vitest.e2e.config.ts`, `vitest.gateway.config.ts`, `vitest.channels.config.ts`, `vitest.extensions.config.ts`, `vitest.live.config.ts`
- Pool: `forks` only — never `threads`, `vmThreads`, or `vmForks`
- Workers: max 16; CI uses 2–3 workers; local uses `max(4, min(16, cpuCount))`

**Assertion Library:**

- Vitest built-in (`expect`)

**Run Commands:**

```bash
pnpm test                    # Run all unit tests via parallel wrapper (node scripts/test-parallel.mjs)
pnpm test -- <path-or-filter> [vitest args...]   # Scoped run (e.g., pnpm test -- src/infra/errors.test.ts)
pnpm test:coverage           # Unit tests with V8 coverage (vitest run --config vitest.unit.config.ts --coverage)
pnpm test:e2e                # E2E tests (vitest run --config vitest.e2e.config.ts)
pnpm test:changed            # Only tests changed since origin/main
OPENCLAW_LIVE_TEST=1 pnpm test:live   # Live tests with real API keys
OPENCLAW_TEST_PROFILE=low OPENCLAW_TEST_SERIAL_GATEWAY=1 pnpm test   # Low-memory mode for CI
```

## Test File Organization

**Location:** Co-located with source in the same directory

**Naming:**

- Unit: `<module>.test.ts` — same name as the source file: `backoff.ts` → `backoff.test.ts`
- E2E: `<module>.e2e.test.ts` — for gateway/agent integration: `pi-embedded-runner.e2e.test.ts`
- Live (real API keys): `<module>.live.test.ts` — excluded from default runs: `anthropic.setup-token.live.test.ts`
- Node-environment-only: `<module>.node.test.ts` — `storage.node.test.ts`
- Browser-environment: `<module>.browser.test.ts` — `focus-mode.browser.test.ts`

**Structure:**

```
src/
  infra/
    backoff.ts
    backoff.test.ts          # co-located unit test
    gateway-lock.ts
    gateway-lock.test.ts
src/
  test-utils/                # shared test helpers (NOT test files)
    env.ts
    temp-home.ts
    tracked-temp-dirs.ts
    fixture-suite.ts
    fetch-mock.ts
    vitest-mock-fn.ts
test/
  setup.ts                   # global setup file
  test-env.ts                # HOME isolation helpers
```

## Test Structure

**Suite Organization:**

```typescript
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { functionUnderTest } from "./module.js"; // .js extension required

describe("module name", () => {
  // Shared fixtures at describe level
  const tempDirs = createTrackedTempDirs();

  beforeAll(async () => {
    // One-time setup: create temp root dirs
  });

  beforeEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    await tempDirs.cleanup();
  });

  afterAll(async () => {
    // Clean up temp directories created with fs.mkdtemp
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  });

  it("describes the behavior being tested", async () => {
    // arrange
    const env = await makeEnv();
    // act
    const result = await functionUnderTest(env);
    // assert
    expect(result).not.toBeNull();
  });
});
```

Top-level `beforeAll` / `afterAll` without a `describe` wrapper is also used when the whole file covers one module: `src/pairing/pairing-store.test.ts`

**Patterns:**

- Test description: plain English sentence beginning with a verb ("resolves after delay", "blocks concurrent acquisition")
- Each `it` tests one behavior; group related tests in nested `describe` blocks
- Always clean up timers in `afterEach`: `vi.useRealTimers()`, `vi.restoreAllMocks()`

## Mocking

**Framework:** Vitest (`vi`)

**Module Mocking (top-level, hoisted):**

```typescript
vi.mock("../infra/device-bootstrap.js", () => ({
  issueDeviceBootstrapToken: vi.fn(async () => ({
    token: "bootstrap-123",
    expiresAtMs: 123,
  })),
}));
```

Used for: external services, native modules, modules with side effects at import time.

**Spy-based Mocking (per-test):**

```typescript
const spy = vi
  .spyOn(fs, "stat")
  .mockRejectedValue(Object.assign(new Error("EPERM"), { code: "EPERM" }));
// ...
spy.mockRestore(); // always in finally or afterEach
```

Used for: Node built-ins (`fs`, `crypto`, `net`), Math methods (`Math.random`).

**Environment Variable Stubbing:**

```typescript
vi.stubEnv("OPENCLAW_GATEWAY_TOKEN", "");
vi.stubEnv("HOME", "/srv/openclaw-home");
// Automatically restored because vitest.config.ts sets unstubEnvs: true
```

**Fake Timers:**

```typescript
vi.useFakeTimers();
vi.setSystemTime(new Date("2026-03-14T12:00:00Z"));
// ... test code ...
vi.advanceTimersByTime(1000);
// In afterEach:
vi.useRealTimers();
```

**Mock Type Helper:**

```typescript
// src/test-utils/vitest-mock-fn.ts
export type MockFn<T extends (...args: any[]) => any = (...args: any[]) => any> =
  import("vitest").Mock<T>;
```

Use `MockFn<typeof someFn>` to type mock variables; avoids TS2742 inferred type issues.

**What to Mock:**

- Node built-ins when testing error handling (EACCES, EPERM, ECONNREFUSED)
- External HTTP/network calls (never make real network requests in unit tests)
- File system in tests that run multiple times concurrently (use temp dirs instead when possible)
- Time-dependent code via `vi.useFakeTimers()`

**What NOT to Mock:**

- The module under test itself
- Core data structures and pure utility functions
- File I/O when using isolated temp directories (prefer real FS over mocks)

## Fixtures and Factories

**Temp Directory Pattern — `createTrackedTempDirs()` (preferred):**

```typescript
const tempDirs = createTrackedTempDirs();

afterEach(async () => {
  await tempDirs.cleanup();
});

it("does something with files", async () => {
  const dir = await tempDirs.make("openclaw-test-");
  // use dir ...
});
```

Source: `src/test-utils/tracked-temp-dirs.ts`

**Single Temp Dir — `withTempDir()`:**

```typescript
await withTempDir("openclaw-test-", async (dir) => {
  // dir is cleaned up automatically
});
```

Source: `src/test-utils/temp-dir.ts`

**Fixture Suite Pattern (multiple cases per test file):**

```typescript
const suite = createFixtureSuite("openclaw-gateway-lock-");

beforeAll(async () => suite.setup());
afterAll(async () => suite.cleanup());

it("case A", async () => {
  const dir = await suite.createCaseDir("case-a");
  // ...
});
```

Source: `src/test-utils/fixture-suite.ts`

**Home Directory Isolation:**

```typescript
// test/setup.ts runs this for all tests globally:
const testEnv = withIsolatedTestHome();
// Redirects HOME/OPENCLAW_STATE_DIR to a temp directory per test run
```

**Environment Helpers:**

```typescript
// Scoped env override for async tests:
await withEnvAsync({ OPENCLAW_STATE_DIR: dir }, async () => {
  // process.env.OPENCLAW_STATE_DIR === dir here
});

// Sync env override:
withEnv({ HOME: "/tmp/fake-home" }, () => {
  // ...
});
```

Source: `src/test-utils/env.ts`

**Helper Functions in Test Files:**
Complex tests extract helper functions at file scope (not inside `it`):

```typescript
async function makeEnv() { ... }
function resolveLockPath(env: NodeJS.ProcessEnv) { ... }
async function writeLockFile(env: NodeJS.ProcessEnv, params = { startTime: 111 }) { ... }
```

This keeps `it` blocks short and the intent clear.

## Coverage

**Requirements:**

- Lines: 70%
- Functions: 70%
- Branches: 55%
- Statements: 70%

**Provider:** V8

**Scope:** Only `./src/**/*.ts` counts toward coverage. Extensions, UI, CLI wiring, and integration surfaces are excluded. See `vitest.config.ts` coverage.exclude list.

**View Coverage:**

```bash
pnpm test:coverage
# Outputs text summary + generates lcov report
```

## Test Types

**Unit Tests (`*.test.ts`):**

- Scope: single module or small set of collaborating modules
- Use temp dirs and mocked dependencies; no real network
- Must clean up all timers, mocks, and file system state
- Included in default `pnpm test` run

**E2E Tests (`*.e2e.test.ts`):**

- Scope: full agent runs, gateway lifecycle, hook execution chains
- Config: `vitest.e2e.config.ts`; runs 1 worker locally, 2 on CI
- Run with: `pnpm test:e2e`

**Live Tests (`*.live.test.ts`):**

- Scope: real API provider calls (Anthropic, OpenAI, etc.)
- Guarded by `isLiveTestEnabled()` from `src/agents/live-test-helpers.ts`
- Run with: `OPENCLAW_LIVE_TEST=1 pnpm test:live`
- Use `describe.skip` when the env flag is absent: `const describeLive = LIVE ? describe : describe.skip`

**Contract Tests:**

- Location: `src/channels/plugins/contracts/`, `src/plugins/contracts/`
- Run with: `pnpm test:contracts:channels`, `pnpm test:contracts:plugins`

## Common Patterns

**Async Testing:**

```typescript
it("resolves after delay using fake timers", async () => {
  vi.useFakeTimers();
  const promise = sleep(1000);
  vi.advanceTimersByTime(1000);
  await expect(promise).resolves.toBeUndefined();
  vi.useRealTimers();
});
```

**Error Testing:**

```typescript
// Test that a function throws a specific error class:
await expect(pending).rejects.toBeInstanceOf(GatewayLockError);

// Test error shape:
await expect(fn()).rejects.toMatchObject({
  message: "aborted",
  cause: expect.anything(),
});

// Test a custom error has a specific code:
const err = Object.assign(new Error("busy"), { code: "EADDRINUSE" });
expect(hasErrnoCode(err, "EADDRINUSE")).toBe(true);
```

**Platform-Conditional Tests:**

```typescript
const describeUnix = process.platform === "win32" ? describe.skip : describe;
describe.skipIf(isWindows)("restart-stale-pids", () => { ... });
const maybeIt = process.platform === "win32" ? it.skip : it;
```

**Result Object Assertions:**

```typescript
const result = await someFunction();
expect(result.ok).toBe(true);
if (!result.ok) throw new Error("expected success"); // type narrowing
expect(result.payload.token).toBe("bootstrap-123");
```

**Global Setup (`test/setup.ts`):**

- Mocks `@mariozechner/pi-ai` and `@mariozechner/clipboard` globally
- Sets `VITEST=true` and `OPENCLAW_PLUGIN_MANIFEST_CACHE_MS=60000`
- Creates isolated HOME/state directory via `withIsolatedTestHome()`
- Resets agent/session/registry state in `afterEach` using test-internal reset helpers (e.g., `resetContextWindowCacheForTest`, `resetSessionWriteLockStateForTest`)

---

_Testing analysis: 2026-03-28_
