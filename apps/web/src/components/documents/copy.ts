/**
 * T-521: copy for the documents list and the templates library. Kept out of the
 * App Router page files, which may export only Next's page fields.
 */

/** Signed: copy row 459 (empty documents list); row 455 (generic failure, load error). */
export const DOCUMENTS_COPY = {
  emptyHeading: 'No documents yet',
  emptyBody: 'Your drafts will appear here.',
  emptyAction: 'Start a draft',
  loadFailed: 'Something did not work. Try again.',
} as const;

/** Signed: copy row 455 (generic failure) for the templates load error, with `Retry`. */
export const TEMPLATES_LOAD_FAILED = 'Something did not work. Try again.';
