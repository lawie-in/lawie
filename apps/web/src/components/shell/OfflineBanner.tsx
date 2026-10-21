'use client';

/**
 * T-520: offline banner (spec 08, copy section 5), full width under the top bar in warn. Reads
 * navigator.onLine and follows the window online/offline events. SSR-safe: the server and the
 * first client render assume online, so nothing shows until the browser says it is offline.
 *
 * ui/Banner has no offline kind (its kinds are ai-down, payment-failed, verify-email,
 * privacy-reaccept), so this uses the same tokens and layout with its own markup.
 */
import { useSyncExternalStore } from 'react';

import { cn } from '@/lib/cn';

/** Copy section 5, offline banner. */
export const OFFLINE_BANNER_COPY = 'You are offline. Reconnect to keep working.';

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}
function getSnapshot(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}
function getServerSnapshot(): boolean {
  return true;
}

/** True unless the browser reports it is offline. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function OfflineBanner({ className }: { className?: string }) {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      data-kind="offline"
      data-tone="warn"
      className={cn(
        'nl border-nl-line bg-nl-warn-light py-nl-2 text-nl-warn flex min-h-[44px] w-full items-center border-b',
        className,
      )}
    >
      {/* T-524: the fill runs full width; the text sits in the page's content column (the same
          max width and gutters as app/dashboard/page.tsx), so it lines up with the greeting. */}
      <div className="px-nl-4 min-[900px]:px-nl-8 mx-auto w-full min-w-0 max-w-[1180px]">
        <p className="nl-body-sm m-0 min-w-0 break-words font-medium">{OFFLINE_BANNER_COPY}</p>
      </div>
    </div>
  );
}
