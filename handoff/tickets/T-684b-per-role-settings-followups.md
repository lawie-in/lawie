# T-684b: Per-role model settings follow-ups

Status: item 1 READY (shashank, fix/t-684b-insert-only-copy @ 08dc0bad, 30 Oct 2026); items 2-8 backlog. Raised 29 Oct 2026 by Kunal at T-684 READY (0896cfa9)
Priority: P2. The legacy-key removal waits until T-684 has been on prod for one release.

1. The admin AI settings page's Copy action should use an insert-only PUT, so it never overwrites an existing ai.model.\* key.
2. scripts/golden-set/run.ts still reads the old model keys. Move it to the ai.model.<role> keys.
3. After one release on the fallback, remove the legacy keys ai.drafting_model, ai.intake_model and ai.preflight_model, and their read-time fallback.
4. Wire the matcher role's call site to ai.model.matcher.
5. Ops (Nikhil, via Arjun): any alert on /health config_warnings that names the old keys must be changed to the ai.model.\* names when T-684 deploys.

## Added 30 Oct 2026 (Arjun, from Nikhil's v1.2.7 deploy check). Owner: kunal

6. Run apps/drafting/scripts/migrate-model-settings.ts on prod (legacy ai._\_model to ai.model._) as a Nikhil document action, with the founder's go: dry run first, then --apply, numbers only in the report.
7. The migration must run on prod BEFORE the release that removes the legacy keys and their fallback (item 3). Item 3 is blocked until item 6 is done and verified.

## Added 30 Oct 2026 (Shashank, from item 1 review)

8. apps/drafting/scripts/migrate-model-settings.ts:90-101 bumps updatedAt on rows that already exist (the same bug item 1 round 1 had). Fix it so existing rows are left untouched, before item 6 runs on prod. Item 6 is blocked until this is merged.
