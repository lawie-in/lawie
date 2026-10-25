// T-565 item 50 (Ajay, pre-Anushka legal review 22 Oct): four unused credit modals are deleted.
// They carried unsigned text and had no caller. Guard that they stay gone and stay unreferenced.
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../../..'); // apps/web/src
const DELETED = [
  'GenerationFailedModal',
  'LowBalanceModal',
  'DraftReadyModal',
  'UpgradeSuccessModal',
];

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : files(full);
    return /\.(ts|tsx|js|jsx|mjs)$/.test(e.name) ? [full] : [];
  });
}

describe('T-565 item 50: deleted credit modals', () => {
  it.each(DELETED)('%s.tsx does not exist', (name) => {
    expect(fs.existsSync(path.join(SRC, 'components/credits', `${name}.tsx`))).toBe(false);
  });

  it('scans a plausible number of files', () => {
    expect(files(SRC).length).toBeGreaterThan(100);
  });

  it('nothing in apps/web/src (sources and tests) imports, requires or mocks any of them', () => {
    const self = path.resolve(__filename);
    const hits: string[] = [];
    for (const f of files(SRC)) {
      if (path.resolve(f) === self) continue;
      const text = fs.readFileSync(f, 'utf8');
      for (const name of DELETED) {
        // an import, require, dynamic import or jest.mock of the module path (a comment that
        // names the deleted file is not a reference)
        const ref = new RegExp(`(?:from|import|require|mock)\\s*\\(?\\s*['"][^'"]*/${name}['"]`);
        if (ref.test(text)) hits.push(`${path.relative(SRC, f)}: ${name}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
