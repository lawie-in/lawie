# T-301 — Attach images as matter context

| Field      | Value                                                                                                                                                                                                                 |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase      | 3 — Matter context                                                                                                                                                                                                    |
| Owner      | Vishal                                                                                                                                                                                                                |
| Mode       | Full chain                                                                                                                                                                                                            |
| Status     | Founder 15 Oct 2026: uploads are V1 (moves T-301 to T-304 from "after v1" to V1). Needs Arjun re-scope onto the brief flow (ADR-021); ADR-019 3.9 D4 (images sent direct to Anthropic) still needs the founder. Priya |
| Depends on | T-101, T-104, T-109                                                                                                                                                                                                   |
| Branch     | feature/t-301-image-attach                                                                                                                                                                                            |
| Created    | 2026-10-03                                                                                                                                                                                                            |

## Goal

The user can attach photos of an FIR or other papers, and the details are read into the draft after the user confirms them.

## Context

- Founder decision, 3 Oct 2026: the chat box takes images as matter context.
- The drafting model reads images directly, so typed pages need no separate OCR service. Handwritten and Hindi pages are untested (T-303).
- No upload library is installed in any `package.json` (searched for multer, busboy and sharp).
- If the Helicone gateway is on, request bodies pass through a third party. FIR images carry personal data of people who are not our users.
- Standing rule: no personal data or document content in third-party logs.
- Production nginx allows 10 MB per request (`docker/nginx/nginx.prod.conf`) and the drafting service parses JSON up to 10 MB. Five full-size phone photos would not fit.
- The Helicone path speaks the OpenAI message format. Image requests go direct to Anthropic unless the ADR says otherwise, which also keeps FIR data off Helicone.
- ADR-019, section 3.9: images are used only in the fill call, held in memory, never stored, and sent direct to Anthropic (decision D4, pending the founder).

## Acceptance criteria

- The user can attach up to 5 images (JPG or PNG) to the description.
- Images are resized in the browser to 1,568 px on the long edge before upload, the largest size the standard models use. The whole request stays under 8 MB. A file that cannot be brought under the limit is rejected with a clear message.
- Images are sent to the model with the description, and the values read go into the same field set as T-101.
- Every value read from an image is marked and must be confirmed on the review screen before Generate is enabled.
- Images are held in memory only and are not stored, unless T-302 sets a different retention rule.
- Images and values read from them are not written to logs, Sentry or Helicone.
- The consent line from T-302 is shown before the first upload.
- Image tokens are recorded in usage (T-003 fields).
- Up to 5 images add no extra drops. The 50-drop base covers them.
- Tests cover: too many images, a file that is too large, a wrong file type, and an unreadable image.
- `apps/web` has no tests and is not in CI. The PR includes a checked list of manual checks with screenshots at 360 px and at desktop width, and `yarn workspace @lawie/web build` passes.
- Cost controls from ADR-019, section 3.9: pages resized to 1,568 px on the long edge, each page read once, at most 5 pages per request, read by the intake model.
- The first 5 pages are inside the base charge.

## In scope

- `apps/drafting`: intake route and service
- `apps/gateway`: body size limits for the intake route
- `apps/web`: attach control on the describe box

## Out of scope

- PDFs (T-304)
- Storing uploads for later reuse
- FIR-number fetch (T-305)

## References

- Design: T-005
- ADR: `docs/adr/ADR-019-intake-and-routing.md`, approved by the founder on 4 Oct 2026
- Legal sign-off: Ajay, T-302, 4 Oct 2026. Five conditions, listed in the T-302 Result section

## Review, 3 Oct 2026

| Reviewer | Verdict               | Note                                                                                                                                                  |
| -------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arjun    | Approved with changes | Five 5 MB images do not fit the 10 MB request limit. Changed to resize in the browser and keep the request under 8 MB. No server limit change needed. |
| Ajay     | Conditional           | Nothing ships before T-302 is signed.                                                                                                                 |
| Vikram   | Approved              | Free within the base charge for now. T-004 checks image cost.                                                                                         |

## Arjun (15 Oct 2026, 05:10 UTC) — re-scope onto the brief flow (ADR-021), after the founder's V1 ruling

Relayed by Priya: founder, 15 Oct, uploads are V1. This section replaces the acceptance criteria above where they conflict. T-101/T-104/T-125 are gone; the flow is `OneFlow` → `DescribeStep` → `POST /documents/intake/brief` → `BriefStep` (the ledger) → Confirm → draft.

