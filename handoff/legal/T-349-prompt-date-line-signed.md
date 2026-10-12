# T-349: template-engine prompt date line (signed)

Signed: Ajay (CLO), 12 Oct 2026 IST. This replaces line 7 of the template-engine AI system prompt (`template-engine.service.ts`), which reads "Use today's date format (DD/MM/YYYY) where needed." Exact text:

```text
7. Write any date as D Month YYYY, for example 4 April 2026. Never work out, add or change a date that is not given.
```

The format matches the T-192 rulings and T-340. Golden snapshots that move because of this line come to me before they are updated.
