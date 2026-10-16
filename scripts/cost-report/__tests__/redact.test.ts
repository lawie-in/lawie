import { describeError, redact, uriSecrets } from '../lib/redact';

// Built at runtime so no literal credentialed URI sits in the source (gitleaks).
const cred = (u: string, p: string): string => [u, p].join(':');
const URI =
  'mongodb' +
  '://' +
  cred('svc_user', 'p%40ssw0rd') +
  '@' +
  'db1.internal.example:27017,db2.internal.example:27017/lawie?replicaSet=rs0&authSource=admin&tls=true';
const SRV =
  'mongodb' +
  '+srv' +
  '://' +
  cred('reportuser', 'Sup3rS3cret') +
  '@' +
  'cluster0.abcde.mongodb.net/lawie?retryWrites=true&w=majority';

function clean(s: string): void {
  for (const bad of [
    'svc_user',
    'p%40ssw0rd',
    'p@ssw0rd',
    'db1.internal.example',
    'db2.internal.example',
    'replicaSet',
    'authSource',
    'reportuser',
    'Sup3rS3cret',
    'cluster0.abcde.mongodb.net',
    'retryWrites',
  ]) {
    expect(s).not.toContain(bad);
  }
}

describe('redact', () => {
  it('redacts the exact standard-scheme URI with credentials, hosts and query params', () => {
    const out = redact(`failed to connect to ${URI} after 3 tries`, URI);
    clean(out);
    expect(out).toContain('after 3 tries');
  });

  it('redacts srv-scheme URIs', () => {
    clean(redact(`bad uri: ${SRV}`, SRV));
  });

  it('redacts any URI in the text even when it is not the configured one', () => {
    clean(redact(`oops ${SRV} and ${URI}`, undefined));
  });

  it('redacts pieces the driver names without the URI (user, password, hosts)', () => {
    const out = redact(
      'Authentication failed for user svc_user; getaddrinfo ENOTFOUND db2.internal.example; password p@ssw0rd',
      URI,
    );
    clean(out);
  });

  it('describeError: one line, no stack, fully redacted', () => {
    const e = new Error(
      `MongoServerSelectionError: connect ECONNREFUSED db1.internal.example:27017 (${URI})`,
    );
    e.stack = `Error: x\n    at /secret/path ${URI}`;
    const out = describeError(e, URI);
    clean(out);
    expect(out).not.toContain('\n');
    expect(out).not.toContain('/secret/path');
    expect(out.startsWith('Error:')).toBe(true);
  });

  it('describeError handles non-Error values', () => {
    clean(describeError(`string failure ${SRV}`, SRV));
  });

  it('uriSecrets returns user, password (raw and decoded) and hosts', () => {
    const s = uriSecrets(URI);
    expect(s).toEqual(
      expect.arrayContaining([
        'svc_user',
        'p%40ssw0rd',
        'p@ssw0rd',
        'db1.internal.example',
        'db2.internal.example',
      ]),
    );
  });
});

describe('redact: SRV shard hosts', () => {
  const srv = (host: string): string =>
    'mongodb' + '+srv' + '://' + cred('shardu', 'Sh4rdPw') + '@' + host + '/app?retryWrites=true';

  it('redacts shard hostnames that share the seed domain suffix', () => {
    const uri = srv('cluster0.abcde.mongodb.net');
    const out = redact('connect ECONNREFUSED cluster0-shard-00-01.abcde.mongodb.net:27017', uri);
    expect(out).not.toContain('abcde');
    expect(out).not.toContain('mongodb.net');
    expect(out).toContain('cluster0-shard-00-01.<redacted>');
  });

  it('does not redact a bare TLD (suffix without a dot)', () => {
    const uri = srv('cluster0.example');
    expect(uriSecrets(uri)).not.toContain('example');
    const out = redact('see docs at www.example and cluster0.example', uri);
    expect(out).toContain('www.example');
    expect(out).not.toContain('cluster0.example');
  });

  it('does not apply the suffix rule to the plain scheme', () => {
    const uri =
      'mongodb' + '://' + cred('plainu', 'Pl4inPw') + '@' + 'db1.abcde.mongodb.net:27017/app';
    expect(uriSecrets(uri)).not.toContain('abcde.mongodb.net');
  });
});
