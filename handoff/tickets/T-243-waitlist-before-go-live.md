# T-243 — Waitlist form before go-live

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Polish and release |
| Owner          | Rajesh (design). Madhuri (copy), Meera signs. Ajay (consent line, DPDP). Lead (build). Anushka (verdict) |
| Mode           | Full chain. UI: needs Rajesh's design first |
| Status         | To do. Waits for Rajesh's design and Ajay's consent line. Asked for by Meera, 12 Oct 2026 |

## Acceptance criteria

1. A public form asks for name, email, and optionally phone, city and practice area. It has a consent checkbox with Ajay's text, unticked by default.
2. Entries are stored with the time and the T-242 source fields. One entry per email; a second submit with the same email doesn't create a duplicate.
3. Rate-limited and protected from bots. No personal data in logs.
4. The confirmation copy promises nothing about the launch date.
5. A deletion path exists for an entry (DPDP).

## Design (Rajesh, 12 Oct 2026)

`handoff/design/T-243-waitlist-form.md`: fields, states, 375 px, tokens, accessibility. It replaces the off-brand `WaitlistForm.tsx` (lawie/slate/green colours). Needs Ajay: the consent line (DPDP wording), the privacy-policy link and the deletion-contact line, and an optional Hindi version. Madhuri owns the draft strings.
