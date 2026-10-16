/**
 * T-453 cost report — keeps the connection string out of anything printed.
 * Pure. Removes the exact URI, any MongoDB connection string (plain or SRV scheme), and
 * the URI's user, password and host names on their own (driver errors can
 * name a host or user without the full URI).
 */

const ANY_MONGO_URI = /mongodb(?:\+srv)?:\/\/[^\s"'<>`]+/gi;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The pieces of a URI worth hiding on their own: user, password, hosts. */
export function uriSecrets(uri: string): string[] {
  const out: string[] = [];
  const m = /^mongodb(\+srv)?:\/\/(?:([^@/]*)@)?([^/?]*)/i.exec(uri.trim());
  if (!m) return out;
  const [, srv, userinfo, hosts] = m;
  if (userinfo) {
    const [user, pass] = userinfo.split(':');
    for (const p of [user, pass]) {
      if (p) {
        out.push(p);
        try {
          const decoded = decodeURIComponent(p);
          if (decoded !== p) out.push(decoded);
        } catch {
          /* keep the raw form only */
        }
      }
    }
  }
  if (hosts) {
    for (const h of hosts.split(',')) {
      const host = h.replace(/:\d+$/, '');
      if (host) out.push(host);
      // SRV: the driver resolves the seed name to shard hosts that share its
      // domain suffix (e.g. cluster0-shard-00-01.<id>.<provider domain>), so
      // hide everything after the first label too. Only when the suffix
      // still has a dot, so a bare top-level domain is never redacted.
      if (srv && host) {
        const dot = host.indexOf('.');
        const suffix = dot >= 0 ? host.slice(dot + 1) : '';
        if (suffix.includes('.')) out.push(suffix);
      }
    }
  }
  // Very short pieces (e.g. a one-letter user) would mangle ordinary words; the full-URI rules still apply.
  return out.filter((s) => s.length >= 3).sort((a, b) => b.length - a.length);
}

export function redact(text: string, uri: string | undefined): string {
  let out = text;
  if (uri) {
    out = out.split(uri).join('<redacted>');
  }
  out = out.replace(ANY_MONGO_URI, 'mongodb://<redacted>');
  if (uri) {
    for (const s of uriSecrets(uri)) {
      out = out.replace(new RegExp(escapeRegExp(s), 'g'), '<redacted>');
    }
  }
  return out;
}

/** One printable line for an unknown error: name and redacted message, never the stack. */
export function describeError(err: unknown, uri: string | undefined): string {
  if (err instanceof Error) {
    return redact(`${err.name}: ${err.message}`, uri);
  }
  return redact(String(err), uri);
}
