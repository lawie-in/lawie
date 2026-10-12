# T-290 — Section picker: hint to type the code for old-law numbers

| Field          | Value |
| -------------- | ----- |
| Phase          | 4 — Polish and release |
| Owner          | Rajesh (words, small layout). Ajay signs. Lead (build, web). Anushka |
| Mode           | Small fix (web) |
| Status         | Building: tanvi (12 Oct 2026). Words signed by Ajay, design by Rajesh |

Under Arjun's corrected T-277 rule, a bare number with no code (for example "303") is read as BNS, because the picker stores bare numbers. An advocate who types an old IPC number without "IPC" gets the wrong section. The BNS section picker ("Sections Charged" in `apps/web/src/components/form/DynamicFormRenderer.tsx`) should tell them to type the code.

## Acceptance criteria

1. Under the section picker, a short hint says to type the code with old-law numbers (Arjun's draft: "type the code for old-law numbers, e.g. 302 IPC"). Rajesh words it; Ajay signs it.
2. No change to how values are stored or read (T-277 owns that).
3. Readable at 375 px; no layout change beyond one line of hint text.

## Gates

- Design: Rajesh only if the look changes
- ADR: Not needed
- Legal sign-off: Ajay (the hint words)

## WITHDRAWN by Ajay, 12 Oct 2026 (superseded below). Earlier words (12 Oct 2026, board comment T-290 / c_t290_ajay_words)

- Hint under the picker: "Type the Act with each section, for example BNS 303(2) or IPC 379."
- Message when a bare number is entered: "Add the Act before the section number, for example BNS 303(2) or IPC 379."
- An optional Hindi line is in the comment.



## Ajay's two conditions (12 Oct 2026, replaces the withdrawn lines)

The risk: an advocate types "302" meaning IPC 302 and gets BNS 302, a different offence.

1. The hint must say: "A number without the Act is read as a BNS section."
2. The picker must show what it read before the draft uses it, for example "Read as BNS 302: {title}" (title from the signed BNS table, so this builds after T-277).

Rajesh writes the words and the small layout; Ajay signs them against these two points. Then any free lead builds it.

## Rajesh (12 Oct 2026): design in handoff/design/T-290-section-picker-hint.md (f478f6b)

- Hint: "A number without the Act is read as a BNS section. For IPC, type the Act, for example IPC 302."
- Read-as line: "Read as BNS {number}: {title}"; unknown title: "Read as BNS {number}" (no guess).
- Layout: each value in its own block, chip with its read-as line under it, stacked. Hint colour slate-500 (contrast).
- Titles come only from the signed T-277 table. (The 12 px remove "x" moved to T-291.)
- Waiting for Ajay to sign the strings, including S5 ("Read as a section of another Act (not checked)").

## Ajay SIGNED (12 Oct 2026)

S1 to S6 in Rajesh's design are signed, with one change to S5: "Read as a section of another Act (not checked by Lawie)". Use the strings exactly. Titles only from the signed T-277 table; none for other codes.

## Arjun (12 Oct 2026): the read endpoint for the preview (option a, with one change)

Priya chose a read-only drafting endpoint so the web shows exactly what the server will read. Agreed, with **POST instead of GET**.

**Why POST.** What the user types in `sections_charged` can carry a FIR number or a date ("FIR 123/2024 u/s BNS 303"). A GET puts it in the URL, and nginx access logs and Sentry keep URLs. `/sections/convert` is already a POST for text for the same reason.

**Route.** `POST /sections/read`, in a **new file** `apps/drafting/src/routes/sections-read.routes.ts`, mounted with one line in `apps/drafting/src/app.ts` (`app.use('/sections', sectionsReadRoutes)`, next to the existing `/sections` mount). It calls the exported `readSectionsCharged` from T-277 and nothing else: no copy of the rules, no change to the resolver, no database, no model call, nothing stored, nothing logged from the body.

**Gateway: no change.** `/api/sections` is already a public proxy (`publicRateLimiter`, rewrite `^/` → `/sections/`), so the web calls `POST ${API_URL}/api/sections/read` with no token. The route is public by design, like its neighbours; it is bounded by the input caps below and by the public rate limiter.

**Request** (exactly one of):
```json
{ "values": ["303", "302 IPC"] }
{ "text": "BNS 64, 115(2) (IPC 376, 323)" }
```
- `values` mirrors what the server does for a `source: bns_mapping` field: array entries are read with `defaultCode: 'BNS'`. At most 30 entries, each at most 100 characters.
- `text` mirrors a plain string field: `defaultCode` undefined, so a bare number stays bare. At most 500 characters.
- Anything else (both keys, neither, wrong types, over the caps): `400 { "error": "invalid_input" }`, with no echo of the input.

**Response** `200`:
```json
{ "read": [ { "code": "BNS", "number": "303" }, { "code": "IPC", "number": "302" } ] }
```
- `code` is one of `BNS`, `BNSS`, `BSA`, `IPC`, `CRPC`, `IEA`, `OTHER`, or `null` for a bare number. `number` is the section with any attached sub-section (`115(2)`). Order and de-duplication are the reader's.
- Nothing else is returned: no labels, no bailability, no titles, no text from the input. The web needs only "what was read".

**Web behaviour.** Debounced call (about 400 ms) as the user changes the field, shown as a short line under the picker ("We will read: BNS 303, IPC 302"; wording is Rajesh's and Ajay's). If the call fails or times out, show nothing: never guess locally and never block the form. A `null` code is the case where Ajay's "add the Act" message appears.

**Tests.** Drafting: the two request shapes give the T-277 fixtures' results (including `["303","351"]` → BNS, `"103, 105"` → two nulls, `"BNS 64, 115(2) (IPC 376, 323)"` → BNS 64, BNS 115(2), IPC 376, IPC 323); both keys, neither key, 31 entries and 501 characters each return 400; a test that no log line and no response field contains the input. Web: the preview renders for a sample response, and stays empty on a failed call.

**Order and files.** The reader comes from T-277: build against its exported signature and wait for T-277 to merge before this route can pass CI. Files: `apps/drafting/src/routes/sections-read.routes.ts` (new), one line in `apps/drafting/src/app.ts`, its tests; `apps/web/src/components/form/DynamicFormRenderer.tsx` and the hint. Tanvi checks `leads.md` for `app.ts` and `DynamicFormRenderer.tsx`.

**Addendum (Arjun, 12 Oct 2026, after Tanvi's question): `title` added to the response.** Each item in `read` may also carry `title`: for a BNS entry, the title from the signed T-277 table through `resolveBnsKey` (a sub-section shows its parent's title); `null` for every other code and for a bare number. It lets the advocate catch a wrong number at a glance. No alias field, no labels, no bailability. Everything else in the spec above stands: POST, `{values}` or `{text}`, batch not one call per entry, caps 30 × 100 and 500, no gateway change. Response item: `{ "code": "BNS", "number": "303", "title": "Theft" }`.
