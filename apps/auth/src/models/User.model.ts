import { CURRENT_PRIVACY_VERSION, UserRole, UserPlan, isGstStateCode } from '@lawie/shared';
import bcrypt from 'bcryptjs';
import mongoose, { Document, Schema, Types } from 'mongoose';

// T-234 — versions recorded when a user accepts the consent line. The values are set by Ajay's
// rulings (T-234 consent ruling, 11 Oct 2026, and Addendum 3, 12 Oct 2026 in
// handoff/legal/T-234-login-copy-signed.md); they are maintained by hand, not read from the pages.
// CURRENT_TERMS_VERSION: bump when /terms changes, with Ajay's sign-off.
// T-299: terms '2026-10-12' matches /terms "Last updated: 12 October 2026" (T-268, f6566b4).
// T-436 (Ajay, GST file Addendum 7 (3a)): '2026-10-15', the T-436 merge date, matches /terms
// "Last updated: 15 October 2026": the contracting party (5b/5c) and the courts (Ranchi) change.
// T-541 top-up Ink expiry narrowed (AJ-535-M5): '2026-10-22', matches "Last updated: 22 October".
// T-343: CURRENT_PRIVACY_VERSION now lives in @lawie/shared (constants/privacy.ts, with its
// history and the per-version signed summaries); re-exported here so existing imports still work.
// Versions are opaque strings: compare them for equality only, never parse them as dates.
export const CURRENT_TERMS_VERSION = '2026-10-22';
export { CURRENT_PRIVACY_VERSION };
/** T-563 (AJ-563-M1a): 'test' marks a test account's consent record; never real consent. */
export type TermsAcceptedVia = 'password' | 'google' | 'test';
/** T-522 (Arjun ruling 1): what a verify link does. A missing kind is treated as 'verify'. */
export type EmailVerifyKind = 'signin' | 'verify';
/** T-522 (Arjun ruling 2): the stored outcome of a sign-up referral code. */
export type ReferralStatus = 'applied' | 'not_applied';
/**
 * T-343 (Ajay §4) — how the current privacyVersion was accepted. 'signin' (Ajay, round 5): the
 * T-234 Google consent stamp on a linked or returning account set privacyVersion at sign-in.
 */
export type PrivacyAcceptedVia = 'signup' | 'reaccept' | 'signin';
/** T-358 — which email started the unverified-account clock. */
export type FirstVerifySentVia = 'verify' | 'notice';

/** T-343 (Ajay §4) — one accepted privacy version. No IP address and no user agent. */
export interface IPrivacyAcceptance {
  version: string;
  acceptedAt: Date;
  via: PrivacyAcceptedVia;
}

const PrivacyAcceptanceSchema = new Schema<IPrivacyAcceptance>(
  {
    version: { type: String, required: true, trim: true },
    acceptedAt: { type: Date, required: true },
    via: { type: String, enum: ['signup', 'reaccept', 'signin'], required: true },
  },
  { _id: false },
);

/** T-242 — campaign tags from the landing link, already capped and filtered (sanitizeUtm). */
export interface ISignupSource {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  /** Server time the account was created with these tags. */
  recordedAt: Date;
}

const SignupSourceSchema = new Schema<ISignupSource>(
  {
    utmSource: { type: String, maxlength: 100 },
    utmMedium: { type: String, maxlength: 100 },
    utmCampaign: { type: String, maxlength: 100 },
    recordedAt: { type: Date, required: true },
  },
  { _id: false },
);

/**
 * T-115c — account close and erase (Arjun's revised design, ruling 1). `stage` is the last
 * step that finished, so a retry (the sweep or erase-user.ts --resume) starts after it. There
 * is no 'done' stage: the last step hard-deletes this document, and an `account_delete`
 * AuditLog row is the record that the erase finished.
 */
export const ERASURE_STAGES = [
  'locked',
  'drafting_erased',
  'billing_erased',
  'auth_data_erased',
  'audit_done',
] as const;
export type ErasureStage = (typeof ERASURE_STAGES)[number];

