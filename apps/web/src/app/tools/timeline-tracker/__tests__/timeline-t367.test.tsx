// T-367 (Ajay, signed 51175aa; Addendum 1, 3431cce): the tracker page shows the
// day-1 input label and help text, dates like "1 March 2026", the API's signed
// lines, Ajay's Legal Reference item, and no remand breakdown.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import TimelineTrackerPage from '../page';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const R1 =
  'Police custody: up to 15 days in total, in one go or in parts, within the first 40 days of detention (BNSS 187(2)).';
const R2 =
  'Detention limit before charge sheet: 60 days (BNSS 187(3)), counting the date of the first remand as day 1.';
const R3 =
  'Last day for the charge sheet: 1 March 2026. If none is filed by then, default bail is available from 2 March 2026.';
const LEGAL_REF =
  'BNSS 187(3): if the investigation is not completed within 60 or 90 days, the accused is to be released on bail if prepared to and does furnish bail (default bail).';
const HELP = 'The date the Magistrate first ordered the accused into custody. This is day 1.';

// Shape of the API reply for first remand 1 Jan 2026, BNS 303 (60-day period).
const API_60 = {
  arrestDate: '2026-01-01',
  maxYears: 5,
  isLifeOrDeath: false,
  policeCustodyEndDate: '2026-02-09',
  policeCustodyDays: 15,
  policeCustodyNote: R1,
  judicialCustodyEndDate: '2026-03-01',
  judicialCustodyDays: 60,
  chargesheetDeadline: '2026-03-01',
  defaultBailDate: '2026-03-02',
  detentionLimitNote: R2,
  chargesheetNote: R3,
  periodNote: null,
  bnssSection: '187',
  bnssSectionTitle: 'BNSS 187(3): detention limit before the charge sheet',
  milestones: [
    {
      date: '2026-01-01',
      label: 'Day 1: first remand',
      description: HELP,
      type: 'start',
      critical: false,
    },
    {
      date: '2026-02-09',
      label: 'Last day for police custody (day 40)',
      description: R1,
      type: 'police_custody',
      critical: true,
    },
    {
      date: '2026-03-01',
      label: 'Last day for the charge sheet (day 60)',
      description: R2,
      type: 'chargesheet',
      critical: true,
    },
    {
      date: '2026-03-02',
      label: 'Default bail available from (day 61)',
      description: R3,
      type: 'default_bail',
      critical: true,
    },
  ],
  defaultBailAvailable: true,
  defaultBailExplanation: `${R2} ${R3}`,
  sectionsUsed: ['303'],
  sectionsNotFound: [],
  sectionsWithoutPeriod: [],
  sectionNotes: {},
};

let container: HTMLDivElement;
let root: Root;

