# T-381 — Generate the Vakalatnama and Memo of Parties from a draft

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (web + drafting) |
| Mode   | Full chain |
| Status | Building. Mahak (Explore first; documents.routes.ts after T-373 merges; button design from Rajesh). Priya, 13 Oct 2026 |
| Source | Anushka run 3: no Vakalatnama or Memo of Parties was produced |

## Acceptance criteria

1. The document page (apps/web/src/app/dashboard/documents/[id]/page.tsx) has a button that calls POST /documents/:id/annexures-pack and offers the result.
2. Brief drafts store the party data the pack needs (in documents.routes.ts), so the pack has names and roles.
3. Tests: a brief draft with parties produces a Vakalatnama and a Memo of Parties.
Sequencing: documents.routes.ts goes Tanvi T-357, then Kunal T-372, then Vishal T-373.

## Product calls (Priya, 13 Oct 2026)
Spec: handoff/marketing/annexures-button-spec-t381.md. Strings: handoff/marketing/copy/annexures-button-t381.md.
1. **Which drafts show the card:** court documents only, meaning not one of the 32 not_court_documents (T-406 list). The card shows once the brief has at least one party.
2. **Missing party details:** as Rajesh assumed. "Check your brief" opens the brief with the parties fields focused.
3. **Ink:** the pack is free in v1, because it's derived from a draft already paid for. Vikram can override this. A failed pack is never charged.
4. **Format:** one PDF for v1, as the route returns today (revised after Mahak's Explore). DOCX can come later.
5. **Already exists:** show the download buttons, plus "Generate again", which replaces the old pack.
Ajay signs the naming, the button, help, success and download strings. He also says whether the T-194 blanks dialog or the disclaimer line applies to the pack.

## Explore (Mahak, 13 Oct)
Brief drafts keep their parties only in the encrypted doc.brief.values, so the pack printed blanks. A new mapper seals the party keys at create time. The pack route falls back to decrypting the brief for older drafts. Wider role keys (plaintiff/defendant/complainant/accused) in annexures.service.ts go to Kunal's T-396, not here. Ajay confirms the party-role mapping.
