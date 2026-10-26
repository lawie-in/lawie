// T-601 tester helpers (not a test file). A fixture catalogue of our own, a reader for the handoff
// docs, and small stubs for IntersectionObserver and tab visibility.
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { act } from 'react';

import type { LandingCatalogue } from '../catalogue-source';

export const REPO_ROOT = path.resolve(__dirname, '../../../../../../../');

/**
 * Reads a handoff doc. The working tree copy wins if it contains `marker`; the T-584 v2 docs
 * reached develop_staging after this branch was cut, so a branch that has not caught up reads the
 * file from origin/develop_staging instead (git show). After the branch is rebased the file read
 * is the only path used.
 */
export function readHandoff(rel: string, marker: string): string {
  const local = path.join(REPO_ROOT, rel);
  if (fs.existsSync(local)) {
    const t = fs.readFileSync(local, 'utf8');
    if (t.includes(marker)) return t;
  }
  for (const ref of ['origin/develop_staging', 'develop_staging']) {
    try {
      const t = execFileSync('git', ['-C', REPO_ROOT, 'show', `${ref}:${rel}`], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      if (t.includes(marker)) return t;
    } catch {
      // try the next ref
    }
  }
  throw new Error(
    `handoff doc ${rel} (with "${marker}") is in neither the tree nor develop_staging`,
  );
}

/** Template ids are real catalogue ids; the counts are ours: 0 (dropped), 1, many. */
export const FIXTURE: LandingCatalogue = {
  generatedAt: '2026-10-26T00:00:00.000Z',
  categories: [
    {
      id: 'criminal_bail_custody',
      name: 'Criminal: bail and custody',
      order: 1,
      templates: [
        { id: 'bail_regular', name: 'Regular Bail Application' },
        { id: 'bail_anticipatory', name: 'Anticipatory Bail Application' },
        { id: 'default_bail', name: 'Default Bail Application' },
      ],
    },
    // Empty category: must never be rendered.
    { id: 'civil_plaints_suits', name: 'Civil: plaints and suits', order: 5, templates: [] },
    {
      id: 'tax',
      name: 'Tax',
      order: 18,
      templates: [{ id: 'tax_one', name: 'Only Tax Template' }],
    },
    {
      id: 'family_matrimonial',
      name: 'Family and matrimonial',
      order: 8,
      templates: [
        { id: 'maintenance_bnss_144', name: 'Maintenance Application (s.144 BNSS)' },
        { id: 'divorce_mutual_consent', name: 'Mutual Consent Divorce' },
      ],
    },
    // A category the signed Hindi map does not know: falls back to the JSON name.
    {
      id: 'brand_new_shelf',
      name: 'Brand New Shelf',
      order: 99,
      templates: [
        { id: 'bn_a', name: 'Brand New A' },
        { id: 'bn_b', name: 'Brand New B' },
      ],
    },
  ],
  // Deliberately not the sum of the templates (8): the footer prints this exact total.
  total: 86,
};

export const SHELVES_IN_FIXTURE = 4;

/** A 19-category catalogue (today's library has 19 shelves). */
export function bigCatalogue(): LandingCatalogue {
  const categories = Array.from({ length: 19 }, (_, i) => ({
    id: `cat_${i + 1}`,
    name: `Category ${i + 1}`,
    order: i + 1,
    templates: Array.from({ length: (i % 4) + 1 }, (_, j) => ({
      id: `cat_${i + 1}_t${j + 1}`,
      name: `Template ${i + 1}.${j + 1}`,
    })),
  }));
  const total = categories.reduce((n, c) => n + c.templates.length, 0);
  return { generatedAt: '2026-10-26T00:00:00.000Z', categories, total };
}

type IOCallback = (entries: Partial<IntersectionObserverEntry>[]) => void;
export interface FakeIO {
  cb: IOCallback;
  target: Element | null;
  disconnected: boolean;
  options?: IntersectionObserverInit;
}

/** Installs a controllable IntersectionObserver; returns the instances and a restore function. */
export function stubIntersectionObserver() {
  const instances: FakeIO[] = [];
  const original = (window as unknown as { IntersectionObserver?: unknown }).IntersectionObserver;
  class FakeObserver {
    rec: FakeIO;
    constructor(cb: IOCallback, options?: IntersectionObserverInit) {
      this.rec = { cb, target: null, disconnected: false, options };
      instances.push(this.rec);
    }
    observe(el: Element) {
      this.rec.target = el;
    }
    unobserve() {}
    disconnect() {
      this.rec.disconnected = true;
    }
    takeRecords() {
      return [];
    }
  }
  Object.defineProperty(window, 'IntersectionObserver', {
    configurable: true,
    writable: true,
    value: FakeObserver,
  });
  return {
    instances,
    /** Reports the (last) live observer's target as intersecting with this ratio. */
    show(ratio = 1, which?: Element) {
      for (const i of instances.filter((x) => !x.disconnected && x.target)) {
        if (which && i.target !== which) continue;
        act(() =>
          i.cb([{ isIntersecting: ratio > 0, intersectionRatio: ratio, target: i.target! }]),
        );
      }
    },
    hide(which?: Element) {
      for (const i of instances.filter((x) => !x.disconnected && x.target)) {
        if (which && i.target !== which) continue;
        act(() => i.cb([{ isIntersecting: false, intersectionRatio: 0, target: i.target! }]));
      }
    },
    restore() {
      Object.defineProperty(window, 'IntersectionObserver', {
        configurable: true,
        writable: true,
        value: original,
      });
    },
  };
}

export function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  act(() => void document.dispatchEvent(new Event('visibilitychange')));
}

export function setConnection(value: unknown) {
  Object.defineProperty(navigator, 'connection', { configurable: true, value });
}

export function clearMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: undefined,
  });
}

export const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
