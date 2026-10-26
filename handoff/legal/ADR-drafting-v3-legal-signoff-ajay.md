# ADR drafting v3: Ajay's sign-off on the LEGAL sections (3F, 5, 6)

Source: `handoff/design/ADR-drafting-v3.md` at origin/develop_staging 220c495e. I commit only under handoff/legal/, so this file is my signature; Priya fills the ADR's signature line with a link to it. **Any later edit to 3F, 5 or 6 re-opens it** (Arjun's condition (b)).

**Verdict: SIGNED 26 Oct 2026, on the conditions below.** Principles 4 (no live research agent) and 7 (no prod draft content to an AI session) are endorsed; I would not sign without them.

## 3F Legal reviewer

| id | condition |
| --- | --- |
| ADR3-L1 | The rubric is legal content. Its text, check ids and pass/fail wording come to me as a signed file before Phase 2 is built. The ADR's five items are headings only. |
| ADR3-L2 | Rubric items I add now: (a) provisions match the pack **and** the old/new law switch: offence on or after 1 Jul 2024 under BNS, earlier under IPC (Art. 20(1)); procedure under BNSS, but CrPC for matters pending on 1 Jul 2024 (BNSS s.531); (b) no named judgment or case citation (T-441 S line: `[Authority — add if relied upon]`); (c) no disclaimer text in the pleading body (T-573); (d) no outcome promised to the client or the court. |
| ADR3-L3 | The reviewer finds; it never writes legal text. The repair goes through the Drafter, limited to the pack and my section instructions. No section, citation or authority may be introduced by the reviewer or the repair. The diff guard also rejects any new section number not in the pack. |
| ADR3-L4 | Nothing in the UI, marketing or export may say the draft was "legally reviewed", "checked by a lawyer" or anything similar (BCI; AJ-511). It is an automated check. The advocate reviews and files. |
| ADR3-L5 | Model tier: Haiku on every draft is acceptable as a floor. "Argued" packs get Sonnet (list below). |

**Packs I mark "argued"**: (1) every bail pack (regular, anticipatory, default, NDPS, Bihar prohibition, juvenile JJ s.12, SC/ST appeal s.14A); (2) temporary injunction (CPC O.39 rr.1–2); (3) quashing (BNSS s.528; old CrPC s.482); (4) criminal revision and criminal appeal. I add (4) to Arjun's three because their grounds are argued too. Arjun maps these to catalogue ids; I confirm the id list in one line.

## 5 Acceptance

| id | condition |
| --- | --- |
| ADR3-L6 | Every golden snapshot change comes to me before merge (as `.claude/docs/golden-snapshots.md`). I review the diff, not the whole draft. |
| ADR3-L7 | Golden cases, including Anushka's six matters, use fictional parties under the placeholder convention (Sample Person N, SAMPLE/000/0000). No real name, FIR or case number goes in a cassette or snapshot. |
| ADR3-L8 | The nightly run's Sentry and dashboard entries carry ids, counts and rubric ids only, never draft text or facts (no document content in third-party logs). |
| ADR3-L9 | Zero blocking legal findings is part of the CI gate, as written. |

## 6 What I sign

| id | condition |
| --- | --- |
| ADR3-L10 | Agreed list, plus three items: (a) code-derived legal wording: cause-title assembly and labels, court display names, the amount-in-words format, and pronoun forms in pleadings (principle 3); (b) the text the delivery gate shows in place of a blank (`[To be confirmed: …]`); (c) the user question for a missing fact, where it names a legal term. |
| ADR3-L11 | Fact-checker violation policy (T-611): "never blanks a value the ledger holds" is right. But a ledger value that conflicts with the description or with another fact must go to the user as a question; the checker neither keeps it silently nor blanks it. I sign the T-611 policy text via Vishal. |
