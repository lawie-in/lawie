# T-380 — Web test files typecheck clean; remove the exclusion

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (web) |
| Mode   | Small fix |
| Status | Mahak, after T-365. Known errors (Mahak, 13 Oct): VerifyEmailPrompt.test.tsx 32 and verify-email/__tests__/page.test.tsx 13 (T-223), PrivacyUpdatePrompt.test.tsx 18 (T-343), signup-source.test.tsx 1. VerifyEmailPrompt.test.tsx is on Kunal's T-370 row until it merges |
| Source | T-369 (Arjun): the CI web typecheck excludes `__tests__` through apps/web/tsconfig.typecheck.json |

## Acceptance criteria

1. The 4 web test files with ~60 type errors typecheck clean under tsc.
2. `__tests__` is removed from the exclusion in apps/web/tsconfig.typecheck.json (or the file is dropped if nothing else needs it).
3. The CI web typecheck step stays green.
