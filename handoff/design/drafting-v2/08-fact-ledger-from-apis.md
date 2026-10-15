# Fact Ledger from APIs — feasibility

## Arjun (15 Oct 2026)

Founder's question: can the Fact Ledger be filled from an API instead of typed? Short answer: **partly, yes — case particulars via a third-party eCourts wrapper; not FIRs; identity via DigiLocker only if we ever need KYC.** Judgments APIs belong to the Law Library, not the ledger.

### 1. What the ledger holds, and which part an API can supply

| Fact group | Examples | API source? |
|---|---|---|
| Case particulars | CNR, court, case no., parties, advocates, stage, next hearing, orders | **Yes** — eCourts data via a wrapper |
| FIR particulars | FIR no., police station, sections, date | **No** — stays typed or read from the uploaded FIR copy (T-304) |
| Client identity | name, address, DOB | Possible via DigiLocker; not worth it for drafting |
| Client narrative | what happened, grounds, antecedents | Never — human only |

### 2. Options reviewed

**eCourts (official).** No developer API; API Setu does not list one; the public portal is captcha-gated. Scraping it ourselves (Apify-style captcha solving) is out.

**eCourtsIndia (third-party wrapper).** Token-auth REST (`GET /api/partner/case/{cnr}`: parties, advocates, judge, stage, hearing history, orders; search by party/advocate; cause lists, batch up to 100 CNRs; order text; async refresh 5–10 s; prepaid credits; hosted MCP server). It is a scrape of eCourts behind an API; its terms page does not state the licence or commercial-use position. **Best candidate for a pilot** — value high, dependency risk medium (vendor could change or be blocked). Alternatives of the same shape: Vakeel360 (X-API-Key), Parse.bot. Pricing not public; needs an account.

**FIR data.** No official API anywhere; state CCTNS citizen portals vary and Bihar's is weak. Vendors (e.g. HelloVerify) sell FIR data scraped from portals including addresses, relatives and phone numbers — **no**: DPDP exposure and PII through a third party. FIR facts come from the client or from our own extraction of the uploaded FIR copy.

**DigiLocker (official, MeitY).** OAuth consent flow, DPDP-aligned, issued documents (Aadhaar, DL). Partner onboarding needs regulatory authorisation to issue/authenticate documents, an MoU, and there is no sandbox; aggregators (Cashfree etc.) front it. Drafting needs only name/address, which the advocate already has. **Park**; revisit only if advocate KYC (BCI enrolment check) ever becomes a requirement.

**Indian Kanoon API.** Judgments and statutes, not facts. Prepaid INR credits (vendors report ₹0.02–0.50 per call, unverified), key-pair auth, "powered by IKanoon" attribution required for display and RAG. A good phase-2 retrieval source for the Law Library — Ajay's status marking is still required before anything is cited. Goes on the D5 licence list.

### 3. How it fits the design (no change to v1)

- `FactSource` gains `'lookup'` post-v1 (packages/shared + web mirror, same as the `'upload'` addition in T-301). Each lookup fact stores `provider`, `ref` (CNR), `fetchedAt`, `fieldPath`.
- Behind a `CaseLookupProvider` interface in `apps/drafting`; eCourtsIndia is the first adapter. Vendor swap = adapter swap.
- Looked-up facts are **suggestions until the advocate confirms**, exactly like "Read from page n" in the brief flow. Nothing auto-inserted; the ledger shows the provenance.
- Guards: per-draft lookup cap (credits), 10 s timeout, fail open to typed intake, response stored only for the fields used, no case content in logs, API key in env (founder adds it; never in a ticket).
- Cost: small per lookup; Vikram prices it once we have an account. Ajay reads the vendor terms before we go live.

### 4. Recommendation

Pilot after v1: ticket "Case lookup by CNR into intake" — a one-week spike (adapter + confirm step on one kind, bail) then a feature ticket if the advocates use it. Needs from the founder: an eCourtsIndia account (key goes into the environment secrets), and a yes to Ajay reading their terms.
