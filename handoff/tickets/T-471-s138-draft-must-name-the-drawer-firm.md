# T-471: A s.138 notice or complaint must name the drawer firm

| Field  | Value                                                                       |
| ------ | --------------------------------------------------------------------------- |
| Status | To do. V1 BLOCKER for prod (the model switch). Priya, 15 Oct 2026           |
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
