# Rate-Output Micro-UI — Design Spec
**Owner:** Rajesh (Design) | **Date:** 2026-05-06 | **Ticket:** SCRUM-59
**Target file:** `apps/web/src/components/draft/RateOutputCard.tsx`
**Consumed by:** Vishal (Dev) | **Filed under:** Notion 02 Product & GTM

---

## 1. Design rationale

The advocate has just finished generating a bail application — their attention is on the draft, not on us. This component therefore lives as a **single-line horizontal pill** anchored to the bottom of the draft view, full-width on mobile, max-width 720px on desktop. It uses a soft neutral background (slate-50 / dark border slate-200) so it reads as "ambient UI," not a modal. The thumbs are the primary affordance — large 40px tap targets, no label noise. The textarea is **collapsed by default** and only expands after a thumb is picked, so the advocate sees one decision at a time. The unlock reward is shown as a quiet gold badge ("+1 draft") on the right — present enough to motivate, small enough to not nag. We deliberately chose **gold #F59E0B only on the reward badge** (consistent with upgrade CTAs elsewhere) and kept the submit button in brand sky-600 so the advocate's eye still lands on the action, not the incentive. Skip is a tertiary text link, never a button — it must feel like an option, not a peer to Submit.

---

## 2. Visual mock — self-contained HTML

```html
<!-- =========================================================
     RateOutputCard — all states stacked for review
     Tailwind only. No JS. Vishal wires React state + fetch.
     Container assumes mobile-first; max-w-3xl on >=640px.
     ========================================================= -->
<div class="space-y-8 p-6 bg-white">

  <!-- ─── STATE 1 — DEFAULT (no thumb picked, textarea hidden) ─── -->
  <section>
    <p class="text-xs uppercase tracking-wider text-slate-500 mb-2">State 1 — Default</p>
    <div class="rounded-lg border border-slate-200 bg-slate-50 p-4 sm:p-5 max-w-3xl">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div class="flex items-center gap-3">
          <span class="text-sm text-slate-700">Was this draft useful?</span>
          <div class="flex items-center gap-2">
            <!-- HOVER: bg-slate-100, scale-105 transition-transform duration-150 -->
            <!-- FOCUS: outline-2 outline-sky-600 outline-offset-2 -->
            <button class="h-10 w-10 rounded-md border border-slate-200 bg-white text-lg hover:bg-slate-100 hover:border-slate-300 transition" aria-label="Thumbs up">👍</button>
            <button class="h-10 w-10 rounded-md border border-slate-200 bg-white text-lg hover:bg-slate-100 hover:border-slate-300 transition" aria-label="Thumbs down">👎</button>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <span class="inline-flex items-center rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 border border-amber-200">+1 draft on rating</span>
          <button class="text-[13px] text-slate-500 hover:text-slate-700 underline-offset-2 hover:underline">Skip</button>
        </div>
      </div>
    </div>
  </section>

  <!-- ─── STATE 2 — SELECTED (thumb picked, textarea expanded) ─── -->
  <section>
    <p class="text-xs uppercase tracking-wider text-slate-500 mb-2">State 2 — Selected (thumbs up picked)</p>
    <div class="rounded-lg border border-slate-200 bg-slate-50 p-4 sm:p-5 max-w-3xl">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-3">
          <span class="text-sm text-slate-700">Was this draft useful?</span>
          <div class="flex items-center gap-2">
            <!-- Selected: ring-2 ring-sky-600 bg-sky-50 -->
            <button class="h-10 w-10 rounded-md border border-sky-600 bg-sky-50 ring-2 ring-sky-600 text-lg" aria-label="Thumbs up selected" aria-pressed="true">👍</button>
            <button class="h-10 w-10 rounded-md border border-slate-200 bg-white text-lg hover:bg-slate-100 transition" aria-label="Thumbs down">👎</button>
          </div>
        </div>
        <span class="inline-flex items-center rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 border border-amber-200">+1 draft on submit</span>
      </div>

      <label class="block text-[13px] text-slate-600 mb-1.5">One line of feedback (optional)</label>
      <textarea
        rows="2"
        maxlength="200"
        placeholder="What worked, or what we could do better"
        class="w-full rounded-md border border-slate-200 bg-white p-2.5 text-sm text-slate-800 placeholder-slate-400 focus:border-sky-600 focus:ring-1 focus:ring-sky-600 outline-none resize-none"
      >Citations were on point — saved me 20 minutes.</textarea>
      <div class="flex items-center justify-between mt-2">
        <span class="text-[11px] text-slate-500">52 / 200</span>
        <div class="flex items-center gap-3">
          <button class="text-[13px] text-slate-500 hover:text-slate-700">Skip</button>
          <button class="rounded-md bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium px-4 py-2 transition">Submit rating</button>
        </div>
      </div>
    </div>
  </section>

  <!-- ─── STATE 3 — SUCCESS (post-submit) ─── -->
  <section>
    <p class="text-xs uppercase tracking-wider text-slate-500 mb-2">State 3 — Success (credit awarded)</p>
    <div class="rounded-lg border border-emerald-200 bg-emerald-50 p-4 sm:p-5 max-w-3xl">
      <div class="flex items-center gap-3">
        <span class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white text-sm font-bold">✓</span>
        <div class="flex-1">
          <p class="text-sm font-medium text-emerald-900">+1 draft unlocked</p>
          <p class="text-[13px] text-emerald-800/80">You have 7 drafts left this month. Thanks for the feedback.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- ─── STATE 3b — SUCCESS but earned-credit cap reached ─── -->
  <section>
    <p class="text-xs uppercase tracking-wider text-slate-500 mb-2">State 3b — Submitted at +5/5 cap (no new credit)</p>
    <div class="rounded-lg border border-slate-200 bg-slate-50 p-4 sm:p-5 max-w-3xl">
      <div class="flex items-center gap-3">
        <span class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-300 text-slate-700 text-sm font-bold">✓</span>
        <div class="flex-1">
          <p class="text-sm font-medium text-slate-800">Thanks for rating</p>
          <p class="text-[13px] text-slate-600">+5 / 5 earned credits already used this month. Resets on the 1st.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- ─── STATE 4 — SKIPPED (greyed inline link) ─── -->
  <section>
    <p class="text-xs uppercase tracking-wider text-slate-500 mb-2">State 4 — Skipped</p>
    <div class="rounded-lg border border-slate-200 bg-white p-3 sm:p-3.5 max-w-3xl">
      <div class="flex items-center justify-between">
        <p class="text-[13px] text-slate-500">Skipped — no credit awarded.</p>
        <button class="text-[13px] text-sky-600 hover:text-sky-700 hover:underline underline-offset-2">Rate this draft later? You'd unlock 1 extra draft.</button>
      </div>
    </div>
  </section>

</div>
```

