/**
 * T-521: opts a page or flow into the Night Library tokens (`nl`) and page ground
 * (`nl-root`). Tokens apply only under an ancestor with `nl`, and the dashboard
 * layout does not have it yet.
 *
 * Remove once T-520 puts nl nl-root on the dashboard layout.
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
