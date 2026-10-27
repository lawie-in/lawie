// T-634: Document.courtType accepts and keeps 'high_court_bench'.
import { COURT_TYPES } from '@lawie/shared';

import { LawieDocument } from '../models/Document.model';

describe('T-634 Document courtType high_court_bench', () => {
  it('COURT_TYPES lists high_court_bench', () => {
    expect(Object.values(COURT_TYPES)).toContain('high_court_bench');
  });

  it('validates and keeps the value', () => {
    const doc = new LawieDocument({
      userId: '507f1f77bcf86cd799439613',
      title: 't',
      docType: 'injunction',
      courtType: 'high_court_bench',
    });
    expect(doc.validateSync()?.errors.courtType).toBeUndefined();
    expect(doc.courtType).toBe('high_court_bench');
  });

  it('still rejects an unknown courtType', () => {
    const doc = new LawieDocument({
      userId: '507f1f77bcf86cd799439613',
      title: 't',
      docType: 'injunction',
      courtType: 'nope',
    });
    expect(doc.validateSync()?.errors.courtType).toBeDefined();
  });
});
