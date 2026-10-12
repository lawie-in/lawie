# T-243: Waitlist form (design hand-off)

| Field | Value |
| --- | --- |
| Owner | Rajesh (design). Copy: Madhuri. Sign-off: Meera. Consent line: Ajay. Build: lead. Verdict: Anushka |
| Date | 12 Oct 2026 |
| Sources | `T-243-waitlist-before-go-live.md`, `T-242-signup-source-and-utm.md`, tokens in `apps/web/tailwind.config.js` (T-005), class names in `components/intake/ui.ts` |
| Replaces | `components/landing/WaitlistForm.tsx` (email only; uses `lawie-*` blue, `slate-*` and green, none of which are brand tokens, and has no consent, no error state) |
| Copy | Every string below is a **draft for Madhuri**. The consent line is **Ajay's** and is a placeholder here |

## 1. Where it lives

- Landing page `FinalCTA` section, as a card (`card` from `ui.ts`, `max-w-[520px] mx-auto`). The hero keeps a single "Join the waitlist" button that scrolls to this card (one form on the page, not two).
- No modal. A modal on a patchy 4G phone with the keyboard open is the worst case; an in-page card scrolls naturally.

## 2. Fields

Single column at every width. Visible label above each field (`label` class), never placeholder-only. All inputs use `input` (48px high, `text-base` 16px so Android/iOS don't zoom).

| # | Field | Required | Type / attrs | Limit | Helper (`small`) |
| --- | --- | --- | --- | --- | --- |
| 1 | Full name | Yes | `text`, `autocomplete="name"` | 100 | none |
| 2 | Email | Yes | `email`, `inputmode="email"`, `autocomplete="email"`, `autocapitalize="off"` | 254 | none |
| 3 | Phone | No | `tel`, `inputmode="tel"`, `autocomplete="tel"`. +91 prefix shown as static text inside the field, user types 10 digits | 10 digits | "Optional. Only if you'd like a call or WhatsApp." (draft) |
| 4 | City | No | `text`, `autocomplete="address-level2"` | 60 | "Optional" |
| 5 | Practice area | No | Native `<select>` (mid-range Android renders it as a full-screen picker, better than a custom dropdown). First option "Select (optional)" | n/a | "Optional" |

- Optional fields carry the word "(optional)" in the label text, not an asterisk. Required ones carry nothing; the form says once, above the fields, "Name and email are required."
- Practice-area options: **Madhuri/Priya to confirm the list.** Suggested: Criminal, Civil, Family, Property, Cheque bounce (NI Act), Consumer, Other.
- Hidden fields (no UI): `utm_source`, `utm_medium`, `utm_campaign` (T-242, from first-party storage), plus a bot-trap field (visually hidden, `tabindex="-1"`, `aria-hidden`, `autocomplete="off"`). Not shown to the user, not announced to screen readers.

## 3. Consent

- Checkbox directly above the submit button. Unticked by default. 24 x 24 box inside a 44px-high row; the **whole label text is the tap target**.
- Layout: `flex items-start gap-3`, text `text-sm leading-5 text-brand-navy`.
- Required: submit is not disabled when unticked (a disabled button gives no reason); instead, submitting unticked shows the consent error (section 4).
- Text: **`[CONSENT LINE: Ajay to supply, DPDP wording. Must name what we store, why, and how to withdraw]`**
- Below it, `small`: link "Privacy policy" (opens in the same tab, `linkButton`) and, **if Ajay confirms**, a one-line "To remove your details, write to {address}" (T-243 criterion 5, deletion path). Address and wording: Ajay.
- If Ajay's text is long, it wraps; do not truncate or put it behind a "read more".
- Language: if Ajay signs a Hindi version, it shows under the English line, `lang="hi"`. Needs Mukta added to `fontFamily.sans` first (same note as T-253 section 9).

## 4. States

| State | What the user sees | Notes |
| --- | --- | --- |
| **Empty (default)** | Card with heading, one-line sub, fields, consent, button "Join the waitlist" (`primaryButton w-full`) | Heading uses `h1`-scale `font-heading` navy. Sub in `sub`. Draft heading: "Get a place on the Lawie waitlist". Draft sub: "Name and email are required." No date, no price, no "launching soon" |
| **Focus** | `focus:border-brand-teal focus:ring-2 ring-brand-teal` (from `input`) | Teal is used for focus only |
| **Field error** | Inline under the field: `text-[13px] text-brand-error` with `AlertCircle` 14px; field border `border-brand-error`; `aria-invalid="true"`, `aria-describedby` points to the message | Validate on blur for email, on submit for the rest. Never validate while typing |
| **Consent error** | Same inline style under the checkbox row: "Please tick to continue." (draft). Checkbox border turns `brand-error` | Focus moves to the checkbox |
| **Error summary** | On submit with errors, focus goes to the first invalid field. No separate top banner (one error at a time is shorter to scan on 375px) | |
| **Submitting** | Button text "Joining..." with 16px spinner (static icon under reduced motion), `disabled`, `aria-busy`. Fields `readonly`, not disabled (keeps values and focus) | Prevents double submit |
| **Success** | The form is **replaced** by a card: `bg-brand-teal-light`, `CheckCircle2` 24px `text-brand-teal-dark`, title `font-heading text-xl text-brand-navy` "You're on the list." and `text-[15px] text-brand-navy` "We'll write to {email}." No launch date, no "soon", no price (T-243 criterion 4). Focus moves to the title; polite live region announces it | Teal fill with teal-dark icon: allowed by T-005 ("teal for focus and success fills"). Text stays navy for contrast |
| **Already on the list** | Looks identical to Success (criterion 2: no duplicate, and showing "already registered" would leak who is on the list) | Server returns 200 for both |
| **Rate limited (429)** | Inline card above the button, `bg-brand-gold-light text-brand-gold-dark rounded-xl px-4 py-3 text-sm`, `Clock` 16px: "Too many tries. Please wait a few minutes and try again." (draft). Values kept | |
| **Network / server error** | Same card position, `bg-brand-error-light text-brand-error`, `role="alert"`: "Couldn't send your details. Check your connection and try again." (draft). Button re-enabled; all values kept | Offline: "You're offline. Your details are still here." |
| **Bot rejected** | Show the same Success card. No hint to the bot | Server drops silently |

## 5. Mobile at 375 px

| Item | Spec |
| --- | --- |
| Container | Page gutter `px-4` (16px). Card `p-4`, so content width is 375 - 32 - 32 - 2 = **309px**. Inputs full width of that |
| Order | Heading, sub, name, email, phone, city, practice area, consent, button, privacy link. Total about 700px tall without the keyboard; with the keyboard open the page scrolls, no fixed elements |
| Heading | `text-[26px] leading-8` (the `h1` mobile size), wraps to 2 lines |
| Spacing | `gap-4` between fields (label to input `gap-1.5`); consent row `mt-1`; button `mt-2` |
| Keyboard | Enter on a text field moves to the next field (`enterkeyhint="next"`), last field `enterkeyhint="done"`. Email shows the email keyboard, phone the numeric pad. Focused field scrolls into view with `scroll-margin-top: 96px` |
| Button | Full width, 48px, never sticky (a sticky button sits on top of the Android keyboard) |
| Tap targets | All 44px+ (inputs 48, consent row 44, privacy link 44) |
| Success card | Same width, text wraps; email address uses `break-all` so a long address doesn't overflow |
| 320px | No horizontal scroll; heading drops to 24px if it wraps to 3 lines |
| `sm:` and up | Same single column in a `max-w-[520px]` card, centred. No two-column layout: it saves little and breaks the label-above pattern |

## 6. Accessibility

- Real `<form>`, `<label for>` on every field, `<fieldset>`/`<legend>` not needed.
- Errors tied by `aria-describedby`; success and errors announced in one polite live region (`role="alert"` for server errors only).
- Contrast (all at least 4.5:1): navy on white 16:1; brand-muted `#566580` on white 5.9:1; error `#B3261E` on white 6.5:1 and on error-light 5.6:1; gold-dark on gold-light 6.4:1. Gold `#C8850E` is not used for text.
- Works at 200% zoom; keyboard-only complete; Esc not needed (no modal).
- `prefers-reduced-motion`: no spinner rotation, no transitions.

## 7. Tokens (no new ones)

| Use | Token |
| --- | --- |
| Heading | `font-heading text-brand-navy` |
| Card | `border-brand-line bg-white rounded-xl` |
| Input | `ui.ts` `input`; error variant `border-brand-error` |
| Label / helper | `label` / `small` (`text-brand-muted`) |
| Button | `ui.ts` `primaryButton` |
| Rate-limit card | `bg-brand-gold-light text-brand-gold-dark` |
| Error | `bg-brand-error-light text-brand-error` |
| Success | `bg-brand-teal-light`, icon `text-brand-teal-dark` |
| Focus | `ring-brand-teal` |
| Icons | lucide: `AlertCircle, CheckCircle2, Clock, Loader2` |
| Do not use | `lawie-*`, `slate-*`, `green-*` (what the current `WaitlistForm.tsx` uses) |

## 8. Open items

| # | Item | Owner |
| --- | --- | --- |
| 1 | Consent line, privacy link target and the deletion-request wording | **Ajay** |
| 2 | All draft strings (heading, sub, helpers, errors, success) | Madhuri, Meera signs |
| 3 | Practice-area list | Madhuri / Priya |
| 4 | Whether the success state should offer the deletion contact too | Ajay |
| 5 | Hindi version of the consent line (needs Mukta in the Tailwind font stack) | Ajay, Vishal |
| 6 | Hero CTA currently renders its own inline email form; it should become a scroll-to-card button | Lead |
| 7 | No personal data in logs applies to client-side error reporting too: Sentry must not capture field values | Lead |
| 8 | Web has no tests; Anushka's browser pass covers every state in section 4, 375px, keyboard-only | Anushka |
