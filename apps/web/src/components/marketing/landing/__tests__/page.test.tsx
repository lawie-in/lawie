// T-601 (e): the server component checks public/ for the video and the samples. fs is mocked, so no
// real file is needed. Missing, unreadable or malformed sidecar: no video section, no throw.
import { isValidElement, type ReactElement } from 'react';

const files = new Map<string, string>();
jest.mock('node:fs', () => {
  const rel = (p: string) => p.replace(/^.*\/public\//, '');
  const fake = {
    existsSync: (p: string) => files.has(rel(p)),
    readFileSync: (p: string) => {
      const v = files.get(rel(p));
      if (v === undefined) throw new Error('ENOENT');
      return v;
    },
  };
  return { __esModule: true, default: fake, ...fake };
});

import HomePage, { metadata } from '@/app/(marketing)/page';

import { SEO_DESCRIPTION, SEO_TITLE } from '@/components/marketing/nl-copy';
import { cleanupMounted, mount, q, qa } from '@/components/ui/__tests__/nl-test-utils';

const SIDECAR = JSON.stringify({ hasAudio: false, durationS: 0, poster: 'demo-poster.jpg' });
const videoFiles = (sidecar: string | null = SIDECAR) => {
  files.set('demo/demo.mp4', 'x');
  files.set('demo/demo-poster.jpg', 'x');
  files.set('demo/demo.en.vtt', 'x');
  if (sidecar !== null) files.set('demo/demo.json', sidecar);
};
const props = () => (HomePage() as ReactElement<Record<string, unknown>>).props;

beforeEach(() => files.clear());
afterEach(() => cleanupMounted());

describe('metadata', () => {
  it('is unchanged: SEO_TITLE and SEO_DESCRIPTION', () => {
    expect(metadata).toEqual({ title: SEO_TITLE, description: SEO_DESCRIPTION });
    expect(SEO_TITLE).toBe('Lawie: drafting assistant for advocates in India');
  });
});

describe('nothing present', () => {
  it('no video, no samples, no throw', () => {
    expect(isValidElement(HomePage())).toBe(true);
    expect(props()).toMatchObject({
      videoAvailable: false,
      hindiCaptionsAvailable: false,
      videoHasAudio: false,
      availableSampleIds: [],
    });
    mount(<HomePage />);
    expect(q('video')).toBeNull();
    expect(q('[data-section="video"]')).toBeNull();
    expect(q('[data-section="samples"]')).toBeNull();
    expect(q('h1')).not.toBeNull();
  });
});

describe('the video needs the MP4 AND a valid sidecar (Arjun)', () => {
  it('MP4 without the sidecar: no section', () => {
    videoFiles(null);
    expect(props().videoAvailable).toBe(false);
    mount(<HomePage />);
    expect(q('video')).toBeNull();
  });

  it('sidecar without the MP4: no section', () => {
    files.set('demo/demo.json', SIDECAR);
    files.set('demo/demo-poster.jpg', 'x');
    files.set('demo/demo.en.vtt', 'x');
    expect(props().videoAvailable).toBe(false);
  });

  it.each([
    ['invalid JSON', '{nope'],
    ['empty file', ''],
    ['an array', '[]'],
    ['null', 'null'],
    ['missing hasAudio', '{"durationS":0,"poster":"demo-poster.jpg"}'],
    ['hasAudio not boolean', '{"hasAudio":"true","durationS":0,"poster":"demo-poster.jpg"}'],
    ['durationS not a number', '{"hasAudio":true,"durationS":"9","poster":"demo-poster.jpg"}'],
    ['poster path escape', '{"hasAudio":true,"durationS":9,"poster":"../../etc/x.jpg"}'],
    ['poster missing', '{"hasAudio":true,"durationS":9}'],
  ])('a sidecar with %s: no section, no throw (fail closed)', (_n, body) => {
    videoFiles(body);
    expect(() => HomePage()).not.toThrow();
    expect(props().videoAvailable).toBe(false);
    expect(props().videoHasAudio).toBe(false);
    mount(<HomePage />);
    expect(q('video')).toBeNull();
  });

  it('the sidecar names a poster that does not exist: no section', () => {
    videoFiles(JSON.stringify({ hasAudio: false, durationS: 0, poster: 'gone.jpg' }));
    expect(props().videoAvailable).toBe(false);
  });

  it('English captions are required', () => {
    videoFiles();
    files.delete('demo/demo.en.vtt');
    expect(props().videoAvailable).toBe(false);
  });

  it('files plus a valid sidecar: the section renders, no sound button (hasAudio false)', () => {
    videoFiles();
    expect(props()).toMatchObject({
      videoAvailable: true,
      videoHasAudio: false,
      hindiCaptionsAvailable: false,
    });
    mount(<HomePage />);
    expect(q('video')).not.toBeNull();
    expect(qa('track')).toHaveLength(1);
  });

  it('hasAudio true is passed through; false or the wrong type never enables it', () => {
    videoFiles(JSON.stringify({ hasAudio: true, durationS: 12.4, poster: 'demo-poster.jpg' }));
    expect(props()).toMatchObject({
      videoAvailable: true,
      videoHasAudio: true,
      videoDurationS: 12.4,
    });
    videoFiles(JSON.stringify({ hasAudio: 1, durationS: 12, poster: 'demo-poster.jpg' }));
    expect(props().videoHasAudio).toBe(false);
  });

  it('durationS is used only when positive', () => {
    videoFiles(JSON.stringify({ hasAudio: false, durationS: -3, poster: 'demo-poster.jpg' }));
    expect(props().videoDurationS).toBeNull();
    videoFiles(JSON.stringify({ hasAudio: false, durationS: 0, poster: 'demo-poster.jpg' }));
    expect(props().videoDurationS).toBeNull();
  });

  it('the Hindi track is optional and adds the second track', () => {
    videoFiles();
    files.set('demo/demo.hi.vtt', 'x');
    expect(props().hindiCaptionsAvailable).toBe(true);
    mount(<HomePage />);
    expect(qa('track')).toHaveLength(2);
  });

  it('a Hindi track without the video does not make the section appear', () => {
    files.set('demo/demo.hi.vtt', 'x');
    expect(props()).toMatchObject({ videoAvailable: false, hindiCaptionsAvailable: false });
  });
});

describe('samples', () => {
  it('0 or 1 PDFs under public/samples/ render no samples section', () => {
    expect(props().availableSampleIds).toEqual([]);
    mount(<HomePage />);
    expect(q('[data-section="samples"]')).toBeNull();
    cleanupMounted();
    files.set('samples/maintenance_bnss_144.pdf', 'x');
    expect(props().availableSampleIds).toEqual(['maintenance_bnss_144']);
    mount(<HomePage />);
    expect(qa('a[data-sample]')).toHaveLength(0);
    expect(q('[data-section="samples"]')).toBeNull();
  });

  it('2 PDFs render the two folios', () => {
    files.set('samples/maintenance_bnss_144.pdf', 'x');
    files.set('samples/legal_notice_breach_of_contract.pdf', 'x');
    expect(props().availableSampleIds).toEqual([
      'legal_notice_breach_of_contract',
      'maintenance_bnss_144',
    ]);
    mount(<HomePage />);
    expect(qa('a[data-sample]')).toHaveLength(2);
  });
});
