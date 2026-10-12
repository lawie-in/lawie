import Image from 'next/image';
import Link from 'next/link';

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div className="footer-col footer-brand">
          <Link href="/" aria-label="Lawie — home">
            <Image src="/lockup-on-dark.png" alt="Lawie" width={150} height={35} />
          </Link>
          <p className="footer-tag">
            Legal drafting for Indian advocates. Criminal drafts use BNS, BNSS and BSA section
            numbers.
          </p>
          <p className="footer-disclaimer">
            Lawie is a drafting assistant. The advocate is responsible for legal accuracy and
            filing.
          </p>
        </div>
        <div className="footer-col">
          <h5>Product</h5>
          <ul>
            <li>
              <Link href="/tools">Free Tools</Link>
            </li>
            <li>
              <Link href="/pricing">Pricing</Link>
            </li>
            <li>
              <Link href="/login">Start Drafting</Link>
            </li>
            <li>
              <Link href="/login">Sign In</Link>
            </li>
          </ul>
        </div>
        <div className="footer-col">
          <h5>Company</h5>
          <ul>
            <li>
              <Link href="/about">About</Link>
            </li>
            <li>
              <Link href="/contact">Contact</Link>
            </li>
            <li>
              <Link href="/faq">FAQ</Link>
            </li>
          </ul>
        </div>
        <div className="footer-col">
          <h5>Legal</h5>
          <ul>
            <li>
              <Link href="/terms">Terms of Service</Link>
            </li>
            <li>
              <Link href="/privacy">Privacy Policy</Link>
            </li>
            <li>
              <Link href="/refunds">Refund Policy</Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="footer-bottom">
        <span>
          © 2026 Lawie <span className="divider-dot">·</span> Contact:{' '}
          <a href="mailto:contact@lawie.in">contact@lawie.in</a>
        </span>
        <span>
          Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.
        </span>
      </div>
    </footer>
  );
}
