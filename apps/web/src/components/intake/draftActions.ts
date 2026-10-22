/**
 * T-521: the draft-ready actions that reach the documents service, with the
 * same fetch and auth pattern as the editor page (`app/dashboard/documents/[id]`).
 * No API change: PATCH /api/documents/:id takes `{ status: 'finalised' }` today.
 */
import { getAccessToken } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Opening the editor with this hash focuses its export buttons. Export is not
 * rebuilt on the ready view: the editor's export (save first, blanks warning,
 * server PDF with the client fallback, DOCX) runs as it is.
 */
export const EXPORT_HASH = '#export';

/** Marks the document finalised. Resolves when the service has it; throws otherwise. */
export async function finaliseDocument(docId: string): Promise<void> {
  const token = getAccessToken();
  if (!token) throw new Error('not signed in');
  const res = await fetch(`${API_URL}/api/documents/${docId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status: 'finalised' }),
  });
  if (!res.ok) throw new Error('finalise failed');
}
