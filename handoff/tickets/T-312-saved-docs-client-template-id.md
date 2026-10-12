# T-312 — Saved documents may carry a client-chosen template_id

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Polish and release |
| Owner  | Arjun (decides: backfill, repair on read, or nothing pre-v1). Lead (build, drafting) |
| Mode   | Small fix (drafting), mode per Arjun's call |
| Status | To do. Unassigned. Waits on Arjun. After T-300 merges (same files). Found by Mahak in T-300, 12 Oct 2026 |

Before T-300, `documents.routes.ts` (~850) stored `{template_id, ...form_data}`, so a client `template_id` inside `form_data` replaced the real one in the saved `formInputs`. T-300 fixes new saves (`{...form_data, template_id}`). Documents saved earlier may still carry a client-chosen `template_id`. Annexures read it for the config, ruleForMatter, party labels and doc type. It can't fall back to `doc.templateId` as-is, because that's an ObjectId.

## Acceptance criteria

1. Arjun decides: a one-off backfill, a repair on read (resolve from `doc.templateId`), or no action if no affected documents exist pre-v1.
2. If there's a fix, annexures for an already-saved document use the document's real template, and a test shows a tampered `formInputs.template_id` is ignored.
3. No document content in logs.
