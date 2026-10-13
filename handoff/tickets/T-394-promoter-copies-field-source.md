# T-394 — Rule-pack fields keep their `source`, so section search works on v1 packs

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (drafting) |
| Mode   | Small fix |
| Status | Merged into develop_staging 5708bf3 (mahak, 13 Oct 2026). Latent fix; nothing to test in the UI. Priya |
| Source | Arjun, from Mahak's T-385 Explore |

## Problem

The rule-pack promoter (`template-promoter.ts`) never copies a field's `source` (`courts_db.*`, `bns_mapping`) into the config the renderer receives. So packs that declare `bns_mapping`, such as bail_anticipatory, show no section search in the form. Only the 6 docs/templates overrides send it.

## Acceptance criteria

1. The promoter copies field-level `source` into the promoted config for every pack field that declares one.
2. bail_anticipatory and the other v1 packs with `bns_mapping` show section search in the form.
3. A test pins 1 for at least one courts_db field and one bns_mapping field.
4. Drafting only: the promoter and a test.

## Mahak (13 Oct 2026)

This is a latent fix. AC2 already holds on develop_staging: the form reads /template-configs/:id, which serves the docs/templates override first, and all 6 packs with a field source (14 fields) have an override that already sends it. The fix matters once an override is retired, or a new pack with a source lands without one. The test pins promoted == override for each pack. Nothing to test in the UI.
