'use client';

/**
 * B3 Choose the court (T-126). Three pickers fed by the courts list: state,
 * court type, court. The court is never free text and is never filled in for
 * the advocate (ADR-021, rule 3).
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import type { BriefCourt } from './briefTypes';
import ConsumerLevelGroup, {
  CONSUMER_COURT_LABEL,
  CONSUMER_COURT_TYPE,
  CONSUMER_NO_MATCH,
  CONSUMER_TEMPLATE_ID,
  LIVE_CLEARED,
  LIVE_COURT_SHOWN,
  LIVE_NATIONAL_SHOWN,
  LIVE_STATE_SHOWN,
  NCDRC_COURT_ID,
  NCDRC_COURT_TYPE,
  NCDRC_OPTION_LABEL,
  NCDRC_STATE_ID,
  type ConsumerLevel,
  type LevelChangeHow,
} from './ConsumerLevelGroup';
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

/**
 * T-425 (Ajay 69c8cbe): the bail packs, by exact id. For these the three lists are asked
 * for with `template=<id>`, so the server leaves out courts where the pack does not lie.
 * Must match BAIL_TEMPLATE_IDS in apps/drafting/src/routes/courts.routes.ts.
 */
const BAIL_TEMPLATE_IDS: ReadonlySet<string> = new Set([
  'bail_regular',
  'bail_anticipatory',
  'bail_before_magistrate',
  'default_bail',
  'interim_bail',
  'bail_cancellation',
]);

/** T-425: added to a saved choice the scoped list no longer offers. */
export const NOT_OFFERED_SUFFIX = ' (not offered for this document)';

/** T-425: names for a saved court type the scoped /types list leaves out. */
const SAVED_TYPE_NAMES: Record<string, string> = {
  cjm: 'Chief Judicial Magistrate',
  jmfc: 'Judicial Magistrate First Class',
  district_court: 'District Court',
  civil_court: 'Civil Court (Senior Division)',
  consumer_commission: 'Consumer Commission',
  supreme_court: 'Supreme Court',
  tribunal: 'Tribunal',
};

interface SavedCourt {
  id: string;
  name: string;
  state: string;
}

/** T-411: the level a stored court belongs to, when it can be told from the court alone. */
function initialLevel(court: BriefCourt): ConsumerLevel | null {
  if (
    court.court === NCDRC_COURT_ID ||
    (court.state === NCDRC_STATE_ID && court.court_type === NCDRC_COURT_TYPE)
  ) {
    return 'national';
  }
  return null;
}

