// T-601: the Reading Desk landing's configuration in one place: static asset paths (the server
// checks their presence, page.tsx), the sample list, the hero script timing and every visual value
// that has no DESIGN.md token yet (Rajesh, 26 Oct: no new tokens; DESIGN.md wins over the canvas).
// Change a value here and every section follows. No env reads, no fetch.

// ── Static assets (presence decides the section; Rajesh ruling 4) ───────────────────────────────

/** Paths under apps/web/public. `href` is the URL, `file` the path relative to public/. */
export const DEMO_VIDEO_ASSETS = {
  /** MP4, H.264/AAC, at most 3 MB (Arjun). */
  video: { file: 'demo/demo.mp4', href: '/demo/demo.mp4' },
  /** Sidecar written by whoever drops the MP4 (Arjun): `{ hasAudio, durationS, poster }`. */
  sidecar: { file: 'demo/demo.json' },
  captionsEn: { file: 'demo/demo.en.vtt', href: '/demo/demo.en.vtt' },
  /** Optional: without it the chip and the note drop Hindi (AJ, M-LP-15-10 condition). */
  captionsHi: { file: 'demo/demo.hi.vtt', href: '/demo/demo.hi.vtt' },
} as const;

/** The poster named by the sidecar lives in the same folder (public/demo/). */
export const DEMO_DIR = 'demo';

export interface DemoSidecar {
  hasAudio: boolean;
  /** Positive seconds, or null: no duration chip. */
  durationS: number | null;
  /** Poster file name inside public/demo/ (JPEG). */
  poster: string;
}

/**
 * Validates the parsed demo.json. Any wrong shape returns null, so the section does not render
 * (fail closed). The poster must be a plain .jpg/.jpeg file name (no folders).
 */
export function parseDemoSidecar(raw: unknown): DemoSidecar | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.hasAudio !== 'boolean') return null;
  if (typeof r.durationS !== 'number' || !Number.isFinite(r.durationS)) return null;
  if (typeof r.poster !== 'string' || !/^[\w.-]+\.jpe?g$/i.test(r.poster)) return null;
  if (r.poster.startsWith('.')) return null;
  return {
    hasAudio: r.hasAudio,
    durationS: r.durationS > 0 ? r.durationS : null,
    poster: r.poster,
  };
}

export interface SampleEntry {
  /** The template id (catalogue key). The title is the catalogue's display name for it. */
  templateId: string;
  /** Catalogue category id, for the eyebrow (M-LP-15-15a..c reuse the M-LP-14 names). */
  categoryId: string;
  /** Key into SAMPLE_SUMMARIES in landing-copy.ts. */
  summary: 'bail' | 'notice' | 'maintenance';
  /** Fallback title when the catalogue does not list the template. */
  fallbackTitle: string;
  /** File under public/ and its URL. */
  file: string;
  href: string;
  /** Page count, from the PDF (Vishal, T-602). null hides the meta line. */
  pages: number | null;
  /** Language of the PDF ('en' | 'hi'); the label comes from the signed language toggle copy. */
  language: 'en' | 'hi';
}

const sample = (
  templateId: string,
  categoryId: string,
  summary: SampleEntry['summary'],
  fallbackTitle: string,
): SampleEntry => ({
  templateId,
  categoryId,
  summary,
  fallbackTitle,
  file: `samples/${templateId}.pdf`,
  href: `/samples/${templateId}.pdf`,
  pages: null,
  language: 'en',
});

/**
 * The regular bail sample (M-LP-09a). NOT in the default list: it joins only when T-245a is
 * confirmed merged (Arjun, 26 Oct). Kept so the data shape is ready for the third folio.
 */
export const BAIL_SAMPLE: SampleEntry = sample(
  'bail_regular',
  'criminal_bail_custody',
  'bail',
  'Regular Bail Application',
);

/**
 * The samples the landing ships with, in desk order (Arjun, 26 Oct): the breach-of-contract notice
 * and the maintenance petition. Each shows only when its PDF exists under public/samples/.
 */