**Hover/focus rules (in CSS comments above):**
- Thumbs unselected → hover `bg-slate-100`, border darkens to `slate-300`, subtle 150ms scale 1.05.
- Thumbs selected → `ring-2 ring-sky-600 bg-sky-50`, no hover transform (stays calm).
- Submit button → hover `bg-sky-700`, focus `ring-2 ring-offset-2 ring-sky-600`.
- All interactive elements: focus-visible outline 2px sky-600, offset 2px (a11y).

---

## 3. Copy (final strings)

| Slot | String |
|---|---|
| Prompt label | Was this draft useful? |
| Reward pill (default) | +1 draft on rating |
| Reward pill (selected) | +1 draft on submit |
| Textarea label | One line of feedback (optional) |
| Textarea placeholder | What worked, or what we could do better |
| Char counter | `{count} / 200` |
| Skip link | Skip |
| Submit button | Submit rating |
| Success title (credit awarded) | +1 draft unlocked |
| Success subtitle | You have {N} drafts left this month. Thanks for the feedback. |
| Success title (cap hit) | Thanks for rating |
| Success subtitle (cap hit) | +5 / 5 earned credits already used this month. Resets on the 1st. |
| Skipped state line | Skipped — no credit awarded. |
| Re-prompt link | Rate this draft later? You'd unlock 1 extra draft. |
| ARIA — thumbs up | Thumbs up — this draft was useful |
| ARIA — thumbs down | Thumbs down — this draft needs work |

