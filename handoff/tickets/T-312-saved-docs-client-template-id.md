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

## Arjun (12 Oct 2026): decision — do nothing before v1; no backfill, no repair on read

**Call: close as not needed pre-v1.** Reasons:
1. **No real documents are affected.** Production starts fresh at launch (T-403: new database, new secrets; same decision as T-117). Develop holds only test documents, made by the team and by Anushka's runs.
2. **The only way to be hurt is to tamper with your own document.** A client `template_id` in `form_data` changes which party labels, doc type and rule config the *annexures of that same user's document* use. It does not read, change or reach another user's data, and nothing is billed differently. Before T-300 a person had to hand-craft the request to do it; the web never sends it.
3. **T-300 closes it for every new save** (`{...form_data, template_id}`: the server's value wins). A backfill or a repair-on-read would only protect documents that, by (1), will not exist at launch.
4. **No code to maintain for a case that disappears.** A repair on read adds a `Template` lookup to every annexure render and a second source of truth for the template id.

**One condition that reopens it.** If any document made before T-300 is meant to survive into production (a database copy, a migration instead of the fresh environment), then build the repair on read: for a document with `doc.templateId`, resolve its template slug through the `Template` model and use that in the annexures, ignoring the stored `formInputs.template_id`; for a document with no `doc.templateId` (the brief path, whose stored id is server-written), keep the stored value. Priya notes this next to the T-403 plan.

Status line is Priya's; my suggestion: Closed, not needed (decided by Arjun 12 Oct 2026).
