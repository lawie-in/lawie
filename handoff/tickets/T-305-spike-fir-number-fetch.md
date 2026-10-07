# T-305 — Spike: can we fetch an FIR by its number?

| Field      | Value                                                            |
| ---------- | ---------------------------------------------------------------- |
| Phase      | 3 — Matter context                                               |
| Owner      | Arjun, with Ajay on legality                                     |
| Mode       | Research spike, time-boxed to 1 day, no build                    |
| Status     | Done. No-go for an automatic fetch in v1. Upload covers the need |
| Depends on | None                                                             |
| Branch     | None                                                             |
| Created    | 2026-10-03                                                       |

## Goal

A clear go or no-go on fetching FIR details from an FIR number.

## Context

- Founder, 3 Oct 2026: a user may have an FIR number and want the system to fetch the matter.
- No API has been identified. Nothing is promised to users until this spike reports.

## Acceptance criteria

- The note lists the sources checked for Bihar and Jharkhand first, then other states.
- For each source it says: what is available, whether there is a login or captcha, and whether automated access is allowed.
- Ajay gives a view on whether using each source is lawful.
- The note ends with go or no-go and, if go, a rough effort.
- The result is written into this file.

## In scope

- Research and a written note

## Out of scope

- Any scraping code
- Any commitment to build

## References

- Design: Not needed
- ADR: Not needed
- Legal sign-off: Not needed

## Review, 3 Oct 2026

| Reviewer | Verdict  | Note                                         |
| -------- | -------- | -------------------------------------------- |
| Arjun    | Approved | Research only. Can start now.                |
| Ajay     | Approved | I give the view on lawful access per source. |

## Result (Arjun, with Ajay on legality, 4 Oct 2026)

**Verdict: no-go for an automatic fetch in v1. The FIR upload (T-301) covers the need for every state. A Bihar-only lookup is possible later, and only with permission.**

This was desk research. I read the public pages and guides listed under Sources. I did not run searches against any police portal.

### What I found

| Source                                                                    | What is there                                                                                                                                                                                                                             | Access                                                                                                        | Automated use                                                                                                                             |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Bihar, State Crime Records Bureau** (`scrb.bihar.gov.in`, "Search FIR") | A search form: district, police station, then complainant name, FIR number or accused name. Results show on screen as a table: FIR number, date, complainant, address, accused, police station, sections, district, incident date, status | No login. I saw no captcha in the page content, but could not confirm that one does not appear after a search | No API. No terms that allow it. The site says its data "is not for legal use", and that some FIRs are withheld under court orders and law |
| **Jharkhand**                                                             | An online FIR system exists for lodging complaints. I could not confirm a public page for viewing an FIR by number                                                                                                                        | Not confirmed                                                                                                 | Not confirmed                                                                                                                             |
| **Other states**                                                          | Most have a citizen portal with a "View FIR" service                                                                                                                                                                                      | Guides say most need a captcha, and some need an OTP sent to the complainant's phone                          | No public API found for any state                                                                                                         |
| **Central portals** (CCTNS, Digital Police)                               | Citizen services that link to the state systems                                                                                                                                                                                           | Login or OTP                                                                                                  | No public API found                                                                                                                       |

### Three facts that decide it

1. **There is no official API anywhere.** Every route is a web page built for a person, so a fetch would mean scraping.
2. **Sensitive FIRs are not online at all.** The Supreme Court directed in 2016 that FIRs be uploaded within 24 hours, but excluded sensitive cases such as sexual offences, insurgency and terrorism. So a lookup fails exactly where an advocate may need it most.
3. **Coverage is one state at a time.** Each portal has its own form, its own fields and its own rules. Bihar is the only one I could read in enough detail.

### Ajay's view on legality

- Reading an FIR is not the problem. FIRs are published under a court direction, and personal data that a law requires to be made public may fall outside the data-protection Act.
- **Automated access by a commercial service is the problem.** No portal grants it. Bihar's own disclaimer says the data is not for legal use. Pulling data from a government system without permission carries risk under the IT Act.
- So: no automated access without written permission from the bureau concerned. Until then the advocate fetches the FIR and gives it to us.
- Whatever the source, values that come from a portal are treated like values read from an image: the user confirms each one before drafting.

### What to do instead

| Option                              | What it is                                                                                                 | Risk                                                                                      | Effort                                                                          |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **A. Upload the FIR** (recommended) | T-301 as planned. Works for every state and for FIRs that are not online                                   | None added                                                                                | Already planned                                                                 |
| **B. A help link**                  | On the describe screen: "Find your FIR on the Bihar police portal", opening the official page in a new tab | None                                                                                      | Under a day, inside T-103                                                       |
| **C. Bihar lookup, later**          | Server asks the Bihar portal by district, police station and FIR number, and pre-fills the fields          | Legal and technical, as above. The page is not built for it and can change without notice | Roughly 3 to 5 days for Bihar alone, plus upkeep. Only after written permission |

### Recommendation

- Ship A and B for v1.
- If you want C: Ajay writes to the Bihar State Crime Records Bureau asking for permission or an API. Nothing is built until there is a written answer.
- Tell users nothing about fetching by FIR number until C exists.

### Sources

- [Bihar SCRB, FIR search](https://scrb.bihar.gov.in/FIRiew.aspx) and [home page](https://scrb.bihar.gov.in/)
- [Guide to downloading a Bihar FIR copy](https://biharhelp.in/bihar-police-fir-copy-download/)
- [How to get a copy of an FIR online](https://www.lawzone.in/2026/08/how-to-get-copy-of-fir-online.html)
- [Supreme Court direction on uploading FIRs, 2016](https://scconline.com/blog/?p=67531)
- [Jharkhand online FIR system listing](https://services.india.gov.in/service/detail/police-online-fir-system-jharkhand)