export const SAMPLE_ENTRIES: readonly SampleEntry[] = [
  sample(
    'legal_notice_breach_of_contract',
    'notices_replies',
    'notice',
    'Legal Notice — Breach of Contract',
  ),
  sample(
    'maintenance_bnss_144',
    'family_matrimonial',
    'maintenance',
    'Maintenance Application (s.144 BNSS)',
  ),
];

// ── Hero script (spec §2) ────────────────────────────────────────────────────────────────────

export const HERO_SCRIPT = {
  /** Pen-writing duration, once, when the folio is half in view. */
  writeMs: 2600,
  /** One state update per tick (not per frame). */
  tickMs: 40,
  /** IntersectionObserver threshold for the start. */
  threshold: 0.5,
  /** Draft progress (T-539 pct) where the script holds (Rajesh, 26 Oct: the frozen state). */
  pctTo: 54,
  /** Ink level = 100 - pct x 0.92 (DESIGN.md Inkwell: a finished draft leaves about 8%). */
  inkPerPct: 0.92,
  /** Lamp follow range in px, from 1280 with a fine pointer only. */
  lampRange: 24,
} as const;

/** The lamp follows only here (spec §2: from 1280 with a fine pointer). */
export const LAMP_FOLLOW_QUERY = '(pointer: fine) and (min-width: 1280px)';

// ── Visual values with no token (Rajesh ruling 7: DESIGN.md wins; listed in the T-601 report) ──

export const LANDING_STYLE = {
  /** Rajesh (26 Oct): every section on --bg-wall (Control Line is 3.24:1 on day Wall, 2.88 on Wood). */
  deepGround: 'bg-nl-wall',
  /** Section padding: 48 below 720, 64 from 720, 96 from 1280 (Rajesh, 26 Oct). Full literals. */
  section:
    'px-nl-4 py-nl-12 min-[720px]:px-nl-6 min-[720px]:py-nl-16 min-[1280px]:px-nl-12 min-[1280px]:py-24',
  /** h1: 34/40 on phones, 48/52 from 900, 54/60 from 1280 (Tiro). */
  h1: 'font-nl-display font-normal text-[34px] leading-[40px] min-[900px]:text-[48px] min-[900px]:leading-[52px] min-[1280px]:text-[54px] min-[1280px]:leading-[60px]',
  /** h2: 28/34 on phones, 32/38 from 720 (nl-h1 size), 36/44 from 1280 (Tiro). */
  h2: 'font-nl-display font-normal text-[28px] leading-[34px] min-[720px]:text-[32px] min-[720px]:leading-[38px] min-[1280px]:text-[36px] min-[1280px]:leading-[44px]',
  /** Folio paper: the app's Card surface in both themes (Rajesh 7; not #fbf8f0 at night). */
  paper: 'bg-nl-card',
  /** Card, folio, drawer, panel and desk radii: 4px (Rajesh 7; canvas had 6/8/12). */
  radius: 'rounded-nl-md',
  /** The brass pull on a drawer (spec radius 3): 2px. */
  pullRadius: 'rounded-nl-sm',
  /** One Shadow: the hero folio only, and none on phones (spec: no blur above 24px there). */
  heroShadow: 'min-[900px]:shadow-nl-card',
  /** SAMPLE watermark: --ox at 18% (Rajesh 7), text and border. */
  watermark:
    'text-[color:color-mix(in_srgb,var(--ox)_18%,transparent)] border-[color:color-mix(in_srgb,var(--ox)_18%,transparent)]',
  /** Lamp pool: the --lamp token (spec named --amber at 16%; no such token in globals.css). */
  lamp: 'bg-[radial-gradient(closest-side,var(--lamp),transparent)]',
  /** The desk's lamp from the top (static). */
  deskLamp: 'bg-[radial-gradient(ellipse_at_top,var(--lamp),transparent_70%)]',
} as const;