export interface IErasure {
  requestedAt: Date;
  stage: ErasureStage;
  /** Last failed attempt (stage it stopped at is `stage`); ids and times only. */
  lastAttemptAt?: Date;
  attempts?: number;
}

const ErasureSchema = new Schema<IErasure>(
  {
    requestedAt: { type: Date, required: true },
    stage: { type: String, enum: ERASURE_STAGES, required: true },
    lastAttemptAt: { type: Date },
    attempts: { type: Number, min: 0 },
  },
  { _id: false },
);

export interface IUser extends Document {
  email: string;
  password?: string;
  authProvider: 'email' | 'google';
  googleId?: string;

  name: string;
  phone?: string;
  barCouncilId?: string;
  state?: string;
  /**
   * T-436 (Arjun, 14 Oct 2026) — the GST State/UT code the user gave for the place of supply on
   * their tax invoices: a 2-digit string from GST_STATES ("01", never 1). Set only by PATCH /me,
   * and only once the current privacy version is accepted (Ajay, GST file Addendum 7 (2)).
   * Billing reads it directly at invoice time (CUSTOMER_STATE_CODE_FIELD). Not `state` above,
   * which is the free-text Bar Council State.
   */
  gstStateCode?: string;
  practiceAreas: string[];
  /**
   * T-507 — ids of the courts the user practises in (/^[a-z0-9_]{2,80}$/, at most 20, no
   * duplicates) and the one they pick by default, which must be one of them. Set by PATCH /me.
   */
  courtsPractisedIn: string[];
  defaultCourt?: string;
  yearsOfExperience?: number;

  role: UserRole;
  plan: UserPlan;
  planStartedAt?: Date;
  planExpiresAt?: Date;
  docCount: number;

  enrollmentNumber?: string;
  emailVerified: boolean;
  isActive: boolean;
  lastLoginAt?: Date;

  referredVia?: Types.ObjectId; // ReferralCode._id used at signup (SCRUM-71)
  freeTierBonusGrant: number; // bonus drafts granted via referral (default 0)

  // ── SCRUM-73 / SCRUM-59 — credit system (founder-authorised 2026-05-12) ──
  // Three credit buckets, consumed in priority order: topup → earned → subscription.
  subscriptionCredits: number; // Granted on plan renewal. Lapses on monthly/yearly cycle.
  earnedCredits: number; // From daily login + rating bonuses. Permanent.
  topupCredits: number; // One-time top-up purchases. Permanent.
  planTier: 'free' | 'practice' | 'firm';
  billingCycle: 'none' | 'monthly' | 'yearly';
  planRenewsAt?: Date;
  lastLoginBonusAt?: Date; // Used by daily-login-bonus dedupe
  signupBonusGrantedAt?: Date; // Idempotency guard for signup bonus (SCRUM-100)

  // T-563 — set only by the develop-only test sign-up bypass. Immutable, default false.
  isTestAccount: boolean;

  // T-234 — proof of Terms acceptance. Server-set only; never overwritten once set.
  termsAcceptedAt?: Date;
  termsVersion?: string;
  privacyVersion?: string;
  acceptedVia?: TermsAcceptedVia;

  // T-343 — privacy acceptance (Ajay §4). Server-set only. privacyVersion above is the version
  // accepted; these say when and how. privacyHistory is append-only ($push only, never edited
  // or removed): one row per acceptance, so we can show which version was accepted and when.
  privacyAcceptedAt?: Date;
  privacyAcceptedVia?: PrivacyAcceptedVia;
  privacyHistory?: IPrivacyAcceptance[];

  // T-242 — where the sign-up came from (Ajay, T-242 signed). Set once, only when an account is
  // created and the landing link carried at least one tag. Deleted with the account.
  signupSource?: ISignupSource;

