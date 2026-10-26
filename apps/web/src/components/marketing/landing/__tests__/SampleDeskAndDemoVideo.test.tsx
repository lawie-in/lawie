// T-601 (d): SampleDesk and DemoVideo, presence props false / true (Rajesh ruling 4, Arjun's sidecar).
import fs from 'fs';
import path from 'path';

import { SampleDesk } from '../SampleDesk';
import { DemoVideo, formatDuration } from '../DemoVideo';
import { ReadingDeskLanding } from '../ReadingDeskLanding';
import { BAIL_SAMPLE, SAMPLE_ENTRIES, parseDemoSidecar, type SampleEntry } from '../landing-config';
import {
  FIXTURE,
  clearMatchMedia,
  norm,
  setConnection,
  setVisibility,
  stubIntersectionObserver,
} from './_helpers';

import { act } from 'react';
import {
  cleanupMounted,
  click,
  mount,
  q,
  qa,
  stubMatchMedia,
} from '@/components/ui/__tests__/nl-test-utils';
import { REDUCED_MOTION_QUERY } from '@/components/ui/motion';

const WIDE = '(min-width: 720px)';

let io: ReturnType<typeof stubIntersectionObserver> | null = null;
beforeEach(() => {
  clearMatchMedia();
  setConnection(undefined);
  setVisibility('visible');
});
afterEach(() => {
  cleanupMounted();
  io?.restore();
  io = null;
  jest.restoreAllMocks();
});

