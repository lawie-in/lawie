/**
 * T-346: one shared post-draft citation check (checkDraftCitations) for the template,
 * brief and guided draft paths. No behaviour change: order and content are what the
 * three paths each built inline before (T-270 ruling A, SCRUM-64 b, T-333).
 */
import './setupEnv';

import * as fs from 'fs';
import * as path from 'path';

import { checkDraftCitations } from '../services/validator';

jest.mock('../services/sections.service', () => ({
  convertOldReferencesInText: jest.fn(async (text: string) => ({
    converted: text,
    conversions: [],
  })),
  lookupOldToNew: jest.fn(async (section: string, code: string) =>
    section === '302' && code === 'IPC'
      ? {
          old_code: 'IPC',
          old_code_full: 'Indian Penal Code',
          old_section: '302',
          old_title: 'Punishment for murder',
          new_code: 'BNS',
          new_code_full: 'Bharatiya Nyaya Sanhita',
          new_section: '103(1)',
          new_title: 'Punishment for murder',
          mapping_type: 'direct',
        }
      : null,
  ),
}));

const MIXED = 'Section 302 IPC, BNS 999, BSA 999, Section 999 IPC';

describe('T-346 checkDraftCitations', () => {
  it('returns old-law, then BNS whitelist, then other-code warnings, in that order', async () => {
    const w = await checkDraftCitations(MIXED);
    expect(w.map((x) => `${x.type}:${x.details?.code}:${x.details?.section}`)).toEqual([
      'old_law_reference:IPC:302',
      'invalid_section:BNS:999',
      'invalid_section:BSA:999',
      'invalid_section:IPC:999',
    ]);
  });

  it('ruling A: 999 IPC appears only as invalid_section, never as old_law_reference', async () => {
    const w = await checkDraftCitations(MIXED);
    const ipc999 = w.filter((x) => x.details?.code === 'IPC' && x.details?.section === '999');
    expect(ipc999).toHaveLength(1);
    expect(ipc999[0].type).toBe('invalid_section');
  });

  it('warns about a bad BNS section once, not from both the whitelist and the other-code check', async () => {
    const w = await checkDraftCitations(MIXED);
    expect(w.filter((x) => x.details?.code === 'BNS')).toHaveLength(1);
  });

  it('returns [] for empty text and for text with no citations', async () => {
    expect(await checkDraftCitations('')).toEqual([]);
    expect(await checkDraftCitations('The accused was present at the scene.')).toEqual([]);
  });

  it('ai.service.ts calls only the helper, not the three checks directly', () => {
    const src = fs.readFileSync(path.join(__dirname, '../services/ai.service.ts'), 'utf8');
    expect(src).not.toMatch(
      /\b(validateSectionReferences|validateBNSWhitelist|detectOldLawReferences)\s*\(/,
    );
    expect(src.match(/checkDraftCitations\(/g)).toHaveLength(3);
  });
});
