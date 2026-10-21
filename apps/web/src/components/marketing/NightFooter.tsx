'use client';

// T-517: the Night Library footer (spec 01 footer; copy §1.10) for the landing, pricing and auth
// pages. The old SiteFooter stays on the other marketing pages.
// - Grievance: the AJ-517-M11 line (with the officer's name only when
//   NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME is set), not a "Grievance Officer" link (AJ-517-M8).
// - "Case diary and reminders: coming" (spec): not in the signed copy (§0 decision 3, no "coming").
// - Cookie settings (T-310 S9) is kept: it is how a visitor reopens the analytics choice.

import Link from 'next/link';

import { footerCopy, type Lang } from './nl-copy';
import { NL_TEXT_LINK } from './nl-link';

import { CONSENT_STRINGS, openConsentSettings } from '@/components/AnalyticsConsent';
import { LawieMark } from '@/components/shell';

export function NightFooter({ lang = 'en' }: { lang?: Lang }) {
  const copy = footerCopy(lang);
  return (
    <footer className="nl border-nl-line bg-nl-wood px-nl-4 py-nl-8 text-nl-soft min-[900px]:px-nl-8 border-t">
      <div className="gap-nl-4 mx-auto flex max-w-[1180px] flex-col">
        <LawieMark />
        <p className="nl-body-sm max-w-[60ch]">{copy.disclaimer}</p>
        <p lang="en" className="nl-body-sm max-w-[60ch]" data-grievance-line="">
          {copy.grievance.before}
          <a
            className="nl-focus rounded-nl-sm text-nl-brass-dark underline underline-offset-4"
            href={`mailto:${copy.grievance.email}`}
          >
            {copy.grievance.email}
          </a>
          {copy.grievance.after}
        </p>
        <ul className="gap-x-nl-4 m-0 flex list-none flex-wrap p-0">
          <li>
            <Link className={NL_TEXT_LINK} href="/privacy">
              {copy.links.privacy}
            </Link>
          </li>
          <li>
            <Link className={NL_TEXT_LINK} href="/terms">
              {copy.links.terms}
            </Link>
          </li>
          <li>
            <Link className={NL_TEXT_LINK} href="/refunds">
              {copy.links.refunds}
            </Link>
          </li>
          <li lang="en">
            <button
              type="button"
              aria-haspopup="true"
              className={`${NL_TEXT_LINK} border-0 bg-transparent p-0`}
              onClick={(e) => openConsentSettings(e.currentTarget)}
            >
              {CONSENT_STRINGS.S9}
            </button>
          </li>
        </ul>
      </div>
    </footer>
  );
}
