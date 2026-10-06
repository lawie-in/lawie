'use client';

/**
 * B3 Choose the court (T-126). Three pickers fed by the courts list: state,
 * court type, court. The court is never free text and is never filled in for
 * the advocate (ADR-021, rule 3).
 */
import { useCallback, useEffect, useState } from 'react';

import type { BriefCourt } from './briefTypes';
import { input, label, linkButton, small, tagError } from './ui';

import { apiFetch } from '@/lib/apiFetch';

interface Option {
  id: string;
  name: string;
}

async function getList<T>(
  path: string,
  read: (data: Record<string, unknown>) => T[],
): Promise<T[]> {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error('courts');
  return read((await res.json()) as Record<string, unknown>);
}

/** Above this many courts the picker gets a box to narrow the list. */
const SEARCH_FROM = 8;

export default function CourtPicker({
  court,
  onChange,
  missing,
}: {
  court: BriefCourt;
  onChange: (court: BriefCourt) => void;
  /** True when Confirm is off because the court is not chosen yet. */
  missing: boolean;
}) {
  const [states, setStates] = useState<Option[]>([]);
  const [types, setTypes] = useState<Option[]>([]);
  const [courts, setCourts] = useState<Option[]>([]);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    let off = false;
    setFailed(false);
    getList('/api/courts/states', (d) =>
      ((d.states as Array<{ id: string; name: string }>) ?? []).map((s) => ({
        id: s.id,
        name: s.name,
      })),
    )
      .then((list) => !off && setStates(list))
      .catch(() => !off && setFailed(true));
    return () => {
      off = true;
    };
  }, [attempt]);

  useEffect(() => {
    if (!court.state) {
      setTypes([]);
      return;
    }
    let off = false;
    getList(`/api/courts/types?state=${encodeURIComponent(court.state)}`, (d) =>
      ((d.types as Array<{ id: string; label: string }>) ?? []).map((t) => ({
        id: t.id,
        name: t.label,
      })),
    )
      .then((list) => !off && setTypes(list))
      .catch(() => !off && setFailed(true));
    return () => {
      off = true;
    };
  }, [court.state, attempt]);

  useEffect(() => {
    if (!court.state || !court.court_type) {
      setCourts([]);
      return;
    }
    let off = false;
    getList(
      `/api/courts?state=${encodeURIComponent(court.state)}&type=${encodeURIComponent(court.court_type)}`,
      (d) =>
        ((d.courts as Array<{ courtId: string; name: string }>) ?? []).map((c) => ({
          id: c.courtId,
          name: c.name,
        })),
    )
      .then((list) => !off && setCourts(list))
      .catch(() => !off && setFailed(true));
    return () => {
      off = true;
    };
  }, [court.state, court.court_type, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (failed) {
    return (
      <div role="alert" className="bg-brand-error-light text-brand-error rounded-lg p-3 text-sm">
        We could not load the courts. Try again.{' '}
        <button type="button" onClick={retry} className={linkButton}>
          Retry
        </button>
      </div>
    );
  }

  const q = filter.trim().toLowerCase();
  const shown =
    q === ''
      ? courts
      : courts.filter((c) => c.id === court.court || c.name.toLowerCase().includes(q));
  const gap = missing ? '!border-brand-error !border-2' : '';

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_1.4fr]">
        <div>
          <label htmlFor="brief-court-state" className={label}>
            State
          </label>
          <select
            id="brief-court-state"
            value={court.state ?? ''}
            onChange={(e) =>
              onChange({ state: e.target.value || null, court_type: null, court: null })
            }
            className={`${input} mt-1.5 ${missing && !court.state ? gap : ''}`}
          >
            <option value="">Choose</option>
            {states.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="brief-court-type" className={label}>
            Court type
          </label>
          <select
            id="brief-court-type"
            value={court.court_type ?? ''}
            disabled={!court.state}
            onChange={(e) =>
              onChange({ state: court.state, court_type: e.target.value || null, court: null })
            }
            className={`${input} mt-1.5 disabled:bg-slate-100 ${
              missing && court.state && !court.court_type ? gap : ''
            }`}
          >
            <option value="">Choose</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="brief-court-court" className={label}>
            Court
          </label>
          {courts.length > SEARCH_FROM && (
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Type to narrow the list"
              aria-label="Narrow the list of courts"
              className={`${input} mt-1.5`}
            />
          )}
          <select
            id="brief-court-court"
            value={court.court ?? ''}
            disabled={!court.court_type}
            onChange={(e) =>
              onChange({
                state: court.state,
                court_type: court.court_type,
                court: e.target.value || null,
              })
            }
            className={`${input} mt-1.5 disabled:bg-slate-100 ${
              missing && court.court_type && !court.court ? gap : ''
            }`}
          >
            <option value="">Choose</option>
            {shown.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {missing && (
        <p className="mt-2">
          <span className={tagError}>Needed to continue</span>
        </p>
      )}
      {court.court_type && courts.length === 0 && states.length > 0 && (
        <p className={`${small} mt-2`}>No court of this type is listed for this state yet.</p>
      )}
    </div>
  );
}
