# T-253d: Lawie Assistant panel (design hand-off)

| Field | Value |
| --- | --- |
| Owner | Rajesh (design). Build: the lead on T-253d. Verdict: Anushka |
| Date | 11 Oct 2026 |
| Sources | `T-253-lawie-assistant-chatbot.md`, `ADR-T-253-lawie-assistant.md` (ADR-023), `handoff/legal/T-253-assistant-scope-signed.md` (Ajay, blocks B and E) |
| Matches | Dashboard layout (`app/dashboard/layout.tsx`), `SectionFinderPanel` (right-docked panel), T-194 `ExportBlanksDialog` (Radix Dialog shell, `intake/ui.ts` buttons), T-005 brand tokens |
| Copy | Ajay's strings are exact and come from the server or the constants below. Upgrade CTA: Meera. Every other string here is a **draft for Madhuri**; any change to a legal line goes back to Ajay |

## 1. Where it opens

| | Desktop (≥ 768px, `md:`) | Phone (< 768px, incl. 375px) |
| --- | --- | --- |
| Form | Right-docked side panel, **non-modal**. `fixed inset-y-0 right-0 z-40 w-[400px] border-l border-brand-line bg-white shadow-xl` | **Full-screen sheet**, modal (Radix Dialog). `fixed inset-0 z-50 h-[100dvh] bg-white` |
| Why | The advocate keeps reading the draft while asking; copy-paste between them | At 375px the Android keyboard takes ~half the screen. A partial drawer would leave 3 lines of chat |
| Page behind | `md`–`lg`: panel overlays. `xl` (≥ 1280px): `main` gets `xl:pr-[400px]` so the draft stays fully visible beside the chat | Hidden. Android back closes the panel (push a history entry on open), never leaves the page |
| Motion | `translate-x-full` → `0`, 200 ms, as SectionFinderPanel. None under `prefers-reduced-motion` | Slide up 200 ms; none under reduced motion |

**Entry points**
- Top bar (layout.tsx), left of `HeaderCreditPill`: button `MessagesSquare` 16px + "Assistant". Phone: icon only, 44 × 44, `aria-label="Open assistant"`.
- Sidebar: one nav item "Assistant" under "Section finder" (same `action` pattern).
- Free plan: entry shows, with a 12px `Lock` icon; it opens the locked state.
- No keyboard shortcut in v1 (⌘K / Ctrl+K belongs to Section finder).

**One right panel at a time.** Opening the assistant closes Section finder and the reverse (window events `lawie:openAssistant` / existing `lawie:openSectionFinder`). Both use the right edge and `z-40`; two open panels would stack.

## 2. Anatomy (top to bottom)

| Zone | Spec |
| --- | --- |
| Header, 56px | `px-4 md:px-5 border-b border-brand-line flex items-center gap-2`. `MessagesSquare` 16px `text-brand-navy` (decorative). Title `font-heading text-lg font-semibold text-brand-navy` "Lawie Assistant". Under it `text-[13px] text-brand-muted` usage line: "{left} of {limit} messages left today". Right: overflow `MoreVertical` menu (Radix DropdownMenu) with "Delete conversation"; close `X` (phone: `ChevronLeft` "Back"). All icon buttons 44 × 44 |
| Message list | `flex-1 overflow-y-auto px-4 md:px-5 py-4 flex flex-col gap-4`. Auto-scroll to bottom only if the user is already within 80px of it |
| Composer | `border-t border-brand-line px-4 md:px-5 pt-3 pb-2 flex flex-col gap-2`: notice, paste area, question box + Send |
| Footer, always | `px-4 md:px-5 pb-3 pt-1 text-xs leading-5 text-brand-muted` with Ajay's footer line (§4). Phone: add `pb-[env(safe-area-inset-bottom)]` |

### Messages

| Element | Spec |
| --- | --- |
| User turn | Right-aligned, `max-w-[85%] self-end rounded-xl rounded-br-sm bg-brand-navy text-white px-4 py-2.5 text-[15px] leading-6` |
| User turn with pasted text | Above the question: a block `rounded-lg bg-white/10 px-3 py-2 font-serif text-[14px] leading-6`, label "Pasted text" `text-xs text-white/80`, clamped to 4 lines with "Show all" (44px tap) |
| Assistant answer | Left, full width, `rounded-xl border border-brand-line bg-white px-4 py-3 text-[15px] leading-6 text-brand-navy`. Plain text: paragraphs on blank lines, `-` lists. **No raw HTML, no links** except allowlisted `lawie.in` paths (output filter already strips the rest) |
| Suggested wording block | Inside an answer: `mt-3 rounded-lg border-l-4 border-brand-gold bg-brand-page px-3 py-2 font-serif text-[15px] leading-7 text-black` (court-paper look, so it reads as draft text, not chat). `[To be confirmed: …]` markers kept as written, `font-semibold` |
| Disclaimer under answer | Divider `border-t border-brand-line mt-3 pt-2`, then Ajay's line `text-[13px] text-brand-muted`. Rendered on the `done` event, never mid-stream |
| Action row | Under the disclaimer, `flex gap-1`: **Copy paragraph** (only when the answer has a wording block) and **Report**. Ghost buttons `min-h-[44px] px-3 text-sm text-brand-navy rounded-lg hover:bg-brand-page`, icons `Copy` / `Flag` 16px |