describe('SampleDesk', () => {
  it('absent when no PDF exists', () => {
    mount(<SampleDesk samples={[]} catalogue={FIXTURE} lang="en" />);
    expect(q('section')).toBeNull();
    cleanupMounted();
    mount(<ReadingDeskLanding catalogue={FIXTURE} availableSampleIds={[]} />);
    expect(q('[data-section="samples"]')).toBeNull();
    expect(norm(document.body.textContent)).not.toContain('Sample drafts');
  });

  it('the default list is two samples, never the bail one', () => {
    expect(SAMPLE_ENTRIES.map((s) => s.templateId)).not.toContain('bail_regular');
    expect(SAMPLE_ENTRIES).toHaveLength(2);
    expect(BAIL_SAMPLE.templateId).toBe('bail_regular');
    // A PDF for the bail template does not add a folio: it is not in the list.
    mount(<ReadingDeskLanding catalogue={FIXTURE} availableSampleIds={['bail_regular']} />);
    expect(q('[data-section="samples"]')).toBeNull();
  });

  it('present: flat folios linking to /samples/<id>.pdf, watermark aria-hidden, no shadow', () => {
    mount(
      <ReadingDeskLanding
        catalogue={FIXTURE}
        availableSampleIds={SAMPLE_ENTRIES.map((s) => s.templateId)}
      />,
    );
    const links = qa('a[data-sample]');
    expect(links.map((a) => a.getAttribute('href'))).toEqual(
      SAMPLE_ENTRIES.map((s) => `/samples/${s.templateId}.pdf`),
    );
    for (const a of links) {
      expect(a.className).not.toMatch(/shadow/);
      const w = a.querySelector('span[aria-hidden="true"]')!;
      expect(w.textContent).toBe('SAMPLE');
    }
    expect(q('[data-section="samples"] h2')!.textContent).toBe(
      'Drafts left on the desk for you to read.',
    );
    expect(norm(q('[data-section="samples"]')!.textContent)).toContain(
      'Sample Traders and Sample Packaging Works',
    );
    expect(norm(q('[data-section="samples"]')!.textContent)).toContain(
      'Sample Person 2 and Sample Person 3',
    );
    expect(norm(q('[data-section="samples"]')!.textContent)).not.toContain('Sample Person 1');
  });

  it('0 or 1 existing PDFs render nothing (the section needs at least 2 folios)', () => {
    for (const ids of [[], ['maintenance_bnss_144'], ['legal_notice_breach_of_contract']]) {
      mount(<ReadingDeskLanding catalogue={FIXTURE} availableSampleIds={ids} />);
      expect(q('[data-section="samples"]')).toBeNull();
      expect(qa('a[data-sample]')).toHaveLength(0);
      cleanupMounted();
    }
    mount(<SampleDesk samples={[SAMPLE_ENTRIES[0]]} catalogue={FIXTURE} lang="en" />);
    expect(q('section')).toBeNull();
  });

  it('2 existing PDFs render the two real folios in the centred 2-column grid', () => {
    const ids = SAMPLE_ENTRIES.map((s) => s.templateId);
    mount(<ReadingDeskLanding catalogue={FIXTURE} availableSampleIds={ids} />);
    expect(qa('a[data-sample]').map((a) => a.getAttribute('data-sample'))).toEqual(ids);
    const ul = q('[data-section="samples"] ul')!;
    expect(ul.className).toContain('min-[720px]:grid-cols-2');
    expect(ul.className).not.toContain('min-[720px]:grid-cols-3');
    expect(ul.className).toContain('min-[720px]:mx-auto');
  });

  it('meta line only when pages is known (and "1 pages" is the data problem the copy notes)', () => {
    const noPages = SAMPLE_ENTRIES[0];
    const withPages: SampleEntry = { ...SAMPLE_ENTRIES[1], pages: 6 };
    mount(<SampleDesk samples={[noPages, withPages]} catalogue={FIXTURE} lang="en" />);
    const text = qa('a[data-sample]').map((a) => norm(a.textContent));
    expect(text[0]).not.toMatch(/pages ·/);
    expect(text[1]).toContain('6 pages · English · PDF');
  });

  it('Hindi: eyebrows are the signed names, titles stay English', () => {
    mount(<SampleDesk samples={SAMPLE_ENTRIES} catalogue={FIXTURE} lang="hi" />);
    const a = qa('a[data-sample]');
    expect(a[0].textContent).toContain('नोटिस और उत्तर');
    expect(a[1].textContent).toContain('परिवार और वैवाहिक');
    expect(a[1].querySelector('[lang="en"]')!.textContent).toBe(
      'Maintenance Application (s.144 BNSS)',
    );
  });

  it('the SAMPLE_ENTRIES template ids exist in the drafting catalogue', () => {
    // Text scan: the drafting workspace is not importable from web. A rename there must fail here.
    const dir = path.resolve(__dirname, '../../../../../../drafting/src/config');
    const walk = (d: string): string[] =>
      fs
        .readdirSync(d, { withFileTypes: true })
        .flatMap((e) =>
          e.isDirectory()
            ? walk(path.join(d, e.name))
            : /\.ts$/.test(e.name) && !/test/.test(e.name)
              ? [path.join(d, e.name)]
              : [],
        );
    const all = walk(dir)
      .map((f) => fs.readFileSync(f, 'utf8'))
      .join('\n');
    for (const s of SAMPLE_ENTRIES)
      expect({ id: s.templateId, found: all.includes(s.templateId) }).toEqual({
        id: s.templateId,
        found: true,
      });
  });
});

