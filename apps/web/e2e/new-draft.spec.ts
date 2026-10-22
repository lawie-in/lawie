/**
 * T-523 AC1: the one drafting flow at /dashboard/new, with the brief and the generate-from-brief
 * SSE stream mocked. Synthetic text only; no model, no Anthropic. Runs on desktop-1280.
 */
import { expect, mockApi, test } from './fixtures';
import { flowsOnDesktopOnly, seedSignedIn } from './helpers';
import {
  briefResponse,
  generateErrorReply,
  createGate,
  gated,
  generateReply,
  intakeEnabled,
  json,
  sse,
  type MockHandler,
  templateConfigs,
} from './mocks';

flowsOnDesktopOnly();

const MATTER = 'Recover Rs 2,50,000 owed by Mehta Traders for goods supplied in March 2026.';

async function setUp(
  page: import('@playwright/test').Page,
  context: import('@playwright/test').BrowserContext,
  generate: MockHandler = generateReply(undefined, { delayMs: 0 }),
) {
  await seedSignedIn(page, context);
  const calls = await mockApi(page, {
    'GET /api/documents/intake/enabled': json(intakeEnabled()),
    'GET /api/documents/template-configs': json(templateConfigs()),
    'POST /api/documents/intake/brief': json(briefResponse()),
    'POST /api/documents/generate-from-brief': generate,
    'PATCH /api/documents/:id': json({ status: 'success' }),
  });
  return calls;
}

async function toBrief(page: import('@playwright/test').Page) {
  await page.goto('/dashboard/new');
  await page.getByLabel('Your matter').fill(MATTER);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Check your brief' })).toBeVisible();
}

test.describe('new draft', () => {
  test('describe, brief, confirm, generating, draft ready, finalise, export', async ({
    page,
    context,
  }) => {
    const gate = createGate();
    const calls = await setUp(page, context, gated(generateReply(undefined, { delayMs: 0 }), gate));
    await page.goto('/dashboard/new');
    await expect(
      page.getByRole('heading', { level: 1, name: 'What do you need to draft?' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();

    await page.getByLabel('Your matter').fill(MATTER);
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Check your brief' })).toBeVisible();
    // The Ink cost is shown before Confirm.
    await expect(page.getByText('Uses 1 Ink')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm brief and continue' }).click();

    await expect(
      page.getByRole('heading', { level: 1, name: 'Drafting your Legal notice' }),
    ).toBeVisible();
    await expect(page.getByText('Writing the draft')).toBeVisible();
    // The stream waits for the spec, not for a timer.
    gate.release();

    await expect(page.getByRole('heading', { level: 1, name: 'Legal notice' })).toBeVisible();
    await expect(page.getByText('Your draft is ready.')).toBeVisible();
    await expect(page.getByTestId('ink-used-chip')).toContainText('1 Ink used');

    await page.getByRole('button', { name: 'Finalise', exact: true }).click();
    await expect(page.getByTestId('finalised-chip')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export PDF / Word' })).toBeVisible();

    const brief = calls.find((c) => c.path === '/api/documents/intake/brief');
    expect(brief?.body).toMatchObject({ description: MATTER });
    expect(calls.some((c) => c.path === '/api/documents/generate-from-brief')).toBe(true);
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch?.params.id).toBe('doc_e2e_new1');
    expect(patch?.body).toEqual({ status: 'finalised' });
  });

  test('no Ink chip when nothing was debited', async ({ page, context }) => {
    await setUp(
      page,
      context,
      sse(
        [
          { text: 'x' },
          {
            event: 'done',
            data: {
              docId: 'doc_e2e_new1',
              rulePack: true,
              startingDraft: false,
              startingDraftLabel: null,
              labelReason: null,
              missingClauses: [],
              disclaimer: null,
              inkDebited: 0,
            },
          },
        ],
        { delayMs: 0 },
      ),
    );
    await toBrief(page);
    await page.getByRole('button', { name: 'Confirm brief and continue' }).click();
    await expect(page.getByText('Your draft is ready.')).toBeVisible();
    await expect(page.getByTestId('ink-used-chip')).toHaveCount(0);
  });

  test('an error event says no Ink was used and keeps the typed text', async ({
    page,
    context,
  }) => {
    const gate = createGate();
    await setUp(
      page,
      context,
      gated(generateErrorReply('The drafting service could not finish this draft.'), gate),
    );
    await toBrief(page);
    await page.getByRole('button', { name: 'Confirm brief and continue' }).click();
    await expect(page.getByText('Writing the draft')).toBeVisible();
    gate.release();

    await expect(
      page.getByRole('heading', { name: 'The draft did not finish. No Ink was used.' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Back to the brief' }).click();
    await page.getByRole('button', { name: 'Edit my description' }).click();
    await expect(page.getByLabel('Your matter')).toHaveValue(MATTER);
  });

  test('a dropped stream says the connection was lost and makes no Ink claim', async ({
    page,
    context,
  }) => {
    await setUp(page, context, sse([{ text: 'partial' }], { delayMs: 0 }));
    await toBrief(page);
    await page.getByRole('button', { name: 'Confirm brief and continue' }).click();

    await expect(
      page.getByRole('heading', { name: 'Connection lost. Check your documents.' }),
    ).toBeVisible();
    await expect(page.getByText('No Ink was used')).toHaveCount(0);
  });

  test('the prefill key fills the textarea once, is not submitted and is removed', async ({
    page,
    context,
  }) => {
    // setUp has no POST /intake/brief reaction needed: a submit would still be answered, so the
    // assertion is on the calls list.
    const calls = await setUp(page, context);
    await page.addInitScript(() => {
      window.sessionStorage.setItem(
        'lawie:draft-prefill',
        'A bail application for a client arrested on Tuesday.',
      );
    });
    await page.goto('/dashboard/new');
    await expect(page.getByLabel('Your matter')).toHaveValue(
      'A bail application for a client arrested on Tuesday.',
    );
    expect(
      await page.evaluate(() => window.sessionStorage.getItem('lawie:draft-prefill')),
    ).toBeNull();
    expect(calls.some((c) => c.path === '/api/documents/intake/brief')).toBe(false);
    await expect(
      page.getByRole('heading', { level: 1, name: 'What do you need to draft?' }),
    ).toBeVisible();
  });
});
