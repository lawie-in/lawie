// T-535 — "Ghost, danger" Button variant (Rajesh) and where it is used.
import { act } from 'react';

import { Button } from '../Button';
import { NL_GHOST_HOVER, NL_PRIMARY_BUTTON_HOVER } from '../hover';
import { cleanupMounted, mount } from './nl-test-utils';

afterEach(cleanupMounted);

const cls = (v: 'primary' | 'ghost' | 'destructive' | 'ghost-danger') =>
  mount(<Button variant={v}>x</Button>).container.querySelector('button')!;

describe('T-535 Button ghost-danger', () => {
  it('has data-variant and Rust (--err) text and border on a transparent fill', () => {
    const b = cls('ghost-danger');
    expect(b.dataset.variant).toBe('ghost-danger');
    expect(b.className).toContain('bg-transparent');
    expect(b.className).toContain('text-[color:var(--err)]');
    expect(b.className).toContain('border-[color:var(--err)]');
  });

  it('hover background is --err-light, gated to real hover pointers', () => {
    const b = cls('ghost-danger');
    expect(b.className).toContain(
      '[@media(hover:hover)_and_(pointer:fine)]:[&:not([aria-disabled=true])]:enabled:hover:bg-[color:var(--err-light)]',
    );
    // no ungated hover background
    expect(
      b.className
        .split(/\s+/)
        .filter((c) => c.includes('hover:bg-'))
        .every((c) => c.startsWith('[@media(hover:hover)')),
    ).toBe(true);
  });

  it('has no lift and no halo', () => {
    const b = cls('ghost-danger');
    expect(b.className).not.toMatch(/translate-y/);
    expect(b.className).not.toContain('shadow-nl-halo');
  });

  // T-531 (Rajesh): lift and halo are primary-only. Ghost takes the non-lift hover, destructive
  // has none; none of the three uses --err.
  it('primary still lifts with the halo and does not use --err', () => {
    const b = cls('primary');
    expect(b.className).toContain(NL_PRIMARY_BUTTON_HOVER);
    expect(b.className).toContain('enabled:hover:shadow-nl-halo');
    expect(b.className).toContain('enabled:hover:-translate-y-px');
    expect(b.className).not.toContain('var(--err');
  });

  it('ghost uses NL_GHOST_HOVER: no lift, no halo, and does not use --err', () => {
    const b = cls('ghost');
    expect(b.className).toContain(NL_GHOST_HOVER);
    expect(b.className).not.toMatch(/translate-y/);
    expect(b.className).not.toContain('shadow-nl-halo');
    expect(b.className).not.toContain('var(--err');
  });

  it('destructive has no hover lift or halo and does not use --err', () => {
    const b = cls('destructive');
    expect(b.className).not.toMatch(/translate-y/);
    expect(b.className).not.toContain('shadow-nl-halo');
    expect(b.className).not.toContain('var(--err');
  });

  it('ghost keeps its Control Line border; destructive keeps the filled Oxblood', () => {
    expect(cls('ghost').className).toContain('border-[color:var(--line-control)]');
    expect(cls('destructive').className).toContain('bg-nl-ox');
  });

  it('is still a working button', () => {
    const onClick = jest.fn();
    const { container } = mount(
      <Button variant="ghost-danger" onClick={onClick}>
        Go
      </Button>,
    );
    act(() => container.querySelector('button')!.click());
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
