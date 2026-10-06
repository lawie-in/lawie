'use client';

import { Menu, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

type ActivePage = 'tools' | 'pricing' | 'about' | 'faq' | undefined;

interface SiteNavProps {
  activePage?: ActivePage;
}

// Class names here are written as whole strings on purpose. The Tailwind Prettier plugin trims
// spaces inside a template literal in className, which once turned "nav-drawer is-open" into
// "nav-draweris-open" and broke the menu.
export default function SiteNav({ activePage }: SiteNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <nav className="site-nav">
        <div className="nav-inner">
          <Link href="/" aria-label="Lawie — home">
            <Image src="/lockup-on-dark.png" alt="Lawie" width={160} height={35} priority />
          </Link>
          <div className="nav-center">
            <Link
              className={activePage === 'tools' ? 'nav-link is-active' : 'nav-link'}
              href="/tools"
            >
              Free Tools
            </Link>
            <Link
              className={activePage === 'pricing' ? 'nav-link is-active' : 'nav-link'}
              href="/pricing"
            >
              Pricing
            </Link>
            <Link
              className={activePage === 'about' ? 'nav-link is-active' : 'nav-link'}
              href="/about"
            >
              About
            </Link>
            <Link className={activePage === 'faq' ? 'nav-link is-active' : 'nav-link'} href="/faq">
              FAQ
            </Link>
          </div>
          <div className="nav-right">
            <Link className="nav-signin" href="/login">
              Sign In
            </Link>
            <Link className="btn btn-primary btn-sm" href="/login">
              Start Drafting Free
            </Link>
            <button
              className="nav-burger"
              aria-label="Open menu"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <Menu strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </nav>

      <div className={open ? 'nav-scrim is-open' : 'nav-scrim'} onClick={() => setOpen(false)} />
      <aside
        className={open ? 'nav-drawer is-open' : 'nav-drawer'}
        aria-hidden={!open}
        aria-label="Mobile menu"
      >
        <div className="nav-drawer-head">
          <Link className="wordmark wordmark--light" href="/">
            <svg className="wm-l" viewBox="0 0 15 27" aria-hidden="true">
              <rect x="0" y="0" width="3.5" height="27" rx="1" />
              <rect x="0" y="23.5" width="15" height="3.5" rx="1" />
            </svg>
            <span className="wm-text">awie</span>
          </Link>
          <button
            className="nav-drawer-close"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X strokeWidth={1.5} />
          </button>
        </div>
        <Link className="d-link" href="/tools" onClick={() => setOpen(false)}>
          Free Tools
        </Link>
        <Link className="d-link" href="/pricing" onClick={() => setOpen(false)}>
          Pricing
        </Link>
        <Link className="d-link" href="/about" onClick={() => setOpen(false)}>
          About
        </Link>
        <Link className="d-link" href="/faq" onClick={() => setOpen(false)}>
          FAQ
        </Link>
        <div className="d-actions">
          <Link
            className="btn btn-block"
            href="/login"
            style={{
              color: 'var(--navy)',
              border: '1.5px solid var(--border-strong)',
              background: '#fff',
            }}
          >
            Sign In
          </Link>
          <Link className="btn btn-primary btn-block" href="/login">
            Start Drafting Free
          </Link>
        </div>
      </aside>
    </>
  );
}
