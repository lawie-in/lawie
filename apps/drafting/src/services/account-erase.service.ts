/**
 * T-115c — erase everything drafting holds for one user (Arjun's revised
 * design, decision 10 and "Account close, in order" step 2; runbook
 * T-235-erase-runbook.md steps 1d-1f and 2a-2l).
 *
 * Called by auth through `POST /internal/erase-user` (internal secret, never
 * through the gateway). Auth orchestrates and retries; this service only
 * erases what drafting owns.
 *
 *   0. read: the user's document ids and intake ids (generations,
 *      factledgers, llmauxcalls), before the rows they are read from go
 *   1. redis: intake:burst:<uid>, intake:day:<uid>:* (SCAN), and
 *      intake:owner:<id> / intake:followups:<id> for each intake id.
 *      Done first, while the intake ids can still be read from Mongo.
 *      intake:cache:* is encrypted, keyed by a hash, and expires in 30
 *      minutes: it cannot be matched to a user and is left to expire.
 *   2. as a REVIEWER on other owners' documents (Ajay 8067679, 96ad274; Arjun),
 *      found through the review tokens whose assignedEmail is the user's email
 *      (if given) on documents the user does not own. Nothing is deleted:
 *      - reviewerfeedbacks: the feedback is kept with its reviewTokenId, text and
 *        checklist unchanged; its `assignedTo` becomes REVIEWER_PLACEHOLDER, what
 *        the document owner sees. ReviewFeedback holds no reviewer email.
 *      - reviewerevents: `panel_review_submitted` events for those tokens get the
 *        same placeholder in `metadata.assignedTo` and lose `metadata.token`.
 *      - reviewertokens (last, it removes what the steps above search by): the
 *        token row and its _id stay; assignedTo and assignedEmail are unset, the
 *        link string is replaced by a random one (it is unique and required, so it
 *        cannot be unset on more than one row), the link is revoked, and
 *        `reviewerErased: true` is set. The admin panel shows "reviewer: erased".
 *   3. reviewfeedbacks, reviewtokens: deleted by the user's document ids (tokens
 *      on the user's own documents go with the documents)
 *   4. factdiffs (deleteFactDiffsFor), factledgers, generations, llmauxcalls,
 *      usagelogs, events, templateusages, sectionbookmarks, sectionrecents,
 *      bonuscredits: by userId
 *   5. documents: by userId, including isDeleted rows and rows a T-115b
 *      erase has not finished. Last, so a run cut off earlier can still
 *      reach the review rows through the document ids on the next run.
 *
 * Not touched here: creditledgers and inkledger (billing owns them), users,
 * sessions and auditlogs (auth owns them).
 *
 * Idempotent: every step is a delete or update by a filter that the step
 * itself stops matching, so a second run finds nothing and returns zero counts. `dryRun` runs the same filters as counts
 * and changes nothing.
 *
 * Logs hold the userId, the step name, `err.name` and counts only: never the
 * email, a name, a title or any content, and nothing is sent to Sentry.
 */
import crypto from 'crypto';

import mongoose, { Types } from 'mongoose';

import logger from '../config/logger';
import redis from '../config/redis';
import { BonusCredit } from '../models/BonusCredit.model';
import { LawieDocument } from '../models/Document.model';
import { Event } from '../models/Event.model';
import { FactDiff } from '../models/FactDiff.model';
import { FactLedgerModel } from '../models/FactLedger.model';
import { Generation } from '../models/Generation.model';
import { LlmAuxCall } from '../models/LlmAuxCall.model';
import { ReviewFeedback } from '../models/ReviewFeedback.model';
import { ReviewToken } from '../models/ReviewToken.model';
import { SectionBookmark } from '../models/SectionBookmark.model';
import { SectionRecent } from '../models/SectionRecent.model';
import { TemplateUsage } from '../models/TemplateUsage.model';
import { UsageLog } from '../models/UsageLog.model';

import { deleteFactDiffsFor } from './fact-diff-log';

export type AccountEraseStep =
  | 'read'
  | 'redisKeys'
  | 'reviewerfeedbacks'
  | 'reviewerevents'
  | 'reviewertokens'
  | 'reviewfeedbacks'
  | 'reviewtokens'
  | 'factdiffs'
  | 'factledgers'
  | 'generations'
  | 'llmauxcalls'
  | 'usagelogs'
  | 'events'
  | 'templateusages'
  | 'sectionbookmarks'
  | 'sectionrecents'
  | 'bonuscredits'
  | 'documents';

