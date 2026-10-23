'use client';

/**
 * T-577: the paragraph-count quote for the brief (FINAL API CONTRACT, T-577 ticket).
 *
 * `POST /api/documents/paragraph-quote` `{kind, values?, ledger_id?, paragraphs?, language?}`
 * returns `{asks:false, ink}` or `{asks:true, ink, min, max, default, paragraphs, bands, ceiling}`.
 * No hold, no model call.
 *
 * - Fetched once when a type that asks (`asks_paragraphs`) is on the brief, with no count (the
 *   server answers with the pack's default), then again on each committed change: blur, a step
 *   press or an arrow key. Never on a keystroke.
 * - A stale answer (an older request) is dropped.
 * - `asks:false`: no stepper; the brief uses the quote's `ink`.
 * - A failure (400/404/500, network, unreadable body) keeps the stepper as it is and makes the
 *   cost unknown, so nothing charges (T-388). A 503 is the signed row 455 with Retry.
 * - The shown quote is the only figure generate may send (`expected_ink`), and only while the
 *   stepper's value is the quoted count.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { apiFetch } from '@/lib/apiFetch';

export interface ParagraphBand {
  from: number;
  to: number;
  ink: number;
}

export interface ParagraphQuote {
  ink: number;
  min: number;
  max: number;
  default: number;
  /** The count this quote is for. */
  paragraphs: number;
  /** Clipped to min..max by the server. */
  bands: ParagraphBand[];
  /** True: the count and the cost are ceilings ("up to"). */
  ceiling: boolean;
}

export type ParsedParagraphQuote =
  | { asks: false; ink: number }
  | { asks: true; quote: ParagraphQuote };

/**
 * `idle`: nothing asked yet. `loading`: a quote is on its way. `ready`: the quote is current.
 * `failed`: 400/404/500 or unreadable (cost unknown). `try_again`: a 503 (row 455 + Retry).
 */
export type ParagraphQuoteStatus = 'idle' | 'loading' | 'ready' | 'failed' | 'try_again';

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0;
const isInk = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** Reads the quote body. Null when it is not the contract's shape (treated as a failure). */
export function parseParagraphQuote(body: unknown): ParsedParagraphQuote | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (!isInk(b.ink)) return null;
  if (b.asks === false) return { asks: false, ink: b.ink };
  if (b.asks !== true) return null;
  if (!isCount(b.min) || !isCount(b.max) || !isCount(b.default) || !isCount(b.paragraphs)) {
    return null;
  }
  if (b.min > b.max || typeof b.ceiling !== 'boolean' || !Array.isArray(b.bands)) return null;
  const bands: ParagraphBand[] = [];
  for (const raw of b.bands as unknown[]) {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (!isCount(r.from) || !isCount(r.to) || !isInk(r.ink) || r.from > r.to) return null;
    bands.push({ from: r.from, to: r.to, ink: r.ink });
  }
  return {
    asks: true,
    quote: {
      ink: b.ink,
      min: b.min,
      max: b.max,
      default: b.default,
      paragraphs: b.paragraphs,
      bands,
      ceiling: b.ceiling,
    },
  };
}

