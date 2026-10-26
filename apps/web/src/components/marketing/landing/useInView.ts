'use client';

// T-601: a small IntersectionObserver hook. SSR-safe: the server and the first client render return
// `initial`; without IntersectionObserver it returns `fallback` (the hero then shows its finished
// state, spec §2). Disconnects on unmount, and after the first hit when `once` is set.

import { useEffect, useState, type RefObject } from 'react';

export interface UseInViewOptions {
  threshold?: number;
  rootMargin?: string;
  /** Stop observing after the element first enters the viewport. */
  once?: boolean;
  /** Value before the observer has reported (server render, first paint). */
  initial?: boolean;
  /** Value when IntersectionObserver does not exist. */
  fallback?: boolean;
  /** Observe only while true. */
  enabled?: boolean;
}

export function hasIntersectionObserver(): boolean {
  return typeof window !== 'undefined' && typeof window.IntersectionObserver === 'function';
}

export function useInView(
  ref: RefObject<Element | null>,
  {
    threshold = 0,
    rootMargin,
    once = false,
    initial = false,
    fallback = true,
    enabled = true,
  }: UseInViewOptions = {},
): boolean {
  const [inView, setInView] = useState(initial);

  useEffect(() => {
    if (!enabled) return undefined;
    const el = ref.current;
    if (!el) return undefined;
    if (!hasIntersectionObserver()) {
      setInView(fallback);
      return undefined;
    }
    const observer = new window.IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        // isIntersecting is true for any overlap, so the ratio decides (with a rounding margin).
        const hit = entry.isIntersecting && entry.intersectionRatio >= threshold - 0.01;
        if (hit && once) {
          setInView(true);
          observer.disconnect();
          return;
        }
        if (!once) setInView(hit);
      },
      { threshold, rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, threshold, rootMargin, once, fallback, enabled]);

  return inView;
}
