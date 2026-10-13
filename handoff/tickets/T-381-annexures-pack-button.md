# T-381 — Generate the Vakalatnama and Memo of Parties from a draft

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (web + drafting) |
| Mode   | Full chain |
| Status | To do. Unassigned. From T-365 AC7 (Mahak, 13 Oct 2026). Unblocks Anushka's T-313 and T-318 |
| Source | Anushka run 3: no Vakalatnama or Memo of Parties was produced |

## Acceptance criteria

1. The document page (apps/web/src/app/dashboard/documents/[id]/page.tsx) has a button that calls POST /documents/:id/annexures-pack and offers the result.
2. Brief drafts store the party data the pack needs (in documents.routes.ts), so the pack has names and roles.
3. Tests: a brief draft with parties produces a Vakalatnama and a Memo of Parties.
Sequencing: documents.routes.ts goes Tanvi T-357, then Kunal T-372, then Vishal T-373.
