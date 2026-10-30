/**
 * T-705 — a document's current text as plain text, for the Drafter on a
 * revision. `finalContent` is the editor's HTML (TipTap) once the user has
 * edited; `generatedContent` is the pipeline's plain text. Plain text is
 * returned as it is; HTML has its block ends turned into line breaks, its
 * tags removed and the common entities decoded. Never logged.
 */
const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
};

export function draftAsText(content: string): string {
  if (!content.trimStart().startsWith('<')) return content;
  const text = content
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h[1-6]|li|div|blockquote|tr)>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(nbsp|amp|lt|gt|quot|#39|apos);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d{1,7});/g, (m, n: string) =>
      Number(n) <= 0x10ffff ? String.fromCodePoint(Number(n)) : m,
    );
  return text
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
