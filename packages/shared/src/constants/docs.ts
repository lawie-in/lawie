export const USER_PLANS = {
  FREE: 'free',
  PRO: 'pro',
} as const;

export type UserPlan = (typeof USER_PLANS)[keyof typeof USER_PLANS];

export const DOC_TYPES = {
  BAIL_APPLICATION: 'bail_application',
  PETITION: 'petition',
  LEGAL_NOTICE: 'legal_notice',
  AFFIDAVIT: 'affidavit',
  VAKALATNAMA: 'vakalatnama',
  PLAINT: 'plaint',
  WRITTEN_STATEMENT: 'written_statement',
  INJUNCTION: 'injunction',
  REPLY: 'reply',
  COMPLAINT: 'complaint',
  RENT_AGREEMENT: 'rent_agreement',
} as const;

export type DocType = (typeof DOC_TYPES)[keyof typeof DOC_TYPES];

export const COURT_TYPES = {
  DISTRICT_COURT: 'district_court',
  HIGH_COURT: 'high_court',
  SUPREME_COURT: 'supreme_court',
  TRIBUNAL: 'tribunal',
  CONSUMER_FORUM: 'consumer_forum',
  CONSUMER_COMMISSION: 'consumer_commission',
  FAMILY_COURT: 'family_court',
  SESSIONS: 'sessions',
  CJM: 'cjm',
  JMFC: 'jmfc',
  CIVIL_COURT: 'civil_court',
} as const;

export type CourtType = (typeof COURT_TYPES)[keyof typeof COURT_TYPES];

export const DOC_STATUSES = {
  DRAFT: 'draft',
  FINAL: 'final',
} as const;

export type DocStatus = (typeof DOC_STATUSES)[keyof typeof DOC_STATUSES];
