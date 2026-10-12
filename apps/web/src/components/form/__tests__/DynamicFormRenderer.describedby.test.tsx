/* eslint-disable @typescript-eslint/no-explicit-any */
// T-343 round 6: the last-step submit button points at the privacy P7 box via aria-describedby.
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';

import DynamicFormRenderer, { TemplateConfig } from '../DynamicFormRenderer';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const config = {
  template_id: 't',
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
  (global as any).fetch = jest.fn(async () => ({ json: async () => ({}) }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function mount(props: { submitDescribedBy?: string }) {
  act(() => {
    root.render(
      <DynamicFormRenderer config={config} onSubmit={jest.fn()} onCancel={jest.fn()} {...props} />,
    );
  });
}
function primary(): HTMLButtonElement {
  const buttons = Array.from(container.querySelectorAll('button'));
  return buttons.find((b) =>
    /^(Next|Generate document)/.test(b.textContent ?? ''),
  ) as HTMLButtonElement;
}
function next() {
  act(() => primary().click());
}

describe('DynamicFormRenderer submitDescribedBy', () => {
  it('does not set aria-describedby on an earlier step', () => {
    mount({ submitDescribedBy: 'reaccept-p7-generate' });
    expect(primary().textContent).toContain('Next');
    expect(primary().hasAttribute('aria-describedby')).toBe(false);
  });

  it('sets aria-describedby on the Generate button of the last step', () => {
    mount({ submitDescribedBy: 'reaccept-p7-generate' });
    next();
    expect(primary().textContent).toContain('Generate document');
    expect(primary().getAttribute('aria-describedby')).toBe('reaccept-p7-generate');
  });

  it('sets nothing on any step when the prop is absent', () => {
    mount({});
    expect(primary().hasAttribute('aria-describedby')).toBe(false);
    next();
    expect(primary().textContent).toContain('Generate document');
    expect(primary().hasAttribute('aria-describedby')).toBe(false);
  });
});
