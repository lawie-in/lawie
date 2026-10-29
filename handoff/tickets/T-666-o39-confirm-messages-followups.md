# T-666 — T-661 follow-ups: rename o39-confirm-messages, cross-pack field match

Status: built, READY 29 Oct (8595fb69). Ajay approved (fbc6a2ff). Follow-ups: T-668, T-669.

## Acceptance criteria
1. Rename `apps/drafting/src/config/intake/o39-confirm-messages.ts` to a pack-neutral name, because it now holds the signed ask lines for every pack. Update the imports. No string changes.
2. `isO39RequiredField` matches fields across packs. Make it pack-scoped, so that a field with the same key in another pack is not treated as O.39-required. Add a test with a same-key field in two packs.
3. Ajay byte-checks the branch head (legal content path).

## Mode
Small fix (drafting only), legal content.
