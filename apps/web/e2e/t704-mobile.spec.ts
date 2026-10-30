/**
 * T-704: mobile (390 px) views of the drafting pages and the admin panel.
 * - No page scrolls sideways (documentElement.scrollWidth <= innerWidth) and the main region is
 *   at least 300 px wide, on mobile-390 and desktop-1280.
 * - The admin sidebar is a drawer below md (Menu button, backdrop, Escape, navigation close it)
 *   and a static rail from md up (no Menu button).
 * - Admin tables scroll inside their own .overflow-x-auto wrapper, not the page.
 * The gateway is mocked at the network edge (T-550); admin pages get deliberately wide rows.
 * Screenshots go to e2e/artefacts/<project>/any/t704-*.png (gitignored; for a human to review).
 */
import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import { hideDevOverlay, pageOverflow, saveShot, seedSignedIn, settle } from './helpers';
import { intakeEnabled, json, shells, templateConfigs } from './mocks';

const LONG_EMAIL =
  'a.very.long.advocate.name.for.overflow.checks@chambers-of-the-high-court.example.in';
const NOW = '2026-10-01T00:00:00Z';

const userRow = (i: number) => ({
  _id: `u${i}`,
  name: `Advocate With A Rather Long Full Name ${i}`,
  email: LONG_EMAIL,
  planTier: 'pro',
  billingCycle: 'annual',
  planRenewsAt: NOW,
  isActive: true,
  createdAt: NOW,
  lastLoginAt: NOW,
  inkSub: 100,
  inkAnnualCarry: 10,
  inkTopup: 20,
  totalInk: 130,
});

const subRow = (i: number) => ({
  _id: `s${i}`,
  userId: `u${i}`,
  userName: `Advocate With A Rather Long Full Name ${i}`,
  userEmail: LONG_EMAIL,
  razorpaySubscriptionId: `sub_very_long_razorpay_identifier_${i}`,
  planLabel: 'Pro annual',
  planType: 'pro',
  amountInr: 14999,
  status: 'active',
  currentPeriodEnd: NOW,
  cancelledAt: null,
  createdAt: NOW,
});

const couponRow = (i: number) => ({
  _id: `c${i}`,
  code: `LAUNCHOFFER${i}`,
  label: 'Launch offer for chambers with long names',
  discountType: 'percent',
  discountValue: 20,
  applicablePlans: ['solo', 'pro'],
  maxUses: 100,
  maxUsesPerUser: 1,
  uses: 3,
  isActive: true,
  expiresAt: NOW,
  razorpayOfferId: 'offer_long_identifier_value',
  createdAt: NOW,
});

const ledgerRow = (i: number) => ({
  _id: `l${i}`,
  userId: `u${i}`,
  userName: `Advocate With A Rather Long Full Name ${i}`,
  userTier: 'firm',
  source: 'draft_generation_debit',
  bucket: 'subscriptionCredits',
  amount: -2,
  balanceAfter: 40,
  reference: 'doc_reference_that_is_quite_long_indeed',
  templateId: 'bail_regular',
  createdAt: NOW,
});

const matrixRow = (i: number) => ({
  token: `tok_long_review_token_value_${i}`,
  assignedTo: 'reviewer.with.long.address@panel.example.in',
  documentId: `d${i}`,
  documentTitle: 'Regular bail application for a long titled matter',
  documentType: 'bail_application',
  status: 'submitted',
  verdict: 'minor_edits',
  submittedAt: NOW,
  comments: null,
  checklist: null,
});

const referralRow = (i: number) => ({
  code: `FRIEND${i}`,
  label: 'Friends of the founder with a long label',
  isActive: true,
  maxUses: 50,
  uses: 5 - i,
  bonusInk: 10,
  expiresAt: NOW,
  createdAt: NOW,
});

const auditRow = (i: number) => ({
  _id: `a${i}`,
  userId: `u${i}`,
  userName: 'Advocate With A Rather Long Full Name',
  userEmail: LONG_EMAIL,
  eventType: 'admin_grant_ink',
  severity: 'warning',
  ipAddress: '203.0.113.7',
  metadata: { reason: 'support_grant' },
  createdAt: NOW,
});

const rows = <T>(make: (i: number) => T, n = 3) => Array.from({ length: n }, (_, i) => make(i + 1));

