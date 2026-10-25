/**
 * T-115a — a document's case details (`formInputs`, and the filled-in
 * `filingChecklist` below) are stored encrypted.
 *
 * New writes set `formInputsEnc` = encrypt(JSON.stringify(inputs)) and leave
 * `formInputs` unset. Rows written before T-115a still hold the plain
 * `formInputs` until the backfill (`src/scripts/encrypt-case-details.ts`)
 * encrypts them. Every reader goes through `readFormInputs`, which handles both.
 *
 * A wrong ENCRYPTION_KEY or a damaged value throws (AES-GCM auth check): this
 * never returns garbage. Nothing here logs a value.
 */
import { applyFieldAliases } from '../services/rule-pack.service';

import { decrypt, encrypt } from './encryption';

export type FormInputs = Record<string, unknown>;

/** The fields `readFormInputs` looks at. A hydrated document and a `.lean()` row both fit. */
export interface FormInputsCarrier {
  formInputsEnc?: string | null;
  formInputs?: unknown;
  /** T-451: the pack, so pack-scoped option-id aliases apply (else the stored template_id). */
  rulePackId?: string | null;
}

function isRecord(v: unknown): v is FormInputs {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** The value to store in `formInputsEnc`. */
export function sealFormInputs(inputs: FormInputs): string {
  return encrypt(JSON.stringify(inputs));
}

/**
 * The document's case details: `formInputsEnc` decrypted when set, else the
 * legacy plain `formInputs`, else null. Throws when `formInputsEnc` cannot be
 * decrypted (wrong key, tampered) or does not hold an object.
 *
 * T-382: a draft saved before the pack key rename reads with the new key too
 * (`applyFieldAliases`, old -> new only when new is absent).
 */
export function readFormInputs(doc: FormInputsCarrier): FormInputs | null {
  const enc = doc.formInputsEnc;
  if (typeof enc === 'string' && enc.length > 0) {
    const parsed: unknown = JSON.parse(decrypt(enc));
    if (!isRecord(parsed)) throw new Error('formInputsEnc does not hold an object');
    return applyFieldAliases(parsed, doc.rulePackId);
  }
  return isRecord(doc.formInputs) ? applyFieldAliases(doc.formInputs, doc.rulePackId) : null;
}

// ── Filing checklist (T-115a) ───────────────────────────────────────────────
// The checklist items are template lines filled with the user's form values,
// so they are case details too. `checklistState` (booleans) stays plain.

/** The fields `readFilingChecklist` looks at. A hydrated document and a `.lean()` row both fit. */
export interface FilingChecklistCarrier {
  filingChecklistEnc?: string | null;
  filingChecklist?: readonly unknown[] | null;
}

function isStringList(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

/** The value to store in `filingChecklistEnc`. */
export function sealFilingChecklist(items: readonly string[]): string {
  return encrypt(JSON.stringify(items));
}

/**
 * The document's filing checklist: `filingChecklistEnc` decrypted when set,
 * else the legacy plain `filingChecklist`, else []. Returns a fresh plain
 * array. Throws when `filingChecklistEnc` cannot be decrypted (wrong key,
 * tampered) or does not hold a list of strings.
 */
export function readFilingChecklist(doc: FilingChecklistCarrier): string[] {
  const enc = doc.filingChecklistEnc;
  if (typeof enc === 'string' && enc.length > 0) {
    const parsed: unknown = JSON.parse(decrypt(enc));
    if (!isStringList(parsed)) throw new Error('filingChecklistEnc does not hold a list');
    return [...parsed];
  }
  const plain = doc.filingChecklist;
  return Array.isArray(plain) ? plain.filter((x): x is string => typeof x === 'string') : [];
}