## 3. States

| State | Trigger (ADR-023 §4) | What shows | Composer |
| --- | --- | --- | --- |
| **Empty** | No turns | `text-brand-navy text-[15px]` intro: "Ask about Indian law and practice, using Lawie, or the wording of one paragraph." Then 4 prompt chips, one per scope + one paste prompt. Chips: `min-h-[44px] rounded-full border border-brand-line bg-white px-4 text-sm text-brand-navy hover:bg-brand-page text-left`, wrap. Tap **fills** the question box, never sends. Draft chips (Madhuri; none may ask for case law, a time limit or an outcome): "Explain the difference between BNSS 480 and CrPC 437", "How do I export a draft to Word?", "Which template fits a regular bail application?", "Improve the wording of a paragraph" (opens the paste area) | Normal, notice visible |
| **Typing** (sent, no token yet) | After POST, before first chunk | Assistant card with 3 dots `h-1.5 w-1.5 rounded-full bg-brand-muted animate-pulse` (static under reduced motion). Visually hidden "Lawie Assistant is replying" | Send becomes **Stop** (`Square` icon, `secondaryButton`). Inputs stay editable |
| **Streaming** | SSE chunks | Text appends in sentence chunks (server buffers per sentence). Card `aria-busy="true"`. No disclaimer or actions yet | Stop. On Stop: keep text received, add "Stopped." `text-[13px] text-brand-muted`, then the disclaimer |
| **Done** | `done` event | Disclaimer line + action row appear. Usage line updates | Normal |
| **Refused** | Reply is one of Ajay's R1–R12, or a `retract` replaces a reply | Card `bg-brand-page border-brand-line`, text `text-brand-navy`, **no** icon, **no** red, **no** disclaimer (Ajay: refusals aren't substantive), no Copy. Report stays (lets the advocate flag a wrong refusal). On `retract`: swap the text in place, no flash | Normal |
| **Daily cap** | 429 `daily` | System card `rounded-xl bg-brand-gold-light text-brand-gold-dark px-4 py-3 text-[15px]`, `Clock` 16px: Ajay's line `You've reached today's message limit. It resets tomorrow.` + numbers line "{limit} of {limit} messages used today. Resets at midnight IST." | **Replaced** by the card (not a disabled box). History stays readable; Copy and Report still work |
| **Monthly cap** | 429 `monthly` | Same card. Draft: "You've reached this month's assistant limit. It resets on {1 Month}." No ₹ figure shown | Replaced. **Needs Ajay's string** (he signed only the daily one) |
| **Cool-down** | 429 `cooldown` (3 flags in 24 h) | Same card, draft: "The assistant is paused on your account until {time, date}." | Replaced. **Needs Ajay's string** |
| **Unavailable** | 503 `paused` (kill switch) or global budget | Neutral card `rounded-xl border border-brand-line bg-brand-page px-4 py-3`, `PauseCircle` 16px `text-brand-muted`. ADR text "Assistant is paused" + draft "Please try again later." No reason, no ₹, no time | Replaced |
| **Free plan locked** | 403 / `plan: free` | Whole body is one centred card (T-194 dialog look): 40px circle `bg-brand-gold-light` with `Lock` 20px `text-brand-gold-dark`; title `font-heading text-[22px] text-brand-navy` Ajay's line `Lawie's assistant is included with Solo and Pro.`; numbers line `text-[15px] text-brand-navy` "Solo: 30 messages a day. Pro: 60 a day."; CTA `primaryButton w-full` → `/dashboard/payment`. **CTA text and any extra line: Meera; Ajay checks.** Never "unlimited", no teaser answers, no prompt chips | None. Notice and paste area hidden. Footer line stays |
| **Error** | Network, 5xx, stream cut without `done` | Under the user turn: `rounded-xl bg-brand-error-light text-brand-error px-4 py-3 text-sm` "Couldn't get a reply." + `secondaryButton` "Try again" (resends the same message + paste). Partial text, if any, is dropped (it never got the disclaimer). Offline (`navigator.onLine === false`): "You're offline. Your message is still in the box." | Message restored to the boxes so nothing is retyped |

## 4. Legal lines (Ajay, block E, exact; do not reword)

| Line | Exact text | Where and when |
| --- | --- | --- |
| Under every answer | `Legal information, not legal advice. Check the bare act before you rely on it.` | Every non-refusal answer, after `done`. The server appends it (ADR §3d); the client renders the server's string in the disclaimer style. If the client builds it, use a single constant, never model text |
| Panel footer | `Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.` | Always visible, every state incl. locked |
| Above the input | `Don't enter client names or other details that identify a person.` | Before first message ever, and whenever both boxes are empty. `flex gap-2 rounded-lg bg-brand-gold-light px-3 py-2 text-[13px] leading-5 text-brand-gold-dark`, `ShieldAlert` 14px. `id="asst-notice"`, referenced by both boxes' `aria-describedby` |