const adminMocks = () => ({
  ...shells.free(),
  'GET /api/drafting/admin/overview/kpis': json({
    activeAdvocates: { value: 12, deltaWeek: 2 },
    draftsGenerated: { value: 340, deltaPct: 5 },
    panelReviewsPending: { value: 3, overdue: 1 },
    conversion: { valuePct: 8, deltaPct: 1 },
    monthlyRevenue: { inr: 125000, paid: 9, newPaid: 2, churn: 1 },
    inkCirculation: 4200,
  }),
  'GET /api/drafting/admin/overview/activity': json({
    items: [
      { type: 'signup', label: 'New advocate signed up', detail: LONG_EMAIL, at: NOW },
      { type: 'draft', label: 'Bail application drafted', detail: 'Patna High Court', at: NOW },
    ],
  }),
  'GET /api/drafting/admin/overview/ai-runtime': json({
    drafting_model: 'claude-model-with-a-long-identifier',
    preflight_model: 'claude-model-with-a-long-identifier',
  }),
  'GET /api/auth/admin/referral-codes': json({ codes: rows(referralRow) }),
  'GET /api/drafting/admin/users': json({ users: rows(userRow), total: 3 }),
  'GET /api/billing/admin/billing/subscriptions': json({ subscriptions: rows(subRow), total: 3 }),
  'GET /api/billing/admin/coupons': json({ coupons: rows(couponRow) }),
  'GET /api/drafting/admin/credits/kpis': json({
    creditsInCirculation: 5000,
    bucketSums: { subscriptionCredits: 3000, earnedCredits: 500, topupCredits: 1500 },
    grantedThisMonth: 800,
    spentThisMonth: 600,
    topupRevenueInr: 45000,
    topupPacksSold: 30,
    activeAdvocates: 12,
  }),
  'GET /api/drafting/admin/credits/ledger': json({ entries: rows(ledgerRow) }),
  'GET /api/drafting/admin/panel-review': json({
    matrix: rows(matrixRow),
    counts: { total: 3, submitted: 3, pending: 0, expired: 0, verdicts: { minor_edits: 3 } },
  }),
  'GET /api/drafting/': json({ documents: [] }),
  'GET /api/auth/admin/audit-log': json({ logs: rows(auditRow), total: 3 }),
  'GET /api/drafting/admin/documents/analytics': json({
    kpis: {
      totalDocs: 100,
      totalDocsThisMonth: 20,
      finalisedRate: 0.4,
      aiCostInr: 1200,
      aiGenCount: 90,
      avgCostPerGenInr: 13,
    },
    docTypeBreakdown: [{ _id: 'bail_application', count: 40 }],
    templateUsage: [
      {
        templateId: 'bail_regular',
        displayName: 'Regular bail application',
        category: 'Criminal',
        planAccess: 'free',
        count: 40,
        finalisedRate: 0.5,
      },
    ],
  }),
  'GET /api/drafting/admin/documents/exports': json({
    exports: rows((i) => ({
      _id: `e${i}`,
      title: 'Regular bail application for a long titled matter',
      docType: 'bail_application',
      userName: 'Advocate With A Rather Long Full Name',
      exportedAs: ['pdf', 'docx'],
      exportedAt: NOW,
    })),
  }),
});

const docBody = () => ({
  _id: 'd1',
  title: 'Regular bail application',
  docType: 'bail_application',
  courtType: 'high_court',
  courtName: 'Patna High Court',
  content: '<p>Opening line</p><p>The petitioner submits that the matter is fit for relief.</p>',
  status: 'draft',
  sectionsCited: [],
  filingChecklist: ['Court fee stamp'],
  checklistState: [false],
  exportedAs: [],
  version: 1,
  createdAt: NOW,
  updatedAt: NOW,
  courtDocument: true,
  hasParty: true,
  startingDraft: true,
  startingDraftLabel: 'Starting draft — review before use · not court-verified',
  disclaimer:
    'Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.',
});

const draftingMocks = () => ({
  ...shells.free(),
  'GET /api/documents/intake/enabled': json(intakeEnabled()),
  'GET /api/documents/template-configs': json(templateConfigs()),
  'GET /api/documents/:id': json(docBody()),
  'PATCH /api/documents/:id': json({ version: 2, updatedAt: NOW }),
});

const ADMIN_PAGES = [
  '/admin',
  '/admin/users',
  '/admin/subscriptions',
  '/admin/coupons',
  '/admin/credit-ledger',
  '/admin/panel-review',
  '/admin/referral-codes',
  '/admin/audit-log',
  '/admin/documents',
];

async function expectNoSidewaysScroll(page: Page): Promise<void> {
  const o = await pageOverflow(page);
  expect(o.scrollWidth, `scrollWidth ${o.scrollWidth} > innerWidth ${o.inner}`).toBeLessThanOrEqual(
    o.inner,
  );
  // document.scrollingElement is the same box in standards mode; assert it directly as well.
  const se = await page.evaluate(() => ({
    w: (document.scrollingElement as Element).scrollWidth,
    i: window.innerWidth,
  }));
  expect(se.w).toBeLessThanOrEqual(se.i);
}

/**
 * main clips sideways overflow (overflow-x-clip), so scrollWidth alone cannot see content cut off
 * at the right edge. Every element in main must end inside the viewport unless it sits in an
 * .overflow-x-auto scroller.
 */
async function expectNothingClipped(page: Page): Promise<void> {
  const offenders = await page.evaluate(() => {
    const out: string[] = [];
    const vw = window.innerWidth;
    for (const el of Array.from(document.querySelectorAll('main *'))) {
      if (el.closest('.overflow-x-auto')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > vw + 1)
        out.push(
          `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} right=${Math.round(r.right)}`,
        );
    }
    return out.slice(0, 5);
  });
  expect(offenders, 'elements cut off past the right edge').toEqual([]);
}

