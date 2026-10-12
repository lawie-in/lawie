import { Router, Request, Response } from 'express';

import {
  getOffenceRow,
  readSectionsCharged,
  resolveBnsKey,
  type ChargedCode,
  type ChargedSection,
} from '../services/bns-offence-resolver';

/**
 * T-290 — what the server will read from a sections_charged value (Arjun, 12 Oct
 * 2026, "the read endpoint for the preview" plus its Addendum).
 *
 * POST /sections/read — POST, not GET, because the input can carry a FIR number
 * or a date, and URLs end up in access logs and Sentry.
 *
 * Body, exactly one of:
 *   { values: string[] }  read like a `source: bns_mapping` field: each entry on
 *                         its own with defaultCode 'BNS' (an explicit code wins).
 *                         Max 30 x 100.
 *   { text: string }      read like a plain string field (no default; a bare
 *                         number stays bare). Max 500.
 * Anything else: 400 { error: 'invalid_input' }, never echoing the input.
 *
 * Response (Addendum 2, grouped per entry so the web can put a "Read as" line
 * under each chip): 200 { entries: [{ read: [{ code, number, title }] }] }.
 *   - values: entries[i] is values[i] read on its own, de-duplicated within that
 *     entry only. Same length and order as values. The draft's real read of the
 *     field is these lists de-duplicated across entries (readChargedField).
 *   - text: exactly one entry.
 * title is the signed T-277 table title for BNS (a sub-section shows its
 * parent's), else null.
 *
 * Read-only: no DB, no AI, nothing stored, and nothing from the body is logged.
 */

const MAX_VALUES = 30;
const MAX_VALUE_LENGTH = 100;
const MAX_TEXT_LENGTH = 500;

interface ReadItem {
  code: ChargedCode | null;
  number: string;
  title: string | null;
}

type ReadInput = { kind: 'values'; values: string[] } | { kind: 'text'; text: string };

function parseBody(body: unknown): ReadInput | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const keys = Object.keys(body);
  if (keys.length !== 1) return null;
  const b = body as { values?: unknown; text?: unknown };

  if (keys[0] === 'values') {
    const { values } = b;
    if (!Array.isArray(values) || values.length > MAX_VALUES) return null;
    if (!values.every((v) => typeof v === 'string' && v.length <= MAX_VALUE_LENGTH)) return null;
    return { kind: 'values', values: values as string[] };
  }
  if (keys[0] === 'text') {
    const { text } = b;
    if (typeof text !== 'string' || text.length > MAX_TEXT_LENGTH) return null;
    return { kind: 'text', text };
  }
  return null;
}

/** BNS only: the signed table title, via the row key or its nearest parent row. */
function bnsTitle(number: string): string | null {
  const hit = resolveBnsKey(number);
  if (!hit) return null;
  return getOffenceRow(hit.key)?.title ?? null;
}

function toItem(s: ChargedSection): ReadItem {
  return {
    code: s.code,
    number: s.number,
    title: s.code === 'BNS' ? bnsTitle(s.number) : null,
  };
}

const router = Router();

router.post('/read', (req: Request, res: Response): void => {
  const input = parseBody(req.body);
  if (!input) {
    res.status(400).json({ error: 'invalid_input' });
    return;
  }

  const perEntry: ChargedSection[][] =
    input.kind === 'values'
      ? input.values.map((v) => readSectionsCharged(v, 'BNS'))
      : [readSectionsCharged(input.text)];

  res.json({ entries: perEntry.map((sections) => ({ read: sections.map(toItem) })) });
});

export default router;
