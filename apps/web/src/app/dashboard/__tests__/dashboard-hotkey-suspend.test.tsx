// T-524 round 2: the Top up modal suspends the dashboard command bar's exclusive Ctrl/Cmd+K, and
// closing it restores the hotkey. While suspended Ctrl+K reaches a window bubble listener (the
// section finder), which is the documented consequence.
import { useRouter } from 'next/navigation';

import { balanceBody, healthy, mountPage, ok, PATHS } from './page-test-setup';

import {
  cleanupMounted,
  click,
  press,
  q,
  qa,
  stubMatchMedia,
} from '@/components/ui/__tests__/nl-test-utils';

const mockApiFetch = jest.fn();
jest.mock('@/lib/apiFetch', () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Asha Rao', email: 'a@example.com', plan: 'free' } }),
}));
jest.mock('@/components/credits/TopUpModal', () => ({
  TopUpModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="topup-modal">
      <button type="button" onClick={onClose}>
        Close top up
      </button>
    </div>
  ),
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

beforeEach(() => {
  jest.clearAllMocks();
  stubMatchMedia();
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn() });
  window.sessionStorage.clear();
});
afterEach(cleanupMounted);

const btn = (c: ParentNode, label: string) =>
  qa('button', c).find((b) => b.textContent === label) as HTMLElement | undefined;
const bar = () => q('[role=combobox]') as HTMLInputElement;

describe('dashboard Ctrl+K and the Top up modal (T-524)', () => {
  it('opening Top up suspends the hotkey; closing it restores it', async () => {
    const finder = jest.fn();
    window.addEventListener('keydown', finder);
    try {
      const { container } = await mountPage(
        mockApiFetch,
        healthy({ [PATHS.balance]: async () => ok(balanceBody(1)) }),
      );

      // before: the bar owns Ctrl+K, the finder (bubble listener) never sees it
      let ev = press(window, { key: 'k', ctrlKey: true });
      expect(ev.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(bar());
      expect(finder).not.toHaveBeenCalled();
      bar().blur();

      // open the modal from the low-Ink nudge
      click(btn(container, 'Top up')!);
      expect(q('[data-testid=topup-modal]')).not.toBeNull();
      bar().blur();

      // suspended: the bar does not take the key, a bubble listener sees it (documented)
      ev = press(window, { key: 'k', ctrlKey: true });
      expect(ev.defaultPrevented).toBe(false);
      expect(finder).toHaveBeenCalledTimes(1);
      expect(document.activeElement).not.toBe(bar());
      ev = press(window, { key: 'k', metaKey: true, shiftKey: true });
      expect(ev.defaultPrevented).toBe(false);
      expect(finder).toHaveBeenCalledTimes(2);

      // close: exclusive again
      click(btn(document.body, 'Close top up')!);
      expect(q('[data-testid=topup-modal]')).toBeNull();
      ev = press(window, { key: 'k', ctrlKey: true });
      expect(ev.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(bar());
      expect(finder).toHaveBeenCalledTimes(2);
    } finally {
      window.removeEventListener('keydown', finder);
    }
  });
});
