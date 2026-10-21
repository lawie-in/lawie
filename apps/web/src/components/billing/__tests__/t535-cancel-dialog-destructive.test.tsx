// T-535 — the confirm dialog keeps the filled destructive; ghost-danger is for the trigger only.
import { CancelPlanDialog } from '../CancelPlanDialog';
import { cleanupMounted, mount } from '@/components/ui/__tests__/nl-test-utils';

afterEach(cleanupMounted);

describe('T-535 CancelPlanDialog', () => {
  it('confirm button is the filled destructive, not ghost-danger', () => {
    mount(
      <CancelPlanDialog
        open
        onOpenChange={jest.fn()}
        date="14 Oct 2026"
        onConfirm={jest.fn()}
        loading={false}
        failed={false}
      />,
    );
    const dlg = document.body.querySelector('[role="alertdialog"], [role="dialog"]')!;
    expect(dlg.querySelector('button[data-variant="destructive"]')).not.toBeNull();
    expect(dlg.querySelector('[data-variant="ghost-danger"]')).toBeNull();
  });
});
