# DPDP UI strings: T-115b, T-115c (Madhuri, 14 Oct 2026)

Draft for Meera. Specs: `delete-document-spec-t115b.md`, `close-account-spec-t115c.md`. Ajay-signed text is quoted from `handoff/legal/dpdp-v1-calls-signed.md`, unchanged.

**Flag for lead:** Ajay's file adds a signed last line to BOTH dialog bodies: `Backup copies are erased within 7 days.` Neither spec shows it. Add it to both bodies (Ajay, signed).

## A. T-115b Delete a document

| Where (spec section) | String | Note |
| --- | --- | --- |
| Dialog title (2) | `Delete this document?` | Ajay, signed |
| Dialog body (2) | `This deletes the document and everything in it, including its drafts and annexures. You cannot undo this. Ink used on it is not refunded.` + `Backup copies are erased within 7 days.` | Ajay, signed |
| Dialog buttons (2) | `Delete document` / `Cancel` | Ajay, signed |
| List button, 1280 px (1) | `Delete` | Icon-only at 375 px |
| List button aria-label (1) | `Delete {title}` | Title must not go to logs or analytics |
| Document page button (1) | `Delete document` | Same as dialog button |
| Working button (3) | `Deleting...` | |
| Working, screen reader (3) | `Deleting the document.` | |
| Success line (3) | `Document deleted.` | Shown 6 s |
| Error, default (3) | `We could not delete this document. Try again.` | Safe if the route is not all-or-nothing |
| Error, only if lead confirms all-or-nothing (3) | `We could not delete this document. Nothing was deleted. Try again.` | NEEDS AJAY if used (it states what was or was not erased) |

## B. T-115c Close account

| Where (spec section) | String | Note |
| --- | --- | --- |
| Settings heading (1) | `Close account` | |
| Settings description (1) | `Close your Lawie account. You will be asked to confirm first.` | No erase claim |
| Settings button (1) | `Close account` | |
| Dialog title (2) | `Close your account and erase your data?` | Ajay, signed |
| Dialog body (2) | `This erases your account, your profile and every document you have created on Lawie. Any unused Ink and any active plan end now and are not refunded. We keep payment and invoice records for as long as tax law requires. You cannot undo this.` + `Backup copies are erased within 7 days.` | Ajay, signed |
| Dialog buttons (2) | `Close account and erase` / `Cancel` | Ajay, signed |
| Password label (2) | `Your password` | |
| Password help text (2) | `Enter your password to confirm it is you.` | |
| Email label, Google-only (2) | `Type your email address` | |
| Email help text (2) | `Type the email address you sign in with, to confirm it is you.` | |
| Working button (3) | `Closing...` | |
| Working, screen reader (3) | `Closing your account. Please wait.` | |
| Wrong password, 401 (3) | `That password is not right. Nothing was changed.` | Fine: the 401 comes before any erase. Lead to confirm |
| Wrong email, Google-only (3) | `That email address does not match. Nothing was changed.` | Same check as above |
| 409 `subscription_active`, cancel path exists (3) | `Cancel your plan first.` + link label `Go to Plan` | Arjun's string |
| 409, no cancel path (3) | `Cancel your plan first.` + `Write to contact@lawie.in to cancel.` | Arjun's fallback |
| Other error (3) | `We could not close your account. Try again.` | |
| Old Google session (3) | add `Sign in again, then try once more.` | |
| Failure midway through erase (3) | `We couldn't finish closing your account. Some of your data may not be erased yet. Please try again, or write to us at {support email} and we will finish it.` | Ajay, signed (14 Oct). {support email} = Privacy Policy address. Signed in 1a842e1 |

## C. /account-closed page (4)

| Element | Variants | Note |
| --- | --- | --- |
| Title (`h1`) | `Your account is closed` / `Your Lawie account is closed` | Spec's own wording |
| Line 1 | `You have been signed out.` | |
| Line 2 | `Thank you for using Lawie.` | |
| Link label | `Go to the home page` / `Back to Lawie` | Links to `/` |

- The page says nothing about what was erased, so it does not need Ajay. If anyone adds "your data has been erased", it NEEDS AJAY.
- Avoided everywhere: "free", "permanently", "immediately", security or encryption claims, backup promises beyond Ajay's signed line.

## Needs Ajay

- Mid-erase failure line (B): signed by Ajay, now in the table above. T-115b equivalent: `We couldn't finish deleting this document. Please try again. If this keeps happening, write to us at {support email}.`
- Error line in A with "Nothing was deleted", only if the lead wants it.
- Any added line on /account-closed about erased data.
