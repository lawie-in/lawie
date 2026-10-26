import fs from 'node:fs';
import path from 'node:path';

import type { Metadata } from 'next';

import {
  DEMO_DIR,
  DEMO_VIDEO_ASSETS,
  SAMPLE_ENTRIES,
  parseDemoSidecar,
  type DemoSidecar,
} from '@/components/marketing/landing/landing-config';
import { ReadingDeskLanding } from '@/components/marketing/landing/ReadingDeskLanding';
import { SEO_DESCRIPTION, SEO_TITLE } from '@/components/marketing/nl-copy';

// T-517: the Night Library landing (spec 01). SEO title and description: copy §1.1 (the root
// layout title equals the title, Priya 21 Oct).
export const metadata: Metadata = {
  title: SEO_TITLE,
  description: SEO_DESCRIPTION,
};

// T-601 (Rajesh ruling 4): the video and the sample folios render only when their files exist.
// This server component checks apps/web/public (the demo sidecar, demo/demo.json, is
// read here too; Arjun, 26 Oct). The page has no dynamic input, so Next prerenders
// it at `next build`, where the working directory is apps/web; the standalone server (Dockerfile:
// node apps/web/server.js) also runs from apps/web, with public/ copied beside it. Adding a file
// therefore needs a rebuild, which a deploy does anyway.
function hasPublicFile(file: string): boolean {
  try {
    return fs.existsSync(path.join(process.cwd(), 'public', file));
  } catch {
    return false;
  }
}

/** public/demo/demo.json (Arjun), read at build. Missing, unreadable or wrong shape: null. */
function readDemoSidecar(): DemoSidecar | null {
  try {
    const raw = fs.readFileSync(
      path.join(process.cwd(), 'public', DEMO_VIDEO_ASSETS.sidecar.file),
      'utf8',
    );
    return parseDemoSidecar(JSON.parse(raw));
  } catch {
    return null;
  }
}

export default function HomePage() {
  // The video section needs the MP4, a valid sidecar, its poster and the English captions.
  const sidecar = readDemoSidecar();
  const videoAvailable =
    sidecar !== null &&
    hasPublicFile(DEMO_VIDEO_ASSETS.video.file) &&
    hasPublicFile(`${DEMO_DIR}/${sidecar.poster}`) &&
    hasPublicFile(DEMO_VIDEO_ASSETS.captionsEn.file);
  const hindiCaptionsAvailable = videoAvailable && hasPublicFile(DEMO_VIDEO_ASSETS.captionsHi.file);
  const availableSampleIds = SAMPLE_ENTRIES.filter((s) => hasPublicFile(s.file)).map(
    (s) => s.templateId,
  );
  return (
    <ReadingDeskLanding
      videoAvailable={videoAvailable}
      hindiCaptionsAvailable={hindiCaptionsAvailable}
      videoHasAudio={videoAvailable && sidecar !== null && sidecar.hasAudio}
      videoPosterHref={sidecar ? `/${DEMO_DIR}/${sidecar.poster}` : undefined}
      videoDurationS={sidecar?.durationS ?? null}
      availableSampleIds={availableSampleIds}
    />
  );
}
