'use client';

import { useEffect, useRef, useState } from 'react';

export function LogoSplash() {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const lettersRef = useRef<SVGGElement>(null);
  const dotWrapRef = useRef<SVGGElement>(null);
  const taglineRef = useRef<HTMLDivElement>(null);

  // Step 1 — decide whether to show
  useEffect(() => {
    if (sessionStorage.getItem('lawie_splash_seen')) return;

    // Preload Fraunces (the serif display font used for "awie.")
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500&display=swap';
    document.head.appendChild(link);

    setVisible(true);
  }, []);

  // Step 2 — run animation once SVG is in the DOM
  useEffect(() => {
    if (!visible) return;

    if (!svgRef.current || !lettersRef.current || !dotWrapRef.current) return;
    const svg = svgRef.current as SVGSVGElement;
    const lettersGroup = lettersRef.current as SVGGElement;
    const dotWrapEl = dotWrapRef.current as SVGGElement;
    const taglineEl = taglineRef.current;

    const SVG_NS = 'http://www.w3.org/2000/svg';
    let built = false;
    const anims: Animation[] = [];

    const EASE = {
      out: 'cubic-bezier(0.16, 0.84, 0.30, 1)',
      swing: 'cubic-bezier(0.5, 0, 0.1, 1)',
      back: 'cubic-bezier(0.34, 1.42, 0.50, 1)',
    };

    function A(node: Element, keyframes: Keyframe[], delay: number, dur: number, easing: string) {
      const a = node.animate(keyframes, {
        delay: delay * 1000,
        duration: dur * 1000,
        easing,
        fill: 'both',
      });
      anims.push(a);
      return a;
    }

    function buildLetters() {
      if (built) return;
      const FONT = "Fraunces, 'Times New Roman', Georgia, serif";
      const attrs: Record<string, string> = {
        'font-family': FONT,
        'font-weight': '500',
        'font-size': '360',
        y: '280',
        style: "font-variation-settings:'opsz' 144",
      };

      // Hidden measuring node to get exact per-glyph x positions
      const meas = document.createElementNS(SVG_NS, 'text') as SVGTextElement;
      Object.assign(meas, {});
      Object.entries({ ...attrs, x: '256', 'letter-spacing': '-6', visibility: 'hidden' }).forEach(
        ([k, v]) => meas.setAttribute(k, v),
      );
      meas.textContent = 'awie.';
      svg.appendChild(meas);

      const str = 'awie.';
      const starts: number[] = [];
      for (let i = 0; i < str.length; i++) starts.push(meas.getStartPositionOfChar(i).x);
      svg.removeChild(meas);

      // a w i e — each letter in its own <g> for independent animation
      for (let j = 0; j < 4; j++) {
        const g = document.createElementNS(SVG_NS, 'g');
        g.setAttribute('class', 'splash-letter');
        g.style.transformBox = 'fill-box';
        g.style.transformOrigin = '50% 100%';
        g.style.opacity = '0';
        const t = document.createElementNS(SVG_NS, 'text');
        Object.entries({ ...attrs, x: String(starts[j]), fill: '#0D1F3C' }).forEach(([k, v]) =>
          t.setAttribute(k, v),
        );
        t.textContent = str[j];
        g.appendChild(t);
        lettersGroup.appendChild(g);
      }

      // Period — rust accent, its own wrapper
      const dt = document.createElementNS(SVG_NS, 'text');
      Object.entries({ ...attrs, x: String(starts[4]), fill: '#E63E2C' }).forEach(([k, v]) =>
        dt.setAttribute(k, v),
      );
      dt.textContent = '.';
      dotWrapEl.appendChild(dt);

      built = true;
    }

    function play() {
      if (!built) return;
      anims.forEach((a) => {
        try {
          a.cancel();
        } catch {
          /* noop */
        }
      });
      anims.length = 0;

      const stem = svg.querySelector('.splash-stem')!;
      const fold = svg.querySelector('.splash-fold')!;
      const foot = svg.querySelector('.splash-foot')!;
      const letters = svg.querySelectorAll('.splash-letter');

      // 1. Document page rises into place
      A(
        stem,
        [
          { opacity: 0, transform: 'translateY(64px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        0.1,
        0.58,
        EASE.out,
      );

      // 2. Dog-ear corner unfurls
      A(
        fold,
        [
          { opacity: 0, transform: 'scale(0.05) rotate(-28deg)' },
          { opacity: 1, transform: 'scale(1) rotate(0deg)' },
        ],
        0.52,
        0.5,
        EASE.back,
      );

      // 3. Baseline foot shoots right
      A(
        foot,
        [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }],
        0.74,
        0.52,
        EASE.swing,
      );

      // 4. "awie" writes on letter by letter
      const base = 1.06,
        step = 0.125;
      letters.forEach((g, i) => {
        A(
          g,
          [
            { opacity: 0, transform: 'translateY(30px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          base + i * step,
          0.52,
          EASE.out,
        );
      });

      // 5. Period pops — the punchline
      const dotDelay = base + 4 * step + 0.04;
      A(
        dotWrapEl,
        [
          { opacity: 0, transform: 'scale(0.2)' },
          { opacity: 1, transform: 'scale(1)' },
        ],
        dotDelay,
        0.46,
        EASE.back,
      );

      // 6. Tagline fades up
      if (taglineEl) {
        A(
          taglineEl,
          [
            { opacity: 0, transform: 'translateY(8px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          dotDelay + 0.34,
          0.55,
          EASE.out,
        );
      }

      // Hold 1.4s after animation ends, then fade out the whole splash
      const totalMs = (dotDelay + 0.46 + 0.34 + 0.55 + 1.4) * 1000;
      const timer = setTimeout(() => {
        setFading(true);
        setTimeout(() => {
          setVisible(false);
          sessionStorage.setItem('lawie_splash_seen', '1');
        }, 500);
      }, totalMs);

      return () => clearTimeout(timer);
    }

    function start() {
      buildLetters();
      play();
    }

    if (document.fonts?.ready) {
      Promise.all([document.fonts.load('500 360px Fraunces'), document.fonts.ready])
        .then(start)
        .catch(start);
      // Safety fallback in case fonts API stalls
      setTimeout(() => {
        if (!built) start();
      }, 1200);
    } else {
      start();
    }

    return () => {
      anims.forEach((a) => {
        try {
          a.cancel();
        } catch {
          /* noop */
        }
      });
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '26px',
        background: 'radial-gradient(120% 120% at 50% 18%, #FFFFFF 0%, #EDF1F7 62%, #E3E9F2 100%)',
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.5s ease',
        pointerEvents: fading ? 'none' : 'auto',
      }}
    >
      <svg
        ref={svgRef}
        viewBox="0 0 1210 380"
        role="img"
        aria-label="Lawie"
        style={{
          width: 'min(78vw, 680px)',
          height: 'auto',
          overflow: 'visible',
          filter: 'drop-shadow(0 10px 22px rgba(13,31,60,0.14))',
        }}
      >
        <defs>
          <filter id="lk-s" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="2.5" />
            <feOffset dx="0.6" dy="3" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.55" />
            </feComponentTransfer>
          </filter>
          <clipPath id="lk-foldclip">
            <path d="M 160 30 L 160 90 L 220 90 C 217 67.8, 179.8 32, 160 30 Z" />
          </clipPath>
        </defs>

        {/* Baseline foot — reveals left-to-right via clip-path */}
        <path
          className="splash-foot"
          d="M 40 280 L 880 280 L 880 320 L 40 320 Z"
          fill="#0D1F3C"
          style={{ clipPath: 'inset(0 100% 0 0)' }}
        />

        {/* Document stem — the body of the L, rises up */}
        <path
          className="splash-stem"
          d="M 40 30 L 160 30 L 220 90 L 220 320 L 40 320 Z"
          fill="#0D1F3C"
          style={{ transformBox: 'fill-box', transformOrigin: '50% 100%', opacity: 0 }}
        />

        {/* Dog-eared corner — layered rust curl */}
        <g
          className="splash-fold"
          style={{ transformBox: 'fill-box', transformOrigin: '0% 0%', opacity: 0 }}
        >
          <g clipPath="url(#lk-foldclip)">
            <path
              d="M 160 30 L 160 90 L 220 90 C 217 67.8, 179.8 32, 160 30 Z"
              fill="#000"
              filter="url(#lk-s)"
            />
          </g>
          <path d="M 160 30 L 160 90 L 220 90 C 217 67.8, 179.8 32, 160 30 Z" fill="#F2604A" />
          <path
            d="M 162.6 35.2 L 162.6 87.4 L 214.8 87.4 C 212.19 68.086, 179.826 36.94, 162.6 35.2 Z"
            fill="#E63E2C"
          />
          <path
            d="M 165.4 40.8 L 165.4 84.6 L 209.2 84.6 C 207.01 68.394, 179.854 42.26, 165.4 40.8 Z"
            fill="#C42B14"
          />
          <path
            d="M 168.6 47.2 L 168.6 81.4 L 202.8 81.4 C 201.09 68.746, 179.886 48.34, 168.6 47.2 Z"
            fill="#9C1F08"
          />
        </g>

        {/* "awie" and "." injected by animation engine */}
        <g ref={lettersRef} />
        <g
          ref={dotWrapRef}
          style={{ transformBox: 'fill-box', transformOrigin: '50% 60%', opacity: 0 }}
        />
      </svg>

      {/* Tagline */}
      <div
        ref={taglineRef}
        style={{
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 'clamp(10px, 1.35vw, 15px)',
          fontWeight: 600,
          letterSpacing: '0.42em',
          textIndent: '0.42em',
          color: '#5A7A99',
          opacity: 0,
          whiteSpace: 'nowrap',
        }}
      >
        AI LEGAL PRODUCTIVITY
      </div>
    </div>
  );
}
