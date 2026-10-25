// T-375: the bail checker and timeline tracker layouts are hidden (notFound) while their flag
// is off, when the flag cannot be read, and when the answer is malformed; they render their
// children when on. The flag is UX only; the tool APIs 404 on the server as well.
import { notFound } from 'next/navigation';

import BailCheckerLayout from '../bail-checker/layout';
import TimelineLayout from '../timeline-tracker/layout';

const notFoundMock = notFound as unknown as jest.Mock;

type Flags = { tool_timeline?: unknown; tool_bail_checker?: unknown };

function replyWith(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  });
}

const layouts: Array<
  [string, (p: { children: React.ReactNode }) => Promise<React.ReactNode>, keyof Flags, keyof Flags]
> = [
  ['bail-checker', BailCheckerLayout as never, 'tool_bail_checker', 'tool_timeline'],
  ['timeline-tracker', TimelineLayout as never, 'tool_timeline', 'tool_bail_checker'],
];

describe.each(layouts)('%s layout', (_name, Layout, own, other) => {
  const KIDS = 'the tool page';

  beforeEach(() => {
    notFoundMock.mockReset();
  });

  it('renders its children and does not 404 when its flag is on', async () => {
    replyWith({ tool_timeline: true, tool_bail_checker: true });
    const out = await Layout({ children: KIDS });
    expect(out).toBe(KIDS);
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('is on from its own flag only, whatever the other tool says', async () => {
    replyWith({ [own]: true, [other]: false });
    expect(await Layout({ children: KIDS })).toBe(KIDS);
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it('calls notFound when its flag is off', async () => {
    replyWith({ [own]: false, [other]: true });
    await Layout({ children: KIDS });
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it('calls notFound when both are off', async () => {
    replyWith({ tool_timeline: false, tool_bail_checker: false });
    await Layout({ children: KIDS });
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it('calls notFound when the fetch fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));
    await Layout({ children: KIDS });
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it.each([404, 500, 503])(
    'calls notFound on a %i answer, even with a body that says on',
    async (status) => {
      replyWith({ tool_timeline: true, tool_bail_checker: true }, { ok: false, status });
      await Layout({ children: KIDS });
      expect(notFoundMock).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ['null', null],
    ['a string', 'on'],
    ['an array', [true, true]],
    ['an empty object', {}],
    ['the string "true"', { tool_timeline: 'true', tool_bail_checker: 'true' }],
    ['the number 1', { tool_timeline: 1, tool_bail_checker: 1 }],
    ['nested values', { tool_timeline: { on: true }, tool_bail_checker: { on: true } }],
  ])('calls notFound on a malformed body (%s)', async (_n, body) => {
    replyWith(body);
    await Layout({ children: KIDS });
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it('calls notFound when the body is not JSON', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    });
    await Layout({ children: KIDS });
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it('reads the public features endpoint, revalidating every 60 seconds', async () => {
    replyWith({ tool_timeline: true, tool_bail_checker: true });
    await Layout({ children: KIDS });
    const [url, opts] = (global.fetch as jest.Mock).mock.calls[0];
    expect(String(url)).toMatch(/\/api\/sections\/features$/);
    expect(opts).toMatchObject({ next: { revalidate: 60 } });
  });
});
