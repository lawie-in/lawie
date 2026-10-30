/**
 * T-674 AC3 / Ajay's ruling R4: no internal court id is ever shown on screen.
 *
 * `Document.courtName` keeps its meaning (the classic form and the brief path
 * store the picker's court id there, and other code reads it as an id). The API
 * sends a separate `courtLabel` built here:
 *
 * - a known courtId           -> `<Court name>, <Place>` (the place only when the
 *                                name does not already carry it: T-160, city once)
 * - a typed court name        -> returned exactly as typed
 * - an unknown id-shaped value -> '' (the UI shows its dash, never the id)
 * - empty                     -> ''
 */
import { Court } from '../models/Court.model';

/** The shape of a picker id: lower-case snake_case with at least one underscore. */
const COURT_ID_SHAPE = /^[a-z0-9]+(_[a-z0-9]+)+$/;

export interface CourtLabelSource {
  name?: string | null;
  city?: string | null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True when `name` already contains `place` as whole words (case-insensitive). */
function nameCarriesPlace(name: string, place: string): boolean {
  const words = place.trim().split(/\s+/).map(escapeRegExp).join('\\s+');
  if (words === '') return true;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${words}($|[^\\p{L}\\p{N}])`, 'iu').test(name);
}

/** Whether a stored value looks like an internal court id rather than a typed name. */
export function looksLikeCourtId(value: string): boolean {
  return COURT_ID_SHAPE.test(value.trim());
}

/**
 * The on-screen label for a stored court value. `court` is the Court row for
 * that value when one was found; pass nothing when the lookup found none.
 */
export function courtLabelFor(
  courtIdOrText: string | null | undefined,
  court?: CourtLabelSource | null,
): string {
  const stored = String(courtIdOrText ?? '').trim();
  if (court) {
    const name = String(court.name ?? '').trim();
    const city = String(court.city ?? '').trim();
    if (name !== '') {
      return city === '' || nameCarriesPlace(name, city) ? name : `${name}, ${city}`;
    }
    // A row with no name is not a label; fall through to the stored value rules.
  }
  if (stored === '') return '';
  if (looksLikeCourtId(stored)) return '';
  return stored;
}

/**
 * Labels for many stored values with ONE Court query (no per-document lookups).
 * Returns a map from each stored value (as given) to its label. A failed lookup
 * is logged by name only and degrades to the no-row rules (ids become '').
 */
export async function resolveCourtLabels(
  values: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const stored = values.map((v) => String(v ?? '').trim());
  const ids = [...new Set(stored.filter((v) => v !== ''))];
  const byId = new Map<string, CourtLabelSource>();
  if (ids.length > 0) {
    try {
      const rows = await Court.find({ courtId: { $in: ids } })
        .select('courtId name city')
        .maxTimeMS(5000)
        .lean();
      for (const row of rows) byId.set(row.courtId, { name: row.name, city: row.city });
    } catch (err) {
      console.error(
        '[drafting] Court labels: lookup failed:',
        err instanceof Error ? err.name : 'UnknownError',
      );
    }
  }
  const labels = new Map<string, string>();
  values.forEach((raw, i) => {
    const key = String(raw ?? '');
    if (!labels.has(key)) labels.set(key, courtLabelFor(stored[i], byId.get(stored[i])));
  });
  return labels;
}

/**
 * T-674 AC3 (R4): the title the screen gets. A classic document's stored title
 * is `<pack> — <court_name>`, and court_name is the picker's court id. When the
 * stored courtName is id-shaped and the title ends with ` — <that id>` (or
 * ` - <that id>`, trailing spaces allowed), the suffix becomes ` — <label>`, or
 * is dropped when there is no label. Any other title is returned unchanged.
 * Pure: the stored title is not changed.
 */
export function displayTitle(
  title: string | null | undefined,
  courtName: string | null | undefined,
  courtLabel: string | null | undefined,
): string {
  const t = String(title ?? '');
  const id = String(courtName ?? '').trim();
  if (id === '' || !looksLikeCourtId(id)) return t;
  const m = new RegExp(`\\s+[—-]\\s+${escapeRegExp(id)}\\s*$`).exec(t);
  if (!m) return t;
  const head = t.slice(0, m.index);
  const label = String(courtLabel ?? '').trim();
  return label === '' ? head : `${head} — ${label}`;
}

/** The label for a single stored value (one Court query at most). */
export async function resolveCourtLabel(value: string | null | undefined): Promise<string> {
  const labels = await resolveCourtLabels([value]);
  return labels.get(String(value ?? '')) ?? '';
}
