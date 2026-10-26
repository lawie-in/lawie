/**
 * T-600: the landing page's template catalogue (Arjun, 26 Oct 2026, T-584
 * spec §11 part 1), written by `export:catalogue` to the committed
 * apps/web/src/data/landing-catalogue.json. The web renders that file only.
 *
 * "Shown" = every TEMPLATE_CATALOGUE key, grouped in CATALOGUE_CATEGORIES
 * order, except doc-type aliases, NON_TEMPLATE_PRICES ids and any id a
 * template switch hides at its default (hiddenAtDefaults). A category with no
 * shown template is left out. Within a category, templates keep catalogue key
 * order (the order of the batch files), so the output never depends on file
 * system order.
 *
 * Names follow the app's precedence (template-engine `listTemplateConfigs`):
 * an active docs/templates/<id>.json `display_name`, then the rule file's
 * `displayName`, then `title`, then the humanised id. Read here with `fs` on
 * purpose: template-engine and template-promoter load env through the logger.
 *
 * This module must not import env, the logger, mongoose or any service, so
 * the exporter runs with no env and no database (T-600 AC5).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { isDeepStrictEqual } from 'util';

import {
  CATALOGUE_CATEGORIES,
  DOC_TYPE_ALIASES,
  NON_TEMPLATE_PRICES,
  TEMPLATE_CATALOGUE,
} from '../config/catalogue';
import { hiddenAtDefaults } from '../config/catalogue/template-switches';

export interface LandingTemplate {
  id: string;
  name: string;
}

export interface LandingCategory {
  id: string;
  name: string;
  order: number;
  templates: LandingTemplate[];
}

/** What the exporter compares: everything in the file except `generatedAt`. */
export interface LandingCatalogue {
  categories: LandingCategory[];
  total: number;
}

export interface LandingCatalogueFile extends LandingCatalogue {
  generatedAt: string;
}

export interface LandingCatalogueDirs {
  /** Rule files (`<id>.json`). Default: config/document-rules. */
  rulesDir?: string;
  /** Signed overrides (`<id>.json`). Default: the repo's docs/templates. */
  overridesDir?: string;
}

/** Same dirs the app reads: template-promoter DOC_RULES_DIR and template-engine TEMPLATES_DIR. */
export const DEFAULT_RULES_DIR = join(__dirname, '..', 'config', 'document-rules');
export const DEFAULT_OVERRIDES_DIR = join(__dirname, '..', '..', '..', '..', 'docs', 'templates');

const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Copy of template-promoter.ts `humaniseId` (private there; that module loads env). */
export function humaniseId(id: string): string {
  return id
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/**
 * The parsed JSON object at `dir/<id>.json`, or null when there is no such
 * file. An unreadable or invalid file throws, naming the id only, so a broken
 * file stops the export instead of silently changing a name.
 */
function readJsonFile(dir: string, id: string, what: string): Record<string, unknown> | null {
  let raw: string;
  try {
    raw = readFileSync(join(dir, `${id}.json`), 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
    throw new Error(`Landing catalogue: ${what} ${id} is unreadable`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Landing catalogue: ${what} ${id} is not valid JSON`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Landing catalogue: ${what} ${id} is not a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

/**
 * A template's display name, in the app's precedence. A docs/templates
 * override that is not `metadata.status === 'active'` is ignored for the name
 * (Arjun's default 4); it never hides a template.
 */
export function templateName(id: string, dirs: LandingCatalogueDirs = {}): string {
  const override = readJsonFile(dirs.overridesDir ?? DEFAULT_OVERRIDES_DIR, id, 'override');
  if (override) {
    const metadata = override.metadata as Record<string, unknown> | undefined;
    if (metadata?.status === 'active' && nonEmpty(override.display_name)) {
      return override.display_name;
    }
  }
  const rule = readJsonFile(dirs.rulesDir ?? DEFAULT_RULES_DIR, id, 'rule file');
  if (rule && nonEmpty(rule.displayName)) return rule.displayName;
  if (rule && nonEmpty(rule.title)) return rule.title;
  return humaniseId(id);
}

/** The landing catalogue as it stands now (no `generatedAt`). Deterministic. */
export function buildLandingCatalogue(dirs: LandingCatalogueDirs = {}): LandingCatalogue {
  const hidden = hiddenAtDefaults();
  const shown = Object.keys(TEMPLATE_CATALOGUE).filter(
    (id) => !hasOwn(DOC_TYPE_ALIASES, id) && !hasOwn(NON_TEMPLATE_PRICES, id) && !hidden.has(id),
  );

  const categories: LandingCategory[] = [];
  for (const c of CATALOGUE_CATEGORIES) {
    const templates = shown
      .filter((id) => TEMPLATE_CATALOGUE[id].category === c.id)
      .map((id) => ({ id, name: templateName(id, dirs) }));
    if (templates.length === 0) continue;
    categories.push({ id: c.id, name: c.name, order: c.order, templates });
  }

  const total = categories.reduce((n, c) => n + c.templates.length, 0);
  return { categories, total };
}

/** The same data with keys in the file's fixed order, so output never depends on input key order. */
function canonical(catalogue: LandingCatalogue): LandingCatalogue {
  return {
    categories: catalogue.categories.map((c) => ({
      id: c.id,
      name: c.name,
      order: c.order,
      templates: c.templates.map((t) => ({ id: t.id, name: t.name })),
    })),
    total: catalogue.total,
  };
}

/** `{ categories, total }` from a previous file's text, or null when it cannot be read as one. */
function previousFile(previous: string | null | undefined): Partial<LandingCatalogueFile> | null {
  if (!previous) return null;
  try {
    const parsed: unknown = JSON.parse(previous);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Partial<LandingCatalogueFile>;
  } catch {
    return null;
  }
}

/**
 * The file text for `catalogue`: keys `generatedAt`, `categories`, `total` in
 * that order, 2-space JSON, trailing newline. When `previous` (the current
 * file's text) holds deep-equal `{ categories, total }` and a string
 * `generatedAt`, that timestamp is kept, so a re-run with no change writes
 * the same bytes. Otherwise `generatedAt` is `now().toISOString()`.
 * `generatedAt` is never part of the comparison.
 */
export function serialiseLandingCatalogue(
  catalogue: LandingCatalogue,
  previous?: string | null,
  now: () => Date = () => new Date(),
): string {
  const next = canonical(catalogue);
  const prev = previousFile(previous);
  const unchanged =
    prev !== null &&
    typeof prev.generatedAt === 'string' &&
    isDeepStrictEqual({ categories: prev.categories, total: prev.total }, next);
  const generatedAt =
    unchanged && typeof prev?.generatedAt === 'string' ? prev.generatedAt : now().toISOString();
  const file: LandingCatalogueFile = { generatedAt, ...next };
  return `${JSON.stringify(file, null, 2)}\n`;
}
