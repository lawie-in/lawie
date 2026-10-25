// T-375: the Tools page shows the bail checker and timeline cards only while their flag is on.
// The converter card always shows. The page description names no tool.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import ToolsPage, { metadata } from '../page';

jest.mock('@/components/marketing/SiteNav', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/marketing/SiteFooter', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/marketing/FloatCta', () => ({ __esModule: true, default: () => null }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function flags(tool_timeline: unknown, tool_bail_checker: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ tool_timeline, tool_bail_checker }),
  });
}

async function renderPage() {
  const page = await ToolsPage();
  act(() => root.render(page));
}

const BAIL = 'Bail Eligibility Checker';
const TIMELINE = 'BNSS Investigation Timeline';
const CONVERTER = 'IPC → BNS Converter';

const cardTitles = () =>
  Array.from(container.querySelectorAll('.tool-card h3')).map((h) => h.textContent);
const hasLink = (href: string) => container.querySelector(`a[href="${href}"]`) !== null;

describe('Tools page', () => {
  it('shows all three cards when both flags are on', async () => {
    flags(true, true);
    await renderPage();
    expect(cardTitles()).toEqual([CONVERTER, BAIL, TIMELINE]);
    expect(hasLink('/tools/bail-checker')).toBe(true);
    expect(hasLink('/tools/timeline-tracker')).toBe(true);
    expect(hasLink('/tools/section-converter')).toBe(true);
  });

  it('hides the bail checker card when only its flag is off', async () => {
    flags(true, false);
    await renderPage();
    expect(cardTitles()).toEqual([CONVERTER, TIMELINE]);
    expect(hasLink('/tools/bail-checker')).toBe(false);
    expect(hasLink('/tools/timeline-tracker')).toBe(true);
  });

  it('hides the timeline card when only its flag is off', async () => {
    flags(false, true);
    await renderPage();
    expect(cardTitles()).toEqual([CONVERTER, BAIL]);
    expect(hasLink('/tools/timeline-tracker')).toBe(false);
    expect(hasLink('/tools/bail-checker')).toBe(true);
  });

  it('renders the converter alone when both flags are off', async () => {
    flags(false, false);
    await renderPage();
    expect(cardTitles()).toEqual([CONVERTER]);
    expect(hasLink('/tools/section-converter')).toBe(true);
    expect(hasLink('/tools/bail-checker')).toBe(false);
    expect(hasLink('/tools/timeline-tracker')).toBe(false);
    expect(container.querySelector('.tools-grid--1')).not.toBeNull();
    // The call to action under the cards still renders.
    expect(hasLink('/pricing')).toBe(true);
  });

  it('renders the converter alone when the flags cannot be read', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));
    await renderPage();
    expect(cardTitles()).toEqual([CONVERTER]);
  });

  it('only a literal true shows a card', async () => {
    flags('true', 1);
    await renderPage();
    expect(cardTitles()).toEqual([CONVERTER]);
  });

  it('names no hidden tool anywhere in the page text when both are off', async () => {
    flags(false, false);
    await renderPage();
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/bail/i);
    expect(text).not.toMatch(/timeline/i);
  });

  it('has the description that names no tool', () => {
    // T-564 item 1 (Ajay 22 Oct): signed description.
    expect(metadata.description).toBe('Free legal tools for Indian advocates.');
    expect(String(metadata.description)).not.toMatch(/bail|timeline|converter/i);
  });
});
