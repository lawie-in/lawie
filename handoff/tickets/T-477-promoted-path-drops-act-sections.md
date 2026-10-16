# T-477: The promoted-template path drops the act sections

| Field  | Value                                                                 |
| ------ | --------------------------------------------------------------------- |
| Status | To do. V1 (to confirm with Ajay and Arjun). Priya, 16 Oct 2026         |
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
