/**
 * T-521: the draft-ready actions that reach the documents service.
 * T-544: through `apiFetch` (lib/apiFetch), so a 401 after a long generation refreshes the
 * session once and retries; a failed refresh clears the session and goes to /login. No local
 * "not signed in" guard: with no token `apiFetch` sends without a Bearer and handles the 401.
 * No API change: PATCH /api/documents/:id takes `{ status: 'finalised' }` today.
 */
import { apiFetch } from '@/lib/apiFetch';

/**
 * Opening the editor with this hash focuses its export buttons. Export is not
 * rebuilt on the ready view: the editor's export (save first, blanks warning,
 * server PDF with the client fallback, DOCX) runs as it is.
 */
export const EXPORT_HASH = '#export';

/** Marks the document finalised. Resolves when the service has it; throws otherwise. */
export async function finaliseDocument(docId: string): Promise<void> {
  const res = await apiFetch(`/api/documents/${docId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'finalised' }),
  });
  if (!res.ok) throw new Error('finalise failed');
}
