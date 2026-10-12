/**
 * T-278 - an auto-detected IPC number with no IPC table row (Ajay, CLO).
 * "999" must come back found:false with the signed NOT_IN_IPC_TABLE note, the same as "999-IPC",
 * and must never be looked up as a BNS section.
 */
import './setupEnv';
import fs from 'fs';
import path from 'path';

import { checkBailEligibility, NOT_IN_IPC_TABLE } from '../services/bail-check.service';

// IPC rows come from the signed table itself. Sections in `missingRows` are served as "no row",
// to reach the in-range path (every real IPC_INDICATORS number <= 358 has a row, see below).
const missingRows = new Set<string>();
jest.mock('../services/sections.service', () => {
  const nodeFs = jest.requireActual('fs') as typeof import('fs');
  const nodePath = jest.requireActual('path') as typeof import('path');
  const table = JSON.parse(
    nodeFs.readFileSync(
      nodePath.join(__dirname, '..', 'config', 'sections', 'ipc-to-bns.json'),
      'utf-8',
    ),
  ) as { mappings: Record<string, { new: string | null; type: string; new_title: string | null }> };
  return {
    lookupOldToNew: jest.fn(async (section: string, code: string) => {
      if (code !== 'IPC' || missingRows.has(section)) return null;
      const row = table.mappings[section];
      if (!row) return null;
      return {
        old_code: 'IPC',
        old_section: section,
        new_code: 'BNS',
        new_section: row.new,
        new_title: row.new_title,
        mapping_type: row.type,
      };
    }),
  };
});

afterEach(() => missingRows.clear());

describe('T-278: auto-detected IPC with no table row', () => {
  it('"999" returns found:false with the signed note, no offence, no guessed BNS section', async () => {
    const { sections } = await checkBailEligibility(['999']);
    expect(sections).toHaveLength(1);
    const s = sections[0];
    expect(s.found).toBe(false);
    expect(s.note).toBe(NOT_IN_IPC_TABLE);
    expect(s.note).toBe('Not found in the IPC table. Check the Gazette');
    expect(s.offence).toBeNull();
    expect(s.bnsSection).toBe('');
    expect(s.ipcSection).toBe('999');
  });

  it('"999" gives the same result as the explicit "999-IPC" (apart from the input text)', async () => {
    const auto = (await checkBailEligibility(['999'])).sections[0];
    const explicit = (await checkBailEligibility(['999-IPC'])).sections[0];
    expect(explicit.note).toBe(NOT_IN_IPC_TABLE);
    expect({ ...auto, input: '' }).toEqual({ ...explicit, input: '' });
  });

  it('"999" is undetermined in the summary, not a bailable/non-bailable verdict', async () => {
    const { summary } = await checkBailEligibility(['999']);
    expect(summary.overallBailable).toBeNull();
  });

  it('every IPC_INDICATORS number <= 358 has a real table row (so none can be tested unmocked)', () => {
    const table = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'config', 'sections', 'ipc-to-bns.json'), 'utf-8'),
    ) as { mappings: Record<string, unknown> };
    for (const s of ['302', '304', '304A', '306', '307', '354']) {
      expect(table.mappings[s]).toBeDefined();
    }
  });

  it('an in-range IPC indicator ("302") whose row is missing gets the note and no BNS offence', async () => {
    missingRows.add('302');
    const s = (await checkBailEligibility(['302'])).sections[0];
    expect(s.found).toBe(false);
    expect(s.note).toBe(NOT_IN_IPC_TABLE);
    expect(s.offence).toBeNull();
    expect(s.bnsSection).toBe('');
    expect(s.ipcSection).toBe('302');
  });

  it('with its row present, "302" still converts (guard against over-reach)', async () => {
    const s = (await checkBailEligibility(['302'])).sections[0];
    expect(s.found).toBe(true);
    expect(s.note).toBeUndefined();
    expect(s.bnsSection).toBe('103(1)');
  });
});
