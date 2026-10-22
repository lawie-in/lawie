// T-565 item 33 (Ajay, pre-Anushka review): the low-Ink nudge is never shown to an unverified
// user. It shows only once GET /api/auth/me confirms emailVerified === true or hasGoogle === true;
// loading, a failed /me, or missing fields all keep it hidden (fail closed).
import { isVerifiedAccount, LowInkNudge } from '../LowInkNudge';

import { flush, notOk, ok } from './dash-test-utils';

import { cleanupMounted, mount, stubMatchMedia } from '@/components/ui/__tests__/nl-test-utils';

const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

beforeEach(() => {
  mockApiFetch.mockReset();
  stubMatchMedia();
});
afterEach(cleanupMounted);

async function renderNudge() {
  const m = mount(
    <LowInkNudge balance={0} tier="free" renewsOn="" onTopUp={jest.fn()} onDismiss={jest.fn()} />,
  );
  await flush();
  return m;
}
const shown = (c: ParentNode) => c.querySelector('[data-low-ink]') !== null;

describe('LowInkNudge is hidden unless /me confirms a verified account', () => {
  it('shows for an email-verified account, and asks /me exactly once per mount', async () => {
    mockApiFetch.mockResolvedValue(ok({ data: { emailVerified: true, hasGoogle: false } }));
    const { container } = await renderNudge();
    expect(shown(container)).toBe(true);
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockApiFetch.mock.calls[0][0]).toBe('/api/auth/me');
  });

  it('shows for a Google account whose emailVerified is not set', async () => {
    mockApiFetch.mockResolvedValue(ok({ data: { emailVerified: false, hasGoogle: true } }));
    expect(shown((await renderNudge()).container)).toBe(true);
  });

  it('is hidden for an unverified account (no 5 Ink line for someone who never got the 5)', async () => {
    mockApiFetch.mockResolvedValue(ok({ data: { emailVerified: false, hasGoogle: false } }));
    const { container } = await renderNudge();
    expect(shown(container)).toBe(false);
    expect(container.textContent).not.toContain('5 Ink');
  });

  it('is hidden when /me lacks both fields (unknown)', async () => {
    mockApiFetch.mockResolvedValue(ok({ data: { email: 'a@b.in' } }));
    expect(shown((await renderNudge()).container)).toBe(false);
  });

  it.each([
    ['null body', ok(null)],
    ['no data', ok({})],
    ['truthy strings, not true', ok({ data: { emailVerified: 'true', hasGoogle: 1 } })],
  ])('is hidden for %s', async (_n, res) => {
    mockApiFetch.mockResolvedValue(res);
    expect(shown((await renderNudge()).container)).toBe(false);
  });

  it('is hidden when /me answers non-OK', async () => {
    mockApiFetch.mockResolvedValue(notOk(500));
    expect(shown((await renderNudge()).container)).toBe(false);
  });

  it('is hidden when /me rejects (network down)', async () => {
    mockApiFetch.mockRejectedValue(new Error('offline'));
    expect(shown((await renderNudge()).container)).toBe(false);
  });

  it('is hidden when /me returns invalid JSON', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('bad json');
      },
    });
    expect(shown((await renderNudge()).container)).toBe(false);
  });

  it('is hidden while /me is still loading, and does not set state after unmount', async () => {
    let resolve!: (v: unknown) => void;
    mockApiFetch.mockReturnValue(new Promise((r) => (resolve = r)));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { container, unmount } = await renderNudge();
    expect(shown(container)).toBe(false);
    unmount();
    resolve(ok({ data: { emailVerified: true } }));
    await flush();
    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

describe('isVerifiedAccount', () => {
  it.each([
    [{ emailVerified: true }, true],
    [{ hasGoogle: true }, true],
    [{ emailVerified: false, hasGoogle: false }, false],
    [{}, false],
    [{ emailVerified: 'true' }, false],
    [null, false],
    [undefined, false],
    ['x', false],
  ])('%j -> %s', (v, want) => {
    expect(isVerifiedAccount(v)).toBe(want);
  });
});
