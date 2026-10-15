# eCourtsIndia API: may an advocate's product use it? (Ajay, CLO)

For Arjun's handoff/design/drafting-v2/08-fact-ledger-from-apis.md. Read on 15 Oct 2026 from ecourtsindia.com/api/docs. Their /terms page returned 403, and the docs page links to no terms or privacy page.

## What their own pages say

- The data is described as re-scraped "from official eCourts government servers". PDFs are called "certified true copies from the eCourts system". That is their claim; a scraped PDF is not a certified copy in law.
- No licence grant, permitted-use clause, commercial-use clause, redistribution rule, retention period or liability term appears anywhere I could read.
- Accuracy disclaimers: "Results are from public court records; identity match is probabilistic. Verify before adverse action." and "not legal advice".
- They ask for attribution: "Source: eCourts India - https://ecourtsindia.com".
- Besides case lookup, they sell person-level products ("LegalCheck", electoral search).

## Ruling

**Not cleared for production use.** The pilot may run on test or made-up CNRs only, until the founder obtains a written agreement from the vendor. Why:

1. **No licence.** With no stated terms, we have no right to use the data commercially and no promise that the vendor has the right to supply it. The official eCourts portal publishes no developer API and gates access behind a captcha (Arjun's §2). Whether the vendor's own collection is lawful is **verify**: access to a computer resource beyond its permission is the risk area (IT Act s.43). We should not build on it without a contract.
2. **Personal data.** Case data names parties, witnesses and advocates who are not our users. The DPDP Act exempts data made public "by any other person who is under an obligation under any law" to publish it (s.3(c)(ii)). Whether court records published through eCourts fall within that, and whether a third party's copy does, is **verify**. I do not build on the exemption, as in T-302.

**The written agreement must give us, at minimum:**

- a licence to use the data commercially in an advocate's drafting product;
- the vendor's warranty that it is entitled to collect and supply the data;
- an indemnity;
- a data-processing clause: what they log about our queries, retention, deletion, and Indian hosting or transfer;
- a notice period before the service changes or stops.

## If the agreement is signed: rules for the pilot

1. **Only the advocate's own matter.** The lookup is by a CNR the advocate types for a case they are engaged in. No search by party name or advocate name, no bulk or batch lookups, and no cause-list monitoring of other people's cases.
2. **Never use** LegalCheck, electoral search or any person-level search. That is profiling of non-users and outside a drafting product.
3. **What we may store:** only the fields the advocate confirms into the Fact Ledger (court, case no., stage, next date, party names as the advocate confirms them), kept with the draft inputs under the T-302 retention rule. They are deleted with the document or the account.
4. **What we must not store:** the raw API response, order PDFs or order text, hearing history beyond the fields used, other parties' advocates' details, and anything in logs, Sentry or usage rows. An order text used for one draft is held in memory for that request only, as with uploads (T-302).
5. **Protected identities.** If the response contains the name or identifying details of a victim of a sexual offence, a child in conflict with law, or a POCSO child, it is **never shown as a suggestion and never printed**; the field becomes a blank. Court records sometimes carry these despite masking duties: BNS s.72 (old IPC s.228A), JJ Act s.74, POCSO s.23.
6. **Matrimonial and in-camera matters.** Order text in family matters is used only to fill the advocate's own draft, never cached.
7. **Provenance.** Each suggested fact shows "From eCourtsIndia (unofficial copy of eCourts), fetched {date}". The advocate confirms it. A filed draft never describes these facts or PDFs as certified copies.
8. **Attribution**, as the vendor asks, but only on our screens, never inside the draft.

## Lower-risk alternative

The advocate downloads the case status or order PDF from the official eCourts portal themselves and uploads it. We read it under T-301/T-304 and T-302. This needs no third-party vendor and no licence, and the source is official. I recommend this for v1.1, and the eCourtsIndia adapter only after the agreement above.

Signed: Ajay (CLO), 15 Oct 2026 IST.
