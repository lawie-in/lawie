# T-301 — Attach images as matter context

| Field      | Value                           |
| ---------- | ------------------------------- |
| Phase      | 3 — Matter context              |
| Owner      | Vishal                          |
| Mode       | Full chain                      |
| Status     | Blocked: T-101, T-104 and T-109 |
| Depends on | T-101, T-104, T-109             |
| Branch     | feature/t-301-image-attach      |
| Created    | 2026-10-03                      |

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
