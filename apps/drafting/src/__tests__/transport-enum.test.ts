/**
 * T-118 — rows written before the change carry transport 'helicone'. Both
 * models must still accept that value so old rows load and re-save; new rows
 * are always 'direct'. validateSync needs no database.
 */
import './setupEnv';

import { Generation } from '../models/Generation.model';
import { LlmAuxCall } from '../models/LlmAuxCall.model';

const transportError = (doc: { validateSync(...args: never[]): unknown }) =>
  (doc.validateSync() as { errors: Record<string, unknown> } | null)?.errors.transport;

describe('transport enum keeps the old gateway value (T-118 AC 3 and 7)', () => {
  it.each(['helicone', 'direct'])('Generation accepts transport %s', (transport) => {
    expect(transportError(new Generation({ transport }))).toBeUndefined();
  });

  it.each(['helicone', 'direct'])('LlmAuxCall accepts transport %s', (transport) => {
    expect(transportError(new LlmAuxCall({ transport }))).toBeUndefined();
  });

  it('both still reject a value that was never valid', () => {
    expect(transportError(new Generation({ transport: 'carrier-pigeon' }))).toBeDefined();
    expect(transportError(new LlmAuxCall({ transport: 'carrier-pigeon' }))).toBeDefined();
  });
});
