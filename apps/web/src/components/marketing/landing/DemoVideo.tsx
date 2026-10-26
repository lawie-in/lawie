'use client';

// T-601: the demo video, "the long version" (spec §5 as updated by Rajesh at b54420b8, Arjun's
// constraints). The section exists only when the real files exist (page.tsx checks public/demo/
// on the server and passes `available`); no file, no section.
// - The JPEG poster (<img loading="lazy">) is the visual and the LCP candidate. Over it, a
//   <video muted loop playsinline preload="none"> with the poster, the EN caption track and, when
//   its file exists, the HI one, captions on by default (the loop is silent).
// - The loop starts muted only while the player is in view, the tab is visible and reduced motion
//   is not set; it pauses when any of those stops. Under reduced motion the poster stays.
// - The brass button: in the poster-only state M-LP-15-09 (a press plays with controls). In the
//   loop state it unmutes and shows the native controls, labelled M-LP-15-09b, and only when the
//   file has an audio track (`hasAudio`, default false; Priya: the v2 script is captions only).
//   Sound only ever after a press. The button has no visible text, so its aria-label is its name.
// - Chips: M-LP-15-10 (हिंदी only with the Hindi track, Ajay's condition) and the duration from the
//   sidecar's durationS when positive (no duration in copy).
// - hasAudio, the poster and durationS come from public/demo/demo.json, read by page.tsx at build.
// - The note: M-LP-10c (English track) or M-LP-10c-hi (with the Hindi track), AJ-601-F2/F4.
// - M-LP-15-09b ships only when the sidecar says the file has audio (AJ-601-F7).

import { useEffect, useRef, useState } from 'react';

import { isSlowConnection } from './HeroFolio';
import { DEMO_VIDEO_ASSETS, LANDING_STYLE } from './landing-config';
import { LP, captionsChip, tr, videoNote } from './landing-copy';
import { useInView } from './useInView';

import { landingCopy, type Lang } from '@/components/marketing/nl-copy';
import { Chip, useMediaQuery, usePageVisible, usePrefersReducedMotion } from '@/components/ui';
import { cn } from '@/lib/cn';

export interface DemoVideoProps {
  /** The MP4, the poster and the English captions exist. Default false: nothing renders. */
  available?: boolean;
  /** The Hindi caption file exists. */
  hindiCaptions?: boolean;
  /** The MP4 has an audio track: shows the "Play with sound" button in the loop state. */
  hasAudio?: boolean;
  /** Poster URL (the sidecar's `poster` in public/demo/). */
  posterHref?: string;
  /** Duration in seconds (sidecar); null or not positive: no duration chip. */
  durationS?: number | null;
  lang: Lang;
}

/** The muted loop runs only from this width (spec §5 phone budget). */
export const LOOP_MIN_WIDTH_QUERY = '(min-width: 720px)';