function setValue(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

async function calculate(reply: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => reply,
  }) as unknown as typeof fetch;
  await act(async () => root.render(<TimelineTrackerPage />));
  const date = container.querySelector('input[type="date"]') as HTMLInputElement;
  const text = container.querySelector('input[type="text"]') as HTMLInputElement;
  await act(async () => setValue(date, '2026-01-01'));
  await act(async () => setValue(text, '303'));
  const btn = Array.from(container.querySelectorAll('button')).find((b) =>
    /Calculate Timeline/.test(b.textContent ?? ''),
  ) as HTMLButtonElement;
  await act(async () => {
    btn.click();
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('T-367 timeline tracker page', () => {
  it('labels the input "Date of first remand" with the signed help text', async () => {
    await act(async () => root.render(<TimelineTrackerPage />));
    const text = container.textContent ?? '';
    expect(text).toContain('Date of first remand');
    expect(text).toContain(HELP);
    expect(text).not.toContain('Arrest Date');
    expect(text).not.toContain('All custody periods begin');
  });

  it('shows dates like "1 March 2026", the signed lines and the signed Legal Reference', async () => {
    await calculate(API_60);
    const text = container.textContent ?? '';
    expect(text).toContain('9 February 2026');
    expect(text).toContain('1 March 2026');
    expect(text).toContain('2 March 2026');
    expect(text).toContain('Day 1: first remand');
    expect(text).toContain('Last day for police custody (day 40)');
    expect(text).toContain(R1);
    expect(text).toContain(R2);
    expect(text).toContain(R3);
    expect(text).toContain(LEGAL_REF);
    expect(text).not.toContain('Police Custody Limit');
    expect(text).not.toContain('187(4)');
  });

  it('shows the Addendum 2 card texts, heading, title and disclaimer, and no "Chargesheet"', async () => {
    await calculate(API_60);
    const text = container.textContent ?? '';
    expect(text).toContain('Last day for the charge sheet (day 60)');
    expect(text).toContain('Default bail available from (day 61)');
    expect(text).toContain('Day 61: default bail (BNSS 187(3))');
    expect(text).toContain('Default bail (BNSS 187(3))');
    expect(text).toContain('BNSS 187(3): detention limit before the charge sheet');
    expect(text).toContain(`${R2} ${R3}`);
    expect(text).toContain(
      'This tracker counts dates from the date you enter. It is not legal advice. Check the remand orders and the BNSS before relying on it.',
    );
    expect(text).not.toMatch(/chargesheet/i);
    expect(text).not.toContain('indefeasible');
    expect(text).not.toContain('Default Bail Date');
  });

  it('has no remand breakdown section or unsigned lines', async () => {
    await calculate(API_60);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/remand breakdown/i);
    expect(text).not.toMatch(/staggered/i);
    expect(text).not.toContain('No further police remand');
    expect(text).not.toContain('accrues on Day');
    expect(text).not.toContain('stringent');
  });

  it('with no period shows the "Depends" line and no police date', async () => {
    const depends = 'Depends on the offence. Check BNSS section 187.';
    await calculate({
      ...API_60,
      maxYears: null,
      policeCustodyEndDate: null,
      policeCustodyNote: depends,
      judicialCustodyEndDate: null,
      judicialCustodyDays: null,
      chargesheetDeadline: null,
      defaultBailDate: null,
      detentionLimitNote: null,
      chargesheetNote: null,
      periodNote: depends,
      milestones: [API_60.milestones[0]],
      defaultBailAvailable: null,
    });
    const text = container.textContent ?? '';
    expect(text).toContain(depends);
    expect(text).not.toContain('Last day for police custody');
    expect(text).not.toContain('Default Bail Date');
  });
});

// ── Addendum 3: countdown, CTA, Legal Reference ──────────────────────────────

/** ISO date n days from the local today, matching the page's local-midnight maths. */
function isoFromToday(n: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function withLastDay(offset: number) {
  const last = isoFromToday(offset);
  return { ...API_60, chargesheetDeadline: last, judicialCustodyEndDate: last };
}

describe('T-367 Addendum 3: charge sheet countdown', () => {
  it.each([
    [5, '60-day period · 5 days left'],
    [1, '60-day period · 1 day left'],
    [0, '60-day period · Today is the last day'],
    [-1, '60-day period · The last day was 1 day ago'],
    [-7, '60-day period · The last day was 7 days ago'],
  ])('last day %i days from today', async (offset, expected) => {
    await calculate(withLastDay(offset));
    const text = container.textContent ?? '';
    expect(text).toContain(expected);
    expect(text).not.toMatch(/overdue/i);
    expect(text).not.toContain('1 days');
  });

  it('uses the period in the countdown (90-day)', async () => {
    await calculate({ ...withLastDay(3), judicialCustodyDays: 90 });
    expect(container.textContent).toContain('90-day period · 3 days left');
  });
});

describe('T-367 Addendum 3: CTA', () => {
  it('asks "Need to draft a bail application?" and links to the bail application', async () => {
    await calculate(API_60);
    const text = container.textContent ?? '';
    expect(text).toContain('Need to draft a bail application?');
    expect(text).not.toContain('Need to file a default bail application?');
    const link = Array.from(container.querySelectorAll('a')).find((a) =>
      /Draft with Lawie/.test(a.textContent ?? ''),
    );
    expect(link?.getAttribute('href')).toBe('/dashboard/new?type=bail_application');
  });
});

describe('T-367 Addendum 3: Legal Reference', () => {
  function legalItems(): string[] {
    const h = Array.from(container.querySelectorAll('h3')).find(
      (x) => x.textContent === 'Legal Reference',
    );
    const ul = h?.parentElement?.querySelector('ul');
    return Array.from(ul?.querySelectorAll('li') ?? []).map((li) => li.textContent ?? '');
  }

  it('with a period: R1, R2, then the signed 187(3) line', async () => {
    await calculate(API_60);
    expect(legalItems()).toEqual([R1, R2, LEGAL_REF]);
  });

  it('with no period: only the signed 187(3) line, and the Depends line shows once outside the list', async () => {
    const depends = 'Depends on the offence. Check BNSS section 187.';
    await calculate({
      ...API_60,
      maxYears: null,
      policeCustodyEndDate: null,
      policeCustodyNote: depends,
      judicialCustodyEndDate: null,
      judicialCustodyDays: null,
      chargesheetDeadline: null,
      defaultBailDate: null,
      detentionLimitNote: null,
      chargesheetNote: null,
      periodNote: depends,
      milestones: [API_60.milestones[0]],
      defaultBailAvailable: null,
    });
    expect(legalItems()).toEqual([LEGAL_REF]);
    expect((container.textContent ?? '').split(depends).length - 1).toBe(1);
  });
});
