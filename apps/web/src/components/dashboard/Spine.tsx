'use client';

/**
 * T-520: a document as a book spine (spec 3 "Spine"). 52px wide, 184-210px tall, vertical label.
 * Draft: two brass bands. Finalised (an exported document counts as finalised): a seal mark. The
 * status is in the label too, so nothing depends on hover (spec 5). Hover pulls the spine out
 * 14px (250ms) only on a fine-pointer screen above the mobile cap with motion allowed.
 *
 * T-524 (Rajesh, Arjun):
 * - Label: Tiro 15px, one vertical line; the title truncates with an ellipsis and never wraps.
 *   The full title and the status are the link's accessible name; no tooltip (`title`).
 * - Sizes in rem (52px = 3.25rem, 15px = 0.9375rem), so 150% browser text size scales the spine
 *   with its label instead of clipping it.
 * - Hover: `group` is on the <li>, which never moves; the link slides up inside it and an ::after
 *   strip fills the 14px it leaves behind, so the pointer stays on the link and the pull does
 *   not flicker. Keyboard focus gets the same pull.
 * - Forced colours: the oxblood fill becomes Canvas, so the spine gets a border; the bands and
 *   the seal mark are drawn in CanvasText.
 */
import Link from 'next/link';

import { SPINE_STATUS_LABEL } from './dashboardCopy';
import type { ShelfDocument } from './useDashboardData';

import { loopPlayState, useMobileCap, useMotionAllowed, usePageVisible } from '@/components/ui';
import { cn } from '@/lib/cn';

/** Heights cycle so the shelf does not look like a bar chart (196, 184, 210, 190, 204px). */
const HEIGHTS = [
  'h-[12.25rem]',
  'h-[11.5rem]',
  'h-[13.125rem]',
  'h-[11.875rem]',
  'h-[12.75rem]',
] as const;

/** Spine width: 52px. */
const SPINE_WIDTH = 'w-[3.25rem]';

export function spineStatus(status: ShelfDocument['status']): keyof typeof SPINE_STATUS_LABEL {
  return status === 'draft' ? 'draft' : 'finalised';
}

/** The spine link's accessible name: the full title and the status. */
export function spineName(title: string, statusLabel: string): string {
  return title ? `${title} (${statusLabel})` : statusLabel;
}

/**
 * The 26px seal mark (DESIGN.md Spine). ui/Seal is the 100px stamped seal and needs lettering,
 * which is unreadable at 26px, so this is the same disc and inner ring without text. The disc is
 * --brass-mark; the ring is the spine's --ox (Rajesh, T-524), not On Brass as on ui/Seal.
 */
function SealMark() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 26 26"
      className="block h-[1.625rem] w-[1.625rem] shrink-0 forced-colors:[forced-color-adjust:none]"
    >
      <circle
        cx="13"
        cy="13"
        r="12.5"
        fill="var(--brass-mark)"
        className="forced-colors:[fill:CanvasText]"
      />
      <circle
        cx="13"
        cy="13"
        r="10"
        fill="none"
        // T-524 (Rajesh): a brass mark on a dark fill takes its ring from that fill: the spine's
        // own --ox (bg-nl-ox on the link), full opacity, never On Brass.
        stroke="var(--ox)"
        strokeWidth="1"
        className="forced-colors:[stroke:Canvas]"
      />
    </svg>
  );
}

const LABEL_TYPE =
  'font-nl-display text-[0.9375rem] font-normal leading-[1.25rem] whitespace-nowrap [writing-mode:vertical-rl]';

export function Spine({ doc, index }: { doc: ShelfDocument; index: number }) {
  const motion = useMotionAllowed();
  const mobileCap = useMobileCap();
  const pull = motion && !mobileCap;
  const status = spineStatus(doc.status);
  const statusLabel = SPINE_STATUS_LABEL[status];
  const title = doc.title.trim();

  return (
    <li className={cn('flex shrink-0 items-end', pull && 'group')}>
      <Link
        href={`/dashboard/documents/${encodeURIComponent(doc._id)}`}
        aria-label={spineName(title, statusLabel)}
        data-status={status}
        className={cn(
          'nl nl-focus bg-nl-ox py-nl-3 gap-nl-2 relative flex flex-col items-center justify-between text-white no-underline',
          'forced-colors:border-2 forced-colors:border-solid',
          SPINE_WIDTH,
          HEIGHTS[index % HEIGHTS.length],
          pull && [
            'transition-transform duration-[250ms] ease-[ease]',
            'focus-visible:-translate-y-[14px] group-hover:-translate-y-[14px]',
            'after:absolute after:inset-x-0 after:top-full after:hidden after:h-[14px] group-hover:after:block',
          ],
        )}
      >
        {status === 'draft' ? (
          <span aria-hidden="true" className="flex w-full shrink-0 flex-col gap-1">
            <span className="block h-1 w-full bg-[var(--brass-mark)] forced-colors:[background-color:CanvasText] forced-colors:[forced-color-adjust:none]" />
            <span className="block h-1 w-full bg-[var(--brass-mark)] forced-colors:[background-color:CanvasText] forced-colors:[forced-color-adjust:none]" />
          </span>
        ) : (
          <SealMark />
        )}
        <span dir="auto" className={cn(LABEL_TYPE, 'min-h-0 flex-1 overflow-hidden text-ellipsis')}>
          {title}
        </span>
        <span className={cn(LABEL_TYPE, 'shrink-0')}>{statusLabel}</span>
      </Link>
    </li>
  );
}

/** Loading spine: the wood skeleton block, paused while the tab is hidden, static when reduced. */
export function SkeletonSpine({ index }: { index: number }) {
  const visible = usePageVisible();
  return (
    <li className="flex shrink-0 items-end" aria-hidden="true">
      <span
        className={cn('nl-skeleton block', SPINE_WIDTH, HEIGHTS[index % HEIGHTS.length])}
        style={loopPlayState(visible)}
      />
    </li>
  );
}
