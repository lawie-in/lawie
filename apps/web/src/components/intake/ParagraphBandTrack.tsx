'use client';

/**
 * T-577: the band marks under the paragraph stepper (Rajesh, T-578 design note section 5).
 *
 * A 4px track from `min` to `max` (never from 1): Brass fill up to the current count, Wood for the
 * rest, Control Line ticks at the band edges inside the range, and each band's Ink centred under
 * its segment ("2 Ink"), Muted 12px tabular; the current band's label is Text. Bands come from the
 * quote (already clipped to min..max by the server); a band wholly outside the range is not drawn.
 * Static, no motion, no tooltip. Decorative for screen readers: the cost line carries the figure.
 */
import type { ParagraphBand } from './useParagraphQuote';

export default function ParagraphBandTrack({
  min,
  max,
  value,
  bands,
}: {
  min: number;
  max: number;
  value: number;
  bands: ParagraphBand[];
}) {
  const span = max - min;
  // Position of a count on the track, 0..100. A one-value range is a full track.
  const at = (n: number) =>
    span <= 0 ? 100 : ((Math.min(max, Math.max(min, n)) - min) / span) * 100;
  const shown = bands
    .filter((b) => b.to >= min && b.from <= max)
    .map((b) => ({ ...b, from: Math.max(min, b.from), to: Math.min(max, b.to) }));
  // A band's segment runs from its first count to the next band's first count (or the end).
  const segments = shown.map((b, i) => {
    const start = i === 0 ? 0 : at(b.from);
    const end = i === shown.length - 1 ? 100 : at(shown[i + 1].from);
    return { ...b, start, end };
  });

  return (
    <div aria-hidden="true" data-testid="paragraph-band-track" className="w-full">
      <div className="bg-nl-wood relative h-1 w-full">
        <div className="bg-nl-brass absolute inset-y-0 left-0" style={{ width: `${at(value)}%` }} />
        {segments.slice(1).map((s) => (
          <span
            key={`tick-${s.from}`}
            className="absolute -top-1 h-3 w-px bg-[color:var(--line-control)]"
            style={{ left: `${s.start}%` }}
          />
        ))}
      </div>
      <div className="relative mt-1 h-4 w-full">
        {segments.map((s) => {
          const current = value >= s.from && value <= s.to;
          return (
            <span
              key={`label-${s.from}`}
              className={`absolute -translate-x-1/2 whitespace-nowrap text-xs tabular-nums ${
                current ? 'text-nl-text' : 'text-nl-muted'
              }`}
              style={{ left: `${(s.start + s.end) / 2}%` }}
            >
              {s.ink} Ink
            </span>
          );
        })}
      </div>
    </div>
  );
}
