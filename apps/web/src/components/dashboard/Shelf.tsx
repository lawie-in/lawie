'use client';

/**
 * T-520 item 2, "Recent documents": the shelf. Spines from GET /api/documents, scrolling
 * sideways on small screens with 6px gaps and a visible shelf edge (spec 5). Loading: three
 * skeleton spines. Empty: the first-time empty state (copy 3.2). Error: the page shows the
 * dashboard error with Retry; the shelf keeps the spines it had.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { DASHBOARD_COPY } from './dashboardCopy';
import { SkeletonSpine, Spine } from './Spine';
import type { LoadStatus, ShelfDocument } from './useDashboardData';

import { Button, EmptyState } from '@/components/ui';
import { cn } from '@/lib/cn';

export interface ShelfProps {
  docs: ShelfDocument[] | null;
  status: LoadStatus;
  className?: string;
}

export function Shelf({ docs, status, className }: ShelfProps) {
  const router = useRouter();
  const loading = docs === null && status === 'loading';
  const empty = docs !== null && docs.length === 0;

  return (
    <section
      aria-labelledby="shelf-heading"
      aria-busy={loading || undefined}
      className={cn('nl border-nl-line bg-nl-card p-nl-4 min-w-0 border', className)}
    >
      <div className="gap-nl-3 mb-nl-3 flex items-center justify-between">
        {/* T-524: "Recent documents" is a section title (DESIGN.md Title: Tiro 24px/30px). */}
        <h2 id="shelf-heading" className="nl-h2 text-nl-text m-0 min-w-0 break-words">
          {DASHBOARD_COPY.recentDocuments}
        </h2>
        {docs && docs.length > 0 ? (
          <Link
            href="/dashboard/documents"
            className="nl-focus nl-body-sm rounded-nl-sm px-nl-2 text-nl-brass-dark inline-flex min-h-[44px] items-center font-medium underline underline-offset-4"
          >
            {DASHBOARD_COPY.viewAll}
          </Link>
        ) : null}
      </div>

      {empty ? (
        // T-524 (Rajesh): the action is a ghost button here; the command bar's Draft is the one
        // primary on the dashboard. ui/EmptyState only renders a primary action, so the button
        // sits under it in the same column and spacing.
        <div className="gap-nl-3 flex flex-col items-start">
          <EmptyState heading={DASHBOARD_COPY.emptyHeading} message={DASHBOARD_COPY.emptyBody} />
          <Button variant="ghost" onClick={() => router.push('/dashboard/new')}>
            {DASHBOARD_COPY.emptyAction}
          </Button>
        </div>
      ) : loading || (docs && docs.length > 0) ? (
        <div className="-mx-nl-4 px-nl-4 overflow-x-auto overscroll-x-contain">
          {/* T-524: 10px wood shelf edge (DESIGN.md Layout). min-height = the 16px top room for
              the hover pull + the tallest spine (13.125rem), so loading does not shift. */}
          <ul
            role="list"
            className="border-nl-wood pt-nl-4 m-0 flex min-h-[calc(13.125rem+16px)] list-none items-end gap-[6px] border-b-[10px] p-0"
          >
            {loading
              ? [0, 1, 2].map((i) => <SkeletonSpine key={i} index={i} />)
              : (docs ?? []).map((doc, i) => <Spine key={doc._id} doc={doc} index={i} />)}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