  passwordResetToken?: string;
  passwordResetExpires?: Date;
  // T-223 — email verification. sha256 of the single-use token (never the token itself) and its
  // 24 h expiry. Set by mintVerifyLink, cleared on use. Never selected by default.
  emailVerifyTokenHash?: string;
  emailVerifyExpires?: Date;
  // T-522 (Arjun ruling 1) — what the live link does: 'signin' (sign-up and resend links, 30 min,
  // verifies and signs in) or 'verify' (the T-358 notice, 7 days, verifies only). Written and
  // cleared together with the hash and expiry. Missing or unknown means 'verify'.
  emailVerifyKind?: EmailVerifyKind;
  // T-522 (Arjun ruling 2) — the outcome of a referral code sent at sign-up: 'applied' (recorded;
  // the Ink follows verification) or 'not_applied' (the code was no longer valid). Absent: no
  // code was sent, or the outcome is not known. GET /me reports it as referralStatus.
  referralStatus?: ReferralStatus;
  // T-115c — present only once closing the account has started (the account is locked).
  erasure?: IErasure;
  // T-358 (Ajay 8a2b639 / 9e42eea) — the clock. When the FIRST email carrying a verify link
  // (the T-223 verify email, a resend, or the T-358 notice itself) was confirmed sent, or
  // hard-bounced, to this unverified account, and which kind it was. Set once, by the worker's
  // outcome report, never at enqueue. An account without it is never deleted.
  firstVerifySentAt?: Date;
  firstVerifySentVia?: FirstVerifySentVia;
  // T-358 — when the WARNING notice (due at firstVerifySentAt + 23 days) was confirmed sent or
  // hard-bounced. The notice that set firstVerifySentAt never counts as the warning. The
  // unverified sweep deletes no account without it (Arjun ruling 3).
  unverifiedNoticeSentAt?: Date;
  createdAt: Date;
  updatedAt: Date;

  comparePassword(candidate: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email format'],
    },
    password: {
      type: String,
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    authProvider: {
      type: String,
      enum: ['email', 'google'],
      default: 'email',
    },
    googleId: {
      type: String,
      sparse: true,
      select: false,
    },

    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name too long'],
    },
    phone: {
      type: String,
      trim: true,
      match: [/^\+91\d{10}$/, 'Phone must be +91XXXXXXXXXX'],
    },
    barCouncilId: {
      type: String,
      trim: true,
    },
    state: {
      type: String,
      trim: true,
    },
    // T-436 — no default: absent means no State given (billing then uses its fallback).
    gstStateCode: {
      type: String,
      validate: {
        validator: (v: unknown) => v === undefined || v === null || isGstStateCode(v),
        message: 'Invalid GST State code',
      },
    },
    practiceAreas: {
      type: [String],
      default: [],
    },
    // T-507 — validated in validateUpdateMe; no default for defaultCourt (absent = none chosen).
    courtsPractisedIn: {
      type: [String],
      default: [],
    },
    defaultCourt: {
      type: String,
      trim: true,
    },
    yearsOfExperience: {
      type: Number,
      min: 0,
    },

