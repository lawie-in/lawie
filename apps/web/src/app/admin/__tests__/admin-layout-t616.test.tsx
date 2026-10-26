// T-616: the admin layout sends a signed-out visitor to /login?next=<this page> (pathname only).
import { usePathname, useRouter } from 'next/navigation';

import AdminLayout from '../layout';

import { cleanupMounted, mount } from '@/components/ui/__tests__/nl-test-utils';

let mockAuth: { user: { role: string } | null; isLoading: boolean };
jest.mock('@/context/AuthContext', () => ({ useAuth: () => mockAuth }));

const replace = jest.fn();

function render(path: string, auth: typeof mockAuth) {
  mockAuth = auth;
  (usePathname as jest.Mock).mockReturnValue(path);
  return mount(
    <AdminLayout>
      <div data-testid="child" />
    </AdminLayout>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (useRouter as jest.Mock).mockReturnValue({ push: jest.fn(), replace });
});
afterEach(cleanupMounted);

it('signed out: redirects to /login?next=<pathname>', () => {
  render('/admin/users', { user: null, isLoading: false });
  expect(replace).toHaveBeenCalledWith('/login?next=%2Fadmin%2Fusers');
});

it('signed out: query and hash are never carried into next', () => {
  render('/admin/users?q=secret#x', { user: null, isLoading: false });
  expect(replace).toHaveBeenCalledWith('/login?next=%2Fadmin%2Fusers');
});

it('still loading: no redirect yet', () => {
  render('/admin/users', { user: null, isLoading: true });
  expect(replace).not.toHaveBeenCalled();
});
