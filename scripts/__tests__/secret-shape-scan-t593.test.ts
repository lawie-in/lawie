import { spawnSync } from 'node:child_process';
import path from 'node:path';

// T-593: the SHA allowlist deny rule now uses secret STEMS inside joined labels (HMACSECRET,
// MYTOKEN, ...), exempts company-secretary words, and sees through invisible characters and
// full-width look-alikes. Every fake value and every invisible / full-width character is built
// at runtime from fragments and \u escapes; the file holds no secret-shaped literal.
const ROOT = path.resolve(__dirname, '..', '..');
// T593_SCAN_PATH lets a reviewer point this file at another copy of the scan (e.g. the HEAD one).
const SCAN = process.env.T593_SCAN_PATH || path.join(ROOT, 'scripts/secret-shape-scan.mjs');
const hex = (n: number) => 'a1b2c3d4e5f60789'.repeat(Math.ceil(n / 16)).slice(0, n);
const H64 = hex(64);
const H40 = hex(40);

const ZWSP = '\u200b';
const ZWNJ = '\u200c';
const ZWJ = '\u200d';
const WJ = '\u2060';
const BOM = '\ufeff';
const SHY = '\u00ad';
/** Full-width form of an ASCII string (U+FF01..U+FF5E). */
const fw = (s: string) =>
  [...s]
    .map((c) => (c === ' ' ? '\u3000' : String.fromCharCode(c.charCodeAt(0) + 0xfee0)))
    .join('');

