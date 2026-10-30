/**
 * T-612 step 2: the averments for the paid-or-deposited (G2) and bail-bond (G4) grounds, in both bail
 * packs. The expected text is the signed ground wording (handoff/legal/T-612-bail-grounds-wording-signed.md),
 * as the averment kind writes it (lower case, no final stop).
 */
import './setupEnv';

import { readFileSync } from 'fs';
import { join } from 'path';

import type { LedgerFact } from '@lawie/shared';

import { checkUnlockPairs, conditionHolds, loadAvermentLists } from '../services/averments';
import { buildChecklist } from '../services/intake-brief';
import { loadRulePack } from '../services/rule-pack.service';

import { fact } from './fixtures/t373';

type PackId = 'bail_regular' | 'bail_anticipatory';
const PACKS: PackId[] = ['bail_regular', 'bail_anticipatory'];
const FOUR = ['bail_regular', 'bail_anticipatory', 'bail_before_magistrate', 'default_bail'];

const G2 = {
  id: 'amount_paid_or_deposited',
  label: 'Amount in dispute paid or deposited (without admission)',
  text: "the amount in dispute has been paid or deposited by or on behalf of the applicant, without prejudice to the applicant's defence",
};
const G4 = {
  id: 'ready_to_furnish_bail_bond_and_sureties',
  label: 'Ready to furnish a bail bond and sureties',
  text: "the applicant is ready to furnish a bail bond with surety to the satisfaction of this Hon'ble Court and to abide by every condition this Hon'ble Court may impose",
};
const CIVIL = 'Dispute is essentially civil in nature';

function walk(node: unknown, visit: (o: Record<string, unknown>) => void): void {
  if (Array.isArray(node)) node.forEach((n) => walk(n, visit));
  else if (node !== null && typeof node === 'object') {
    visit(node as Record<string, unknown>);
    Object.values(node).forEach((n) => walk(n, visit));
  }
}
function packGroundOptions(p: PackId): Array<{ id: string; label: string }> {
  const file = join(__dirname, '..', 'config', 'document-rules', `${p}.json`);
  const out: Array<{ id: string; label: string }> = [];
  walk(JSON.parse(readFileSync(file, 'utf-8')), (o) => {
    if (
      (o.field_id === 'grounds_for_bail' || o.id === 'grounds_for_bail') &&
      Array.isArray(o.options)
    ) {
      out.push(...(o.options as Array<{ id: string; label: string }>));
    }
  });
  return out;
}
const groundsLabel = (p: PackId): string =>
  buildChecklist(loadRulePack(p)!).find((i) => i.key === 'grounds_for_bail')!.label;

const held = (...displays: string[]): ReadonlyMap<string, readonly LedgerFact[]> =>
  new Map([['grounds_for_bail', displays.map((d) => fact('grounds_for_bail', d))]]);

describe.each(PACKS)('T-612 averments, %s', (packId) => {
  const lists = loadAvermentLists(packId);
  const entry = (id: string) => lists.allowed.find((a) => a.id === id);

  it.each([G2, G4])('$id is an allowed averment with the signed text, byte for byte', (g) => {
    const e = entry(g.id);
    expect(e).toBeDefined();
    expect(e!.kind).toBe('averment');
    expect(e!.averment).toBe(g.text);
    expect(lists.allowed.filter((a) => a.id === g.id)).toHaveLength(1);
  });

  it.each([G2, G4])("$id requires the pack's grounds_for_bail label and option label", (g) => {
    expect(entry(g.id)!.requires).toEqual({
      key: 'grounds_for_bail',
      label: groundsLabel(packId),
      equals: [g.label],
    });
  });

  it.each([G2, G4])('$id equals label matches the pack option label byte for byte', (g) => {
    const opt = packGroundOptions(packId).find((o) => o.id === g.id);
    expect(opt?.label).toBe(g.label);
    const req = entry(g.id)!.requires as { equals: string[] };
    expect(req.equals).toEqual([opt!.label]);
  });

  it('G2 unlocks with its label among the entries', () => {
    const req = entry(G2.id)!.requires;
    expect(conditionHolds(req, held(CIVIL, G2.label))).toBe(true);
  });

  it('G2 does not unlock with only G4, with no grounds key, or with the option id as the entry', () => {
    const req = entry(G2.id)!.requires;
    expect(conditionHolds(req, held(G4.label))).toBe(false);
    expect(conditionHolds(req, new Map())).toBe(false);
    expect(conditionHolds(req, held(G2.id))).toBe(false);
  });

  it('G4 unlocks with its label and not with only G2 or the option id', () => {
    const req = entry(G4.id)!.requires;
    expect(conditionHolds(req, held(G2.label, G4.label))).toBe(true);
    expect(conditionHolds(req, held(G2.label))).toBe(false);
    expect(conditionHolds(req, held(G4.id))).toBe(false);
  });
});

describe('T-612 averments: unlock pairs', () => {
  it.each(FOUR)('%s passes checkUnlockPairs', (id) => {
    const lists = loadAvermentLists(id);
    expect(() => checkUnlockPairs(id, lists)).not.toThrow();
  });
});
