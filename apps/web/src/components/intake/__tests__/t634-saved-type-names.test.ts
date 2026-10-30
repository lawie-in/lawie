// T-634: SAVED_TYPE_NAMES covers every key of the server's TYPE_LABELS (the /types handler in
// apps/drafting/src/routes/courts.routes.ts), with identical strings. TYPE_LABELS is a local
// const there, so the expected map is pinned here as a literal.
import { SAVED_TYPE_NAMES } from '../bailCourts';

const SERVER_TYPE_LABELS: Record<string, string> = {
  high_court: 'High Court',
  high_court_bench: 'High Court Bench',
  sessions: 'Sessions Court',
  district_court: 'District Court',
  cjm: 'Chief Judicial Magistrate',
  jmfc: 'Judicial Magistrate First Class',
  civil_court: 'Civil Court (Senior Division)',
  civil_court_junior: 'Civil Court (Junior Division)',
  supreme_court: 'Supreme Court',
  tribunal: 'Tribunal',
  consumer_commission: 'Consumer Commission',
  family_court: 'Family Court',
};

describe('T-634 SAVED_TYPE_NAMES', () => {
  it.each(Object.entries(SERVER_TYPE_LABELS))('has %s with the server label', (key, label) => {
    expect(SAVED_TYPE_NAMES[key]).toBe(label);
  });

  it('has no key the server label map lacks', () => {
    expect(Object.keys(SAVED_TYPE_NAMES).sort()).toEqual(Object.keys(SERVER_TYPE_LABELS).sort());
  });

  it('names civil_court_junior exactly "Civil Court (Junior Division)"', () => {
    expect(SAVED_TYPE_NAMES.civil_court_junior).toBe('Civil Court (Junior Division)');
  });
});
