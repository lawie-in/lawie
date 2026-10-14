// T-388 AC1 and AC3: the Ink cost line under "Generate document", and the block when it is unknown.
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

import { INK_COST_LOADING, INK_COST_RECHECK, INK_COST_UNKNOWN } from '../../intake/InkCostLine';
import DynamicFormRenderer, { SUBMIT_INK_COST_ID, TemplateConfig } from '../DynamicFormRenderer';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockCapture = jest.fn();
jest.mock('@sentry/nextjs', () => ({
  captureMessage: (...a: unknown[]) => mockCapture(...a),
}));

const config = {
  template_id: 'config_tpl',
  display_name: 'Test form',
  supported_languages: ['en'],
  form_schema: {
    steps: [
      {
        step: 1,
        title: 'One',
        fields: [{ field_id: 'a', label: 'A', type: 'text', required: false }],
      },
      {
        step: 2,
        title: 'Two',
        fields: [{ field_id: 'b', label: 'B', type: 'text', required: false }],
      },
    ],
  },
} as unknown as TemplateConfig;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  jest.clearAllMocks();
  (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({
    json: async () => ({}),
  }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

type Extra = {
  inkCost?: number;
  inkCostLoading?: boolean;
  onInkCostRetry?: () => void;
  templateId?: string;
};
function mount(extra: Extra, onSubmit = jest.fn()) {
  act(() => {
    root.render(
      <DynamicFormRenderer config={config} onSubmit={onSubmit} onCancel={jest.fn()} {...extra} />,
    );
  });
}
function primary(): HTMLButtonElement {
  return Array.from(container.querySelectorAll('button')).find((b) =>
    /^(Next|Generate document)/.test(b.textContent ?? ''),
  ) as HTMLButtonElement;
}
const line = () => container.querySelector(`#${SUBMIT_INK_COST_ID}`);
const toLastStep = () => act(() => primary().click());

describe('DynamicFormRenderer Ink cost (T-388)', () => {
  it('Next on a non-last step shows no cost line and is not held', () => {
    mount({ inkCost: undefined });
    expect(primary().textContent).toContain('Next');
    expect(line()).toBeNull();
    expect(container.textContent).not.toContain(INK_COST_UNKNOWN);
    expect(primary().disabled).toBe(false);
    expect(primary().hasAttribute('aria-disabled')).toBe(false);
    expect(mockCapture).not.toHaveBeenCalled();
    toLastStep();
    expect(primary().textContent).toContain('Generate document');
  });

  it('known: the last step shows "Uses N Ink" under Generate and submits', () => {
    const onSubmit = jest.fn();
    mount({ inkCost: 4 }, onSubmit);
    toLastStep();
    expect(line()?.textContent).toBe('Uses 4 Ink');
    const btn = primary();
    expect(btn.getAttribute('aria-describedby')).toContain(SUBMIT_INK_COST_ID);
    expect(btn.disabled).toBe(false);
    // the line sits after the button in the same column
    expect(btn.compareDocumentPosition(line()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    act(() => btn.click());
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it.each([undefined, 0])(
    'unknown (cost %p): Generate is disabled and aria-disabled, notice shows, nothing submits',
    (inkCost) => {
      const onSubmit = jest.fn();
      mount({ inkCost, templateId: 'bail_regular' }, onSubmit);
      toLastStep();
      const btn = primary();
      expect(btn.disabled).toBe(true);
      expect(btn.getAttribute('aria-disabled')).toBe('true');
      expect(btn.getAttribute('aria-describedby')).toContain(SUBMIT_INK_COST_ID);
      expect(line()?.getAttribute('role')).toBe('alert');
      expect(line()?.textContent).toContain(INK_COST_UNKNOWN);
      expect(container.textContent).not.toMatch(/Uses \d+ Ink/);
      act(() => btn.click());
      expect(onSubmit).not.toHaveBeenCalled();
    },
  );

  it('unknown: reports to Sentry with the template id and action submit, once', () => {
    mount({ inkCost: undefined, templateId: 'bail_regular' });
    expect(mockCapture).not.toHaveBeenCalled(); // not on a non-last step
    toLastStep();
    expect(mockCapture).toHaveBeenCalledTimes(1);
    expect(mockCapture.mock.calls[0][1].tags).toEqual({ kind: 'bail_regular', action: 'submit' });
  });

  it('unknown: falls back to the config template id for Sentry', () => {
    mount({ inkCost: undefined });
    toLastStep();
    expect(mockCapture.mock.calls[0][1].tags).toEqual({ kind: 'config_tpl', action: 'submit' });
  });

  it('unknown: the re-fetch link calls onInkCostRetry', () => {
    const onInkCostRetry = jest.fn();
    mount({ inkCost: undefined, onInkCostRetry });
    toLastStep();
    const retry = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === INK_COST_RECHECK,
    ) as HTMLButtonElement;
    act(() => retry.click());
    expect(onInkCostRetry).toHaveBeenCalledTimes(1);
  });

  it('loading: status line, Generate held, nothing submits, no Sentry report', () => {
    const onSubmit = jest.fn();
    mount({ inkCost: undefined, inkCostLoading: true }, onSubmit);
    toLastStep();
    expect(line()?.getAttribute('role')).toBe('status');
    expect(line()?.textContent).toContain(INK_COST_LOADING);
    expect(primary().disabled).toBe(true);
    expect(primary().getAttribute('aria-disabled')).toBe('true');
    act(() => primary().click());
    expect(onSubmit).not.toHaveBeenCalled();
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('the cost arriving releases Generate', () => {
    const onSubmit = jest.fn();
    mount({ inkCost: undefined, inkCostLoading: true }, onSubmit);
    toLastStep();
    mount({ inkCost: 2 }, onSubmit);
    expect(primary().disabled).toBe(false);
    expect(line()?.textContent).toBe('Uses 2 Ink');
    act(() => primary().click());
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
