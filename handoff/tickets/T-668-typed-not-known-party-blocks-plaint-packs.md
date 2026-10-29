# T-668 — A typed "Not known" party blocks the brief in plaint packs too

Status: building (vishal), 29 Oct 2026. PRIORITY: the replication/WS form route is live on prod since v1.2.2 (no flag). Ajay AJ-668-M1..M4a: 0 prod generations, so no exposure and no notice. Form route moved in (M2/M3). Follow-up: T-671.

## Why
T-655 makes a ledger "Not known" block. In the plaint packs, a "Not known" plaintiff or defendant that the user types into the brief text does not block confirm. AJ-655-M1 says every path.

## Acceptance criteria
1. In every plaint pack, a user-typed non-answer ("Not known", "unknown" and the signed equivalents in the T-655 list) for a required party field blocks confirm, with the existing signed party line. There are no new strings.
2. O.39 behaviour is unchanged. The T-655 ledger rule stays pack-neutral (T-666).
3. Tests: a typed "Not known" party blocks in plaint_partition and one other plaint pack. A real name still passes.
4. Legal content: Ajay byte-checks before merge.

## Mode
Small fix (drafting only), legal content.
