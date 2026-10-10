/**
 * Confidence floors per fact type: a fact read below its floor goes to
 * `unresolved` for Reception to ask about rather than into `facts`.
 *
 * FIRST-PASS VALUES, NOT CALIBRATED. The floors are ADR-022 open question 5;
 * calibration against the golden set happens in T-147e. Nothing reads these
 * yet (wiring is T-147b).
 */
import type { FactType } from '../../types/fact-ledger';

/** ADR-022 open question 5 (first pass; calibrate in T-147e). */
export const CONFIDENCE_FLOOR_AMOUNT = 0.9;
/** ADR-022 open question 5 (first pass; calibrate in T-147e). */
export const CONFIDENCE_FLOOR_DATE = 0.9;
/** ADR-022 open question 5 (first pass; calibrate in T-147e). */
export const CONFIDENCE_FLOOR_PERSON_NAME = 0.8;
/** ADR-022 open question 5 (first pass; calibrate in T-147e). */
export const CONFIDENCE_FLOOR_PLACE_NAME = 0.8;
/** ADR-022 open question 5 (first pass; calibrate in T-147e). */
export const CONFIDENCE_FLOOR_POLICE_STATION = 0.8;
/** ADR-022 open question 5 (first pass; calibrate in T-147e). */
export const CONFIDENCE_FLOOR_COURT = 0.8;
/** ADR-022 open question 5 (first pass; calibrate in T-147e). */
export const CONFIDENCE_FLOOR_SECTION_REF = 0.9;
/** ADR-022 open question 5 (first pass; calibrate in T-147e). */
export const CONFIDENCE_FLOOR_CASE_NUMBER = 0.9;
/** ADR-022 open question 5 (first pass; calibrate in T-147e). */
export const CONFIDENCE_FLOOR_TEXT = 0.6;
/** ADR-022 open question 5 (first pass; calibrate in T-147e). */
export const CONFIDENCE_FLOOR_ENUM = 0.8;
/** ADR-022 open question 5 (first pass; calibrate in T-147e). */
export const CONFIDENCE_FLOOR_BOOLEAN = 0.8;

/** The floors above, by fact type. */
export const CONFIDENCE_FLOORS: Readonly<Record<FactType, number>> = {
  amount: CONFIDENCE_FLOOR_AMOUNT,
  date: CONFIDENCE_FLOOR_DATE,
  person_name: CONFIDENCE_FLOOR_PERSON_NAME,
  place_name: CONFIDENCE_FLOOR_PLACE_NAME,
  police_station: CONFIDENCE_FLOOR_POLICE_STATION,
  court: CONFIDENCE_FLOOR_COURT,
  section_ref: CONFIDENCE_FLOOR_SECTION_REF,
  case_number: CONFIDENCE_FLOOR_CASE_NUMBER,
  text: CONFIDENCE_FLOOR_TEXT,
  enum: CONFIDENCE_FLOOR_ENUM,
  boolean: CONFIDENCE_FLOOR_BOOLEAN,
};
