# T-291 — Remove "x" tap target (design)

| Field   | Value |
| ------- | ----- |
| Ticket  | `handoff/tickets/T-291-chip-remove-tap-target.md` |
| Owner   | Rajesh (look). Lead builds (web). Anushka checks at 375 px |
| Where   | `apps/web/src/components/form/DynamicFormRenderer.tsx`: section chips in `MultiSelectSearchField` (l.~426-440) and the file list (l.~618-640) |
| Builds on | `handoff/design/T-290-section-picker-hint.md` (each chip in its own block, "Read as" line under it) |
| Colours | None new. Slate and amber only, as already used in the file |

## 1. Decision: option 3, a bigger visible "x" button

| Option | Verdict | Why |
| ------ | ------- | --- |
| 1. Taller chips / rows | No | A 44 px amber pill around 12 px text looks like a button, not a value. It also breaks T-290's "chip unchanged" rule |
| 2. Smaller target, no overlap | No | Fails AC1 and our 44 px rule exactly where it matters (phones) |
| **3. Bigger visible "x" button** | **Yes** | The tap area is the visible button, so there is no hidden overlap. The chip keeps its look. On a phone the advocate sees exactly where to tap |

Layout change (all widths): the "x" moves **out of the pill** and becomes a real `<button>` sitting just to the right of it. The pill is the value; the button is the action. Today's "x" is an `<svg>` with `onClick`, so keyboard and screen-reader users cannot use it at all. A real button fixes that as well.

## 2. Sizes