describe('DemoVideo', () => {
  const props = { available: true, lang: 'en' as const };

  it('absent by default and when available is false', () => {
    mount(<DemoVideo lang="en" />);
    expect(q('video')).toBeNull();
    expect(q('section')).toBeNull();
    cleanupMounted();
    mount(<DemoVideo available={false} hindiCaptions hasAudio lang="en" />);
    expect(q('section')).toBeNull();
    cleanupMounted();
    mount(<ReadingDeskLanding catalogue={FIXTURE} />);
    expect(q('video')).toBeNull();
    expect(q('[data-section="video"]')).toBeNull();
  });

  it('present: muted loop playsinline preload=none, poster, two caption tracks, EN default', () => {
    mount(<DemoVideo {...props} hindiCaptions />);
    const v = q('video') as HTMLVideoElement;
    expect(v.muted).toBe(true);
    expect(v.loop).toBe(true);
    expect(v.getAttribute('preload')).toBe('none');
    expect(v.hasAttribute('playsinline') || v.playsInline).toBe(true);
    expect(v.hasAttribute('autoplay')).toBe(false);
    const tracks = qa('track');
    expect(tracks.map((t) => t.getAttribute('kind'))).toEqual(['captions', 'captions']);
    expect(tracks.map((t) => t.getAttribute('srclang'))).toEqual(['en', 'hi']);
    expect(tracks[0].hasAttribute('default')).toBe(true);
    expect(tracks[1].hasAttribute('default')).toBe(false);
    const img = q('img')!;
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('src')).toBe(v.getAttribute('poster'));
    expect(q('source')!.getAttribute('type')).toBe('video/mp4');
  });

  it('no Hindi file: one track, the chip drops the Hindi part, 10c is the English-only line', () => {
    mount(<DemoVideo {...props} />);
    expect(qa('track')).toHaveLength(1);
    expect(q('[data-captions-chip]')!.textContent).toBe('CC English');
    expect(norm(document.body.textContent)).toContain(
      'Real product, fictional parties. Captions in English.',
    );
    expect(norm(document.body.textContent)).not.toMatch(/Hindi|हिंदी|Loads on play/);
    cleanupMounted();
    mount(<DemoVideo {...props} hindiCaptions />);
    expect(q('[data-captions-chip]')!.textContent).toBe('CC English · हिंदी');
    expect(norm(document.body.textContent)).toContain(
      'Real product, fictional parties. Captions in English and Hindi.',
    );
  });

  it('the sound button is absent by default and present only with hasAudio in the loop state', () => {
    io = stubIntersectionObserver();
    stubMatchMedia({ [WIDE]: true });
    mount(<DemoVideo {...props} />);
    // Poster state: the play button (15-09), present.
    expect(q('button')!.getAttribute('aria-label')).toBe('Play the demo video');
    cleanupMounted();
    const playing = jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    for (const hasAudio of [false, true]) {
      mount(<DemoVideo {...props} hasAudio={hasAudio} />);
      io.show(1);
      act(() => void q('video')!.dispatchEvent(new Event('playing')));
      // Native controls on a silent loop; none while the sound button is the control.
      expect((q('video') as HTMLVideoElement).controls).toBe(!hasAudio);
      const b = q('button');
      if (hasAudio) expect(b!.getAttribute('aria-label')).toBe('Play with sound');
      else expect(b).toBeNull();
      cleanupMounted();
    }
    expect(playing).toHaveBeenCalled();
  });

  it('no visible text on the button, so the aria-label is its name (label-in-name holds)', () => {
    mount(<DemoVideo {...props} />);
    expect(q('button')!.textContent).toBe('');
  });

  it('a press unmutes, shows controls and plays; the loop rules then stop applying', () => {
    const play = jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    mount(<DemoVideo {...props} />);
    click(q('button'));
    const v = q('video') as HTMLVideoElement;
    expect(v.muted).toBe(false);
    expect(v.controls).toBe(true);
    expect(play).toHaveBeenCalled();
    expect(q('button')).toBeNull();
  });

  it('plays muted only while in view; pauses when out of view and when the tab is hidden', () => {
    io = stubIntersectionObserver();
    stubMatchMedia({ [WIDE]: true });
    const play = jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const pause = jest
      .spyOn(HTMLMediaElement.prototype, 'pause')
      .mockImplementation(() => undefined);
    mount(<DemoVideo {...props} />);
    expect(play).not.toHaveBeenCalled();
    io.show(0.5);
    expect(play).toHaveBeenCalledTimes(1);
    expect((q('video') as HTMLVideoElement).muted).toBe(true);
    pause.mockClear();
    setVisibility('hidden');
    expect(pause).toHaveBeenCalled();
    setVisibility('visible');
    expect(play.mock.calls.length).toBeGreaterThanOrEqual(2);
    pause.mockClear();
    io.hide();
    expect(pause).toHaveBeenCalled();
  });

  it('below 720px the loop never starts: the poster-only state with the play button, in view or not', () => {
    io = stubIntersectionObserver();
    stubMatchMedia({ [WIDE]: false });
    const play = jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    mount(<DemoVideo {...props} hasAudio />);
    io.show(1);
    expect(play).not.toHaveBeenCalled();
    expect(q('[data-video-player]')!.getAttribute('data-video-state')).toBe('poster');
    expect(q('button')!.getAttribute('aria-label')).toBe('Play the demo video');
    expect((q('video') as HTMLVideoElement).controls).toBe(false);
    expect(q('video')!.getAttribute('preload')).toBe('none');
  });

  it.each([
    ['Save-Data', { saveData: true }],
    ['2g', { effectiveType: '2g' }],
    ['3g', { effectiveType: '3g' }],
  ])('%s: wide and in view, but no loop; the poster stays', (_n, conn) => {
    io = stubIntersectionObserver();
    stubMatchMedia({ [WIDE]: true });
    setConnection(conn);
    const play = jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    mount(<DemoVideo {...props} />);
    io.show(1);
    expect(play).not.toHaveBeenCalled();
    expect(q('[data-video-player]')!.getAttribute('data-video-state')).toBe('poster');
    setConnection(undefined);
  });

  it('a fast connection on a wide screen loops (control for the two cases above)', () => {
    io = stubIntersectionObserver();
    stubMatchMedia({ [WIDE]: true });
    setConnection({ effectiveType: '4g', saveData: false });
    const play = jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    mount(<DemoVideo {...props} />);
    io.show(1);
    expect(play).toHaveBeenCalledTimes(1);
    setConnection(undefined);
  });

  it('after a press the controls always show, with or without audio', () => {
    jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    for (const hasAudio of [false, true]) {
      mount(<DemoVideo {...props} hasAudio={hasAudio} />);
      click(q('button'));
      expect((q('video') as HTMLVideoElement).controls).toBe(true);
      cleanupMounted();
    }
  });

  it('reduced motion: never plays, the poster stays', () => {
    io = stubIntersectionObserver();
    stubMatchMedia({ [REDUCED_MOTION_QUERY]: true });
    const play = jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    mount(<DemoVideo {...props} />);
    io.show(1);
    expect(play).not.toHaveBeenCalled();
    expect(q('[data-video-player]')!.getAttribute('data-video-state')).toBe('poster');
  });

  it('nothing loads before the press: preload none, the video has no src of its own', () => {
    mount(<DemoVideo {...props} />);
    expect((q('video') as HTMLVideoElement).getAttribute('src')).toBeNull();
    expect(q('video')!.getAttribute('preload')).toBe('none');
  });

  it('the duration chip uses durationS only when it is a positive number', () => {
    mount(<DemoVideo {...props} durationS={90} />);
    expect(norm(q('[data-video-player]')!.textContent)).toContain('1:30');
    for (const bad of [0, -5, null, Number.NaN]) {
      cleanupMounted();
      mount(<DemoVideo {...props} durationS={bad as number | null} />);
      expect(q('[data-video-player]')!.textContent).not.toMatch(/\d:\d\d/);
    }
    expect(formatDuration(0)).toBeNull();
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBeNull();
    expect(formatDuration(59.6)).toBe('1:00');
  });

  it('the poster named by the sidecar is the one used', () => {
    mount(<DemoVideo {...props} posterHref="/demo/cover.jpg" />);
    expect(q('img')!.getAttribute('src')).toBe('/demo/cover.jpg');
    expect(q('video')!.getAttribute('poster')).toBe('/demo/cover.jpg');
  });
});

describe('parseDemoSidecar fails closed', () => {
  const good = { hasAudio: false, durationS: 0, poster: 'demo-poster.jpg' };
  it('accepts the agreed shape; durationS 0 becomes null', () => {
    expect(parseDemoSidecar(good)).toEqual({
      hasAudio: false,
      durationS: null,
      poster: 'demo-poster.jpg',
    });
    expect(parseDemoSidecar({ ...good, hasAudio: true, durationS: 88 })).toEqual({
      hasAudio: true,
      durationS: 88,
      poster: 'demo-poster.jpg',
    });
  });
  it.each([
    [null],
    ['x'],
    [[]],
    [42],
    [{}],
    [{ ...good, hasAudio: 'yes' }],
    [{ ...good, hasAudio: undefined }],
    [{ ...good, durationS: '5' }],
    [{ ...good, durationS: Number.NaN }],
    [{ ...good, poster: 42 }],
    [{ ...good, poster: '../x.jpg' }],
    [{ ...good, poster: 'dir/x.jpg' }],
    [{ ...good, poster: 'x.png' }],
    [{ ...good, poster: '.hidden.jpg' }],
  ])('rejects %j', (raw) => {
    expect(parseDemoSidecar(raw)).toBeNull();
  });
});
