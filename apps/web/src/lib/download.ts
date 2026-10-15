/**
 * Browser file downloads from a fetched Blob. Shared by the editor's PDF export, the T-381
 * annexures pack and the T-436 invoice PDFs. Kept apart from components/editor/exportUtils
 * (which re-exports these) so a caller does not pull in the docx / PDF export code.
 */

/**
 * Saves a file the server sent (e.g. the server PDF) under `filename`. The
 * browser download starts only when this is called; nothing is saved before.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

/**
 * The file name from a `Content-Disposition` header (`filename="…"` or
 * `filename=…`), or `fallback` when the header is absent or names no file.
 * Any path part is dropped, so the name cannot point outside the download folder.
 */
export function filenameFromDisposition(header: string | null, fallback: string): string {
  const match = header?.match(/filename\s*=\s*(?:"([^"]*)"|([^;]*))/i);
  const raw = (match?.[1] ?? match?.[2] ?? '').trim();
  const name = raw.split(/[\\/]/).pop()?.trim() ?? '';
  return name || fallback;
}