| Element | < 640 px (phone) | >= 640 px (`sm:`) |
| ------- | ---------------- | ----------------- |
| Remove button, chip | 44 x 44 (`h-11 w-11`), visible border | 24 x 24 (`sm:h-6 sm:w-6`), no border (looks like today's "x") |
| Remove button, file row | 44 x 44 (`h-11 w-11`), visible border | 24 x 24 (`sm:h-6 sm:w-6`), no border |
| "x" icon | 16 px | 12 px (as today) |
| Chip row height | 44 px (pill stays ~20 px, centred) | 24 px (today ~20 px) |
| File row height | 46 px (44 + 1 px border top/bottom) | 26 px (same as today) |
| Min gap between any two tap targets | 8 px | 4 px |

Why 24 px on desktop: it meets WCAG 2.2 AA 2.5.8 (24 x 24 minimum) for mouse users and keeps desktop as it looks today. See risk R1 for touch tablets.

## 3. Classes

### 3a. Section chip block (inside each T-290 block)

```tsx
<div className="mt-1 space-y-2 sm:space-y-1">            {/* list; T-290 had mt-1 space-y-1 */}
  <div>                                                   {/* one block per value */}
    <div className="flex items-center gap-2 sm:gap-1">   {/* chip row: NEW */}
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
        {item.label}                                      {/* pill unchanged, "x" removed from it */}
      </span>
      <button
        type="button"
        onClick={() => onChange(value.filter((v) => v !== item.id))}
        aria-label={`Remove ${item.label}`}
        className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 sm:h-6 sm:w-6 sm:rounded-full sm:border-0"
      >
        <X size={16} className="sm:h-3 sm:w-3" aria-hidden="true" />
      </button>
    </div>
    {/* T-290 "Read as" line(s), unchanged: mt-0.5 text-xs text-slate-600 break-words */}
  </div>
</div>
```

### 3b. File-list row

| Element | Today | New |
| ------- | ----- | --- |
| `<ul>` | `mt-1 space-y-1` | `mt-2 space-y-2 sm:mt-1 sm:space-y-1` |
| `<li>` | `flex items-center justify-between rounded border border-slate-100 px-2 py-1 text-xs text-slate-600` | `flex items-center justify-between gap-2 rounded border border-slate-100 py-0 pl-2 pr-0 text-xs text-slate-600 sm:pr-1` |
| File name `<span>` | `truncate` | `min-w-0 truncate` (so a long name never pushes the button off the row) |
| `<button>` | `text-slate-400 hover:text-slate-600`, `aria-label="Remove"` | same classes as the chip button in 3a, minus `sm:rounded-full` (use `rounded` to match the row); `aria-label={`Remove ${f.name}`}` |
| Icon | `<X size={12} />` | `<X size={16} className="sm:h-3 sm:w-3" aria-hidden="true" />` |

### 3c. Class rationale

| Class | Why |
| ----- | --- |
| `border border-slate-200` (phone) | Shows the 44 px area as a button. Without a hover state on touch, an unbordered 16 px icon still looks like a 16 px target |
| `text-slate-500` | About 4.8:1 on white, passes AA (also used for the T-290 hint). Today's `text-slate-400` (~2.6:1) fails |
| `sm:border-0 sm:rounded-full` | Desktop looks like today's bare "x" next to the pill |
| `flex-shrink-0` | A long chip label or file name must never squeeze the button below 44 px |
| `gap-2` (phone) | 8 px between the pill and the button, so a tap on the pill edge does not hit "remove" |

## 4. Gaps between targets (no overlap anywhere)

| Between | Phone | Desktop | How |
| ------- | ----- | ------- | --- |
| Chip button and the next chip's button | >= 8 px (22 px+ when a "Read as" line sits between) | >= 4 px | `space-y-2 sm:space-y-1` on the list |
| Last chip button and search input | >= 8 px | 4 px | Change search wrapper `relative mt-1` to `relative mt-2 sm:mt-1` |
| "Choose file" button and first file "x" | 8 px | 4 px | `mt-2 sm:mt-1` on `<ul>` |
| File "x" and next file "x" | 8 px | 4 px | `space-y-2 sm:space-y-1` on `<ul>` |

Rule: the tap area is the visible button box. No negative margins, no `::before` hit-area tricks, no `p-*` that grows the area beyond the box.

## 5. Focus ring

- `focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600`
- Why `amber-600`, not the input's `ring-amber-100`: `amber-100` is about 1.1:1 on white and is invisible (fails WCAG 1.4.11, needs 3:1). `amber-600` (already used in the file as `hover:text-amber-600`) is about 3.2:1 on white. Keyboard focus only (`focus-visible`), so it does not flash on tap.

## 6. aria-label

| Control | aria-label | Examples |
| ------- | ---------- | -------- |
| Chip remove | `Remove {chip label as shown}` | `Remove BNS 303(2)`, `Remove IPC 302`, `Remove 302` |
| File remove | `Remove {file name}` | `Remove FIR copy.pdf` |

- Use the label exactly as the chip shows it (what the user typed or picked), not the "Read as" text: the button removes the entry, not a section reading.
- Icon gets `aria-hidden="true"`; the label is on the button.
- No full stop.

## 7. States

| State | Phone | Desktop |
| ----- | ----- | ------- |
| Default | 44 px square, `border-slate-200`, icon `slate-500` | bare 12 px icon, `slate-500` |
| Hover | `bg-slate-50`, icon `slate-700` | same |
| Focus (keyboard) | 2 px `amber-600` ring | same |
| Pressed | no extra style (removal is instant) | same |
| After remove | block (chip + "Read as") disappears; focus moves to the search input (chips) or "Choose file" button (files) so keyboard users are not dropped to `<body>` | same |

## 8. 375 px check

- Card inner width ~311 px. Chip row = pill + 8 px + 44 px; the pill gets ~259 px. Section labels are short; fits on one line.
- File row: name truncates at ~230 px, KB size stays visible after it if room; button never shrinks.
- Vertical cost vs T-290: +24 px per chip, +20 px per file row. For 3 sections and 2 files, about 110 px more. Acceptable for the gain.

## 9. Risks flagged

| # | Risk | Ask |
| - | ---- | --- |
| R1 | Desktop (>= 640 px) gets 24 px, not 44 px. AC1 says 44 x 44 with no width limit. Touch tablets (768 px, portrait) fall in `sm:` and get 24 px | Priya to accept 24 px at `sm:` (WCAG 2.2 AA 2.5.8 met), or keep 44 px at all widths by dropping the `sm:h-6 sm:w-6 sm:border-0` classes. I recommend accepting: our users are on phones; desktop is mouse |
| R2 | The single-select clear "x" (l.~307, `<X size={14}>` with `onClick`) has the same problem and is not a button | Separate small ticket; out of T-291 scope |
| R3 | Two files with the same name get the same label `Remove FIR.pdf` | Low; leave as is unless Anushka flags it |
| R4 | Moving the "x" out of the pill is a small visible change on desktop | Intended; it is the price of a real, labelled button |
