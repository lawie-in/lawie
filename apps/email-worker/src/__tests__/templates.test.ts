/**
 * Template registry shape tests. The full render() integration belongs to
 * @react-email's own test suite; here we only verify the registry exposes
 * the right ids and the subject/Body callables produce sensible output.
 */
import { listTemplates } from '../templates';
import { authWelcomeTemplate } from '../templates/auth/welcome';

describe('email-worker template registry', () => {
  it('exposes auth.welcome in the registered list', () => {
    expect(listTemplates()).toContain('auth.welcome');
  });

  it('auth.welcome subject interpolates the advocate name', () => {
    const s = authWelcomeTemplate.subject({ name: 'Adv. Anand' });
    expect(s).toMatch(/Adv\. Anand/);
  });

  it('auth.welcome subject falls back to "Advocate" when name missing', () => {
    const s = authWelcomeTemplate.subject({});
    expect(s).toMatch(/Advocate/);
  });

  it('auth.welcome Body() returns a React element', () => {
    const element = authWelcomeTemplate.Body({
      name: 'Test',
      loginUrl: 'https://lawie.in/login',
    });
    expect(element).toBeDefined();
    expect(typeof element).toBe('object');
    // React elements carry a $$typeof Symbol
    expect((element as unknown as Record<string, unknown>)['$$typeof']).toBeDefined();
  });
});
