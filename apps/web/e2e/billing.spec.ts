/**
 * T-523 AC1: Settings, Plan tab (/dashboard/settings#plan): the plan chooser, subscribe, cancel
 * and the past_due state. Razorpay is never contacted: the subscribe reply carries a LOCAL
 * shortUrl and that page load is fulfilled by the test. Runs on desktop-1280.
 */
import { expect, mockApi, test } from './fixtures';
import { E2E_BASE_URL } from './guards';
import { flowsOnDesktopOnly, seedSignedIn } from './helpers';
import { cancelReply, json, shells, subscribeReply } from './mocks';

flowsOnDesktopOnly();

test.describe('settings: plan', () => {
  test('shows the plan catalogue from the mock', async ({ page, context }) => {
    await seedSignedIn(page, context);
    await page.goto('/dashboard/settings#plan');
    await expect(page.getByRole('heading', { name: 'Plan', exact: true })).toBeVisible();
    await expect(page.getByText('₹799 a month')).toBeVisible();
    await expect(page.getByText('50 Ink a month', { exact: true })).toBeVisible();
    await expect(page.getByText('₹1,999 a month')).toBeVisible();
    await expect(page.getByText('150 Ink a month', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose Solo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose Pro' })).toBeVisible();
  });

  test('Choose Solo posts the plan and goes to the local payment link', async ({
    page,
    context,
  }) => {
    await seedSignedIn(page, context);
    const calls = await mockApi(page, {
      'POST /api/billing/subscribe': json(subscribeReply()),
    });
    // The local "payment page": fulfil the document so the app's own payment route is not loaded.
    await page.route(`${E2E_BASE_URL}/dashboard/payment/success**`, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>paid</title>' }),
    );
    await page.goto('/dashboard/settings#plan');
    await page.getByRole('button', { name: 'Choose Solo' }).click();

    await expect(page).toHaveURL(
      new RegExp(
        `^${E2E_BASE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/dashboard/payment/success\\?e2e=1$`,
      ),
    );
    const subscribe = calls.find((c) => c.path === '/api/billing/subscribe');
    expect(subscribe?.method).toBe('POST');
    expect(subscribe?.body).toEqual({ planId: 'solo_monthly' });
  });

  test('cancel: confirm posts, then shows the ends-at state', async ({ page, context }) => {
    await seedSignedIn(page, context, { mocks: shells.pro() });
    const calls = await mockApi(page, { 'POST /api/billing/cancel': json(cancelReply('pro')) });
    await page.goto('/dashboard/settings#plan');

    await page.getByRole('button', { name: 'Cancel plan' }).click();
    const dialog = page.getByRole('dialog', { name: 'Cancel your plan?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel plan' }).click();

    await expect(page.getByText(/^Your plan will end on .+\.$/)).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(/^Ends on /)).toBeVisible();
    expect(calls.filter((c) => c.path === '/api/billing/cancel')).toHaveLength(1);
  });

  test('Keep my plan closes the dialog without a call', async ({ page, context }) => {
    await seedSignedIn(page, context, { mocks: shells.pro() });
    const calls = await mockApi(page, { 'POST /api/billing/cancel': json(cancelReply('pro')) });
    await page.goto('/dashboard/settings#plan');

    await page.getByRole('button', { name: 'Cancel plan' }).click();
    const dialog = page.getByRole('dialog', { name: 'Cancel your plan?' });
    await dialog.getByRole('button', { name: 'Keep my plan' }).click();
    await expect(dialog).toBeHidden();
    expect(calls.filter((c) => c.path === '/api/billing/cancel')).toHaveLength(0);
  });

  test('past_due shows the payment-failed state', async ({ page, context }) => {
    await seedSignedIn(page, context, { mocks: shells.pastDue() });
    await page.goto('/dashboard/settings#plan');
    await expect(page.getByTestId('subscription-status')).toContainText('Payment failed');
    await expect(page.getByText(/Your last payment did not go through/)).toBeVisible();
  });
});
