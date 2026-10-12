# T-268 — Terms page: Ajay's nine signed edits

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Polish and release |
| Owner          | Lead (build). Ajay (signed text). Anushka (verdict) |
| Mode           | Small fix, web. Legal text: apply Ajay's signed edits only |
| Status         | Building: mahak (12 Oct 2026). Terms version bump by kunal in T-299 |
| Depends on     | T-235, T-234 |

## Scope

`apps/web/src/app/(marketing)/terms/page.tsx`. The nine numbered edits are in `handoff/legal/site-copy-security-and-terms-signed.md`, section C. In short:
- §2 drops "formatted for Indian courts" and "built around the current criminal codes" (banned claims).
- §3 uses the signed disclaimer.
- §6 gets the Ink sentence.
- "does not affect rights under law" goes into §6, §9 and §12 (consumer law).
- Check that legal@lawie.in exists.
- The "Last updated" date and the `termsVersion` bump go in together with the privacy policy.

## Acceptance criteria

1. Apply the nine edits word for word. No other change.
2. The "Last updated" date is the merge date. `termsVersion` is bumped, in step with the privacy policy change, once T-234 introduces it.
3. A grep of the public pages finds none of the banned claims.
4. Ajay signs the diff.

## Open, for others

- Auto-renew and pre-debit consent for recurring payments: Vikram and Arjun.
- Ajay reviews the blanket "non-refundable" wording separately.
