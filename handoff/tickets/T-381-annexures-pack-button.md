# T-381 — Generate the Vakalatnama and Memo of Parties from a draft

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Lead (web + drafting) |
| Mode   | Full chain |
| Status | Merged into develop_staging 9e3cafa (Mahak, 13 Oct 2026). Waiting for Anushka on develop. Priya |
| Source | Anushka run 3: no Vakalatnama or Memo of Parties was produced |

## Acceptance criteria

1. The document page (apps/web/src/app/dashboard/documents/[id]/page.tsx) has a button that calls POST /documents/:id/annexures-pack and offers the result.
2. Brief drafts store the party data the pack needs (in documents.routes.ts), so the pack has names and roles.
3. Tests: a brief draft with parties produces a Vakalatnama and a Memo of Parties.
Sequencing: documents.routes.ts goes Tanvi T-357, then Kunal T-372, then Vishal T-373.

## Product calls (Priya, 13 Oct 2026)
Spec: handoff/marketing/annexures-button-spec-t381.md. Strings: handoff/marketing/copy/annexures-button-t381.md.
1. **Which drafts show the card:** court documents only, meaning not one of the 32 not_court_documents (T-406 list). The card shows once the draft has at least one party, from the brief or from the form inputs.
2. **Missing party details:** as Rajesh assumed. "Check your brief" opens the brief with the parties fields focused.
3. **Ink:** the pack costs no Ink in v1 (Vikram agreed, 13 Oct). It's a template fill from a paid draft. Conditions: it stays a template fill, so any model call added later goes back to Vikram for a price before merge. The page never calls it "free"; it's just part of the draft. A failed pack is never charged.
4. **Format:** one PDF for v1, as the route returns today (revised after Mahak's Explore). DOCX can come later.
5. **Already exists:** not in v1. Nothing is stored, and each click generates a fresh PDF. Stored packs and DOCX are a follow-up, only if Anushka or users ask.
Ajay signs the naming, the button, help, success and download strings. He also says whether the T-194 blanks dialog or the disclaimer line applies to the pack.

## Explore (Mahak, 13 Oct)
Brief drafts keep their parties only in the encrypted doc.brief.values, so the pack printed blanks. A new mapper seals the party keys at create time. The pack route falls back to decrypting the brief for older drafts. Wider role keys (plaintiff/defendant/complainant/accused) in annexures.service.ts go to Kunal's T-396, not here. Ajay confirms the party-role mapping.

## Scope calls after the web build (Priya, 13 Oct, from Mahak's questions)
- Q1: one "Download annexures" button for the whole 7-annexure PDF. There's no per-annexure route. Ajay supplies the new strings.
- Q2: the blanks check for the pack (T-194) is deferred to a follow-up, if Ajay agrees for v1.
- Q3: there's no "Check your brief" link in v1. The missing-parties state just names what's missing.
- Q4: yes. The route answers 422 {missing:[…]} instead of printing blank names.
- Visibility: yes. GET /documents/:id adds courtDocument and hasParty.
- Annexure A (Memo of Parties) lacks the T-317 footer that the other six have. That goes to Kunal's T-396, the same file.
