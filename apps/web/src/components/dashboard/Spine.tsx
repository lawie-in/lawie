'use client';

/**
 * T-520: a document as a book spine (spec 3 "Spine"). 52px wide, 184-210px tall, vertical label.
 * Draft: two brass bands. Finalised (an exported document counts as finalised): a seal mark. The
 * status is in the label too, so nothing depends on hover (spec 5). Hover pulls the spine out
 * 14px (250ms) only on a fine-pointer screen above the mobile cap with motion allowed.
 */
import Link from 'next/link';

import { SPINE_STATUS_LABEL } from './dashboardCopy';
import type { ShelfDocument } from './useDashboardData';

import { loopPlayState, useMobileCap, useMotionAllowed, usePageVisible } from '@/components/ui';
import { cn } from '@/lib/cn';

/** Heights cycle so the shelf does not look like a bar chart. */
const HEIGHTS = ['h-[196px]', 'h-[184px]', 'h-[210px]', 'h-[190px]', 'h-[204px]'] as const;

export function spineStatus(status: ShelfDocument['status']): keyof typeof SPINE_STATUS_LABEL {
  return status === 'draft' ? 'draft' : 'finalised';
}

export function Spine({ doc, index }: { doc: ShelfDocument; index: number }) {
  const motion = useMotionAllowed();
  const mobileCap = useMobileCap();
  const pull = motion && !mobileCap;
  const status = spineStatus(doc.status);
  const statusLabel = SPINE_STATUS_LABEL[status];
  const title = doc.title.trim();

  return (
    <li className="flex shrink-0 items-end">
      <Link
        href={`/dashboard/documents/${encodeURIComponent(doc._id)}`}
        title={title ? `${title} (${statusLabel})` : statusLabel}
        data-status={status}
        className={cn(
          'nl nl-focus bg-nl-ox py-nl-3 relative flex w-[52px] flex-col items-center justify-between overflow-hidden text-white no-underline',
          HEIGHTS[index % HEIGHTS.length],
          pull && 'transition-transform duration-[250ms] ease-[ease] hover:-translate-y-[14px]',
        )}
      >
        {status === 'draft' ? (
          <span aria-hidden="true" className="flex w-full flex-col gap-1">
            <span className="bg-nl-brass block h-1 w-full" />
            <span className="bg-nl-brass block h-1 w-full" />
          </span>
        ) : (
          <span
            aria-hidden="true"
            className="border-nl-brass bg-nl-brass block h-4 w-4 rounded-full border-2"
          />
        )}
        <span className="nl-body-sm py-nl-2 min-h-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-medium [writing-mode:vertical-rl]">
          {title}
        </span>
        <span className="nl-body-sm whitespace-nowrap [writing-mode:vertical-rl]">
          {statusLabel}
        </span>
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
        className={cn('nl-skeleton block w-[52px]', HEIGHTS[index % HEIGHTS.length])}
        style={loopPlayState(visible)}
      />
    </li>
  );
}
