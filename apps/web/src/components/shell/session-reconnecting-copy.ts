/**
 * T-616: copy for the "Reconnecting…" session banner (handoff/design/T-616-reconnecting-banner.md).
 * Byte for byte as signed. Do not edit without a new sign-off.
 *
 * The dashboard shell has no language switch yet (the EN/HI toggle exists only on the marketing
 * landing), so the banner renders EN. The HI strings are exported for when the shell gets one.
 *
 * Not built: the spec's long form "Your changes will be saved once the connection is back." (T-616
 * queues no saves, so the sentence would promise something the build does not do; Ajay AJ-616-M1
 * signed the short form).
 */

export type SessionReconnectingCopyKey = 'reconnecting' | 'stillTrying' | 'reconnected';

export interface SignedLine {
  en: string;
  hi: string;
  status: 'signed';
  source: string;
}

export const SESSION_RECONNECTING_COPY: Record<SessionReconnectingCopyKey, SignedLine> = {
  // From the 2nd consecutive failed session refresh.
  reconnecting: {
    en: 'Reconnecting…',
    hi: 'फिर जुड़ रहा है…',
    status: 'signed',
    source: 'Ajay AJ-616-M1 (short form, no promise)',
  },
  // After 30 s in the reconnecting state (the text swaps, the bar does not grow).
  stillTrying: {
    en: 'Still trying to reconnect.',
    hi: 'अब भी जुड़ने की कोशिश जारी है।',
    status: 'signed',
    source: 'T-539 signed line, reused (AJ-616-M1)',
  },
  // Recovered: shown 3 s, then the bar goes.
  reconnected: {
    en: 'Reconnected.',
    hi: 'फिर जुड़ गया।',
    status: 'signed',
    source: 'Ajay AJ-616-M1',
  },
};