## 5. Paste area (separate from the question box)

| | Paste area | Question box |
| --- | --- | --- |
| Opens by | Button above the question box: `ClipboardPaste` 16px + "Add text from your draft" (`linkButton`, 44px). Expands; ✕ "Remove pasted text" collapses and clears | Always visible |
| Look | `font-serif text-[15px] leading-6 rounded-lg border border-dashed border-brand-line bg-brand-page px-3 py-2 min-h-[96px] max-h-[160px] overflow-y-auto` (paper, so it reads as material, not a message) | `input` from `intake/ui.ts`, Inter, auto-grow 1–5 lines, `max-h-[136px]` |
| Label | Visible `label` "Text to work on" | Visually hidden "Your question"; placeholder "Ask about law, practice or using Lawie" |
| Limit | 4,000 chars (ADR rule). Counter "1,240 / 4,000" `text-xs text-brand-muted`, turns `text-brand-error` at limit; `maxLength` set | 2,000 chars. Counter shows from 1,800 |
| Sent as | `pasted` field | `message` field. Never concatenated (ADR §3e) |
| With paste, empty question | Chips appear under the paste area: "Improve the wording", "Explain this clause", "Make it more formal". Tap fills the question box | Send disabled until the question has text |

Send: `primaryButton` square, `h-12 w-12 px-0`, `SendHorizontal` 20px, `aria-label="Send"`. Desktop: Enter sends, Shift+Enter is a new line. Phone: Enter is a new line, the button sends. Never send while `isComposing` (Hindi IME).

## 6. "Copy paragraph" (no auto-insert)

