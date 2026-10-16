# T-471: A s.138 notice or complaint must name the drawer firm

| Field  | Value                                                                       |
| ------ | --------------------------------------------------------------------------- |
| Status | Merged into develop_staging b39f45a6, 16 Oct; Anushka to test on develop. Priya |
| Owner  | Vishal (he has the T-453 fixtures and run 64), after T-453 closes           |
| Mode   | Full chain (legal content; Ajay gates)                                      |

## Source

Ajay, 15 Oct 2026, on T-453 run 64: in fixtures 1b, 08, 19 and 21 the draft drops the drawer firm. Where the drawer is a firm or company, a s.141 notice or complaint that leaves the firm out is legally defective. "That fixture must pass before the model switch goes to prod."

## What

Find why the firm is dropped (intake or ledger not keeping it, the body not using it, or the model switch) and fix it so the drawer firm and the persons named under s.141 appear in the notice and the complaint.

## Acceptance criteria

- Fixtures 1b, 08, 19 and 21 keep the drawer firm in the draft, and the golden check for it passes.
- A test pins the case (drawer is a firm or company).
- Findings and the diff go to Ajay; his ref in the merge body.
- Explore first; files after Explore. Ask Priya for the claim.

## Not a blocker for

Anushka starting her run on develop; but she should see this case, and it must be green before anything goes to main.

## Also in this ticket (Ajay, 15 Oct 2026, T-453 run 64)

Extend the golden-set verifier list with BNSS s.144 (maintenance, old s.125 CrPC) and s.145 (procedure, old s.126) for the maintenance_bnss_144 pack only; both are in that pack's own signed text. No general whitelist.

## Cause and Ajay's rulings (15-16 Oct 2026, T-245 file 257d5c48)

Cause (Vishal): the firm is lost at intake. respondent_name is typed as a person name (fact-ledger.service.ts), so "Demo Traders ke malik" gets no name and "Gupta Electricals ke proprietor Anil Gupta" falls under the 0.8 floor. No prompt says a firm is a party name. The draft prints the firm when the ledger has it.

Ajay:
- (a) respondent_name reads as "drawer as named (firm, company or person)": OK.
- (b) The one signed line in the intake prompt, exactly: "A firm or company named as the drawer is the drawer's name. Put the proprietor, partners or directors named with it in their own fields, never in place of the firm."
- (c) Fixture 08 (firm as drawer, Anil Gupta as drawer_proprietor): OK, with one condition. A sole proprietorship is not a separate person: address the notice to "Anil Gupta, proprietor of Gupta Electricals" and do not plead s.141.
- s.141: for a partnership or company, address the notice to the firm and to each partner or director the advocate names as in charge. Names come only from the advocate.

Claim (after T-453 closes): fact-ledger.service.ts (factTypeFor), intake.prompts.ts (one line), fact-verifier.ts + ai.service.ts (pack id pass-through), golden fixtures 08/1b/19/21, tests. If the s.138 pack or its notice text needs a change for the sole-proprietor / partner / director wording, stop after Explore and ask Priya for the claim; that is legal content and Ajay byte-checks it.

## Anushka run 4 (16 Oct 2026): what she found

For a company drawer, the director is not made a noticee, and the s.141 paragraph is vague. Fix together with the firm line. Ajay's rule applies (address the firm and each partner or director the advocate names as in charge; names only from the advocate). Ask Ajay for the s.141 paragraph text.
