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
        'nl border-nl-line bg-nl-warn-light px-nl-4 py-nl-2 text-nl-warn flex min-h-[44px] w-full items-center border-b',
        className,
      )}
    >
      <p className="nl-body-sm m-0 min-w-0 flex-1 font-medium">{OFFLINE_BANNER_COPY}</p>
    </div>
  );
}
