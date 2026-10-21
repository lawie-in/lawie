# T-539 hand-off spec: Draft progress, the honest bar

| Field | Value |
| --- | --- |
| Author | Rajesh (designer), 21 Oct 2026 |
| Source | Arjun's ruling `handoff/design/draft-progress.md` (SSE stage events, resume, run state, cancel); founder, 21 Oct |
| Approvers | Arjun (events and fields), Madhuri and Meera (copy), Ajay (any label that names law) |
| Tokens | `DESIGN.md`; this spec adds one component (Draft progress) and changes one motion rule (ink drain) |
| Surface | Operate (`impeccable` operate mode). Screens: 05 Generating, the editor during a regenerate, the documents list, the dashboard shelf |
| Feeds | T-539 (web), ticket A in Arjun's note (drafting) |

Every string here is placeholder until Madhuri writes it and Ajay signs; stage names below do not name law, so they need Madhuri only. Server `label` and `detail` strings that name a court, a rule or a section are Ajay's.

## 1. The idea

The inkwell was always meant to drain while the draft is written; now it drains for real. The bar, the well and the stage list all read the same number, `pct`, which only ever comes from the server. Nothing on this surface moves on a timer. When the server is quiet the surface is quiet, and says so.

## 2. Anatomy (360 first)

On the folio, under the breadcrumb (Describe · Details · Draft), above the streaming draft text:

```
┌ folio ─────────────────────────────────────────────┐
│ [inkwell]  Checking the draft                 70 % │  row 1: label (Mukta 500 16/24), pct Tiro 24/30 tabular, right
│            checked 4 of 9 citations · about 10 s   │          detail or eta, body-sm Muted
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━●━━━━━━━━━ │  row 2: bar, 6px, track Wood, fill Brass, width = pct
│ ● ● ● ● ◉ ○ ○      Show steps          Cancel draft│  row 3: stage dots, disclosure, cancel
└────────────────────────────────────────────────────┘
```

- **Inkwell** (52×64, DESIGN.md Inkwell) at the left of row 1. Its level is the advocate's Ink balance, and it drains from `balance` to `balance − cost` as `pct` goes 0 to 100. At 360 the well stays; nothing else is dropped.
- **Label**: the current stage name (section 3). Mukta 500 16/24, Text. One line; wraps to two on 360 if Hindi needs it.
- **Pct**: Tiro 24/30, tabular, Text, right-aligned on the label's line. Shown from the first `stage` event. Never animated as a counter; it changes when the server says so.
- **Detail line**: body-sm Muted. Shows the server `detail` when present ("checked 4 of 9 citations"); otherwise the eta (section 4); otherwise empty but keeps its height so the folio does not jump.
- **Bar**: 6px, radius 0, track Wood, fill Brass. Width is `pct`. Transition `width 400ms ease-out`; none under reduced motion. The fill never moves without a server value.
- **Stage dots**: one 10px dot per stage reached or ahead (section 3), joined by a 1px Line rail. Done: Brass filled. Current: Brass filled with a 2px Brass Soft ring (the only ring). Upcoming: 1px Control Line ring, transparent. Repair rounds appear as they happen; a run with no repair never shows a repair dot.
- **Show steps**: a text-link disclosure (Brass Text, 44px target) that expands the dots into the named list (section 3) below row 3. Open by default from 900px; closed on phones. Remembered per session.
- **Cancel draft**: ghost button, right end of row 3, 36px small size. Opens the cancel dialog (section 6). Hidden once `done` or `error` arrives.

Spacing: rows 12px apart; the folio keeps its 24/40 padding. The draft text streams in below with a 24px gap once the `draft` stage starts.

## 3. Stages and names

Web owns the stage names in both languages so Madhuri can sign them once and Hindi works; the server owns `detail`. (Arjun: please keep `label` for logs and the fallback, and send `detail` as the advocate-facing free text.)

| `stage` | English name (placeholder) | Hindi (placeholder) | Notes |
| --- | --- | --- | --- |
| queued | In line | कतार में | eta shown if known |
| intake | Reading your facts | आपके तथ्य पढ़ रहा है | |
| preflight | Checking what is needed | ज़रूरी बातें जाँच रहा है | |
| draft | Writing the draft | मसौदा लिख रहा है | tokens stream below; `pct` advances by section |
| verify | Checking the draft | मसौदा जाँच रहा है | ticks: "checked N of M" |
| repair | Fixing what the check found, round N of 2 | जाँच में मिली बातें सुधार रहा है, N/2 | one dot per round |
| render | Laying out the document | दस्तावेज़ सजा रहा है | |
| done | Draft ready | मसौदा तैयार | then the Seal (section 7) |

`pct` is honest: the server computes it from stages reached and sections written. The web never interpolates between values.

## 4. Eta and ticks