export function clampParagraphs(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** The M4 range line under the stepper: from a typed value clamped on blur, or the server's 400. */
export interface ParagraphRangeLine {
  min: number;
  /** True for the server's 400: the input also gets the error ring. */
  server: boolean;
}

/** What the brief's stepper is given. */
export interface ParagraphControl {
  quote: ParagraphQuote | null;
  /** The count on the stepper. */
  value: number | null;
  status: ParagraphQuoteStatus;
  rangeLine: ParagraphRangeLine | null;
  /** A 409 `price_changed` showed a new cost (AJ-577-M8 line). */
  priceChanged: boolean;
  /** A committed change: a step press, an arrow key, or blur (`typed`). */
  onCommit: (n: number, typed: boolean) => void;
  /** Asks for the quote again (Retry, "Check the cost again"). */
  onRetry: () => void;
}

/** What generate sends with a paragraph count, or null when it must not start. */
export interface ParagraphSnapshot {
  paragraphs: number;
  expectedInk: number;
}

export interface ParagraphQuoteRequest {
  kind: string;
  values?: unknown;
  ledger_id?: string;
}

export function useParagraphQuote({
  enabled,
  kind,
  ledgerId,
  readRequest,
}: {
  /** The type on the brief asks (`asks_paragraphs`). False: no request, nothing changes. */
  enabled: boolean;
  /** The type on the brief; a change asks for a fresh quote. */
  kind: string | undefined;
  /** The ledger on the brief; a change asks for a fresh quote. */
  ledgerId: string | undefined;
  /** The body as it is at the moment of the request (values and ledger read then). */
  readRequest: () => ParagraphQuoteRequest | null;
}) {
  const [asks, setAsks] = useState<boolean | null>(null);
  const [plainInk, setPlainInk] = useState<number | undefined>(undefined);
  const [quote, setQuote] = useState<ParagraphQuote | null>(null);
  const [value, setValue] = useState<number | null>(null);
  const [status, setStatus] = useState<ParagraphQuoteStatus>('idle');
  const [rangeLine, setRangeLine] = useState<ParagraphRangeLine | null>(null);
  const [priceChanged, setPriceChanged] = useState(false);

  // Readable by generate without waiting for a render.
  const state = useRef<{
    asks: boolean | null;
    quote: ParagraphQuote | null;
    value: number | null;
    status: ParagraphQuoteStatus;
  }>({ asks: null, quote: null, value: null, status: 'idle' });
  const seq = useRef(0);
  const readRef = useRef(readRequest);
  readRef.current = readRequest;

  const put = useCallback((next: Partial<typeof state.current>) => {
    state.current = { ...state.current, ...next };
    if ('asks' in next) setAsks(next.asks ?? null);
    if ('quote' in next) setQuote(next.quote ?? null);
    if ('value' in next) setValue(next.value ?? null);
    if ('status' in next) setStatus(next.status ?? 'idle');
  }, []);

  const request = useCallback(
    async (paragraphs: number | undefined, keepPriceChanged = false) => {
      const body = readRef.current();
      if (!body) return;
      const mine = ++seq.current;
      put({ status: 'loading' });
      let next: ParsedParagraphQuote | null = null;
      let tryAgain = false;
      try {
        const res = await apiFetch('/api/documents/paragraph-quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: body.kind,
            ...(body.values !== undefined ? { values: body.values } : {}),
            ...(body.ledger_id ? { ledger_id: body.ledger_id } : {}),
            ...(paragraphs !== undefined ? { paragraphs } : {}),
            language: 'en',
          }),
        });
        if (res.ok) next = parseParagraphQuote(await res.json().catch(() => null));
        else tryAgain = res.status === 503;
      } catch {
        next = null;
      }
      if (mine !== seq.current) return; // A newer request is on its way; its answer counts.
      if (!next) {
        // The stepper stays as it is; the cost is unknown, so nothing charges.
        put({ status: tryAgain ? 'try_again' : 'failed' });
        return;
      }
      if (!keepPriceChanged) setPriceChanged(false);
      if (!next.asks) {
        setPlainInk(next.ink);
        put({ asks: false, quote: null, value: null, status: 'ready' });
        return;
      }
      put({ asks: true, quote: next.quote, value: next.quote.paragraphs, status: 'ready' });
    },
    [put],
  );

  // A new type or ledger on the brief: start again from the server's default.
  useEffect(() => {
    seq.current += 1;
    setPlainInk(undefined);
    setRangeLine(null);
    setPriceChanged(false);
    put({ asks: null, quote: null, value: null, status: 'idle' });
    if (enabled && kind) void request(undefined);
  }, [enabled, kind, ledgerId, put, request]);

  const onCommit = useCallback(
    (n: number, typed: boolean) => {
      const q = state.current.quote;
      if (!q) return;
      const next = clampParagraphs(n, q.min, q.max);
      // AJ-577-M4: a typed value outside the range is clamped, and the range line says why.
      setRangeLine(typed && next !== n ? { min: q.min, server: false } : null);
      put({ value: next });
      if (next === q.paragraphs && state.current.status === 'ready') return;
      void request(next);
    },
    [put, request],
  );

  const onRetry = useCallback(() => {
    void request(state.current.quote ? (state.current.value ?? undefined) : undefined);
  }, [request]);

  /**
   * T-577: a 409 `price_changed` before any hold. The cost shows the 409's `ink`, the stepper keeps
   * its value, and the M8 line shows. Without a usable `ink` the quote is asked for again.
   */
  const applyPriceChanged = useCallback(
    (ink: unknown) => {
      setPriceChanged(true);
      const q = state.current.quote;
      if (q && isInk(ink) && state.current.value === q.paragraphs) {
        put({ quote: { ...q, ink }, status: 'ready' });
        return;
      }
      void request(q ? (state.current.value ?? undefined) : undefined, true);
    },
    [put, request],
  );

  /** T-577: the server's 400 `paragraph_count_out_of_range`: the M4 line from its `min`. */
  const applyRangeError = useCallback(
    (min: unknown) => {
      const q = state.current.quote;
      const floor = isCount(min) ? min : q?.min;
      if (floor === undefined) return;
      setRangeLine({ min: floor, server: true });
      if (q && isCount(min) && min !== q.min && min <= q.max) put({ quote: { ...q, min } });
    },
    [put],
  );

  /** The M8 line clears on the next press. */
  const clearPriceChanged = useCallback(() => setPriceChanged(false), []);

  /**
   * What generate sends, or null when it must not start: no current quote, or the stepper shows a
   * count that has not been quoted. `undefined` when the quote does not ask (send nothing).
   */
  const snapshot = useCallback((): ParagraphSnapshot | null | undefined => {
    const s = state.current;
    if (s.asks === false && s.status === 'ready') return undefined;
    if (s.status !== 'ready' || !s.quote || s.value !== s.quote.paragraphs) return null;
    return { paragraphs: s.quote.paragraphs, expectedInk: s.quote.ink };
  }, []);

  const control: ParagraphControl = {
    quote,
    value,
    status,
    rangeLine,
    priceChanged,
    onCommit,
    onRetry,
  };

  return {
    /** null until the first answer; false: the quote does not ask (no stepper). */
    asks,
    /** The quote's `ink` when it does not ask. */
    plainInk,
    control,
    snapshot,
    applyPriceChanged,
    applyRangeError,
    clearPriceChanged,
  };
}