Tone: Indian English, sentence case. No "Awesome!", no "Boom!". Apostrophes straight.

---

## 4. Edge cases for Vishal

| # | Case | Behaviour |
|---|---|---|
| 1 | User has already earned 5/5 credits this month, submits another rating | Accept rating, store feedback, but render **State 3b** (no new credit). API should return `{ creditAwarded: false, reason: 'monthly_cap' }`. |
| 2 | User clicks Skip | Replace card with **State 4** (greyed line + re-prompt link). Re-prompt link re-mounts the default card on click. |
| 3 | User submits, then immediately edits the draft | Set session flag `rated:<draftId>` in component state (or sessionStorage). Do not re-prompt for the same draftId in the same session, even if a new "generate" is triggered. |
| 4 | Mobile < 640px | Card becomes full-width (no max-w cap inside content area). Top row stacks: prompt + thumbs on row 1, reward pill on row 2. Footer row stacks: char counter on top, Skip + Submit side-by-side below (Submit full-width). |
| 5 | Paid user | Component does not render. Gate at parent: `if (user.tier === 'free') <RateOutputCard />`. |
| 6 | Thumbs-down without text | Allow submit; still award credit. Do **not** force feedback. |
| 7 | Network failure on submit | Keep selected state, show inline error below textarea: `Couldn't save — tap submit again.` (text-rose-600, 13px). Do not award credit until 200 OK. |
| 8 | Character overflow attempt | `maxlength="200"` blocks at the input layer. Counter turns `text-rose-600` at 190+. |
| 9 | Keyboard only | Tab order: 👍 → 👎 → textarea → Skip → Submit. Enter on a thumb selects it. Esc collapses textarea back to default state. |
| 10 | Repeated thumb click | Toggling thumb after picking should switch selection (not deselect to none) — keeps the flow forward. |

---

## 5. Hand-off note for Vishal

**Component path:** `apps/web/src/components/draft/RateOutputCard.tsx` (create new `draft/` folder under `components/`).

**Mount point:** Bottom of the draft viewer — in `apps/web/src/app/dashboard/documents/[id]/page.tsx`, after the `<DocumentEditor />` render, gated by `user.tier === 'free'` and `!session.hasRatedDraft(draftId)`.

**Props to expose:**
```ts
type RateOutputCardProps = {
  draftId: string;
  onSubmit: (payload: { rating: 'up' | 'down'; feedback?: string }) => Promise<{ creditAwarded: boolean; remainingDrafts: number; capReason?: 'monthly_cap' }>;
  onSkip?: () => void;
  earnedThisMonth: number; // 0..5
  remainingDrafts: number;
};
```

**State machine:** `idle → selected → submitting → success | error` and `idle → skipped → idle (on re-prompt click)`.

**Tokens used (Tailwind, all already in shadcn/ui defaults):**
- bg: `slate-50`, `white`, `emerald-50`, `amber-50`, `sky-50`
- border: `slate-200`, `sky-600`, `emerald-200`, `amber-200`
- text: `slate-500/600/700/800`, `sky-600/700`, `emerald-800/900`, `amber-700`, `rose-600`
- radius: `rounded-lg` (card), `rounded-md` (buttons, textarea, pill)
- font sizes: `text-sm` (16px body via Tailwind base), `text-[13px]` (label), `text-[11px]` (hint/counter)

**Existing primitives to reuse:** `Button` and `Textarea` from shadcn/ui — replace the raw `<button>` / `<textarea>` in the mock with those once styling is verified at parity. Badge for the reward pill is overkill; the inline span is fine.

**A11y requirements:** thumbs are `<button>` with `aria-pressed`, label association on textarea, focus-visible rings everywhere, success state announces via `role="status"` `aria-live="polite"`.

**Telemetry:** fire `rate_output.shown`, `rate_output.thumb_picked`, `rate_output.submitted`, `rate_output.skipped`, `rate_output.cap_hit` — Priya owns the schema, ping her if unsure.

Ready for next task.
