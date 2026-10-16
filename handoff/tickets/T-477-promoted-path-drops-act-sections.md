# T-477: The promoted-template path drops the act sections

| Field  | Value                                                                 |
| ------ | --------------------------------------------------------------------- |
| Status | To do. V1 BLOCKER (Arjun, 16 Oct 2026). Priya                           |
| Owner  | Kunal (he holds template-promoter.ts for T-473), Ajay gates            |
| Mode   | Full chain (legal content path)                                        |

## Source

Mahak, found while fixing T-475 (16 Oct 2026): template-promoter.ts:903-910 drops act sections on the promoted path (reported, parked).

## What

Explore first: which templates go through the promoted path, what an act section carries (the law the draft cites), and whether a promoted draft is missing citations the other path has. Then decide with Ajay and Arjun whether this is a v1 blocker.

## Acceptance criteria (draft)

- Promoted drafts keep the same act sections as the non-promoted path, or Ajay rules which differences are intended.
- A test pins it. Ajay's ref if any user-visible law text changes.
- Same file as T-473: do after T-473 merges, to avoid a conflict.

## Arjun's ruling (16 Oct 2026)

- The promoted path is the template-engine path (ai.service.ts ~1012-1021: document_structure sections go to buildAISystemPrompt(promptConfig)). Every form-driven draft of a pack with ai_generated sections takes it. The brief/ledger path (~1683 on) reads pack.relevantActs with sections and is unaffected. So the loss hits exactly the drafts Anushka runs through the forms.
- It changes citations: with Act names only, any section number the model prints comes from its own memory, not the pack (for example affidavit_in_support citing Order XIX Rule 3 from recall, or the wrong rule). The verifier does not catch it on that path.
- v1 blocker, small fix: template-promoter.ts ~903 keeps the sections. Render each entry as "<act>, ss. <n1>, <n2>" (the same string shape the NI Act filters at ai.service.ts 1512/1522 match on, so isNiAct keeps working). Promoter test on affidavit_in_support and one NI Act pack. Golden dry run.
- Mode: full chain with Ajay seeing the moved goldens, because the citations the model sees change in 87 packs (Priya's call; Arjun said small fix).
