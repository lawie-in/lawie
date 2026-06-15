'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

export default function FloatCta() {
  const [visible, setVisible] = useState(false);
  const footerRef = useRef<Element | null>(null);

  useEffect(() => {
    footerRef.current = document.querySelector('.site-footer');

    function onScroll() {
      const scrollY = window.scrollY;
      if (scrollY < 300) {
        setVisible(false);
        return;
      }
      if (footerRef.current) {
        const footerTop = footerRef.current.getBoundingClientRect().top + scrollY;
        if (scrollY + window.innerHeight > footerTop - 200) {
          setVisible(false);
          return;
        }
      }
      setVisible(true);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <Link
      className={`float-cta${visible ? 'is-visible' : ''}`}
      href="/login"
      aria-label="Try Lawie free"
    >
      Try Lawie free <ArrowRight strokeWidth={1.5} />
    </Link>
  );
}
