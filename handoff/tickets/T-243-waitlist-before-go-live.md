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

## Ajay signed (12 Oct 2026, `handoff/legal/emails-waitlist-panel-signed.md`, 8b229b4)

Exact consent line, the small text under it, the Hindi version and the success-card line are in that file; build them word for word. Two conditions before go-live: (1) the Privacy Policy does not mention the waitlist today, so add the section 2 bullet and section 9 bullet he signed (ticket T-284); (2) Arjun confirms an entry can be erased by hand. Retention for an untouched entry: **18 months** (Ajay's suggestion; Priya's decision on the founder's delegation, 12 Oct 2026), then deleted.

## Arjun (12 Oct 2026): erase mechanism for the waitlist (Kunal's question, T-284)

Checked: no waitlist backend exists. `WaitlistForm.tsx` still has `// TODO: POST to waitlist API endpoint`, so nothing is collected or kept today. The 18-month erase is therefore **committed here, as a go-live condition of this ticket**, and the T-284 privacy line is true as long as T-243 ships with it.

**Added acceptance criteria**
6. **18-month erase by the database, not a job.** The waitlist collection has `retainUntil` (date) set to `createdAt + 18 months` on insert, and a TTL index on it (`expireAfterSeconds: 0`). "Untouched" means: if the person later signs up or asks to be kept, the build bumps `retainUntil` (or the entry is deleted when they convert). Mongo removes expired entries on its own (within about a minute of the date); no cron, no script to forget.
7. **Erase by hand, today and later.** `apps/<service>/src/scripts/erase-waitlist.ts <email> [--dry-run]` deletes one entry by email and prints a count; the privacy page's contact line is the request path. Dry run first. (Arjun's go-live confirmation in the Ajay gate above is given once this script and the TTL index exist and are tested.)
8. **Test:** an entry with `retainUntil` in the past is gone after the index runs (Mongo memory server: assert the index exists with `expireAfterSeconds: 0`; do not wait for the TTL monitor); the same email twice leaves one entry; the erase script removes it and a second run reports zero.
9. No email address in logs or Sentry (as AC3); the erase script prints counts only.

**For the T-284 privacy page (Kunal):** ship Ajay's 18-month line. It is true from the day the waitlist opens, because the waitlist cannot open without AC6. Do not open the waitlist (T-243) ahead of the page, and do not ship the page's waitlist bullets while T-243 is unbuilt if Ajay wants them tied to a live form; that timing is his and Priya's call.
