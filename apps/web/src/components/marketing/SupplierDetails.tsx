'use client';

/**
 * T-436: the supplier lines on the Terms page (Ajay, handoff/legal/gst-tax-invoice-signed.md).
 *
 * - 5b (Terms §1), as amended by Addendum 1 (no street address on public pages):
 *   `Lawie is a trade name of {supplier_legal_name}, a sole proprietorship registered for GST in
 *   {supplier_state} (GSTIN {supplier_gstin}). In these Terms, "Lawie", "we" and "us" mean that
 *   proprietorship.`
 * - 5c (Terms §14), as amended by Addendum 1: the legal name, above the contact email.
 * - Addendum 7 (3b): never a placeholder. No legal name: 5b and 5c are hidden. A legal name
 *   but no GSTIN: 5b without ` (GSTIN {supplier_gstin})`.
 *
 * Values come from billing's public GET /api/billing/public/supplier (the same values the
 * invoice prints), fetched in the browser once per page load. Any failure (503 while the env
 * is unset, the gateway down, a bad body, no fetch) hides both lines: it fails closed, and the
 * page itself never depends on the gateway at build or render time.
 */
import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface SupplierDetails {
  legalName: string;
  gstin: string;
  stateName: string;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** The usable supplier values, or null (then nothing is shown). */
export function parseSupplier(body: unknown): SupplierDetails | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const legalName = str(b.legalName);
  if (!legalName) return null;
  return { legalName, gstin: str(b.gstin), stateName: str(b.stateName) };
}

/** Ajay 5b (Addendum 1 and 7), or null when it cannot be shown without a placeholder. */
export function supplierTermsSentence(s: SupplierDetails | null): string | null {
  if (!s || !s.stateName) return null;
  const gstin = s.gstin ? ` (GSTIN ${s.gstin})` : '';
  return `Lawie is a trade name of ${s.legalName}, a sole proprietorship registered for GST in ${s.stateName}${gstin}. In these Terms, "Lawie", "we" and "us" mean that proprietorship.`;
}

let pending: Promise<SupplierDetails | null> | null = null;

/** One request per page load, shared by both lines. Never rejects. */
export function loadSupplier(): Promise<SupplierDetails | null> {
  if (!pending) {
    pending = (async () => {
      if (typeof fetch !== 'function') return null;
      try {
        const res = await fetch(`${API_URL}/api/billing/public/supplier`);
        if (!res.ok) return null;
        return parseSupplier(await res.json());
      } catch {
        return null;
      }
    })();
  }
  return pending;
}

/** Test helper: forget the cached request. */
export function resetSupplierCache(): void {
  pending = null;
}

function useSupplier(): SupplierDetails | null {
  const [supplier, setSupplier] = useState<SupplierDetails | null>(null);
  useEffect(() => {
    let live = true;
    void loadSupplier().then((s) => {
      if (live) setSupplier(s);
    });
    return () => {
      live = false;
    };
  }, []);
  return supplier;
}

/** 5b, followed by a space, for use after the first sentence of §1. Nothing if unavailable. */
export function SupplierTermsSentence() {
  const sentence = supplierTermsSentence(useSupplier());
  return sentence ? <>{`${sentence} `}</> : null;
}

/** 5c: the legal name, as its own line above the §14 contact email. Nothing if unavailable. */
export function SupplierContactLine() {
  const supplier = useSupplier();
  return supplier ? <p>{supplier.legalName}</p> : null;
}