    role: {
      type: String,
      enum: ['Admin', 'Lawyer', 'Client'],
      default: 'Client',
    },
    plan: {
      type: String,
      enum: ['free', 'pro'],
      default: 'free',
    },
    planStartedAt: Date,
    planExpiresAt: Date,
    docCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    enrollmentNumber: {
      type: String,
      trim: true,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: Date,

    referredVia: {
      type: Schema.Types.ObjectId,
      ref: 'ReferralCode',
      default: null,
    },
    freeTierBonusGrant: {
      type: Number,
      default: 0,
      min: 0,
    },

    // SCRUM-73 / SCRUM-59 — credit system
    subscriptionCredits: { type: Number, default: 0, min: 0 },
    earnedCredits: { type: Number, default: 0, min: 0 },
    topupCredits: { type: Number, default: 0, min: 0 },
    planTier: {
      type: String,
      enum: ['free', 'practice', 'firm'],
      default: 'free',
    },
    billingCycle: {
      type: String,
      enum: ['none', 'monthly', 'yearly'],
      default: 'none',
    },
    planRenewsAt: { type: Date, default: null },
    lastLoginBonusAt: { type: Date, default: null },
    signupBonusGrantedAt: { type: Date, default: null },
    // T-563 (Arjun) — true only for an account made by the test sign-up bypass. Set at create,
    // never changed. Excluded from user counts, referral and the consent export.
    isTestAccount: { type: Boolean, default: false, immutable: true },

    // T-234 — Terms acceptance. No defaults: an empty value means "not accepted yet".
    termsAcceptedAt: { type: Date },
    termsVersion: { type: String, trim: true },
    privacyVersion: { type: String, trim: true },
    acceptedVia: { type: String, enum: ['password', 'google', 'test'] },

    // T-343 — no defaults: absent means no acceptance recorded under T-343 rules yet.
    privacyAcceptedAt: { type: Date },
    privacyAcceptedVia: { type: String, enum: ['signup', 'reaccept', 'signin'] },
    privacyHistory: { type: [PrivacyAcceptanceSchema], default: undefined },

    // T-242 — no default: absent means no tags were present at sign-up.
    signupSource: { type: SignupSourceSchema },

    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
    },
    // T-223 — no defaults: absent means no live verify link.
    emailVerifyTokenHash: {
      type: String,
      select: false,
    },
    emailVerifyExpires: {
      type: Date,
      select: false,
    },
    // T-522 — no default: absent means 'verify' (links minted before T-522 stay verify-only).
    emailVerifyKind: {
      type: String,
      enum: ['signin', 'verify'],
      select: false,
    },
    // T-522 — no default: absent means no referral code was sent (or the outcome is unknown).
    referralStatus: { type: String, enum: ['applied', 'not_applied'] },
    // T-115c — no default: absent means the account is not being closed.
    erasure: { type: ErasureSchema },
    // T-358 — no defaults: absent means no verify-link email / no warning notice has gone out.
    firstVerifySentAt: { type: Date },
    firstVerifySentVia: { type: String, enum: ['verify', 'notice'] },
    unverifiedNoticeSentAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        ret['id'] = ret['_id'];
        delete ret['_id'];
        delete ret['password'];
        delete ret['__v'];
        return ret;
      },
    },
  },
);

// -- Indexes per CTO schema design --
// email index created by `unique: true` on field definition
// googleId index created by `sparse: true` on field definition
UserSchema.index({ plan: 1 });
UserSchema.index({ createdAt: -1 });
// T-223 — verifyEmailToken looks a user up by the token hash. Sparse: only users with a live link.
UserSchema.index({ emailVerifyTokenHash: 1 }, { sparse: true });
// T-115c — the erase sweep finds unfinished erases by this. Sparse: only accounts being closed.
UserSchema.index({ 'erasure.requestedAt': 1 }, { sparse: true });
// T-563 — the test-account sweep, cap and scripts find test accounts by age. Partial: only
// test accounts are indexed.
UserSchema.index(
  { isTestAccount: 1, createdAt: 1 },
  { partialFilterExpression: { isTestAccount: true } },
);

// -- Pre-save: bcrypt password hashing --
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

UserSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  if (!this.password) throw new Error('User has no password — use OAuth login');
  return bcrypt.compare(candidate, this.password);
};

/** T-343 — the privacy fields stamped on a brand-new account (email or Google sign-up). */
export function privacySignupAcceptance(at: Date): {
  privacyVersion: string;
  privacyAcceptedAt: Date;
  privacyAcceptedVia: PrivacyAcceptedVia;
  privacyHistory?: IPrivacyAcceptance[];
} {
  return {
    privacyVersion: CURRENT_PRIVACY_VERSION,
    privacyAcceptedAt: at,
    privacyAcceptedVia: 'signup',
    privacyHistory: [{ version: CURRENT_PRIVACY_VERSION, acceptedAt: at, via: 'signup' }],
  };
}

/** T-343 — one 'signin' acceptance row (the Google consent stamp set privacyVersion). */
export function privacySigninAcceptance(at: Date): {
  set: { privacyAcceptedAt: Date; privacyAcceptedVia: PrivacyAcceptedVia };
  row: IPrivacyAcceptance;
} {
  return {
    set: { privacyAcceptedAt: at, privacyAcceptedVia: 'signin' },
    row: { version: CURRENT_PRIVACY_VERSION, acceptedAt: at, via: 'signin' },
  };
}

export const User = mongoose.model<IUser>('User', UserSchema);
