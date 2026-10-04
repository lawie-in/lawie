/** Shapes returned by the describe-first intake API (ADR-019 §3.3, T-101, T-102). */

export interface FilledValue {
  value: string | string[];
  // 'image' arrives with T-301 (values read from an image, confirmed on review).
  source: 'description' | 'user' | 'image';
  quote?: string;
}

export interface IntakeQuestion {
  field_id: string;
  question: string;
  type: string;
  options?: Array<{ id: string; label: string }>;
  options_from?: string;
  source?: string;
  placeholder?: string;
  help?: string;
  min_select?: number;
}

export interface IntakeResponse {
  intake_id: string;
  outcome: 'matched' | 'needs_choice' | 'guided' | 'no_match' | 'unavailable';
  template_id?: string;
  display_name?: string;
  fields?: Record<string, FilledValue>;
  form_data?: Record<string, string | string[]>;
  missing?: string[];
  questions?: IntakeQuestion[];
  choices?: Array<{ template_id: string; display_name: string }>;
  needs_upgrade?: boolean;
}

export interface AnswersResponse {
  intake_id: string;
  template_id: string;
  fields: Record<string, FilledValue>;
  form_data: Record<string, string | string[]>;
  missing: string[];
  invalid: Array<{ field_id: string; reason: string }>;
  questions: IntakeQuestion[];
  ready: boolean;
  review: boolean;
  round: number;
}

/** Everything the page keeps between rounds. The server keeps no intake session. */
export interface IntakeState {
  intakeId: string;
  templateId: string;
  displayName: string;
  fields: Record<string, FilledValue>;
  formData: Record<string, string | string[]>;
  missing: string[];
  questions: IntakeQuestion[];
  round: number;
}
