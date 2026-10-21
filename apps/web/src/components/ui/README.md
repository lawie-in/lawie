# Night Library foundation (T-511 part A)

Base components, tokens and theme plumbing for the Night Library redesign. **Mounted on `/dashboard` (T-520) and, since T-525, `/dashboard/settings` and `/dashboard/payment`**; the allowlist is `components/shell/nightLibraryPaths.ts` (`NIGHT_LIBRARY_PATHS`). `DashboardTopBar` and `DashboardCommandBar` are imported by path, not from the shell index. All other screens (`/dashboard/new`, documents, templates) keep the legacy shell until T-521 adds them to the allowlist.

Related code: `components/ui/` (this folder), `components/shell/`, `lib/cn.ts`, `app/globals.css`, `tailwind.config.js`, `app/layout.tsx`.

## Opting in

Tokens are CSS variables scoped to the opt-in class `.nl`, not `:root`. A subtree uses them only if an ancestor has `nl`.

- `nl` on an element: tokens apply to it and its descendants (including portalled content that carries the class).
- `nl-root`: page ground (background and text), in `@layer components`, so Tailwind utilities on the same element still win (`nl-root bg-nl-card`).
- Daylight is the default. `html[data-theme='night'] .nl` switches to Night. There is never a `dark` class.
- Tailwind keys are namespaced `nl-*` (`bg-nl-card`, `text-nl-text`, `border-nl-line`, `p-nl-4`, `rounded-nl-md`, `font-nl-body`, `font-nl-display`). Brass fill is never small text; use `text-nl-brass-dark` for brass text.
- Token names (`--bg-wall`, `--bg-wood`, `--bg-card`, `--text`, `--text-soft`, `--muted`, `--line`, `--line-control` (borders of fields and buttons at rest, at least 3:1 on Card and Wall; Daylight on Wood is 2.88:1, known; hover rules are T-531), `--brass`, `--brass-dark`, `--brass-light`, `--brass-mark` (spine bands and seal mark on oxblood only, not text), `--on-brass`, `--ox`, `--ox-hi`, `--ok`, `--err`, `--warn` and `*-light`, `--lamp`, `--space-*`, `--radius-*`, `--hairline`) are defined in `app/globals.css`.
- Class names are merged with `lib/cn.ts` (clsx only, no tailwind-merge).

## Theme

- Mount `ThemeProvider` (`components/shell`) once near the root; read it with `useTheme()`; `ThemeToggle` is the control.
- Preference is stored in localStorage key `lawie-theme` (daylight, night or system; check `components/shell/theme.ts` for exact values). A pre-paint script in `app/layout.tsx` sets `data-theme` (resolved) and `data-theme-pref` (stored) on `<html>` before first paint.
- `ThemeToggle` can show "System" for one frame before its effect runs.

## Components

- `ui/`: Button (and Spinner), Input, Textarea, Chip, InkChip, Card, Skeleton, EmptyState, ErrorState, Inkwell, Seal, ToastProvider and useToast, Banner, Dialog, Lamp, DustMotes. Import from `components/ui`.
- `shell/`: TopBar, LawieMark, CommandBar, ThemeProvider, ThemeToggle.
- CommandBar uses Radix Popover (no cmdk). It binds Ctrl/Cmd+K by default via its `hotkey` prop, and `components/sections/SectionFinderPanel.tsx` binds the same shortcut. With `hotkeyExclusive` (used on `/dashboard`) CommandBar takes the key in a window capture-phase listener: every Ctrl/Meta+K variant is prevented and stopped so the section finder never sees it, and a plain press focuses the bar (IME composition is ignored). Set `hotkeySuspended` while a modal is open (the top-up modal does); the key then reaches the section finder again. The section finder is a dialog below 768px (inert page, scroll lock) and a rail only at 1280px and up; it ignores Escape and Ctrl/Cmd+K/F11 while another dialog is open. The top-up modal is a Radix Dialog (focus trap, bottom sheet at 640px and below, hides while Razorpay Checkout is open). Pass `hotkey={false}` only to turn the shortcut off entirely.

## Motion gates

Hooks in `ui/motion.ts`: `usePrefersReducedMotion`, `useMotionAllowed`, `useFinePointerDesktop`, `useMobileCap`, `usePageVisible`, `useAmbientMotionAllowed`, `loopPlayState`. Ambient effects (Lamp, DustMotes) run only on a fine-pointer desktop, with reduced motion off and the tab visible. Looping animations should use `loopPlayState` so they pause on hidden tabs.

## Copy is passed in as props

Components do not invent user-facing wording. Where signed-off copy does not exist yet, it is a **required prop**: Toast close label, Banner dismiss label, Seal text. Do not add default strings to get past the type error; get the copy signed and pass it. Existing copy constants (`STATE_COPY`, `THEME_TOGGLE_COPY`, `COMMAND_BAR_COPY`, `BANNER_TONE`) are exported from their modules.

## Fonts

Mukta and Tiro Devanagari Hindi, loaded with `next/font` in `app/layout.tsx` with preload off.

## Known follow-ups for part B

- Legacy shadcn and marketing variables (`--muted`, `--text`, `--warn`) collide with the Night tokens, so tokens stay on `.nl`. Move them to `:root` once the legacy colours are deleted.
- Turn font preload on when redesigned pages ship.
- TopBar hides ThemeToggle below 720px, so the mobile menu must include it.
- Do not put `aria-busy` on an ancestor of a status region (it can suppress the "Still working" announcement); T-524 removed it from `States` and `Card`.
- Button spinner does not pause on a hidden tab.
- `yarn.lock` is stale relative to the workspaces; a plain `yarn add` rewrites about 1800 lines. This change hand-trimmed it to +21 lines (integrity hash checked against the registry). Do the same, or fix the lockfile separately.
- Real-Chromium checks at 360/768/1280 were done for T-525 screens. No Safari, Firefox or touch-device check yet.