export type AccountEraseCounts = Partial<
  Record<Exclude<AccountEraseStep, 'read'> | 'reviewerEmailSkipped', number>
>;

export interface AccountEraseResult {
  /** True only when every step finished. */
  ok: boolean;
  dryRun: boolean;
  /** Rows (or Redis keys) removed per collection, or that would be removed on a dry run. */
  counts: AccountEraseCounts;
  /** The step that failed, when `ok` is false. */
  failedAt?: AccountEraseStep;
}

export interface AccountEraseInput {
  userId: string;
  /** The account email, lower-cased; used only to match ReviewToken.assignedEmail. Never logged. */
  email?: string;
  dryRun?: boolean;
}

/** ReviewToken.assignedEmail's maxlength: a longer address cannot be on any token. */
const REVIEW_TOKEN_EMAIL_MAX_LENGTH = 200;

/** What a reviewer's name reads once the reviewer has erased their account (Ajay 8067679). */
export const REVIEWER_PLACEHOLDER = 'A reviewer';

/** SCAN page size for the per-day intake keys. */
const SCAN_COUNT = 100;

async function scanKeys(pattern: string): Promise<string[]> {
  const found = new Set<string>();
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', SCAN_COUNT);
    for (const k of keys) found.add(k);
    cursor = next;
  } while (cursor !== '0');
  return [...found];
}

/** The user's intake ids, from every collection that records them by userId. */
async function intakeIdsFor(uid: Types.ObjectId): Promise<string[]> {
  const lists = await Promise.all([
    Generation.distinct('intakeId', { userId: uid }),
    FactLedgerModel.distinct('intakeId', { userId: uid }),
    LlmAuxCall.distinct('intakeId', { userId: uid }),
  ]);
  const ids = new Set<string>();
  for (const list of lists) {
    for (const v of list) if (typeof v === 'string' && v !== '') ids.add(v);
  }
  return [...ids];
}

/** Deletes (or, on a dry run, counts) the given keys. Returns how many existed. */
async function removeKeys(keys: string[], dryRun: boolean): Promise<number> {
  if (keys.length === 0) return 0;
  return dryRun ? redis.exists(...keys) : redis.del(...keys);
}

/**
 * Erase (or count, on a dry run) everything drafting holds for one user.
 * Never throws: a failed step stops the run and is reported in the result,
 * and the caller retries. The userId must already be validated as an
 * ObjectId and must not be the golden-set fixture user (the route checks).
 */