**Decision D4 is closed, not pending.** T-118 removed Helicone (9 Oct); every model call is `transport: 'direct'`. Ajay's condition 2 ("image and PDF calls go direct to Anthropic") is met by the codebase as it stands. Nothing for the founder to decide here.

### Where the pages go

1. **Attach control on `DescribeStep`**, next to the describe box: up to 5 JPG/PNG, resized in the browser to 1,568 px on the long edge, sent as base64 content blocks inside the round-1 body of `POST /documents/intake/brief` (`images: [{ mime, data }]`, max 5, whole request under 8 MB; drafting's `express.json` 10 MB and nginx `client_max_body_size 10m` need no change). Round 1 only in V1: to add pages, the user starts the brief again. No new upload library; no multipart.
2. **Server (`intake-brief.ts` / `callAuxModel`)**: the intake model gets the description text plus the image blocks in the same user turn. Pages are read once, in memory, and dropped when the call returns. The intake cache (Redis) keys on the text only and never holds image bytes. The intake rate limits apply unchanged.

### Where the read values go

3. **Into the fact ledger**, as facts with a new `FactSource` value **`'upload'`** (`fact-ledger.service.ts`; today's sources are `'user'`, `'description'`, …). An upload fact carries `display`, `value`, the model's `confidence`, and `span` = `"page n"` (there is no verbatim span to anchor to). The model is told to list facts read from pages separately from facts read from the description; **nothing read from a page is ever written as `source: 'user'`**.
4. **On `BriefStep`**, every `'upload'` fact shows "Read from page n — please check" and counts as unconfirmed: Confirm stays disabled until the advocate confirms or edits each one (same mechanism as `blocksConfirm`). Confirming writes a `ledger_edits` entry with `from_upload_confirmed: true` (next to `from_question`), keeping `source: 'upload'` for the audit trail. An unconfirmed upload fact never reaches the draft.
5. **Draft and verifier**: a confirmed upload fact is an advocate fact for drafting and is in the ledger the D1 verifier reads (today's T-245a lesson: anything the draft may print must be in that ledger).

### Consent, retention, logs (T-302 §5, §9)

6. The per-upload line is shown above the control every time. The once-per-account line is recorded as `uploadAuthorisedAt` on the User (auth, `PATCH /me`, set once, never cleared) before the first upload is accepted; the web sends the images only after that PATCH succeeds.
7. Held in memory only: a test proves no image bytes reach disk, Mongo, Redis, Pino, Sentry or the usage rows during an image intake (spies on all five; Ajay's condition 1).
8. Usage: image tokens arrive inside the provider's `input_tokens` and are recorded as today (`LlmAuxCall`). Vikram's "five pages inside the base charge" stands; images sit in the user turn, so prompt caching does not apply to them.

### What T-303 feeds in

9. The spike's result sets the warning copy on `BriefStep` for Hindi and handwritten pages ("we read typed pages well; check handwritten values carefully"), and whether any page kind is refused. T-301 does not start building until the spike's result is in the T-303 file.

### Scope and gates

- In scope: `apps/web` (`DescribeStep`, `BriefStep`, intake client), `apps/drafting` (`intake.routes.ts` brief schema, `intake-brief.ts`, `aux-llm.ts` content blocks, `fact-ledger.service.ts` source + confirm edit), `apps/auth` (`uploadAuthorisedAt` on User + `PATCH /me`). Full chain. Design: Rajesh for the attach control and the "read from page" marker on the brief (T-005 is the old flow; a one-screen handoff is enough).
- Legal: Ajay's five conditions (T-302 §9). 1, 3, 5 are built here; 2 is met by T-118; **4 (policy and terms text) is the founder's: a practising data-protection lawyer reads Ajay's §6–7 text, or the founder accepts the CLO draft for V1 in writing.** Uploads do not ship to `main` until 4 is settled; they may merge to `develop_staging` and be tested on develop before that.
- Out of scope: PDFs (T-304), storing uploads, adding pages after round 1, FIR-number fetch (T-305), OCR vendors.
- Order (agreed with Priya): T-303 spike → T-302 close-out → T-301 → T-304. Vishal after T-441.

Correction (Arjun, 05:15 UTC): `FactSource` is `'user' | 'asked' | 'computed'` in `packages/shared/src/types/fact-ledger.ts`, mirrored in `apps/web/src/components/intake/briefTypes.ts`. Adding `'upload'` touches `packages/shared`, so T-301's claim includes that one file (one lead at a time; v2 rule 7 wait in slot), and the web mirror.
