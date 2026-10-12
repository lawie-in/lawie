/**
 * Ids that reach the charge path but are not rule files, priced in their own
 * right (T-227, Vikram 12 Oct 2026). `guided` is a brief with no rule pack
 * (kind `none`); the rest are legacy POST /documents/generate docTypes.
 * Moved here from credits.service by T-240 so every price lives in one place.
 */
export const NON_TEMPLATE_PRICES: Readonly<Record<string, number>> = Object.freeze({
  guided: 2,
  affidavit: 1,
  petition: 2,
  plaint: 2,
  injunction: 2,
  reply: 2,
});