export async function eraseAccount(input: AccountEraseInput): Promise<AccountEraseResult> {
  const { userId } = input;
  const dryRun = input.dryRun === true;
  // An address longer than any ReviewToken can hold cannot match one: skip the
  // assignedEmail match, and say so in the counts (reviewerEmailSkipped: 1).
  const emailTooLong =
    typeof input.email === 'string' && input.email.length > REVIEW_TOKEN_EMAIL_MAX_LENGTH;
  const email = emailTooLong ? undefined : input.email;
  const counts: AccountEraseCounts = {};
  if (emailTooLong) counts.reviewerEmailSkipped = 1;
  let step: AccountEraseStep = 'read';

  if (!mongoose.isValidObjectId(userId)) {
    return { ok: false, dryRun, counts, failedAt: step };
  }
  const uid = new Types.ObjectId(userId);
  const byUser = { userId: uid };

  /** deleteMany, or countDocuments on a dry run, with the same filter. */
  const remove = async (
    model: {
      deleteMany: (f: Record<string, unknown>) => PromiseLike<{ deletedCount?: number }>;
      countDocuments: (f: Record<string, unknown>) => PromiseLike<number>;
    },
    filter: Record<string, unknown>,
  ): Promise<number> =>
    dryRun ? model.countDocuments(filter) : ((await model.deleteMany(filter)).deletedCount ?? 0);

  try {
    const documentIds = (await LawieDocument.distinct('_id', byUser)) as Types.ObjectId[];
    const intakeIds = await intakeIdsFor(uid);

    step = 'redisKeys';
    const keys = new Set<string>([
      `intake:burst:${userId}`,
      ...(await scanKeys(`intake:day:${userId}:*`)),
    ]);
    for (const id of intakeIds) {
      keys.add(`intake:owner:${id}`);
      keys.add(`intake:followups:${id}`);
    }
    counts.redisKeys = await removeKeys([...keys], dryRun);

    // As a reviewer on other owners' documents: before the reviewtokens step deletes
    // the tokens these are found through.
    const reviewerTokens = email
      ? await ReviewToken.find({ assignedEmail: email, documentId: { $nin: documentIds } })
          .select('_id token')
          .lean()
      : [];
    const reviewerTokenIds = reviewerTokens.map((t) => t._id);
    const reviewerTokenStrings = reviewerTokens.map((t) => t.token);

    step = 'reviewerfeedbacks';
    const feedbackFilter = {
      reviewTokenId: { $in: reviewerTokenIds },
      assignedTo: { $ne: REVIEWER_PLACEHOLDER },
    };
    counts.reviewerfeedbacks =
      reviewerTokenIds.length === 0
        ? 0
        : dryRun
          ? await ReviewFeedback.countDocuments(feedbackFilter)
          : (
              await ReviewFeedback.updateMany(feedbackFilter, {
                $set: { assignedTo: REVIEWER_PLACEHOLDER },
              })
            ).modifiedCount;

    step = 'reviewerevents';
    const eventFilter = {
      type: 'panel_review_submitted',
      'metadata.token': { $in: reviewerTokenStrings },
    };
    counts.reviewerevents =
      reviewerTokenStrings.length === 0
        ? 0
        : dryRun
          ? await Event.countDocuments(eventFilter)
          : (
              await Event.updateMany(eventFilter, {
                $set: { 'metadata.assignedTo': REVIEWER_PLACEHOLDER },
                $unset: { 'metadata.token': '' },
              })
            ).modifiedCount;

    step = 'reviewertokens';
    if (reviewerTokenIds.length === 0) {
      counts.reviewertokens = 0;
    } else if (dryRun) {
      counts.reviewertokens = reviewerTokenIds.length;
    } else {
      // One random link string per row: `token` is required and unique (not sparse).
      const result = await ReviewToken.bulkWrite(
        reviewerTokenIds.map((id) => ({
          updateOne: {
            filter: { _id: id, assignedEmail: email },
            update: {
              $set: {
                token: crypto.randomBytes(16).toString('hex'),
                isActive: false,
                reviewerErased: true,
              },
              $unset: { assignedTo: '', assignedEmail: '' },
            },
          },
        })),
      );
      counts.reviewertokens = result.modifiedCount;
    }

    step = 'reviewfeedbacks';
    counts.reviewfeedbacks =
      documentIds.length === 0
        ? 0
        : await remove(ReviewFeedback, { documentId: { $in: documentIds } });

    step = 'reviewtokens';
    counts.reviewtokens =
      documentIds.length === 0
        ? 0
        : await remove(ReviewToken, { documentId: { $in: documentIds } });

    step = 'factdiffs';
    counts.factdiffs = dryRun
      ? await FactDiff.countDocuments(byUser)
      : await deleteFactDiffsFor({ userId });

    step = 'factledgers';
    counts.factledgers = await remove(FactLedgerModel, byUser);

    step = 'generations';
    counts.generations = await remove(Generation, byUser);

    step = 'llmauxcalls';
    counts.llmauxcalls = await remove(LlmAuxCall, byUser);

    step = 'usagelogs';
    counts.usagelogs = await remove(UsageLog, byUser);

    step = 'events';
    counts.events = await remove(Event, byUser);

    step = 'templateusages';
    counts.templateusages = await remove(TemplateUsage, byUser);

    step = 'sectionbookmarks';
    counts.sectionbookmarks = await remove(SectionBookmark, byUser);

    step = 'sectionrecents';
    counts.sectionrecents = await remove(SectionRecent, byUser);

    step = 'bonuscredits';
    counts.bonuscredits = await remove(BonusCredit, byUser);

    step = 'documents';
    counts.documents = await remove(LawieDocument, byUser);
  } catch (err) {
    logger.warn(
      {
        userId,
        dryRun,
        step,
        errName: err instanceof Error ? err.name : 'UnknownError',
        counts,
      },
      'Account erase step failed (drafting); the caller retries',
    );
    return { ok: false, dryRun, counts, failedAt: step };
  }

  logger.info(
    { userId, dryRun, counts },
    dryRun ? 'Account erase dry run (drafting)' : 'Account erased (drafting)',
  );
  return { ok: true, dryRun, counts };
}
