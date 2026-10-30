# T-705: Revising a draft (one free, then charged)

Status: MERGED into develop_staging ebf00150 (30 Oct 2026; Ajay approved). PRICE NOT YET APPROVED BY THE FOUNDER: must not reach prod until he does. Was: building (arjun). Raised 30 Oct 2026 by Priya on the founder's order via Arjun (13:40 UTC). Built by Arjun directly with crew agents; no dev lead.

Scope: after a draft, the user can ask for a revision. The first revision is free; each one after that is charged per draft.

Gates: the price per revision is the founder's call with Vikram; Ajay and Meera sign the user-facing copy and terms; billing changes follow the Ink rules in .claude/docs/credits-and-bonuses.md.

Price proposed by Vikram (via Arjun, 30 Oct 2026): one free revision per draft; each further revision costs the same Ink as the original quote (100%). Waiting on the founder's confirmation (money). Copy: Ajay and Meera, later.

Ships DARK (Arjun, 30 Oct 2026): feature.revisions (AppSetting or env, code default off) on fix/t-705-feature-flag. When it is off, the Revise button is hidden and the route refuses. Prod turns it on only after the founder approves the price.

PRICE APPROVED (30 Oct 2026): the founder approved in chat ("I approve the price but get the confirmation from CFO once"), and Vikram confirmed: one free revision per draft, then each further revision costs 100% of the original draft's Ink quote; a failed revision is never charged. Before setting feature.revisions = on in prod: Ajay's signed copy (done at b21b3139) and Anushka's PASS on a run with the setting on.

Founder (30 Oct 2026 17:40 UTC): feature.revisions stays OFF this month. Switching it on next month is gated on T-707b (atomic free-revision claim), then Anushka's PASS with the setting on.
