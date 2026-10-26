/**
 * T-523 AC1: landing, sign-up, login and the auth gate. The gateway is mocked; nothing leaves
 * localhost (the auto fixture fails any test that leaks or hits an unmocked endpoint).
 *
 * Runs on desktop-1280, except the phone top-bar test (mobile-390). The screenshot matrix is in
 * screenshots.spec.ts.
 */
import { expect, mockApi, test } from './fixtures';
import { onlyOn, seedVisitor } from './helpers';
import { authTokens, json, shells } from './mocks';

test.describe('landing page', () => {
  onlyOn('desktop-1280');

  test.beforeEach(async ({ context }) => {
    await seedVisitor(context, 'night');
  });

  test('loads with the hero, the nav links to prices and the FAQ', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);

    await expect(page).toHaveTitle(/Lawie/);
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Describe the matter. Read the draft.',
      }),
    ).toBeVisible();

    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: 'Prices' })).toHaveAttribute('href', '#prices');
    await expect(nav.getByRole('link', { name: 'FAQ' })).toHaveAttribute('href', '#faq');
    await expect(page.getByRole('link', { name: 'Sign in' }).first()).toHaveAttribute(
      'href',
      '/login?mode=signin',
    );
  });

  test('the hero call to action goes to the sign-up tab', async ({ page }) => {
    await page.goto('/');
    const cta = page.getByRole('main').getByRole('link', { name: 'Start with 5 free Ink' }).first();
    await expect(cta).toHaveAttribute('href', '/login?mode=signup');

    await cta.click();
    await expect(page).toHaveURL(/\/login\?mode=signup$/);
    await expect(page.getByRole('tab', { name: 'Create account' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});

test.describe('landing page on a phone', () => {
  onlyOn('mobile-390');

  test('the top bar offers "Start free", which goes to the sign-up tab', async ({
    page,
    context,
  }) => {
    await seedVisitor(context, 'night');
    await page.goto('/');

    const startFree = page.getByRole('banner').getByRole('link', { name: 'Start free' });
    await expect(startFree).toBeVisible();
    await expect(startFree).toHaveAttribute('href', '/login?mode=signup');
    await startFree.click();
    await expect(page).toHaveURL(/\/login\?mode=signup$/);
  });
});

test.describe('login: Sign in tab', () => {
  onlyOn('desktop-1280');

  test.beforeEach(async ({ context }) => {
    await seedVisitor(context, 'night');
  });

  test('shows the Sign in tab by default', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('tab', { name: 'Sign in' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Forgot password?' })).toBeVisible();
  });

  test('signs in, stores the session and lands on the dashboard shell', async ({ page }) => {
    const calls = await mockApi(page, {
      'POST /api/auth/login': json(authTokens({ email: 'advocate@e2e.test' })),
      ...shells.free(),
    });

    await page.goto('/login?mode=signin');
    await page.getByLabel('Email').fill('advocate@e2e.test');
    await page.getByLabel('Password', { exact: true }).fill('Correct-Horse-1');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Your shelf' })).toBeVisible();
    await expect(page.getByRole('banner')).toBeVisible();

    const login = calls.find((c) => c.path === '/api/auth/login');
    expect(login?.method).toBe('POST');
    expect(login?.body).toEqual({ email: 'advocate@e2e.test', password: 'Correct-Horse-1' });

    const stored = await page.evaluate(() => ({
      access: window.localStorage.getItem('lawie_access_token'),
      refresh: window.localStorage.getItem('lawie_refresh_token'),
    }));
    expect(stored.access).toBeTruthy();
    expect(stored.refresh).toBeTruthy();
  });

  test('wrong credentials show the error, keep the email and clear the password', async ({
    page,
  }) => {
    const calls = await mockApi(page, {
      'POST /api/auth/login': json({ status: 'error', message: 'Invalid credentials' }, 401),
    });

    await page.goto('/login?mode=signin');
    await page.getByLabel('Email').fill('advocate@e2e.test');
    await page.getByLabel('Password', { exact: true }).fill('Wrong-Password-1');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    await expect(
      page.getByText('That email and password do not match. Try again, or reset your password.'),
    ).toBeVisible();
    await expect(page.getByLabel('Email')).toHaveValue('advocate@e2e.test');
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
    await expect(page).toHaveURL(/\/login/);
    expect(calls.filter((c) => c.path === '/api/auth/login')).toHaveLength(1);

    const stored = await page.evaluate(() => window.localStorage.getItem('lawie_access_token'));
    expect(stored).toBeNull();
  });

  test('a 422 lists what to check and keeps the typed email', async ({ page }) => {
    await mockApi(page, {
      'POST /api/auth/login': json(
        { status: 'error', message: 'Invalid email format; Password is required' },
        422,
      ),
    });

    await page.goto('/login?mode=signin');
    await page.getByLabel('Email').fill('advocate@e2e.test');
    await page.getByLabel('Password', { exact: true }).fill('x');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    await expect(page.getByText('Please check the following:')).toBeVisible();
    await expect(page.getByLabel('Email')).toHaveValue('advocate@e2e.test');
  });

  test('empty fields are caught before any request', async ({ page }) => {
    // No login mock: a request would fail the test as unmocked.
    await page.goto('/login?mode=signin');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('Enter your email.')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('sign-up (waits for T-522)', () => {
  onlyOn('desktop-1280');

  // Vishal's T-522 is changing the sign-up flow and has not merged. The steps below use roles
  // and labels only and no new copy, so they can be switched on once the flow is final. Do not
  // guess the new wording: re-read the page and the T-522 tests first.
  test.fixme('creates an account and lands on the dashboard (waits for T-522)', async ({
    page,
    context,
  }) => {
    await seedVisitor(context, 'night');
    const calls = await mockApi(page, {
      'POST /api/auth/register': json(authTokens({ email: 'new@e2e.test' }), 201),
      ...shells.free(),
    });

    await page.goto('/login?mode=signup');
    await page.getByLabel('Full name').fill('New Advocate');
    await page.getByLabel('Email').fill('new@e2e.test');
    await page.getByLabel('Password', { exact: true }).fill('Correct-Horse-1');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Create account', exact: true }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    expect(calls.some((c) => c.path === '/api/auth/register' && c.method === 'POST')).toBe(true);
  });
});

test.describe('auth gate', () => {
  onlyOn('desktop-1280');

  test('visiting /dashboard with no token redirects to /login', async ({ page, context }) => {
    await seedVisitor(context, 'night');
    // No API mocks on purpose: a signed-out visitor must not trigger any gateway call.
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('tab', { name: 'Sign in' })).toBeVisible();
  });
});
