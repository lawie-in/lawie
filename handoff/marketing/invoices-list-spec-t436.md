# Handoff spec: Invoices list on settings (T-436)

Owner: Rajesh. For the lead on T-436. No code. Source: `handoff/legal/gst-tax-invoice-signed.md`; ticket Arjun item 7 (`GET /api/billing/invoices/:id.pdf`, owner only). Only quoted text is "Ajay, signed". All UI strings are "Madhuri to word". No tax claim here.

## 1. Decisions

- Ajay, signed: "Email it to the account email and keep it in the account." Pricing FAQ 5a: "you can download it from your account" ships only if the download is built in the same merge.
- Ajay's file does not say what the list shows. So the list shows date, number, amount and PDF link only; no tax breakdown, no SAC, no State. The PDF holds the rest.
- No new colour or component: reuse the settings card and page `text-xs` button style.

## 2. Placement (`apps/web/src/app/dashboard/settings/page.tsx`)

- Order: Profile, Plan, **Invoices**, Sign out. The only other sections today are Profile and Plan; there is no Close account section.
- Card copy of the Profile card: `mt-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm`, `<h2 className="text-sm font-semibold text-slate-700">Invoices</h2>`. Plain white, not the Plan's amber/green tint.

## 3. Row layout

`<ul>` of rows, not a `<table>` (4 short fields, no sort, one markup). Rows `divide-y divide-slate-200 py-3`.

| Width | Layout |
| --- | --- |
| 1280 px | One line: date (`w-32`), number (flex-1), amount (right-aligned), PDF link (right). Card is the page column, no extra width |
| 375 px | Line 1: number left, amount right. Line 2: date left, PDF link right. No horizontal scroll; number may wrap, never truncate |

- Date: `14 Oct 2026` (IST), `<time dateTime>`. Number: as issued, shown whole (Ajay: max 16 characters, so it fits at 375 px).
- Amount: rupees, Indian grouping, no decimals when whole: `₹799`, `₹1,299`, `₹12,999`; paise only if non-zero (`₹799.50`). Use `Intl.NumberFormat('en-IN')`. The amount is the total charged, nothing else.

## 4. Download link

| Item | Spec |
| --- | --- |
| Label | `PDF` with a small download icon already in the app (if none, text only). Madhuri to word |
| Element | `<a href="/api/billing/invoices/:id.pdf" download>`; same tab, no new window |
| File name | `lawie-invoice-<number>.pdf` with `/` replaced by `-` (a slash is not valid in a file name). Lead sets `Content-Disposition` |
| aria-label | `Download invoice <number> as PDF` (Madhuri to word); visible text stays `PDF` |
| Target | min 44 x 44 px (`min-h-[44px] min-w-[44px]` plus padding); row gap covers it, link style `text-xs font-medium text-slate-600 underline` |

## 5. Order and long list

- Newest first by issue date. No sort control, no filter: the user has about one invoice a month plus top-ups.
- Show the first 12 rows, then `Show more` (button, 44 px, Madhuri to word) to reveal the rest. Why: 12 = a year of monthly charges, so most users never see the button; the API returns all rows (small, one request, no paging on patchy 4G). "Show more" is a button with `aria-expanded`; focus stays on it; the new rows are announced by the polite region (`3 more invoices shown`).

## 6. States

| State | What shows | Aria |
| --- | --- | --- |
| Loading | 3 grey skeleton rows (`bg-slate-100`, no animation) | `role="status"`, visually hidden `Loading invoices…` (Madhuri to word) |
| Error | Message + `Try again` button in the card | `<p role="alert">`; retry re-fetches; focus stays on the button |
| Empty | One line, no table: `No invoices yet` (Madhuri to word). A short reason line is optional; Ajay checks it adds no claim beyond his s.2 | `<p>` inside the section; not an alert |
| Loaded | The list | `aria-label="Invoices, newest first"` on the `<ul>` |

## 7. Accessibility

- DOM order: number, amount, date, link. One tab stop per row (the link); no row click target.
- Link is underlined (not colour only); slate-600 on white passes AA. Row is a `<li>`.

## 8. Open questions for the dev lead

1. Credit notes: list them (own series `LAW-CN/...`, negative amounts) or not? Ajay's file requires them to exist, not to be listed. Ask Ajay/Vikram.
2. Number format clash: Ajay `LAW/2026-27/0001` (max 16 chars) vs Arjun `FY25-26/000123`. Layout works for both; lead to settle.

## Drift settled by Arjun (15 Oct 2026)

- The settings page also has a Close account section (T-115c); place Invoices after Plan, before it.
- The PDF route is `/invoices/:id/pdf`, not `/:id.pdf`.
- A plain link cannot send the sign-in token, so the PDF is a blob download. The file name follows billing's.