async function expectMainWide(page: Page): Promise<void> {
  const width = await page
    .locator('main')
    .first()
    .evaluate((el) => el.getBoundingClientRect().width);
  expect(width).toBeGreaterThanOrEqual(300);
}

async function openAdmin(
  page: Page,
  context: Parameters<typeof seedSignedIn>[1],
  path: string,
  extra: Record<string, ReturnType<typeof json>> = {},
) {
  await hideDevOverlay(page);
  await seedSignedIn(page, context, {
    user: { role: 'Admin' },
    mocks: { ...adminMocks(), ...extra },
  });
  await page.goto(path);
  await expect(page.locator('#admin-sidebar')).toBeAttached();
  await expect(page.locator('main h1').first()).toBeVisible();
  // The rows arrive after the first paint: measure only once the data (a table) is on screen.
  await expect(page.locator('main table').first()).toBeVisible();
  await settle(page);
}

test.describe('T-704 a: no horizontal page overflow', () => {
  for (const path of ADMIN_PAGES) {
    test(`admin ${path}`, async ({ page, context }) => {
      await openAdmin(page, context, path);
      await expectNoSidewaysScroll(page);
      await expectNothingClipped(page);
      await expectMainWide(page);
    });
  }

  test('/dashboard/new', async ({ page, context }) => {
    await hideDevOverlay(page);
    await seedSignedIn(page, context, { mocks: draftingMocks() });
    await page.goto('/dashboard/new');
    await expect(page.getByLabel('Your matter')).toBeVisible();
    await settle(page);
    await expectNoSidewaysScroll(page);
    await expectNothingClipped(page);
    await expectMainWide(page);
  });

  test('a saved document page', async ({ page, context }) => {
    await hideDevOverlay(page);
    await seedSignedIn(page, context, { mocks: draftingMocks() });
    await page.goto('/dashboard/documents/d1');
    await expect(page.locator('.ProseMirror')).toBeVisible();
    await settle(page);
    await expectNoSidewaysScroll(page);
    await expectNothingClipped(page);
    await expectMainWide(page);
  });
});

test.describe('T-704 b: admin drawer', () => {
  test('is a drawer at 390 and a static rail at 1280', async ({ page, context }, testInfo) => {
    await openAdmin(page, context, '/admin');
    const aside = page.locator('#admin-sidebar');
    const menu = page.getByRole('button', { name: 'Open menu' });

    if (testInfo.project.name === 'desktop-1280') {
      await expect(aside).toBeVisible();
      await expect(menu).toBeHidden();
      return;
    }
    test.skip(testInfo.project.name !== 'mobile-390', 'drawer behaviour is checked at 390');

    const offscreen = () => aside.evaluate((el) => el.getBoundingClientRect().right <= 0);
    const onscreen = () => aside.evaluate((el) => el.getBoundingClientRect().left >= 0);

    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(offscreen).toBe(true);
    await saveShot(page, testInfo, 'any', 't704-admin-drawer-closed');

    // Menu opens it.
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(onscreen).toBe(true);
    await expect(aside).toBeInViewport();
    await saveShot(page, testInfo, 'any', 't704-admin-drawer-open');

    // Backdrop click closes it (click right of the 240px drawer).
    await page.mouse.click(360, 400);
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(offscreen).toBe(true);

    // Escape closes it.
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(offscreen).toBe(true);

    // Navigating closes it.
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await aside.getByRole('link', { name: 'Users' }).click();
    await expect(page).toHaveURL(/\/admin\/users$/);
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(offscreen).toBe(true);
  });
});

test.describe('T-704 c: admin tables scroll inside their wrapper', () => {
  test('/admin/users: wrapper scrolls, page does not', async ({ page, context }, testInfo) => {
    await openAdmin(page, context, '/admin/users');
    const wrap = page.locator('main .overflow-x-auto').first();
    await expect(wrap.locator('table')).toBeVisible();
    const m = await wrap.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
    if (testInfo.project.name === 'mobile-390') {
      expect(m.sw).toBeGreaterThan(m.cw);
    }
    await expectNoSidewaysScroll(page);
    if (testInfo.project.name === 'mobile-390')
      await saveShot(page, testInfo, 'any', 't704-admin-users');
  });
});

test.describe('T-704 d: screenshots for review', () => {
  test('/admin overview, /dashboard/new and the document page', async ({
    page,
    context,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-390', 'review screenshots are taken at 390');
    await openAdmin(page, context, '/admin', draftingMocks());
    await saveShot(page, testInfo, 'any', 't704-admin-overview');

    await page.goto('/dashboard/new');
    await expect(page.getByLabel('Your matter')).toBeVisible();
    await saveShot(page, testInfo, 'any', 't704-dashboard-new');

    await page.goto('/dashboard/documents/d1');
    await expect(page.locator('.ProseMirror')).toBeVisible();
    await saveShot(page, testInfo, 'any', 't704-document');
  });
});
