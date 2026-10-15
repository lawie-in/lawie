/**
 * T-436 AC10 (round 2): a Redis that "requires a password", without a second redis-server.
 *
 * CI has only a password-free Redis service container (REDIS_TEST_URL) that other suites share, so
 * a test cannot start a private `redis-server --requirepass` there, nor CONFIG SET requirepass
 * or CLIENT KILL on the shared one. This is a small RESP gate on 127.0.0.1 instead: until a client
 * sends a valid AUTH it only answers AUTH / QUIT (anything else gets -NOAUTH, a wrong password
 * gets -WRONGPASS, as Redis does). After a valid AUTH it replies +OK itself (the upstream has no
 * password, so the AUTH is never forwarded) and pipes the connection to the real Redis.
 * Only the bytes a client sends are forwarded: no CONFIG, FLUSH* or CLIENT KILL ever reaches
 * the shared server.
 *
 * Same code lives in apps/auth and apps/email-worker (workspaces do not import each other's tests).
 */
import net from 'net';

interface Command {
  args: string[];
  rest: Buffer;
}

/** Parses one RESP array command off the front of buf; null when it is incomplete. */
function parseCommand(buf: Buffer): Command | null {
  if (buf.length === 0 || buf[0] !== 0x2a) return null; // '*'
  const head = buf.indexOf('\r\n');
  if (head < 0) return null;
  const count = Number(buf.subarray(1, head).toString());
  let pos = head + 2;
  const args: string[] = [];
  for (let k = 0; k < count; k += 1) {
    const eol = buf.indexOf('\r\n', pos);
    if (eol < 0) return null;
    const len = Number(buf.subarray(pos + 1, eol).toString());
    const start = eol + 2;
    if (buf.length < start + len + 2) return null;
    args.push(buf.subarray(start, start + len).toString());
    pos = start + len + 2;
  }
  return { args, rest: buf.subarray(pos) };
}

export interface AuthProxy {
  port: number;
  /** Changes the accepted password (new AUTHs only; open connections stay open). */
  setPassword: (password: string) => void;
  /** Destroys every open client connection, like CLIENT KILL, without touching the upstream server. */
  killClients: () => void;
  close: () => Promise<void>;
}

/** Only the `default` user is valid, as with requirepass. */
export async function createAuthProxy(upstreamUrl: string, password: string): Promise<AuthProxy> {
  const upstream = new URL(upstreamUrl);
  let current = password;
  const sockets = new Set<net.Socket>();

  const server = net.createServer((client) => {
    sockets.add(client);
    let buf: Buffer = Buffer.alloc(0);
    let up: net.Socket | undefined;
    const closeAll = (): void => {
      client.destroy();
      up?.destroy();
      sockets.delete(client);
    };
    client.on('error', closeAll);
    client.on('close', closeAll);
    client.on('data', (chunk: Buffer) => {
      if (up) {
        up.write(chunk);
        return;
      }
      buf = Buffer.concat([buf, chunk]);
      let cmd: Command | null;
      while (!up && (cmd = parseCommand(buf))) {
        buf = cmd.rest;
        const [name, ...rest] = cmd.args;
        const verb = (name ?? '').toUpperCase();
        if (verb === 'AUTH') {
          const [user, pw] = rest.length === 1 ? ['default', rest[0]] : rest;
          if (user === 'default' && pw === current) {
            client.write('+OK\r\n');
            const link = net.connect(Number(upstream.port), upstream.hostname);
            up = link;
            link.on('error', closeAll);
            link.on('close', closeAll);
            link.pipe(client);
            if (buf.length > 0) link.write(buf);
            buf = Buffer.alloc(0);
          } else {
            client.write('-WRONGPASS invalid username-password pair or user is disabled.\r\n');
          }
        } else if (verb === 'QUIT') {
          client.end('+OK\r\n');
        } else {
          client.write('-NOAUTH Authentication required.\r\n');
        }
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const killClients = (): void => {
    for (const s of sockets) s.destroy();
  };
  return {
    port: (server.address() as net.AddressInfo).port,
    setPassword: (p: string) => {
      current = p;
    },
    killClients,
    close: () =>
      new Promise<void>((resolve) => {
        killClients();
        server.close(() => resolve());
      }),
  };
}
