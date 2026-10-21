// T-517: a plan card (spec 3 Card, plain) for the landing and the pricing page. Text comes from
// nl-copy (§1.6) or the T-398 Pro card strings; the button is always ghost, because the section's
// single primary call to action sits under the cards (never two primaries in one view).

import Link from 'next/link';

import { nlLinkButton } from './nl-link';

import { cn } from '@/lib/cn';

export interface NightPlanCardProps {
  name: string;
  /** T-398 Pro subline (`More Ink each month`). */
  subline?: string;
  price: string;
  ink: string;
  includes: string[];
  button: string;
  href: string;
  /** Hindi page: card titles at 20px or more (AC5). */
  largeHeading?: boolean;
  /** data-plan value (free, solo, pro). */
  testId?: string;
  /** Heading level for the plan name: h3 under a section h2 (landing), h2 under the page h1
   *  (pricing), so no level is skipped. */
  headingLevel?: 'h2' | 'h3';
}

export function NightPlanCard({
  name,
  subline,
  price,
  ink,
  includes,
  button,
  href,
  largeHeading = false,
  testId,
  headingLevel = 'h3',
}: NightPlanCardProps) {
  const Heading = headingLevel;
  return (
    <article
      data-plan={testId}
      className="nl border-nl-line bg-nl-card p-nl-6 flex min-w-0 flex-col border"
    >
      <Heading className={cn(largeHeading ? 'nl-h2' : 'nl-h3', 'text-nl-text')}>{name}</Heading>
      {subline ? <p className="nl-body-sm text-nl-soft">{subline}</p> : null}
      {/* T-528 (Rajesh): the price leads the card, Tiro 34/40. DESIGN.md has no 34/40 token
          (Headline is 32/38), so the size is set here. Tabular numerals (The Tabular Rule). */}
      <p
        data-plan-price=""
        className="font-nl-display mt-nl-3 text-nl-text text-[34px] font-normal tabular-nums leading-[40px] [text-wrap:balance]"
      >
        {price}
      </p>
      <p className="nl-body text-nl-soft mt-nl-1">{ink}</p>
      <ul className="mt-nl-4 gap-nl-2 nl-body text-nl-soft flex list-none flex-col p-0">
        {includes.map((line) => (
          <li key={line} className="gap-nl-2 flex items-start">
            <span
              aria-hidden="true"
              className="bg-nl-brass mt-[10px] h-1.5 w-1.5 shrink-0 rounded-full"
            />
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <Link className={nlLinkButton('ghost', 'mt-nl-6 w-full whitespace-normal')} href={href}>
        {button}
      </Link>
    </article>
  );
}
