/**
 * T-521: opts a page or flow into the Night Library tokens (`nl`) and page ground
 * (`nl-root`). Tokens apply only under an ancestor with `nl`. app/dashboard/layout.tsx
 * applies `nl nl-root` only on /dashboard itself, not on the routes that use this.
 *
 * Remove once T-520's layout puts nl nl-root on ALL dashboard routes.
 */
import { cn } from '@/lib/cn';

export default function NightScope({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn('nl nl-root font-nl-body', className)}>{children}</div>;
}
