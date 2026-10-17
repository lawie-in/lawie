// T-511 part A: Chip (spec 3). neutral, brass, ok, warn, error; 12px label, pill radius,
// 4px 10px padding. Static (not interactive). InkChip: brass dot + "{n} Ink" (copy 3.4).

import { cn } from '@/lib/cn';

export type ChipVariant = 'neutral' | 'brass' | 'ok' | 'warn' | 'error';

export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: ChipVariant;
}

const VARIANT: Record<ChipVariant, string> = {
  neutral: 'bg-nl-wood text-nl-soft',
  brass: 'bg-nl-brass-light text-nl-brass-dark',
  ok: 'bg-nl-ok-light text-nl-ok',
  warn: 'bg-nl-warn-light text-nl-warn',
  error: 'bg-nl-err-light text-nl-err',
};

export function Chip({ variant = 'neutral', className, children, ...rest }: ChipProps) {
  return (
    <span
      data-variant={variant}
      className={cn(
        'nl rounded-nl-pill py-nl-1 inline-flex items-center gap-1.5 whitespace-nowrap px-[10px]',
        'font-nl-body text-[12px] font-medium leading-4',
        VARIANT[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

export interface InkChipProps extends Omit<ChipProps, 'variant' | 'children'> {
  /** Ink balance. Rendered with tabular numbers. */
  balance: number | string;
  /** Unit after the number; copy 3.4 `{n} Ink`. */
  unit?: string;
  /** Full override of the visible text. */
  children?: React.ReactNode;
}

export function InkChip({ balance, unit = 'Ink', className, children, ...rest }: InkChipProps) {
  return (
    <Chip variant="brass" className={className} {...rest}>
      <span aria-hidden="true" className="bg-nl-brass inline-block h-1.5 w-1.5 rounded-full" />
      {children ?? (
        <span>
          <span className="tabular-nums">{balance}</span> {unit}
        </span>
      )}
    </Chip>
  );
}