- Copies **only** the wording block to the clipboard, as plain text, `[To be confirmed: …]` markers kept (T-194's export warning then catches them). Never the disclaimer, never the whole answer.
- Feedback: label swaps to `Check` + "Copied" for 2 s; live region says "Paragraph copied. Paste it into your draft."
- **No** insert-at-cursor event, no write to the editor. The advocate pastes it themselves.
- Label pushback: Priya's brief says "Use this paragraph". "Use" reads as "puts it in my draft", which it doesn't. I recommend "Copy paragraph"; Madhuri decides.

## 7. Report

- `Flag` "Report" on every assistant card (answers and refusals).
- Opens a confirm dialog with the T-194 shell (`bg-brand-navy/55` overlay; bottom sheet on phone, `sm:w-[480px]` centred dialog). Title "Report this answer?" Body draft: "We'll keep this question and answer for 90 days so we can review it." Buttons: `primaryButton` "Report", `secondaryButton` "Cancel". Initial focus on Cancel.
- After: button becomes "Reported" (disabled, `Check` icon), live region "Reported. Thank you."
- The 90-day line states retention, so **Ajay checks it** (block H).

## 8. Delete conversation

Header menu → confirm dialog (same shell). Title "Delete this conversation?" Body draft: "This can't be undone." Buttons: `bg-brand-error text-white` "Delete" (`min-h-[48px] rounded-lg`), `secondaryButton` "Cancel" (initial focus). After: empty state.

## 9. Accessibility

| Item | Spec |
| --- | --- |
| Landmark | Desktop: `<aside aria-labelledby="asst-title">` (non-modal, no focus trap). Phone: Radix `Dialog` (modal, focus trapped, `Dialog.Title` = header title) |
| Focus on open | Desktop: question box. Phone: the title (not the box), so the keyboard doesn't cover the screen before they read anything. Locked: the CTA |
| Focus on close | Back to the entry button that opened it. Esc closes (desktop and phone) |
| Streaming | Message list is **not** live. One visually hidden `aria-live="polite"` region: announces "Replying" at start, then the full answer **once** on `done` (text + disclaimer). The streaming card has `aria-busy="true"`. Chunks are never announced one by one |
| Refusal, retract, caps, unavailable | Announced via the same polite region |
| Error | `role="alert"` on the error card. Focus moves to "Try again" |
| Copy / report feedback | Polite region (§6, §7) |
| Contrast (all ≥ 4.5:1) | navy on white 16:1; white on navy 16:1; brand-muted `#566580` on white 5.9:1, on brand-page 5.6:1; gold-dark on gold-light 6.4:1; error on error-light 5.6:1. Gold `#C8850E` only as the wording-block border, never text (T-005 rule) |
| Targets | Every control ≥ 44 × 44; Send and primary buttons 48 |
| Zoom | Works at 200% and at 320px wide: chips wrap, no horizontal scroll; long section numbers break with `break-words` |
| Language | Hindi answers: set `lang="hi"` on the card when the server says so; Inter has no Devanagari, so the stack falls back. **Vishal: add `Mukta` (or Noto Sans Devanagari) to `fontFamily.sans`** before Hindi is tested |

## 10. Tokens and sizes

| Token / size | Value |
| --- | --- |
| Panel width (md+) | 400px; phone 100vw × 100dvh |
| z-index | Panel `z-40` (desktop), `z-50` (phone and confirm dialogs), overlay `z-40` |
| Side padding | `px-4` phone, `md:px-5` |
| Gaps | Messages `gap-4`; composer `gap-2`; action row `gap-1` |
| Radii | Cards `rounded-xl`; inputs, buttons, wording block `rounded-lg`; chips `rounded-full`; sheets `rounded-t-2xl` / `sm:rounded-2xl` |
| Type | Title `font-heading text-lg` (sheet titles `text-[22px] sm:text-2xl`); messages `text-[15px] leading-6`; wording block `font-serif text-[15px] leading-7`; meta, disclaimer, notice `text-[13px]`; footer, counters `text-xs` |
| Colours | `brand-navy` text and user bubble; `bg-white` panel; `brand-page` refusals, paste area, wording block; `brand-line` borders; `brand-muted` meta; `brand-gold-light` / `gold-dark` notice, caps, lock; `brand-error-light` / `error` errors; `brand-teal` focus rings only |
| Focus ring | `focus-visible:ring-2 ring-brand-teal ring-offset-2` (as `intake/ui.ts`) |
| Icons | lucide only (already bundled): `MessagesSquare, X, ChevronLeft, MoreVertical, ClipboardPaste, SendHorizontal, Square, Copy, Check, Flag, Clock, PauseCircle, Lock, ShieldAlert, Trash2` |
| Bandwidth | No images, avatars, or new fonts/libraries in the panel. History loads the last 6 turns on open |

## 11. What the panel needs from 253a's API (contract, for the lead and Arjun)

- A status call on open: `enabled`, `plan`, `used`, `limit`, `resetsAt`, so the usage line and the locked state render before any message.
- 429 and 503 bodies carry a reason: `daily | monthly | cooldown | paused | budget`, plus `resetsAt` where there is one. The UI shows nothing the reason doesn't support.
- A `done` event carrying the disclaimer and, for drafting help, the **wording block as its own field** (or a fixed delimiter). Without it, "Copy paragraph" can't know what to copy.
- Abort on Stop must still settle the cost (client closes the stream).

## 12. UX risks and open items

| # | Item | Owner |
| --- | --- | --- |
| 1 | Monthly cap and cool-down strings aren't signed. Draft strings above | Ajay |
| 2 | The client-names notice hides once typing starts (as signed). Pasting is the riskiest moment, so I'd keep it visible while the paste area has text. That's a placement change to a legal line | Ajay |
| 3 | Disclaimer under Hindi answers stays English (as signed) unless Ajay signs a Hindi version | Ajay |
| 4 | "Use this paragraph" vs "Copy paragraph" (§6) | Madhuri, Priya |
| 5 | Wording block needs a structured field from 253b (§11) | Arjun |
| 6 | Before launch (`chat.enabled=false`), hide the entry points when status says disabled. Otherwise every user sees "paused" for a feature that hasn't launched. Mid-session 503 still shows Unavailable | Lead, Priya |
| 7 | Entry points touch `layout.tsx` and `Sidebar.tsx`; Section finder's open logic needs the one-panel rule | Lead (claim) |
| 8 | Devanagari font missing from the Tailwind stack (§9) | Vishal |
| 9 | Web has no tests or CI; Anushka's browser pass covers: every state in §3, 375px, keyboard-only, TalkBack | Anushka |
