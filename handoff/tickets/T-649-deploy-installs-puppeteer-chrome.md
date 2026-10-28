# T-649 — Deploy script installs Puppeteer's Chrome and smoke-tests a PDF

Status: assigned to vishal, 28 Oct 2026 (P1).

## Problem
PDF export and annexure packs have failed on prod since 27 Oct 13:55 UTC with `Puppeteer PDF render failed: Could not find Chrome (ver. 148.0.7778.97)`. The v1.2.0 install bumped puppeteer, but the matching Chrome build was never downloaded on the box. The ops fix tonight (an SSM action that installs Chrome) is separate. This ticket stops it happening again.

## Acceptance criteria
1. In `scripts/deploy-local.sh`, after `yarn install`, run `npx puppeteer browsers install chrome`. It's idempotent and caches in /home/ubuntu/.cache/puppeteer. The deploy fails if this step fails.
2. Add a post-deploy PDF smoke to the script's health gate: render one page to PDF and assert the bytes look like a PDF (`%PDF`). The deploy fails if it doesn't.
3. Use fictional content only. Write no file outside a temp dir and log no content.
4. The Scripts tests workflow covers both steps (mocked).
5. Only `scripts/deploy-local.sh` and its tests change.
