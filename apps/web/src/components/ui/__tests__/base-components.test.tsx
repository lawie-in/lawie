import { act } from 'react';

import {
  Banner,
  BANNER_TONE,
  Button,
  Card,
  Chip,
  Dialog,
  EmptyState,
  ErrorState,
  InkChip,
  Input,
  Skeleton,
  Textarea,
  STILL_WORKING_AFTER_MS,
} from '@/components/ui';

import { cleanupMounted, click, mount, q, qa, stubMatchMedia } from './nl-test-utils';

beforeEach(() => stubMatchMedia());
afterEach(() => {
  cleanupMounted();
  jest.useRealTimers();
});

describe('Button', () => {
  it('defaults to a primary md type=button', () => {
    const { container } = mount(<Button>Save</Button>);
    const b = q('button', container) as HTMLButtonElement;
    expect(b.type).toBe('button');
    expect(b.dataset.variant).toBe('primary');
    expect(b.dataset.size).toBe('md');
    expect(b.className).toContain('h-11');
  });

  it('renders each variant and size distinctly', () => {
    const { container } = mount(
      <>
        <Button variant="ghost">a</Button>
        <Button variant="destructive">b</Button>
        <Button size="sm">c</Button>
      </>,
    );
    const [a, b, c] = qa('button', container) as HTMLButtonElement[];
    expect(a.dataset.variant).toBe('ghost');
    expect(b.dataset.variant).toBe('destructive');
    expect(a.className).not.toBe(b.className);
    expect(c.className).toContain('h-9');
    expect(c.className).not.toContain('h-11');
  });

  it('fires onClick; disabled does not', () => {
    const onClick = jest.fn();
    const { container } = mount(
      <>
        <Button onClick={onClick}>go</Button>
        <Button onClick={onClick} disabled>
          no
        </Button>
      </>,
    );
    const [on, off] = qa('button', container);
    click(on);
    click(off);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect((off as HTMLButtonElement).disabled).toBe(true);
  });

  it('loading disables, sets aria-busy, keeps the label as the accessible name and shows a spinner', () => {
    const onClick = jest.fn();
    const { container } = mount(
      <Button loading onClick={onClick}>
        Save draft
      </Button>,
    );
    const b = q('button', container) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.getAttribute('aria-busy')).toBe('true');
    // label stays in the DOM and not aria-hidden, so the accessible name is unchanged
    expect(b.textContent).toBe('Save draft');
    const label = q('button > span:first-child', container)!;
    expect(label.getAttribute('aria-hidden')).toBeNull();
    expect(label.className).toContain('opacity-0');
    expect(q('svg[aria-hidden=true]', b)).not.toBeNull();
    click(b);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('not loading has no spinner and no aria-busy', () => {
    const { container } = mount(<Button>Save</Button>);
    expect(q('svg', container)).toBeNull();
    expect(q('button', container)!.getAttribute('aria-busy')).toBeNull();
  });
});

describe('Input and Textarea', () => {
  it('associates the label with the control', () => {
    const { container } = mount(<Input label="Full name" />);
    const label = q('label', container) as HTMLLabelElement;
    const input = q('input', container) as HTMLInputElement;
    expect(label.htmlFor).toBe(input.id);
    expect(input.id).toBeTruthy();
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(input.getAttribute('aria-describedby')).toBeNull();
  });

  it('error sets aria-invalid and links the message with aria-describedby', () => {
    const { container } = mount(
      <Input label="Email" error="Enter a valid email" help="We never share it" />,
    );
    const input = q('input', container) as HTMLInputElement;
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const ids = input.getAttribute('aria-describedby')!.split(' ');
    expect(ids).toHaveLength(2);
    const texts = ids.map((id) => document.getElementById(id)!.textContent);
    expect(texts).toEqual(['We never share it', 'Enter a valid email']);
    expect(input.className).toContain('border-nl-err');
  });

  it('help alone is described but not invalid', () => {
    const { container } = mount(<Input label="Name" help="As on your enrolment" />);
    const input = q('input', container) as HTMLInputElement;
    expect(document.getElementById(input.getAttribute('aria-describedby')!)!.textContent).toBe(
      'As on your enrolment',
    );
    expect(input.getAttribute('aria-invalid')).toBeNull();
  });

  it('keeps a caller aria-describedby and a custom id', () => {
    const { container } = mount(<Input id="my-id" label="X" aria-describedby="ext" error="bad" />);
    const input = q('input', container) as HTMLInputElement;
    expect(input.id).toBe('my-id');
    expect((q('label', container) as HTMLLabelElement).htmlFor).toBe('my-id');
    expect(input.getAttribute('aria-describedby')!.split(' ')[0]).toBe('ext');
  });

  it('forwards disabled and the ref', () => {
    const ref = { current: null as HTMLInputElement | null };
    mount(<Input ref={ref} aria-label="Q" disabled />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
    expect(ref.current!.disabled).toBe(true);
  });

  it('Textarea mirrors the same wiring', () => {
    const { container } = mount(<Textarea label="Facts" error="Too short" rows={6} />);
    const ta = q('textarea', container) as HTMLTextAreaElement;
    expect(ta.rows).toBe(6);
    expect(ta.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(ta.getAttribute('aria-describedby')!)!.textContent).toBe(
      'Too short',
    );
    expect((q('label', container) as HTMLLabelElement).htmlFor).toBe(ta.id);
  });

  it('underline and boxed appearances differ', () => {
    const { container } = mount(
      <>
        <Input aria-label="a" appearance="underline" />
        <Input aria-label="b" />
      </>,
    );
    const [u, b] = qa('input', container);
    expect(u.className).toContain('border-b');
    expect(u.className).not.toBe(b.className);
  });
});

describe('Chip and InkChip', () => {
  it.each(['neutral', 'brass', 'ok', 'warn', 'error'] as const)('variant %s', (v) => {
    const { container } = mount(<Chip variant={v}>text</Chip>);
    expect(q('span', container)!.getAttribute('data-variant')).toBe(v);
  });

  it('each variant has its own colour classes', () => {
    const { container } = mount(
      <>
        {(['neutral', 'brass', 'ok', 'warn', 'error'] as const).map((v) => (
          <Chip key={v} variant={v}>
            {v}
          </Chip>
        ))}
      </>,
    );
    const classes = qa('span', container).map((s) => s.className);
    expect(new Set(classes).size).toBe(5);
  });

  it('InkChip renders "{n} Ink" in brass with a decorative dot', () => {
    const { container } = mount(<InkChip balance={32} />);
    expect(container.textContent).toBe('32 Ink');
    expect(q('[data-variant=brass]', container)).not.toBeNull();
    expect(q('[aria-hidden=true]', container)).not.toBeNull();
    expect(q('.tabular-nums', container)!.textContent).toBe('32');
  });

  it('InkChip unit and children overrides', () => {
    const a = mount(<InkChip balance={7} unit="स्याही" />);
    expect(a.container.textContent).toBe('7 स्याही');
    const b = mount(<InkChip balance={7}>Low ink</InkChip>);
    expect(b.container.textContent).toBe('Low ink');
  });
});

describe('Skeleton, EmptyState, ErrorState', () => {
  it('Skeleton renders N bars, is busy, and shows Still working… only after 8s', () => {
    jest.useFakeTimers();
    const { container } = mount(<Skeleton lines={4} />);
    expect(q('[aria-busy=true]', container)).not.toBeNull();
    expect(qa('.nl-skeleton', container)).toHaveLength(4);
    expect(container.textContent).not.toContain('Still working…');
    act(() => {
      jest.advanceTimersByTime(STILL_WORKING_AFTER_MS - 1);
    });
    expect(container.textContent).not.toContain('Still working…');
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(container.textContent).toContain('Still working…');
    expect(q('[role=status]', container)!.textContent).toBe('Still working…');
  });

  it('Skeleton slowText="" never shows the message and the timer is cleared on unmount', () => {
    jest.useFakeTimers();
    const m = mount(<Skeleton slowText="" />);
    act(() => {
      jest.advanceTimersByTime(20000);
    });
    expect(m.container.textContent).toBe('');
    const m2 = mount(<Skeleton />);
    m2.unmount();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('EmptyState shows message and one action that fires', () => {
    const onClick = jest.fn();
    const { container } = mount(
      <EmptyState message="No drafts yet." action={{ label: 'Start a draft', onClick }} />,
    );
    expect(container.textContent).toContain('No drafts yet.');
    click(q('button', container));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('EmptyState without action has no button', () => {
    const { container } = mount(<EmptyState message="Nothing." />);
    expect(q('button', container)).toBeNull();
  });

  it('ErrorState is role=alert with a Retry button that fires', () => {
    const onRetry = jest.fn();
    const { container } = mount(<ErrorState message="Could not load." onRetry={onRetry} />);
    expect(q('[role=alert]', container)!.textContent).toContain('Could not load.');
    const btn = q('button', container)!;
    expect(btn.textContent).toBe('Retry');
    click(btn);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('ErrorState without onRetry has no button; retryLabel overrides', () => {
    const a = mount(<ErrorState message="x" />);
    expect(q('button', a.container)).toBeNull();
    const b = mount(<ErrorState message="x" onRetry={() => undefined} retryLabel="पुनः प्रयास" />);
    expect(q('button', b.container)!.textContent).toBe('पुनः प्रयास');
  });
});

describe('Card', () => {
  it('ready renders children and plain/folio variants differ', () => {
    const { container } = mount(
      <>
        <Card label="Key" title="Title">
          body
        </Card>
        <Card variant="folio">folio</Card>
      </>,
    );
    const [plain, folio] = qa('section', container);
    expect(plain.getAttribute('data-state')).toBe('ready');
    expect(plain.textContent).toContain('body');
    expect(q('h3', plain)!.textContent).toBe('Title');
    expect(folio.getAttribute('data-variant')).toBe('folio');
    expect(folio.className).not.toBe(plain.className);
  });

  it('kpi shows the value as a tabular number', () => {
    const { container } = mount(<Card variant="kpi" label="Ink" value={32} />);
    const v = q('.tabular-nums', container)!;
    expect(v.textContent).toBe('32');
  });

  it('loading shows a skeleton and hides children; no aria-busy on the card (T-524)', () => {
    const { container } = mount(
      <Card state="loading">
        <span>real content</span>
      </Card>,
    );
    expect(q('section', container)!.hasAttribute('aria-busy')).toBe(false);
    expect(container.querySelectorAll('[aria-busy]')).toHaveLength(1);
    expect(q('[aria-busy]', container)!.getAttribute('aria-hidden')).toBe('true');
    expect(qa('.nl-skeleton', container).length).toBeGreaterThan(0);
    expect(container.textContent).not.toContain('real content');
  });

  it('kpi loading shows a single bar and no value', () => {
    const { container } = mount(<Card variant="kpi" state="loading" value={99} />);
    expect(qa('.nl-skeleton', container)).toHaveLength(1);
    expect(container.textContent).not.toContain('99');
  });

  it('empty shows the message and action', () => {
    const onClick = jest.fn();
    const { container } = mount(
      <Card state="empty" emptyMessage="No matters." emptyAction={{ label: 'Add one', onClick }}>
        hidden
      </Card>,
    );
    expect(container.textContent).toContain('No matters.');
    expect(container.textContent).not.toContain('hidden');
    click(q('button', container));
    expect(onClick).toHaveBeenCalled();
  });

  it('error shows the message and Retry', () => {
    const onRetry = jest.fn();
    const { container } = mount(
      <Card state="error" errorMessage="Failed." onRetry={onRetry}>
        hidden
      </Card>,
    );
    expect(q('[role=alert]', container)!.textContent).toContain('Failed.');
    expect(container.textContent).not.toContain('hidden');
    click(q('button', container));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('as renders the requested element', () => {
    const { container } = mount(<Card as="article">x</Card>);
    expect(q('article', container)).not.toBeNull();
  });
});

describe('Banner', () => {
  it('maps kinds to tones and roles', () => {
    expect(BANNER_TONE['payment-failed']).toBe('error');
    for (const k of ['ai-down', 'verify-email', 'privacy-reaccept'] as const)
      expect(BANNER_TONE[k]).toBe('warn');
    const err = mount(<Banner kind="payment-failed" message="Payment failed" />);
    expect(q('[role=alert]', err.container)!.textContent).toContain('Payment failed');
    const warn = mount(<Banner kind="ai-down" message="AI is down" />);
    expect(q('[role=status]', warn.container)).not.toBeNull();
    expect(q('[role=alert]', warn.container)).toBeNull();
  });

  it('tone override wins', () => {
    const { container } = mount(<Banner kind="ai-down" tone="error" message="x" />);
    expect(q('[role=alert]', container)).not.toBeNull();
  });

  it('action fires', () => {
    const onClick = jest.fn();
    const { container } = mount(
      <Banner kind="verify-email" message="m" action={{ label: 'Resend', onClick }} />,
    );
    click(q('button', container));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('dismiss button needs dismissible + onDismiss + label', () => {
    const onDismiss = jest.fn();
    const ok = mount(
      <Banner kind="ai-down" message="m" dismissible onDismiss={onDismiss} dismissLabel="Close" />,
    );
    const btn = q('button[aria-label=Close]', ok.container)!;
    click(btn);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    const noLabel = mount(<Banner kind="ai-down" message="m" dismissible onDismiss={onDismiss} />);
    expect(q('button', noLabel.container)).toBeNull();
    const notDismissible = mount(
      <Banner kind="ai-down" message="m" onDismiss={onDismiss} dismissLabel="Close" />,
    );
    expect(q('button', notDismissible.container)).toBeNull();
  });
});

describe('Dialog', () => {
  const base = { title: 'Cancel plan?', confirmLabel: 'Cancel plan', cancelLabel: 'Keep plan' };

  it('renders nothing when closed', () => {
    mount(
      <Dialog open={false} onOpenChange={() => undefined} onConfirm={() => undefined} {...base} />,
    );
    expect(q('[role=dialog]')).toBeNull();
  });

  it('open renders a titled dialog with description, portalled into body', () => {
    const { container } = mount(
      <Dialog
        open
        onOpenChange={() => undefined}
        onConfirm={() => undefined}
        description="You lose Ink."
        {...base}
      />,
    );
    const dlg = q('[role=dialog]')!;
    expect(container.contains(dlg)).toBe(false);
    expect(document.getElementById(dlg.getAttribute('aria-labelledby')!)!.textContent).toBe(
      'Cancel plan?',
    );
    expect(document.getElementById(dlg.getAttribute('aria-describedby')!)!.textContent).toBe(
      'You lose Ink.',
    );
    expect(dlg.getAttribute('data-variant')).toBe('confirm');
  });

  it('confirm calls onConfirm; cancel calls onOpenChange(false)', () => {
    const onConfirm = jest.fn();
    const onOpenChange = jest.fn();
    mount(<Dialog open onOpenChange={onOpenChange} onConfirm={onConfirm} {...base} />);
    const buttons = qa('[role=dialog] button') as HTMLButtonElement[];
    const confirm = buttons.find((b) => b.textContent === 'Cancel plan')!;
    const cancel = buttons.find((b) => b.textContent === 'Keep plan')!;
    click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
    click(cancel);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('destructive uses the destructive confirm button and ghost cancel', () => {
    mount(
      <Dialog
        open
        variant="destructive"
        onOpenChange={() => undefined}
        onConfirm={() => undefined}
        {...base}
      />,
    );
    const buttons = qa('[role=dialog] button') as HTMLButtonElement[];
    expect(buttons.find((b) => b.textContent === 'Cancel plan')!.dataset.variant).toBe(
      'destructive',
    );
    expect(buttons.find((b) => b.textContent === 'Keep plan')!.dataset.variant).toBe('ghost');
    expect(q('[role=dialog]')!.getAttribute('data-variant')).toBe('destructive');
  });

  it('confirm variant uses a primary confirm button', () => {
    mount(<Dialog open onOpenChange={() => undefined} onConfirm={() => undefined} {...base} />);
    const buttons = qa('[role=dialog] button') as HTMLButtonElement[];
    expect(buttons.find((b) => b.textContent === 'Cancel plan')!.dataset.variant).toBe('primary');
  });

  it('loading disables both buttons, marks confirm busy and ignores close requests', () => {
    const onConfirm = jest.fn();
    const onOpenChange = jest.fn();
    mount(
      <Dialog open confirmLoading onOpenChange={onOpenChange} onConfirm={onConfirm} {...base} />,
    );
    const buttons = qa('[role=dialog] button') as HTMLButtonElement[];
    const confirm = buttons.find((b) => b.textContent === 'Cancel plan')!;
    const cancel = buttons.find((b) => b.textContent === 'Keep plan')!;
    expect(confirm.disabled).toBe(true);
    expect(confirm.getAttribute('aria-busy')).toBe('true');
    expect(cancel.disabled).toBe(true);
    click(confirm);
    click(cancel);
    expect(onConfirm).not.toHaveBeenCalled();
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(q('[role=dialog]')).not.toBeNull();
  });

  it('Escape asks to close when not loading', () => {
    const onOpenChange = jest.fn();
    mount(<Dialog open onOpenChange={onOpenChange} onConfirm={() => undefined} {...base} />);
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows an inline error as an alert', () => {
    mount(
      <Dialog
        open
        error="Could not cancel your plan. Try again."
        onOpenChange={() => undefined}
        onConfirm={() => undefined}
        {...base}
      />,
    );
    expect(q('[role=dialog] [role=alert]')!.textContent).toBe(
      'Could not cancel your plan. Try again.',
    );
  });
});
