/**
 * T-573: criminal_revision.json gets T-566 item 65 (no Lawie disclaimer inside the pleading) and
 * item 64 (sentence S, no judgment names). Strings are written inline; this file reads no file
 * under handoff/. No database, no network, no model call.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const PACK = join(__dirname, '..', 'config', 'document-rules', 'criminal_revision.json');
const SENTENCE_S =
  'Do not name any judgment. Where an authority would normally be cited, write [Authority — add if relied upon].';

type Pack = Record<string, unknown>;
const pack = (): Pack => JSON.parse(readFileSync(PACK, 'utf-8')) as Pack;

function objects(o: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(o)) o.forEach((x) => objects(x, out));
  else if (o && typeof o === 'object') {
    out.push(o as Record<string, unknown>);
    Object.values(o).forEach((x) => objects(x, out));
  }
  return out;
}

function instructions(p: Pack): string[] {
  const pc = p.prompt_context as Record<string, unknown> | undefined;
  return ((pc && typeof pc === 'object' ? pc.promptInstructions : undefined) ??
    p.promptInstructions) as string[];
}

describe('T-573 criminal_revision pack', () => {
  it('65: no mandatory clause with id disclaimer / lawie_disclaimer anywhere', () => {
    const bad = objects(pack()).filter((o) => o.id === 'disclaimer' || o.id === 'lawie_disclaimer');
    expect(bad).toEqual([]);
    const clauses = (pack().mandatory_clauses ?? pack().mandatoryClauses ?? []) as unknown[];
    expect(Array.isArray(clauses)).toBe(true);
    expect(clauses.length).toBeGreaterThan(0);
  });

  it('65: no promptInstructions element contains "Append Lawie disclaimer"', () => {
    const list = instructions(pack());
    expect(Array.isArray(list)).toBe(true);
    expect(list.some((x) => /Append Lawie disclaimer/i.test(x))).toBe(false);
  });

  it('65d: the top-level disclaimer key is kept', () => {
    expect(pack()).toHaveProperty('disclaimer');
  });

  it('64: sentence S is the last promptInstructions element, exactly once', () => {
    const list = instructions(pack());
    expect(list[list.length - 1]).toBe(SENTENCE_S);
    expect(list.filter((x) => x === SENTENCE_S)).toHaveLength(1);
  });
});
