# T-616 design note: the "Reconnecting…" banner

Rajesh, 26 Oct 2026, for Kunal (web) and Arjun's approval. Tokens of record: `DESIGN.md`. Copy below goes to Madhuri for tone and Ajay for sign-off; the two reused T-539 lines are already signed.

## When
Shows after the second failed session refresh (Arjun's rulings 1 and 4: a 429/5xx/network on `/refresh` never signs out) while the user is anywhere in the dashboard shell; most often mid-draft, where saves are not landing. Clears on the next successful refresh or save. Never while the browser is offline: `OfflineBanner` is the truer message then, so `useOnline() === false` suppresses this banner. No modal, no sign-out, no action button: the client keeps retrying with backoff; the user is not asked to do anything.

## Placement
The shell's banner slot, in flow, directly under the sticky top bar: after `VerifyEmailPrompt`, before `OfflineBanner` (only one of the last two is ever visible). Full-width warn fill, text in the content column, exactly `OfflineBanner`'s markup. Build it as a new `ui/Banner` kind `session-reconnecting` (tone warn, not dismissible, no action) so the three shell banners share one component; `OfflineBanner` may move onto the same kind in a later ticket, not this one. It pushes content down 44px once (same as the offline banner); the editor keeps the caret where it was. It is never sticky and never overlays the folio.

## Style
- Fill `--warn-light` (`bg-nl-warn-light`), text `--warn` (`text-nl-warn`), 1px `--line` bottom border, min height 44, Body Small 500. Both themes from tokens (the warn pair is AA in DESIGN.md).
- Leading mark: three 4px brass dots (`--brass`), 4px apart, before the text; the live one pulses opacity 1 → .35 in sequence, 1.2 s loop (the skeleton pulse timing). Under reduced motion the three dots are static at full opacity. Nothing else moves.
- `role="status"`, `aria-live="polite"`, `aria-atomic="true"`; `data-kind="session-reconnecting"`, `data-tone="warn"`.

## Copy (EN / HI)
| State | EN | HI | Status |
|---|---|---|---|
| Reconnecting (from the 2nd failed refresh) | `Reconnecting… Your changes will be saved once the connection is back.` | `फिर जुड़ रहा है… कनेक्शन लौटते ही आपके बदलाव सहेज लिए जाएँगे।` | NEW, Madhuri → Ajay |
| After 30 s in that state (text swaps, the bar does not grow) | `Still trying to reconnect.` | `अब भी जुड़ने की कोशिश जारी है।` | reused, T-539 signed |
| Recovered (shown 3 s, then the bar goes) | `Reconnected.` | `फिर जुड़ गया।` | NEW, Madhuri → Ajay |

Rules kept: no promise of time, no "never lose", no Ink word. "Your changes will be saved" is true under Arjun's design (the old access token is kept until it truly expires and the retry queue holds the saves); if Kunal's build cannot guarantee it, the sentence drops to `Reconnecting…` alone and Madhuri is told.

## Motion
Appear: 150 ms opacity fade; disappear: 150 ms fade after the 3 s `Reconnected.` state. Reduced motion: appears and disappears at once, dots static. Tab hidden: the dot pulse pauses (`animation-play-state`), the retry logic is Kunal's.

## States and edge cases
- Offline: not shown (offline banner instead). Coming back online while still failing: this banner appears on the next failed refresh, not instantly.
- Refresh succeeds while the `Still trying` line is up: straight to `Reconnected.`.
- Two tabs: each tab shows its own; the cross-tab refresh lock (Arjun 3) means they clear together.
- Sign-out forced by the absolute 7-day ceiling: not this banner; the existing sign-in redirect with the sessionStorage description restore (Arjun 6).
- Focus: never takes focus; the polite live region announces each text change once.

## Acceptance
1. Appears only after the second consecutive failed refresh; never on the first; never while offline.
2. Text swaps at 30 s without a height change at 360 and 1280.
3. Clears within 3 s of a successful refresh with the `Reconnected.` line, announced once.
4. No modal, no sign-out, no focus move; the editor caret is unchanged; saves queued during the state land after it clears.
5. Reduced motion: no fade, static dots. Contrast of the warn pair printed by the reviewer from hex.
