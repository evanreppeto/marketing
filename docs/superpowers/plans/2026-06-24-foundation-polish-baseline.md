# CI Gate Baseline — 2026-06-24

Task 0 of the repo-hardening plan: measure which build/test/lint gates currently
PASS on a clean checkout so a later task knows which checks CI can safely make
**blocking**. No code was changed; this is a measurement-only record.

## Environment

- Branch: `claude/ecstatic-banach-83b3e9` (git worktree)
- pnpm version: **10.33.0**
- `pnpm install --frozen-lockfile`: **SUCCEEDED** — did not modify `pnpm-lock.yaml`
  (git status clean after install). Build scripts for a few deps
  (`@google/genai`, `core-js-pure`, `esbuild`, `protobufjs`) are ignored by pnpm
  by default; this is a warning, not a failure, and does not affect the gates.

## Results

| Command | Result | Note |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | PASS | Lockfile in sync; no modifications. |
| `pnpm typecheck` | PASS | `tsc --noEmit` clean, exit 0. |
| `pnpm lint` | **FAIL** | 16 problems: **3 errors**, 13 warnings. ESLint exits 1 on errors. |
| `pnpm test` | PASS | 290 test files, 1660 tests, all passing. |
| `pnpm build` | PASS | `next build` completed, exit 0. |
| `pnpm --filter ./apps/arc-runner typecheck` | PASS | `tsc --noEmit -p tsconfig.json` clean. |
| `pnpm --filter ./apps/arc-runner test` | PASS | 26 test files, 122 tests, all passing. |
| `pnpm --filter ./packages/arc-connector test` | PASS | 2 test files, 7 tests, all passing. |

The `--filter ./path` form worked for every workspace command; the package-`name`
fallback (`@bsr/arc-runner`, `@growth-engine/arc`) was not needed.
`packages/arc-connector` has **no** `typecheck` script (only `test`), so that gate
was not run there.

## Failure analysis

### `pnpm lint` — FAIL (pre-existing code issue, not environment)

ESLint reports 3 errors (and 13 unused-var warnings, which do not fail the run).
These are lint-rule violations in committed source — a **pre-existing code
failure**, not an environment/setup problem. The errors:

```
src/app/settings/workspace-invite-form.tsx
  73:64   error  `'` can be escaped with `&apos;` ...  react/no-unescaped-entities
  122:97  error  `'` can be escaped with `&apos;` ...  react/no-unescaped-entities

src/lib/auth/workspace-onboarding.test.ts
  49:11   error  Unexpected aliasing of 'this' to local variable  @typescript-eslint/no-this-alias
```

Two are unescaped apostrophes in JSX; one is a `this` alias in a test mock. All
are trivially fixable but are **out of scope for this task** (measure only).

## Recommendation for CI

**Safe to make BLOCKING now** (observed exit 0 on a clean checkout):

- `pnpm install --frozen-lockfile`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm --filter ./apps/arc-runner typecheck`
- `pnpm --filter ./apps/arc-runner test`
- `pnpm --filter ./packages/arc-connector test`

**Keep NON-BLOCKING initially** (currently failing):

- `pnpm lint` — fails on 3 pre-existing ESLint errors. Make it blocking only
  after those 3 errors are fixed (a tiny follow-up). Until then, run it in CI as
  a non-blocking / informational step so it doesn't gate merges.
