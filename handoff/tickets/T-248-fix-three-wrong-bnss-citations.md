# T-248 — Fix three wrong BNSS citations in shipped packs

| Field          | Value |
| -------------- | ----- |
| Phase          | 1 — Describe and draft |
| Owner          | Ajay (signed, 345bd24). Lead (build). Anushka (verdict) |
| Mode           | Small fix. Legal content: apply Ajay's signed text only |
| Status         | To do. Urgent: these are live errors. Next for shashank after T-227 |

Ajay found these while writing T-245 (handoff/legal/T-245-old-new-law-switch-signed.md):

| Pack | Wrong | Right |
|---|---|---|
| review_petition | S.413 BNSS | **S.403 BNSS** (Ajay corrected his own 402 on 12 Oct: CrPC 362 = BNSS 403, T-255) |
| habeas_corpus | S.97 BNSS | S.100 BNSS |
| discharge_application | S.272 BNSS (summons case) | S.268 BNSS (warrant case instituted on complaint) |

## Acceptance criteria

1. Only these citations change, word for word as in Ajay's signed file. Nothing else in the packs changes.
2. Test: each pack cites the right section and not the wrong one.
3. Any golden snapshot that moves is listed for Ajay. CI green on drafting.
4. T-245b later builds on top of this fix, not over it.

**Correction (12 Oct 2026):** review_petition takes **S.403**, not 402. Use Ajay's current signed text in handoff/legal/T-245-old-new-law-switch-signed.md.