export default function CourtPicker({
  court,
  onChange,
  missing,
  templateId,
}: {
  court: BriefCourt;
  onChange: (court: BriefCourt) => void;
  /** True when Confirm is off because the court is not chosen yet. */
  missing: boolean;
  /** T-411: the brief's template. consumer_complaint switches on the Commission level group. */
  templateId?: string;
}) {
  const consumer = templateId === CONSUMER_TEMPLATE_ID;
  const bail = templateId !== undefined && BAIL_TEMPLATE_IDS.has(templateId);
  const [states, setStates] = useState<Option[]>([]);
  const [statesLoaded, setStatesLoaded] = useState(false);
  const [types, setTypes] = useState<Option[]>([]);
  const [typesLoaded, setTypesLoaded] = useState(false);
  const [courts, setCourts] = useState<Option[]>([]);
  const [courtsLoaded, setCourtsLoaded] = useState(false);
  const [saved, setSaved] = useState<SavedCourt | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState('');
  const [level, setLevel] = useState<ConsumerLevel | null>(() =>
    consumer ? initialLevel(court) : null,
  );
  const [live, setLive] = useState('');
  const focusNext = useRef<string | null>(null);

  // T-411: after a level change, move focus to the first control that appeared.
  useEffect(() => {
    if (!focusNext.current) return;
    const el = document.getElementById(focusNext.current);
    focusNext.current = null;
    el?.focus();
  });

  // T-411: a brief reloaded with a District or State Commission already chosen. The
  // stored court does not name its level, so ask the server which list it is on.
  useEffect(() => {
    if (!consumer || level || !court.court || !court.state) return;
    if (court.court_type !== CONSUMER_COURT_TYPE) return;
    let off = false;
    getList(
      `/api/courts?template=${CONSUMER_TEMPLATE_ID}&level=state&state=${encodeURIComponent(court.state)}`,
      (d) => ((d.courts as Array<{ courtId: string }>) ?? []).map((c) => c.courtId),
    )
      .then((ids) => !off && setLevel(ids.includes(court.court as string) ? 'state' : 'district'))
      .catch(() => !off && setFailed(true));
    return () => {
      off = true;
    };
  }, [consumer, level, court.court, court.state, court.court_type, attempt]);

  const scope = consumer
    ? level
      ? `template=${CONSUMER_TEMPLATE_ID}&level=${level}`
      : ''
    : bail
      ? `template=${encodeURIComponent(templateId as string)}`
      : '';

  useEffect(() => {
    setFailed(false);
    if (consumer && (!level || level === 'national')) {
      setStates([]);
      return;
    }
    let off = false;
    setStatesLoaded(false);
    getList(`/api/courts/states${scope ? `?${scope}` : ''}`, (d) =>
      ((d.states as Array<{ id: string; name: string }>) ?? []).map((s) => ({
        id: s.id,
        name: s.name,
      })),
    )
      .then((list) => {
        if (off) return;
        setStates(list);
        setStatesLoaded(true);
      })
      .catch(() => !off && setFailed(true));
    return () => {
      off = true;
    };
  }, [attempt, consumer, level, scope]);

  useEffect(() => {
    if (consumer || !court.state) {
      setTypes([]);
      setTypesLoaded(false);
      return;
    }
    let off = false;
    setTypesLoaded(false);
    const typesPath = `/api/courts/types?state=${encodeURIComponent(court.state)}`;
    getList(scope ? `${typesPath}&${scope}` : typesPath, (d) =>
      ((d.types as Array<{ id: string; label: string }>) ?? []).map((t) => ({
        id: t.id,
        name: t.label,
      })),
    )
      .then((list) => {
        if (off) return;
        setTypes(list);
        setTypesLoaded(true);
      })
      .catch(() => !off && setFailed(true));
    return () => {
      off = true;
    };
  }, [court.state, attempt, consumer, scope]);

  useEffect(() => {
    let path: string;
    if (consumer) {
      if (!level || (level !== 'national' && !court.state)) {
        setCourts([]);
        setCourtsLoaded(false);
        return;
      }
      path =
        level === 'national'
          ? `/api/courts?${scope}`
          : `/api/courts?${scope}&state=${encodeURIComponent(court.state ?? '')}`;
    } else {
      if (!court.state || !court.court_type) {
        setCourts([]);
        setCourtsLoaded(false);
        return;
      }
      path = `/api/courts?state=${encodeURIComponent(court.state)}&type=${encodeURIComponent(court.court_type)}`;
      if (scope) path = `${path}&${scope}`;
    }
    let off = false;
    setCourtsLoaded(false);
    getList(path, (d) =>
      ((d.courts as Array<{ courtId: string; name: string }>) ?? []).map((c) => ({
        id: c.courtId,
        name: c.name,
      })),
    )
      .then((list) => {
        if (off) return;
        setCourts(list);
        setCourtsLoaded(true);
      })
      .catch(() => !off && setFailed(true));
    return () => {
      off = true;
    };
  }, [court.state, court.court_type, attempt, consumer, level, scope]);

  // T-425 (AC3): a bail brief saved with a court this pack no longer offers keeps it. Ask
  // for that court by id only to name it in the list; the choice itself is never changed.
  const courtNotOffered =
    bail && !!court.court && courtsLoaded && !courts.some((c) => c.id === court.court);
  useEffect(() => {
    if (!courtNotOffered || !court.court || saved?.id === court.court) return;
    const id = court.court;
    let off = false;
    apiFetch(`/api/courts/${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (off || !res.ok) return;
        const data = (await res.json()) as { court?: { name?: string; state?: string } };
        if (off || !data.court?.name) return;
        setSaved({ id, name: data.court.name, state: data.court.state ?? '' });
      })
      // Only the label is lost: the saved id still shows.
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [courtNotOffered, court.court, saved?.id]);

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
  const savedName = saved && saved.id === court.court ? saved : null;
  const keptState =
    bail && court.state && statesLoaded && !states.some((s) => s.id === court.state)
      ? { id: court.state, name: `${savedName?.state || court.state}${NOT_OFFERED_SUFFIX}` }
      : null;
  const keptType =
    bail && court.court_type && typesLoaded && !types.some((t) => t.id === court.court_type)
      ? {
          id: court.court_type,
          name: `${SAVED_TYPE_NAMES[court.court_type] ?? court.court_type}${NOT_OFFERED_SUFFIX}`,
        }
      : null;
  const keptCourt =
    courtNotOffered && court.court
      ? { id: court.court, name: `${savedName?.name ?? court.court}${NOT_OFFERED_SUFFIX}` }
      : null;
  const gap = missing ? '!border-brand-error !border-2' : '';

  if (consumer) {
    const national = level === 'national';
    const onLevel = (next: ConsumerLevel, how: LevelChangeHow) => {
      if (next === level) return;
      const hadChoice = national
        ? court.court !== null
        : court.state !== null || court.court !== null;
      setLevel(next);
      setFilter('');
      // Changing the level clears the state and court below it. court_type (and the
      // state, for NCDRC) are still set so the confirm gate sees a full court once picked.
      onChange(
        next === 'national'
          ? { state: NCDRC_STATE_ID, court_type: NCDRC_COURT_TYPE, court: null }
          : { state: null, court_type: CONSUMER_COURT_TYPE, court: null },
      );
      const shown = next === 'national' ? LIVE_NATIONAL_SHOWN : LIVE_STATE_SHOWN;
      setLive(hadChoice ? `${LIVE_CLEARED} ${shown}` : shown);
      // Arrow keys keep focus on the chip (radio pattern); click, Space or Enter moves it on.
      if (how === 'activate') {
        focusNext.current = next === 'national' ? 'brief-court-court' : 'brief-court-state';
      }
    };
    const optionName = (c: Option) => (c.id === NCDRC_COURT_ID ? NCDRC_OPTION_LABEL : c.name);
    const chosen = court.court ? courts.find((c) => c.id === court.court) : undefined;
    const courtDisabled = !level || (!national && !court.state);

    return (
      <div>
        <ConsumerLevelGroup id="brief-court-level" value={level} onChange={onLevel} />
        <p aria-live="polite" role="status" className="sr-only">
          {live}
        </p>
        {level && (
          <div className={`mt-4 grid grid-cols-1 gap-4 ${national ? '' : 'sm:grid-cols-2'}`}>
            {!national && (
              <div>
                <label htmlFor="brief-court-state" className={label}>
                  State
                </label>
                <select
                  id="brief-court-state"
                  value={court.state ?? ''}
                  onChange={(e) => {
                    onChange({
                      state: e.target.value || null,
                      court_type: CONSUMER_COURT_TYPE,
                      court: null,
                    });
                    if (e.target.value) setLive(LIVE_COURT_SHOWN);
                  }}
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
            )}
            <div>
              <label htmlFor="brief-court-court" className={label}>
                {CONSUMER_COURT_LABEL}
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
                disabled={courtDisabled}
                onChange={(e) =>
                  onChange(
                    national
                      ? {
                          state: NCDRC_STATE_ID,
                          court_type: NCDRC_COURT_TYPE,
                          court: e.target.value || null,
                        }
                      : {
                          state: court.state,
                          court_type: CONSUMER_COURT_TYPE,
                          court: e.target.value || null,
                        },
                  )
                }
                className={`${input} mt-1.5 disabled:bg-slate-100 ${
                  missing && !courtDisabled && !court.court ? gap : ''
                }`}
              >
                <option value="">Choose</option>
                {shown.map((c) => (
                  <option key={c.id} value={c.id}>
                    {optionName(c)}
                  </option>
                ))}
              </select>
              {chosen && <p className={`${small} mt-1.5`}>{optionName(chosen)}</p>}
            </div>
          </div>
        )}
        {missing && (
          <p className="mt-2">
            <span className={tagError}>Needed to continue</span>
          </p>
        )}
        {!national && court.state && courtsLoaded && courts.length === 0 && (
          <p className={`${small} mt-2`}>{CONSUMER_NO_MATCH}</p>
        )}
      </div>
    );
  }

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
            {keptState && <option value={keptState.id}>{keptState.name}</option>}
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
            {keptType && <option value={keptType.id}>{keptType.name}</option>}
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
            {keptCourt && <option value={keptCourt.id}>{keptCourt.name}</option>}
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
      {court.court_type && !keptType && courts.length === 0 && states.length > 0 && (
        <p className={`${small} mt-2`}>No court of this type is listed for this state yet.</p>
      )}
    </div>
  );
}
