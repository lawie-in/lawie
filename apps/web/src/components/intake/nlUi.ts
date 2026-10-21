/**
 * T-521: Night Library class names for the one flow, the documents list, the
 * editor and the templates library. Only valid under an `nl` ancestor
 * (NightScope). The T-005 classes in `./ui` stay as they are: screens outside
 * T-521 still use them.
 */

/** Page width: one column at 360, the folio width from 640. */
export const page = 'mx-auto w-full max-w-[720px] px-0';

export const h1 = 'nl-h1 text-nl-text';

export const sub = 'nl-body text-nl-soft mt-nl-2';

/** The folio: the sheet each step sits on (spec 04). */
export const folio =
  'border-nl-line border-t-nl-brass bg-nl-card text-nl-text shadow-nl-card border p-nl-6 min-[900px]:p-nl-10';

/** A plain card (spec 3). */
export const card = 'border-nl-line bg-nl-card text-nl-text border p-nl-4';

export const label = 'nl-body-sm text-nl-soft font-medium';

export const small = 'nl-body-sm text-nl-muted';

export const eyebrow = 'nl-label text-nl-brass-dark';

/** A text link in brass, 44px tall for touch. */
export const linkButton =
  'nl-focus nl-body-sm text-nl-brass-dark inline-flex min-h-[44px] items-center gap-1 underline underline-offset-4 disabled:opacity-50';

/** Boxed input (spec 3, review details). */
export const input =
  'nl-focus nl-body border-[color:var(--line-control)] bg-nl-card text-nl-text placeholder:text-nl-muted rounded-nl-md block min-h-[44px] w-full border px-nl-3 py-nl-2 focus:border-nl-brass focus:outline-none';

/** Button row: stacked at 360 (primary on top), one row from 640. */
export const actions =
  'gap-nl-3 flex flex-col-reverse min-[640px]:flex-row min-[640px]:items-center min-[640px]:justify-between';

/** A select-like option card (radio, document type). */
export const optionCard = (on: boolean) =>
  `nl-focus bg-nl-card text-nl-text flex min-h-[56px] cursor-pointer items-start gap-nl-3 border p-nl-4 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--brass)] ${
    on ? 'border-nl-brass' : 'border-[color:var(--line-control)]'
  }`;

/** A filter chip that toggles (category filters). */
export const toggleChip = (on: boolean) =>
  `nl-focus rounded-nl-pill nl-body-sm inline-flex min-h-[44px] items-center border px-nl-4 ${
    on
      ? 'border-nl-brass bg-nl-brass-light text-nl-brass-dark font-medium'
      : 'border-nl-line bg-nl-card text-nl-soft'
  }`;
