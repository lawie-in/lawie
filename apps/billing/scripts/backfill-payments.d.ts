/** Prod go-live, 23 Oct 2026 00:00 IST (Vikram 6). */
export declare const BACKFILL_FROM: Date;
type Entity = Record<string, unknown>;
/**
 * Legacy plan grants (sub_renewal rows written before the payment id was stored) cannot be
 * matched by payment id at runtime, and old grant rows carry no cycle key. Offline, ONE case
 * is unambiguous: the subscription has exactly ONE un-stamped sub_renewal row in total AND
 * exactly ONE captured plan charge in total. That grant can then only be that charge's: the
 * Payment row gets the grant's delta and the grant row is stamped with the payment id
 * (atomic, only if empty). Anything else is ambiguous: inkUnits 0, one log line with ids,
 * and a refund of it stays manual. Runtime matching stays payment-id only.
 */
export interface BackfillDeps {
  /** Razorpay subscription id of a plan charge (payment entity), or null. */
  subscriptionIdFor: (entity: Entity) => Promise<string | null>;
  /** Captured plan charges in total for a subscription (default: paid Razorpay invoices). */
  countCapturedPlanCharges: (razorpaySubscriptionId: string) => Promise<number>;
  log: (line: string) => void;
}
export interface BackfillCounts {
  inScope: number;
  /** New Payment rows written (dry run: that would be written). */
  written: number;
  /** Payments already recorded with Ink (webhook): left untouched. */
  alreadyRecorded: number;
  /** Legacy plan payments attributed to their subscription's single grant. */
  attributed: number;
  /** Plan payments with no confirmable grant: inkUnits 0; a refund of one stays manual. */
  ambiguous: number;
  unattributed: number;
}
export interface BackfillResult {
  counts: BackfillCounts;
  unattributedIds: string[];
  ambiguousIds: string[];
  refundedKeptInkIds: string[];
}
/**
 * The backfill for `payments` (Razorpay payment entities). `apply` defaults to false: the
 * dry run reads only and writes nothing. Needs an open mongoose connection; opens none.
 */
export declare function runPaymentsBackfill(
  payments: Entity[],
  options?: {
    apply?: boolean;
    deps?: Partial<BackfillDeps>;
  },
): Promise<BackfillResult>;
export {};