/** 90.4 -> "1:30". */
export function formatDuration(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function safePlay(v: HTMLVideoElement) {
  const p = typeof v.play === 'function' ? v.play() : undefined;
  // A blocked play() leaves the poster (or the controls) on screen; nothing else to do.
  if (p && typeof p.catch === 'function') p.catch(() => undefined);
}

export function DemoVideo({
  available = false,
  hindiCaptions = false,
  hasAudio = false,
  posterHref = '/demo/demo-poster.jpg',
  durationS = null,
  lang,
}: DemoVideoProps) {
  const playerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const reduced = usePrefersReducedMotion();
  const visible = usePageVisible();
  const inView = useInView(playerRef, { threshold: 0.25, fallback: false, enabled: available });
  /** The advocate pressed the button: sound and controls; the loop rules no longer apply. */
  const [pressed, setPressed] = useState(false);
  /** The video is showing frames (until then the poster image is the visual). */
  const [showing, setShowing] = useState(false);
  const languages = landingCopy(lang).language;
  // Spec §5 phone budget: below 720px and on Save-Data / 2G / 3G nothing loads before the press,
  // so the poster state stays. `slow` starts true (server, first paint) and is read on mount.
  const wide = useMediaQuery(LOOP_MIN_WIDTH_QUERY, false);
  const [slow, setSlow] = useState(true);
  useEffect(() => setSlow(isSlowConnection()), []);

  const loopAllowed = available && !pressed && !reduced && visible && inView && wide && !slow;

  // Muted loop: play in view, pause otherwise.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || pressed) return;
    if (loopAllowed) {
      v.muted = true;
      safePlay(v);
    } else if (typeof v.pause === 'function') {
      v.pause();
    }
  }, [loopAllowed, pressed]);

  // A hidden tab pauses even after the press; the advocate resumes with the controls.
  useEffect(() => {
    const v = videoRef.current;
    if (v && !visible && typeof v.pause === 'function') v.pause();
  }, [visible]);

  if (!available) return null;

  const duration = durationS === null ? null : formatDuration(durationS);
  const looping = showing && !pressed;
  const showButton = !pressed && (!looping || hasAudio);
  const buttonLabel = tr(looping ? LP.videoPlaySound : LP.videoPlay, lang);

  const press = () => {
    const v = videoRef.current;
    setPressed(true);
    setShowing(true);
    if (!v) return;
    v.muted = false;
    v.controls = true;
    v.focus();
    safePlay(v);
  };

  return (
    <section
      aria-labelledby="video-heading"
      data-section="video"
      className={cn('border-nl-line border-t', LANDING_STYLE.section)}
    >
      <div className="mx-auto w-full max-w-[1180px]">
        <div className="gap-nl-4 flex flex-col min-[900px]:flex-row min-[900px]:items-end min-[900px]:justify-between">
          <div className="min-w-0">
            <p className="nl-label text-nl-muted">{tr(LP.videoEyebrow, lang)}</p>
            <h2 id="video-heading" className={cn(LANDING_STYLE.h2, 'text-nl-text mt-nl-2')}>
              {tr(LP.videoTitle, lang)}
            </h2>
          </div>
          <p className="nl-body-sm text-nl-muted max-w-[40ch] min-[900px]:text-right">
            {videoNote(hindiCaptions, lang)}
          </p>
        </div>

        <div
          ref={playerRef}
          className={cn(
            'border-nl-line bg-nl-wood mt-nl-8 relative aspect-video w-full overflow-hidden border',
            LANDING_STYLE.radius,
          )}
          data-video-player=""
          data-video-state={pressed ? 'sound' : looping ? 'loop' : 'poster'}
        >
          <img
            src={posterHref}
            alt=""
            loading="lazy"
            decoding="async"
            width={1280}
            height={720}
            className="absolute inset-0 h-full w-full object-cover"
          />
          <video
            ref={videoRef}
            muted
            loop
            playsInline
            preload="none"
            // WCAG 2.2.2: a silent loop with no sound button still needs a pause control, so the
            // native controls show while it loops; after a press they always show.
            controls={pressed || (looping && !hasAudio)}
            poster={posterHref}
            onPlaying={() => setShowing(true)}
            className={cn(
              'nl-focus absolute inset-0 h-full w-full',
              showing ? 'opacity-100' : 'opacity-0',
            )}
          >
            <source src={DEMO_VIDEO_ASSETS.video.href} type="video/mp4" />
            <track
              kind="captions"
              src={DEMO_VIDEO_ASSETS.captionsEn.href}
              srcLang="en"
              label={languages.en}
              default={lang === 'en' || !hindiCaptions}
            />
            {hindiCaptions ? (
              <track
                kind="captions"
                src={DEMO_VIDEO_ASSETS.captionsHi.href}
                srcLang="hi"
                label={languages.hi}
                default={lang === 'hi'}
              />
            ) : null}
          </video>
          {showButton ? (
            <button
              type="button"
              aria-label={buttonLabel}
              onClick={press}
              data-video-button={looping ? 'sound' : 'play'}
              className={cn(
                'nl-focus bg-nl-brass text-nl-on-brass rounded-nl-pill absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 touch-manipulation items-center justify-center min-[720px]:h-24 min-[720px]:w-24',
                '[@media(hover:hover)_and_(pointer:fine)]:hover:shadow-nl-halo transition-shadow duration-150 ease-out',
              )}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="ml-1 h-6 w-6 min-[720px]:h-9 min-[720px]:w-9"
                fill="currentColor"
              >
                <path d="M7 4.5v15l12-7.5z" />
              </svg>
            </button>
          ) : null}
          {!pressed ? (
            <div className="gap-nl-2 bottom-nl-3 left-nl-3 pointer-events-none absolute flex flex-wrap">
              <Chip variant="brass" data-captions-chip="">
                {captionsChip(hindiCaptions)}
              </Chip>
              {duration ? (
                <Chip variant="neutral" className="tabular-nums">
                  {duration}
                </Chip>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
