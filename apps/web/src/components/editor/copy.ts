/**
 * T-521: copy for the editor page. Kept out of the App Router page file, which
 * may export only Next's page fields.
 */

/** Signed: copy rows 457 (export failed, `Retry`) and 455 (generic failure, load error). */
export const EDITOR_COPY = {
  exportFailed: 'Could not export. Try again.',
  loadFailed: 'Something did not work. Try again.',
  retry: 'Retry',
} as const;