- `eta_s` known: "about 10 s". Rounding: under 5 s "a few seconds"; 5 to 59 s to the nearest 5 ("about 15 s"); 60 s and over to the nearest minute ("about 1 min", "about 2 min"). Never a countdown; it re-renders only when a new `eta_s` arrives.
- `eta_s` unknown: nothing. No dashes, no "estimating".
- `detail` present: it replaces the eta on the detail line. The eta returns when the next event has no detail.
- **Silence**: 15 s with no event in any stage and the detail line shows "Still working…" (existing copy) in Muted; the bar and the well do not move. The line clears on the next event.

## 5. Connection lost

A stream that ends without a server event (`done` or `error`) is "connection lost". The browser reconnects on its own (`Last-Event-ID`); the surface shows it honestly:

- Label becomes "Connection lost. Reconnecting…" in Warn text; the stage dots keep their state; `pct` stays.
- The bar fill switches to a 45° stripe (Brass on Brass Soft, 8px period, static) so a frozen bar is not mistaken for a stuck one. No animation.
- The inkwell stops where it is.
- After 30 s still disconnected: detail line "Still trying. Your Ink is not charged until the draft finishes." and a ghost "Retry now" beside Cancel.
- On resume: the replayed events restore the label and `pct`; the stripe returns to the solid fill with the 400ms transition.
- After 2 min: the error state (section 7) with "Could not reach Lawie. Your Ink is not charged." and Try again / Back.

## 6. Cancel

"Cancel draft" opens a dialog (DESIGN.md Dialog; bottom sheet at 360): title "Stop this draft?", body "Nothing is charged. You can start again from your details.", safe action "Keep going" (ghost, first focus), confirm "Stop draft" (destructive fill). On confirm: `POST …/cancel`, label "Stopping…", then the surface closes and the flow returns to Review details (03) with everything kept. Cancel is disabled (not hidden) between the `render` and `done` events, with the detail line "Almost done, finishing the document."

## 7. End states

- **Done**: `pct` 100, bar full, label "Draft ready", every dot Brass. 600 ms later the progress block collapses to the "1 Ink used" chip and the Seal stamps (DESIGN.md Seal motion); the draft text is already on the folio. Reduced motion: no collapse animation, Seal fades 150 ms.
- **Error** (server `error`): bar fill Rust, label from the server in Rust text (Ajay-signed set), detail "You were not charged.", buttons Try again (primary) and Back (ghost). The stage dots stay so the advocate can see where it stopped.
- **Refreshed page** (`GET /documents/runs/:runId`): the same block mounts in an "attached" state: label and `pct` from the run state, stripe fill and the detail "Reconnecting to the draft…" until the stream replays, then live. If the run is already done, the page shows Draft ready directly.

## 8. Elsewhere in the app

- **Documents list** row: a Brass chip "Verifying… 70 %" (tabular) in place of the status, from the run-state route, refreshed with the list.
- **Dashboard shelf**: a drafting document is a spine with the two bands and the status label "drafting"; its accessible name carries the stage and pct ("Bail application, checking the draft, 70 percent"). No bar on a spine.
- **Editor, regenerate**: the same block replaces the chips row under the draft; the old draft dims to opacity .5 until `done`, then the new text replaces it and the Seal stamps.

## 9. Accessibility

- The bar is `role="progressbar"` with `aria-valuemin=0`, `aria-valuemax=100`, `aria-valuenow=pct` and `aria-valuetext` = "<stage name>, <pct> percent, <eta or detail>".
- Stage changes are announced through one polite live region (the label). Ticks are not announced; the detail line is `aria-live="off"`. Connection lost and error are announced (`role="alert"` for error).
- Cancel and Retry are 44px targets. Focus order: label, bar, Show steps, Cancel.
- Hidden tab: no transitions run; state still updates so the view is right on return.

## 10. Motion (DESIGN.md change)

The "ink drain 2.6 s linear" entry is replaced: **ink drain follows `pct`**, with a 400 ms ease-out on each change and no animation under reduced motion. The 2.6 s loop remains only on the landing demo, which has no server. Bar width, dot state and the stripe swap use the same 400 ms / 150 ms values; the done collapse is 600 ms.

## 11. For Arjun

- `stage` event fields used: `stage`, `pct`, `eta_s`, `detail` (new, advocate-facing), `round` for repair (1 or 2). `label` kept for logs and as the fallback name when the web has no string for a stage.
- `pct` must be monotonic within a run; if the server would go backwards (a repair round), hold the bar and advance the dots.
- Run-state route also returns `cost` so the inkwell can draw the right drain on a refreshed page.

## 12. Not in this ticket

A per-section progress inside the draft text, a sound, a notification when the tab is hidden, a progress view on the Playwright goldens (anything with model text is never a golden).
