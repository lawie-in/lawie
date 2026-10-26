# T-622: Document choice shows no pre-selected card when the server marks the pair unranked

| Field  | Value |
| ------ | ----- |
| Phase  | 4 — Release (legal condition on T-610; UI) |
| Owner  | a lead (web). Server field ships in T-610 (Shashank) |
| Mode   | Small fix (web only); Rajesh gate (one line) |
| Status | To do. Raised 26 Oct 2026 from Ajay's T610-F2a ruling (f0985461). Priya |
| Source | Ajay T610-F2a: interim accepted on condition this merges before the next prod cut after T-610 |

## Problem
When the matcher fails twice and both bail phrase sets match, T-610 offers two cards (bail_regular, bail_anticipatory). DocumentChoiceStep always pre-selects the first card, which nudges the lawyer towards one bail type the system could not rank.

## Acceptance criteria
1. When the match response carries `unranked: true`, DocumentChoiceStep shows the cards with none selected, and Continue stays disabled until the user picks one.
2. Without `unranked` (or `false`), behaviour is unchanged (first card pre-selected as today).
3. Visual treatment and any helper line follow Rajesh's one-line spec; copy, if any, is Ajay-signed.
4. Tests: unranked renders no selection, Continue disabled until a pick; ranked path unchanged.
5. Release gate: merges into develop_staging before the next prod cut that carries T-610 (Ajay condition). Add to release-checklist-main.md.

## Out of scope
The matcher and the server field (`unranked: true` is added on the server in T-610 by Shashank).

## Gates
- Design: Rajesh one line (pending).
- Legal: Ajay T610-F2a (f0985461); sign any new copy.

## Design (Rajesh, 26 Oct 2026)
- Unselected: every card in optionCard's rest state (Control Line border, no brass, radios unchecked); nothing visually "recommended". No new helper line at rest: the existing sub "Your description could fit more than one. Pick the closest." stays byte-identical.
- Continue: `aria-disabled` (not the `disabled` attribute; stays focusable), dimmed as ui/Button does.
- On Continue with nothing picked: Rust Body Small under the card group, `role="alert"`: "Pick a document to continue." / HI "आगे बढ़ने के लिए एक दस्तावेज़ चुनिए।" (NEW: Ajay signs). Clears when a card is picked; focus moves to the first radio.