/** Number of hits per text, all texts scanned in one node process. */
function hitCounts(texts: string[]): number[] {
  const script =
    `import { scanText } from ${JSON.stringify('file://' + SCAN)};` +
    `const t = JSON.parse(process.argv[1]);` +
    `process.stdout.write(JSON.stringify(t.map((x) => scanText(x).length)));`;
  const r = spawnSync('node', ['--input-type=module', '-e', script, JSON.stringify(texts)], {
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error('scan harness failed');
  return JSON.parse(r.stdout);
}
const hits = (text: string) => hitCounts([text])[0];
const labelled = (label: string, h = H64) => `SHA-256 ${label} ${h}\n`;

describe('T-593 deny stems: joined labels next to a SHA are not trusted', () => {
  it.each([
    'HMACSECRET',
    'RAZORPAYSECRET',
    'MYTOKEN',
    'JWTSECRET',
    'ENCRYPTIONKEY',
    'SIGNINGKEY',
    'PASSWD',
    'hmacsecret',
    'Hmacsecret',
    'SECRETHMAC',
    'HMACKEY',
    'DBPWD',
    'AWSCREDS',
    'PASSPHRASE',
    'dbcredential',
  ])('HITS: SHA label %s', (label) => {
    expect(hits(labelled(label))).toBe(1);
  });

  it.each(['HMACSECRET:', 'RAZORPAYSECRET='])('HITS: label with trailing punctuation %s', (l) => {
    expect(hits(labelled(l))).toBe(1);
  });

  it.each([
    'APIKEY',
    'PRIVATEKEY',
    'CLIENTSECRET',
    'WEBHOOKSECRET',
    'ACCESSKEY',
    'AUTHTOKEN',
    'BEARERTOKEN',
    'apikey',
  ])('HITS (already denied before T-593): %s', (label) => {
    expect(hits(labelled(label))).toBe(1);
  });

  it.each(['HMAC2SECRET', 'HMAC.SECRET', 'HMAC/SECRET', 'HMAC2KEY'])(
    'HITS: digit or separator variant %s',
    (label) => {
      expect(hits(labelled(label))).toBe(1);
    },
  );

  it('HITS: the deny label is in the heading above the hex line', () => {
    expect(hits(`## Final ship SHA\nHMACSECRET ${H40}\n`)).toBe(1);
    expect(hits(`## SHA of MYTOKEN\n${H40}\n`)).toBe(1);
  });

  it('HITS: the deny label is in the table header row', () => {
    expect(hits(`| JWTSECRET | SHA-256 |\n| --- | --- |\n| row | ${H64} |\n`)).toBe(1);
  });
});

describe('T-593 false-positive guards: legal and ordinary prose still allowed', () => {
  it.each([
    ['rapid capital', labelled('rapid capital')],
    ['monkey keyboard', labelled('monkey keyboard')],
    ['HMAC nonce re-derive', labelled('HMAC nonce re-derive')],
    ['PWDVA', labelled('PWDVA')],
    ['PwD', labelled('PwD')],
    ['pwd', labelled('pwd')],
    ['company secretary', labelled('company secretary')],
    ['secretariat', labelled('secretariat')],
    ['credit', labelled('credit')],
    ['incredible', labelled('incredible')],
    ['salt', labelled('salt')],
    ['seed', labelled('seed')],
    ['nonce', labelled('nonce')],
    ['HMAC', labelled('HMAC')],
    ['turkey', labelled('turkey')],
    ['hockey', labelled('hockey')],
    ['donkey', labelled('donkey')],
    ['plain SHA-256:', `SHA-256: ${H64}\n`],
  ])('PASSES: %s', (_n, text) => {
    expect(hits(text)).toBe(0);
  });
});

describe('T-593 invisible and full-width look-alikes', () => {
  it.each([
    ['SE+ZWSP+CRET', `SE${ZWSP}CRET`],
    ['S+SHY+ECRET', `S${SHY}ECRET`],
    ['SE+ZWNJ+CRET', `SE${ZWNJ}CRET`],
    ['SE+ZWJ+CRET', `SE${ZWJ}CRET`],
    ['TO+WJ+KEN', `TO${WJ}KEN`],
    ['SEC+BOM+RET', `SEC${BOM}RET`],
    ['full-width SECRET', fw('SECRET')],
    ['full-width MYTOKEN', fw('MYTOKEN')],
    ['full-width HMACSECRET', fw('HMACSECRET')],
  ])('HITS: %s', (_n, label) => {
    expect(hits(labelled(label))).toBe(1);
  });

  it('HITS: invisibly split label in the heading', () => {
    expect(hits(`## SHA of SE${ZWSP}CRET\n${H40}\n`)).toBe(1);
  });

  it.each([
    ['rapid+ZWSP+capital', `rapid${ZWSP}capital`],
    ['full-width "rapid capital"', fw('rapid capital')],
    ['HMAC+ZWSP+" nonce"', `HMAC${ZWSP} nonce`],
    ['P+SHY+WDVA', `P${SHY}WDVA`],
    ['"company secre"+ZWSP+"tary"', `company secre${ZWSP}tary`],
  ])('PASSES: invisible characters inside an innocent label: %s', (_n, label) => {
    expect(hits(labelled(label))).toBe(0);
  });
});

describe('T-593 the SHA label must be real', () => {
  it('HITS: a full-width "SHA-256" is not a SHA label, so the hex is not allowed', () => {
    expect(hits(`${fw('SHA-256')} ${H64}\n`)).toBe(1);
  });

  it('HITS: a ZWSP inside "SHA" is not a SHA label', () => {
    expect(hits(`S${ZWSP}HA-256 ${H64}\n`)).toBe(1);
  });

  it('PASSES: the real label with the same hex is allowed (control)', () => {
    expect(hits(`SHA-256 ${H64}\n`)).toBe(0);
  });
});

describe('T-593 round 2: all-caps joined KEY / WEBHOOK / API labels', () => {
  it.each([
    'RAZORPAYKEY',
    'MYKEY',
    'JWTKEY',
    'ENCKEY',
    'RAZORPAYWEBHOOK',
    'RZPAPI',
    'RAZORPAYKEYS',
    'RAZORPAYKEYID',
    'RZPWEBHOOKS',
    'RAZORPAYKEY:',
    'MYKEY=',
    'HMAC2KEY',
    'DB2KEY',
    'KEY',
    'API',
    'WEBHOOKS',
  ])('HITS: SHA label %s', (label) => {
    expect(hits(labelled(label))).toBe(1);
  });

  it('HITS: full-width RAZORPAYKEY', () => {
    expect(hits(labelled(fw('RAZORPAYKEY')))).toBe(1);
  });

  it('HITS: RAZORPAY + ZWSP + KEY', () => {
    expect(hits(labelled(`RAZORPAY${ZWSP}KEY`))).toBe(1);
  });

  it('HITS: label in the heading above the hex line', () => {
    expect(hits(`## Final ship SHA\nRAZORPAYKEY ${H40}\n`)).toBe(1);
  });

  it('HITS: label in the table header row', () => {
    expect(hits(`| RZPAPI | SHA-256 |\n| --- | --- |\n| row | ${H64} |\n`)).toBe(1);
  });

  it.each([
    'MONKEY',
    'TURKEY',
    'HOCKEY',
    'DONKEY',
    'JOCKEY',
    'WHISKEY',
    'TURNKEY',
    'HOTKEY',
    'OKAPI',
    'MONKEYS',
    'KEYBOARD',
    'CAPITAL',
    'RAPID',
    'APIARY',
    'LAPIS',
    'HAPIER',
    'monkey',
    'turkey',
    'Turkey',
    'rapid capital',
    'turnkey',
  ])('PASSES: false-positive guard %s', (label) => {
    expect(hits(labelled(label))).toBe(0);
  });
});

describe('T-593 round 3: digits or a version tag after the suffix do not hide it', () => {
  // Built from fragments so no full label sits in the source as one literal.
  it.each([
    ['RAZORPAY', 'KEY2'],
    ['MY', 'KEY1'],
    ['JWT', 'KEY2'],
    ['RZP', 'API2'],
    ['RAZORPAY', 'WEBHOOK2'],
    ['RAZORPAY', 'KEYV2'],
    ['DB', 'PWD2'],
  ])('HITS: SHA label %s%s', (a, b) => {
    expect(hits(labelled(a + b))).toBe(1);
  });

  it.each(['MONKEY2', 'TURKEY1', 'CAPITAL2', 'RAPID3', 'KEYBOARD2', 'SHA256'])(
    'PASSES: false-positive guard %s',
    (label) => {
      expect(hits(labelled(label))).toBe(0);
    },
  );
});

describe('T-593 documented residuals (not protected, not pinned)', () => {
  // Residual: Cyrillic or Greek look-alike letters inside a label (e.g. a Cyrillic "E" in
  // SECRET) are not folded by NFKC, so they are not denied yet.
  it.todo('deny Cyrillic / Greek look-alike letters inside a secret label');
  // Residual: bare hmac, salt, nonce and seed are not deny words (HMACSALT, SEEDHEX pass).
  it.todo('decide whether bare hmac / salt / nonce / seed joined labels should be denied');
  // Residuals of the all-caps suffix rule, deliberately not pinned as desired behaviour.
  it.todo('deny lower / Title-case joined labels (razorpaykey, Mykey, rzpapi)');
  it.todo('deny all-caps labels with the secret word as PREFIX (KEYRAZORPAY, APIRZP)');
  it.todo('deny all-caps labels with the secret word as INFIX (RAZORPAYKEYPROD, RAZORPAYAPIPROD)');
  it.todo('invisible characters outside the stripped list');
});
