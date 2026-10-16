# Drafting model: legal quality floor (signed)

Ajay (CLO), 15 Oct 2026. Asked by Arjun, for the founder, with Vikram. Prices and the decision record are in Arjun's handoff/design/drafting-model-arjun-15-oct.md. This file is the legal floor only.

| # | Question | Ruling |
|---|---|---|
| 1 | Minimum tier for the drafting body | **Sonnet-class or above, for every pack.** No Haiku-class model writes the body of any draft. The floor does not differ by pack: a statutory notice (s.138, consumer, eviction) or an agreement carries the same risk of a wrong section, a dropped averment or a broken signed rule as a bail application. |
| 2 | Review before any switch of the drafting model | (a) Arjun's golden-set run on the candidate (27 fixtures, recorded replies off, real model), with me reading every diff against current output. A diff in a cited section, an averment, a blank, a party role or the law-switch text fails until I rule on it. (b) The guard suites that test signed rules (blank rules, own-words check, NI Act gate, law switch, no judgment names) pass on the candidate with the real model. (c) Anushka's browser run on develop, as the standing quality gate before prod. No extra run for the switch itself. |
| 3 | Opus for any pack regardless of cost | **Not required for v1.** Parked: consider it for Supreme Court and High Court filings (SLP, writs, curative) on the evidence of the golden run. |
| 4 | Intake and preflight on a cheaper model | Acceptable on one condition: the preflight suite (old-law section, unknown-date, s.141 and NI Act checks) passes with the candidate. A preflight that misses a legal flag is a fail. |

Any later change of the drafting model, including a version bump within a tier, goes through row 2 (a) and (b).
