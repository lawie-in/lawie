# T-452: s.138 notice, drawer type required (signed)

Byte check of feature/t-452-drawer-type-required at 25ba5f41, 15 Oct 2026. The only rule change is the deletion of `"default": "individual",` at legal_notice_s138.json:88. `required: true` is kept. The test file is the only other change.

| Item | Mark |
|---|---|
| No default drawer type | Approved. s.141 must not be pleaded or withheld on a guessed drawer type. |
| Placeholder `Select…` instead of `Select drawer type` | Acceptable. The field label already names it, and an empty value is refused. |

Merge-body ref: "Legal: T-452 signed by Ajay, handoff/legal/T-452-drawer-type-signed.md; byte check 25ba5f41".

Signed: Ajay (CLO), 15 Oct 2026 IST.
