/**
 * T-633: crew-role enforcement. The Claude Code CLI does not apply the `hooks:` frontmatter of
 * .claude/agents/dev/*.md to subagents, so enforcement lives in .claude/settings.json PreToolUse
 * and is dispatched by .claude/hooks/crew-role.sh on the hook input's `agent_type`.
 *
 * Every command and path below is only a string inside a JSON payload fed to a hook on stdin.
 * Nothing under test is ever executed. Children get a minimal explicit environment (PATH only);
 * the environment is never printed.
 */
import { spawnSync } from 'node:child_process';
import {
  accessSync,
  constants,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
  chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..');
const HOOK_DIR = join(ROOT, '.claude', 'hooks');
const CREW_ROLE = join(HOOK_DIR, 'crew-role.sh');
const R = '/home/user/lawie-wt/mahak';

const NUL = String.fromCharCode(0);
const NL = String.fromCharCode(10);
const CR = String.fromCharCode(13);

type Payload = Record<string, unknown>;

const base = { session_id: 't', hook_event_name: 'PreToolUse' };

function bashPayload(agent: string | null, command: string, withId = true): Payload {
  return {
    ...base,
    tool_name: 'Bash',
    tool_input: { command },
    ...(agent ? { agent_type: agent, ...(withId ? { agent_id: 'a1' } : {}) } : {}),
  };
}

function editPayload(agent: string | null, filePath: string, tool = 'Edit'): Payload {
  return {
    ...base,
    tool_name: tool,
    tool_input: { file_path: filePath, old_string: 'a', new_string: 'b' },
    ...(agent ? { agent_type: agent, agent_id: 'a1' } : {}),
  };
}

function notebookPayload(agent: string, notebookPath: string): Payload {
  return {
    ...base,
    tool_name: 'NotebookEdit',
    tool_input: { notebook_path: notebookPath, new_source: 'x' },
    agent_type: agent,
    agent_id: 'a1',
  };
}

function minimalEnv(path: string): NodeJS.ProcessEnv {
  return { PATH: path };
}

function run(script: string, input: string, path: string = process.env.PATH ?? '') {
  const r = spawnSync(findOnPath('bash'), [script], {
    input,
    encoding: 'utf8',
    env: minimalEnv(path),
  });
  return { status: r.status, stderr: r.stderr ?? '' };
}

/** Run a payload through crew-role.sh and assert exit status; blocks must explain themselves on stderr. */
function expectHook(input: string, want: 0 | 2, script: string = CREW_ROLE, path?: string) {
  const r = run(script, input, path);
  expect(r.status).toBe(want);
  if (want === 2) expect(r.stderr.trim().length).toBeGreaterThan(0);
}

const expectPayload = (p: Payload, want: 0 | 2) => expectHook(JSON.stringify(p), want);

// ---------------------------------------------------------------------------------------------
// Reviewer and doc-writer Bash (readonly-bash.sh via the dispatcher)
// ---------------------------------------------------------------------------------------------
const readonlyBlocked: Array<[string, string]> = [
  ['AC4 headline: git status; echo x', 'git status; echo x'],
  ['git log | grep x | tee out', 'git log | grep x | tee out'],
  ['git log | tee out', 'git log | tee out'],
  ['4-segment pipe', 'git log | grep a | grep b | head'],
  ['newline then second command', `git status${NL}touch x`],
  ['trailing newline', `git status${NL}`],
  ['carriage return', `git status${CR}touch x`],
  ['NUL byte', `git status${NUL}x`],
  ['git diff --output=f', 'git diff --output=f'],
  ['git diff --output f', 'git diff --output f'],
  ['git diff --outp=f (abbreviation)', 'git diff --outp=f'],
  ['git diff --ext-diff', 'git diff --ext-diff'],
  ['git show --textconv HEAD', 'git show --textconv HEAD'],
  ['cat a > b', 'cat a > b'],
  ['git log >> f', 'git log >> f'],
  ['cat < f', 'cat < f'],
  ['cat <(git log)', 'cat <(git log)'],
  ['git status & (background)', 'git status &'],
  ['git status &> f', 'git status &> f'],
  ['git log |& cat', 'git log |& cat'],
  ['git status && touch x', 'git status && touch x'],
  ['git status || touch x', 'git status || touch x'],
  ['backtick substitution', 'git log `touch x`'],
  ['$(..) substitution', 'git log $(touch x)'],
  ['${..} expansion', 'git log ${X:=y}'],
  ['less (pager can shell out)', 'less README.md'],
  ['git log | less', 'git log | less'],
  ['grep-evil (command name word boundary)', 'grep-evil x'],
  ['trailing empty pipe segment', 'git log |'],
  ['jq -f prog', 'jq -f prog.jq package.json'],
  ['jq -nf prog (combined short flag)', 'jq -nf prog.jq'],
  ['git -c core.pager=x log', 'git -c core.pager=x log'],
  ['yarn lint (eslint --fix rewrites files)', 'yarn lint'],
  ['rm -rf x', 'rm -rf x'],
  ['command starting with -e', '-e git status'],
];

const readonlyAllowed: Array<[string, string]> = [
  ['git status', 'git status'],
  ['git log | grep x', 'git log | grep x'],
  ['3-segment pipe of read commands', 'git log --oneline | grep fix | head -5'],
  ['git log --oneline -5', 'git log --oneline -5'],
  ['jq .name package.json', 'jq .name package.json'],
  [
    'grep -f patterns.txt README.md (grep -f is a pattern file, not a program)',
    'grep -f patterns.txt README.md',
  ],
  // -o is not a git diff/log/show option; nothing real to block
  ['git log -p -o f', 'git log -p -o f'],
  ['git -C <dir> log', 'git -C /home/user/lawie-wt/mahak log --oneline -3'],
];

describe.each(['reviewer', 'doc-writer'])(
  '%s Bash is read-only (readonly-bash.sh via crew-role.sh)',
  (who) => {
    it.each(readonlyBlocked)('blocks: %s', (_name, command) => {
      expectPayload(bashPayload(who, command), 2);
    });

    it.each(readonlyAllowed)('allows: %s', (_name, command) => {
      expectPayload(bashPayload(who, command), 0);
    });

    it('blocks Bash with tool_input {}', () => {
      expectPayload({ ...base, tool_name: 'Bash', tool_input: {}, agent_type: who }, 2);
    });

    it('blocks Bash with no tool_input', () => {
      expectPayload({ ...base, tool_name: 'Bash', agent_type: who }, 2);
    });

    it('blocks Bash with a non-string command', () => {
      expectPayload({ ...base, tool_name: 'Bash', tool_input: { command: 5 }, agent_type: who }, 2);
    });
  },
);

// By class: shell quoting/expansion must not hide a denied flag or command word.
const readonlyClassBlocked: Array<[string, string]> = [
  ['single-quoted denied flag', "git diff '--output=f'"],
  ['double-quoted denied flag', 'git diff "--output=f"'],
  ['backslash-escaped denied flag', 'git diff --out\\put=f'],
  ['empty-quote-spliced denied flag', "git diff --out''put=f"],
  ['quoted command word combined with a denied flag', "'git' diff --output=f"],
  ['single-quoted jq -f', "jq '-f' prog.jq"],
  ['double-quoted jq --from-file', 'jq "--from-file" prog.jq'],
  ['backslash-escaped jq --from-file', 'jq --from\\-file prog.jq'],
  ['spliced command word resolving to a non-allowlisted command', "l''ess README.md"],
  ['spliced command word with double quotes (rm)', 'r""m -rf x'],
  ['$VAR expansion', 'git log $HOME'],
  ['$IFS-style splitting', 'git$IFS log'],
  ["$'..' ANSI-C quoting", "git diff $'--output=f'"],
  ['$".." locale quoting', 'git diff $"--output=f"'],
  ['bare $ in a grep pattern (documented false positive)', "grep 'a$' file"],
];
const readonlyClassAllowed: Array<[string, string]> = [
  ['quoted allowed command word (resolves to git diff)', "'git' diff"],
  ['git diff --stat', 'git diff --stat'],
  ['git log --oneline | grep x', 'git log --oneline | grep x'],
  ['grep with a quoted pattern containing a space', 'grep "a b" file'],
  ['git -C <single-token path> log', 'git -C /home/user/lawie-wt/mahak log'],
];

describe.each(['reviewer', 'doc-writer'])('%s Bash quoting and expansion classes', (who) => {
  it.each(readonlyClassBlocked)('blocks: %s', (_n, command) =>
    expectPayload(bashPayload(who, command), 2),
  );
  it.each(readonlyClassAllowed)('allows: %s', (_n, command) =>
    expectPayload(bashPayload(who, command), 0),
  );
});

describe('NotebookEdit path handling (notebook_path is authoritative)', () => {
  const nb = (agent: string, ti: Record<string, unknown>): Payload => ({
    ...base,
    tool_name: 'NotebookEdit',
    tool_input: ti,
    agent_type: agent,
    agent_id: 'a1',
  });
  const T = `${R}/apps/x/__tests__/nb.ipynb`;
  const S = `${R}/apps/x/src/nb.ipynb`;
  const cases: Array<[string, Payload, 0 | 2]> = [
    [
      'tester: notebook_path in __tests__, file_path in src',
      nb('tester', { notebook_path: T, file_path: S }),
      2,
    ],
    [
      'tester: notebook_path in src, file_path in __tests__',
      nb('tester', { notebook_path: S, file_path: T }),
      2,
    ],
    ['tester: both equal under __tests__', nb('tester', { notebook_path: T, file_path: T }), 0],
    ['tester: notebook_path only under __tests__', nb('tester', { notebook_path: T }), 0],
    ['tester: file_path only (no notebook_path)', nb('tester', { file_path: T }), 2],
    ['tester: empty notebook_path', nb('tester', { notebook_path: '' }), 2],
    ['tester: missing notebook_path and file_path', nb('tester', { new_source: 'x' }), 2],
    ['developer: both equal in src', nb('developer', { notebook_path: S, file_path: S }), 0],
    ['developer: empty notebook_path', nb('developer', { notebook_path: '' }), 2],
    ['developer: missing notebook_path', nb('developer', { new_source: 'x' }), 2],
  ];
  it.each(cases)('%s', (_n, payload, want) => expectPayload(payload, want));
});

describe('agent names match the dispatcher roles', () => {
  const dir = join(ROOT, '.claude', 'agents', 'dev');
  const names = readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => /^name:\s*(\S+)\s*$/m.exec(readFileSync(join(dir, f), 'utf8'))?.[1] ?? '')
    .sort();

  it('frontmatter names are exactly reviewer, doc-writer, tester, developer', () => {
    expect(names).toEqual(['developer', 'doc-writer', 'reviewer', 'tester']);
  });

  // A payload each role must block, so a name the dispatcher does not know would exit 0 here.
  const blocked: Record<string, Payload> = {
    reviewer: bashPayload('reviewer', 'git status; echo x'),
    'doc-writer': editPayload('doc-writer', `${R}/apps/x/src/index.ts`),
    tester: editPayload('tester', `${R}/apps/x/src/index.ts`),
    developer: editPayload('developer', `${R}/apps/x/src/__tests__/a.test.ts`),
  };
  it.each(['reviewer', 'doc-writer', 'tester', 'developer'])('dispatcher enforces %s', (name) => {
    expect(names).toContain(name);
    expectPayload(blocked[name], 2);
  });
  it.each(names)('every agent file name (%s) is enforced', (name) => {
    expect(blocked[name]).toBeDefined();
    expectPayload(blocked[name], 2);
  });
});

// ---------------------------------------------------------------------------------------------
// Edit tools per role
// ---------------------------------------------------------------------------------------------
describe('tester edits are limited to test files (tests-only.sh)', () => {
  const cases: Array<[string, Payload, 0 | 2]> = [
    ['Edit __tests__/a.test.ts', editPayload('tester', `${R}/apps/x/src/__tests__/a.test.ts`), 0],
    ['Write foo.test.ts', editPayload('tester', `${R}/apps/x/src/foo.test.ts`, 'Write'), 0],
    [
      'Edit __tests__/./a.test.ts (dot segment)',
      editPayload('tester', `${R}/apps/x/src/__tests__/./a.test.ts`),
      0,
    ],
    [
      'NotebookEdit notebook_path under __tests__',
      notebookPayload('tester', `${R}/x/__tests__/nb.ipynb`),
      0,
    ],
    ['Edit src/index.ts', editPayload('tester', `${R}/apps/x/src/index.ts`), 2],
    [
      'Edit __tests__/../x.ts (climbs out)',
      editPayload('tester', `${R}/apps/x/src/__tests__/../x.ts`),
      2,
    ],
    [
      'Edit a.test.ts/../index.ts',
      editPayload('tester', `${R}/apps/x/src/a.test.ts/../index.ts`),
      2,
    ],
    ['Edit relative ../../x/__tests__/a.ts', editPayload('tester', '../../x/__tests__/a.ts'), 2],
    ['Edit path containing a newline', editPayload('tester', `${R}/apps/x/__tests__/a${NL}.ts`), 2],
    [
      'Edit path containing a NUL',
      editPayload('tester', `${R}/apps/x/src/index.ts${NUL}/__tests__/a.ts`),
      2,
    ],
    ['MultiEdit on source', editPayload('tester', `${R}/apps/x/src/index.ts`, 'MultiEdit'), 2],
    ['NotebookEdit on source', notebookPayload('tester', `${R}/nb.ipynb`), 2],
    [
      'Edit with no file_path',
      {
        ...base,
        tool_name: 'Edit',
        tool_input: { old_string: 'a' },
        agent_type: 'tester',
        agent_id: 'a1',
      },
      2,
    ],
    [
      'Edit with no tool_input',
      { ...base, tool_name: 'Edit', agent_type: 'tester', agent_id: 'a1' },
      2,
    ],
  ];
  it.each(cases)('%s', (_n, payload, want) => expectPayload(payload, want));
});

describe('doc-writer edits are limited to markdown (docs-only.sh)', () => {
  const cases: Array<[string, Payload, 0 | 2]> = [
    ['Edit README.md', editPayload('doc-writer', `${R}/README.md`), 0],
    ['Write README.mdx', editPayload('doc-writer', `${R}/apps/x/README.mdx`, 'Write'), 0],
    ['Edit src/index.ts', editPayload('doc-writer', `${R}/apps/x/src/index.ts`), 2],
    ['Edit x.md/../index.ts', editPayload('doc-writer', `${R}/x.md/../index.ts`), 2],
  ];
  it.each(cases)('%s', (_n, payload, want) => expectPayload(payload, want));
});

describe('developer edits may not touch tests or snapshots (no-tests.sh)', () => {
  const cases: Array<[string, Payload, 0 | 2]> = [
    [
      'Edit __tests__/a.test.ts',
      editPayload('developer', `${R}/apps/x/src/__tests__/a.test.ts`),
      2,
    ],
    ['Edit foo.test.tsx', editPayload('developer', `${R}/apps/web/src/foo.test.tsx`), 2],
    [
      'Edit __snapshots__/x.snap',
      editPayload('developer', `${R}/apps/drafting/src/__snapshots__/x.snap`),
      2,
    ],
    [
      'Edit src/x/../__tests__/a.ts (normalises into __tests__)',
      editPayload('developer', `${R}/apps/x/src/x/../__tests__/a.ts`),
      2,
    ],
    ['Edit src/index.ts', editPayload('developer', `${R}/apps/x/src/index.ts`), 0],
    [
      'Edit __tests__/../index.ts (normalises out of __tests__)',
      editPayload('developer', `${R}/apps/x/src/__tests__/../index.ts`),
      0,
    ],
  ];
  it.each(cases)('%s', (_n, payload, want) => expectPayload(payload, want));
});

describe('reviewer has no edit tools', () => {
  it.each([
    ['Edit', editPayload('reviewer', `${R}/README.md`, 'Edit')],
    ['Write', editPayload('reviewer', `${R}/src/x.ts`, 'Write')],
    ['MultiEdit', editPayload('reviewer', `${R}/x.md`, 'MultiEdit')],
    ['NotebookEdit', notebookPayload('reviewer', `${R}/n.ipynb`)],
  ])('blocks %s', (_n, payload) => expectPayload(payload, 2));
});

// ---------------------------------------------------------------------------------------------
// tester / developer Bash is decided by db-readonly.sh
// ---------------------------------------------------------------------------------------------
describe('tester and developer Bash (db-readonly.sh)', () => {
  const cases: Array<[string, string, 0 | 2]> = [
    ['git status; echo x (not a db command, passes)', 'git status; echo x', 0],
    [
      'mongosh insertOne',
      'mongosh mongodb://localhost/lawie --eval "db.users.insertOne({a:1})"',
      2,
    ],
    ['mongosh find', 'mongosh mongodb://localhost/lawie --eval "db.users.find({})"', 0],
    ['redis-cli set', 'redis-cli set k v', 2],
    ['redis-cli get', 'redis-cli get k', 0],
  ];
  describe.each(['tester', 'developer'])('%s', (who) => {
    it.each(cases)('%s', (_n, command, want) => expectPayload(bashPayload(who, command), want));
  });
});

// ---------------------------------------------------------------------------------------------
// Pass-through and fail-closed payload handling
// ---------------------------------------------------------------------------------------------
describe('pass-through (not a crew subagent)', () => {
  const cases: Array<[string, Payload]> = [
    ['main thread Bash git status; echo x', bashPayload(null, 'git status; echo x')],
    ['main thread Edit on source', editPayload(null, `${R}/apps/x/src/index.ts`)],
    ['main thread Edit on a test file', editPayload(null, `${R}/apps/x/__tests__/a.test.ts`)],
    ['agent_id without agent_type', { ...bashPayload(null, 'git status; echo x'), agent_id: 'a1' }],
    ['agent_type general-purpose', bashPayload('general-purpose', 'git status; echo x')],
    [
      'plugin-qualified x:reviewer (exact match only)',
      bashPayload('x:reviewer', 'git status; echo x'),
    ],
    ['case-sensitive: Reviewer', bashPayload('Reviewer', 'git status; echo x')],
    [
      'reviewer using Read (tool not dispatched)',
      {
        ...base,
        tool_name: 'Read',
        tool_input: { file_path: '/x' },
        agent_type: 'reviewer',
        agent_id: 'a1',
      },
    ],
  ];
  it.each(cases)('%s -> 0', (_n, payload) => expectPayload(payload, 0));

  it('agent_type reviewer WITHOUT agent_id (a --agent main thread) is still enforced', () => {
    expectPayload(bashPayload('reviewer', 'git status; echo x', false), 2);
  });
});

describe('bad payloads fail closed', () => {
  it.each([
    ['garbage', 'not json at all'],
    ['empty', ''],
    ['JSON array', '[1,2]'],
    ['JSON null', 'null'],
    ['truncated JSON', '{"agent_type":"reviewer","tool_name":"Bash"'],
  ])('%s -> 2', (_n, raw) => expectHook(raw, 2));
});

// ---------------------------------------------------------------------------------------------
// Environment: missing tools, failing or missing role scripts
// ---------------------------------------------------------------------------------------------
function findOnPath(name: string): string {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    const p = join(dir, name);
    try {
      accessSync(p, constants.X_OK);
      if (statSync(p).isFile()) return p;
    } catch {
      /* keep looking */
    }
  }
  throw new Error(`test setup: ${name} not found on PATH`);
}

describe('environment and role-script failures', () => {
  let tmp: string;
  const toolDir = (name: string, tools: string[]): string => {
    const d = join(tmp, name);
    mkdirSync(d);
    for (const t of tools) symlinkSync(findOnPath(t), join(d, t));
    return d;
  };
  // Tools the hooks and role scripts need besides node, bash and jq.
  const COREUTILS = ['grep', 'tr', 'wc', 'cat'];

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'crew-role-env-'));
  });
  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('no node on PATH -> 2, even for a main-thread payload', () => {
    const d = toolDir('no-node', ['bash', 'jq', ...COREUTILS]);
    expectHook(JSON.stringify(bashPayload(null, 'git status')), 2, CREW_ROLE, d);
  });

  it('no jq on PATH -> 2 for a reviewer', () => {
    const d = toolDir('no-jq-r', ['bash', 'node', ...COREUTILS]);
    expectHook(JSON.stringify(bashPayload('reviewer', 'git status')), 2, CREW_ROLE, d);
  });

  it('no jq on PATH -> 0 for the main thread', () => {
    const d = toolDir('no-jq-m', ['bash', 'node', ...COREUTILS]);
    expectHook(JSON.stringify(bashPayload(null, 'git status; echo x')), 0, CREW_ROLE, d);
  });

  it('no bash on PATH (node and jq present) -> 2 for a reviewer', () => {
    const d = toolDir('no-bash', ['node', 'jq', ...COREUTILS]);
    expectHook(JSON.stringify(bashPayload('reviewer', 'git status')), 2, CREW_ROLE, d);
  });

  it('control: with every tool present the same reviewer payload is allowed', () => {
    const d = toolDir('all-tools', ['bash', 'node', 'jq', ...COREUTILS]);
    expectHook(JSON.stringify(bashPayload('reviewer', 'git status')), 0, CREW_ROLE, d);
  });

  describe('copy of the hooks dir', () => {
    let copy: string;
    beforeEach(() => {
      copy = join(tmp, `hooks-${Math.random().toString(36).slice(2)}`);
      cpSync(HOOK_DIR, copy, { recursive: true });
    });

    it('role script exiting 1 -> 2', () => {
      const s = join(copy, 'readonly-bash.sh');
      writeFileSync(s, '#!/bin/bash\nexit 1\n');
      chmodSync(s, 0o755);
      expectHook(
        JSON.stringify(bashPayload('reviewer', 'git status')),
        2,
        join(copy, 'crew-role.sh'),
      );
    });

    it('role script that hangs is killed and fails closed (exit 2)', () => {
      const s = join(copy, 'readonly-bash.sh');
      writeFileSync(s, '#!/bin/bash\nexec sleep 60\n');
      chmodSync(s, 0o755);
      const t0 = Date.now();
      expectHook(
        JSON.stringify(bashPayload('reviewer', 'git status')),
        2,
        join(copy, 'crew-role.sh'),
      );
      expect(Date.now() - t0).toBeLessThan(25_000);
    }, 30_000);

    it('missing tests-only.sh -> 2', () => {
      rmSync(join(copy, 'tests-only.sh'));
      expectHook(
        JSON.stringify(editPayload('tester', `${R}/apps/x/__tests__/a.test.ts`)),
        2,
        join(copy, 'crew-role.sh'),
      );
    });

    it('control: the untouched copy still allows a test-file edit', () => {
      expectHook(
        JSON.stringify(editPayload('tester', `${R}/apps/x/__tests__/a.test.ts`)),
        0,
        join(copy, 'crew-role.sh'),
      );
    });
  });
});

// ---------------------------------------------------------------------------------------------
// Role scripts run standalone (same stdin the dispatcher feeds them)
// ---------------------------------------------------------------------------------------------
describe('role scripts standalone', () => {
  const s = (name: string) => join(HOOK_DIR, name);
  const bash = (command: string) => JSON.stringify({ tool_input: { command } });
  const file = (p: string) => JSON.stringify({ tool_input: { file_path: p } });

  it.each([
    ['readonly-bash.sh', 'semicolon', bash('git status; echo x'), 2],
    ['readonly-bash.sh', 'git diff --stat', bash('git diff --stat'), 0],
    ['readonly-bash.sh', 'garbage input', 'garbage', 2],
    ['tests-only.sh', '__tests__/.. (the directory itself)', file(`${R}/apps/x/__tests__/..`), 2],
    ['tests-only.sh', 'test file', file(`${R}/apps/x/__tests__/a.test.ts`), 0],
    ['docs-only.sh', 'x.md/..', file(`${R}/x.md/..`), 2],
    ['docs-only.sh', './docs//a.md', file('./docs//a.md'), 0],
    [
      'no-tests.sh',
      'x/../src/__tests__/a.ts (relative, normalises into __tests__)',
      file('x/../src/__tests__/a.ts'),
      2,
    ],
    ['no-tests.sh', '/../../r/src/a.ts (above root clamps)', file('/../../r/src/a.ts'), 0],
  ] as Array<[string, string, string, 0 | 2]>)('%s: %s', (script, _n, input, want) => {
    expectHook(input, want, s(script));
  });
});

// ---------------------------------------------------------------------------------------------
// settings.json wiring
// ---------------------------------------------------------------------------------------------
describe('.claude/settings.json wiring', () => {
  const settingsPath = join(ROOT, '.claude', 'settings.json');
  const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  const entries: Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }> =
    settings.hooks.PreToolUse;
  const cmd = (name: string) => `\${CLAUDE_PROJECT_DIR}/.claude/hooks/${name}`;

  it('Bash matcher runs no-secrets-bash.sh, no-env-print.sh, crew-role.sh in that order', () => {
    const e = entries.find((x) => x.matcher === 'Bash');
    expect(e).toBeDefined();
    const hooks = e?.hooks ?? [];
    expect(hooks.map((h) => h.command)).toEqual([
      cmd('no-secrets-bash.sh'),
      cmd('no-env-print.sh'),
      cmd('crew-role.sh'),
    ]);
    expect(hooks.every((h) => h.type === 'command')).toBe(true);
  });

  it('edit-tool matcher runs crew-role.sh', () => {
    const e = entries.find((x) => x.matcher === 'Edit|Write|MultiEdit|NotebookEdit');
    expect(e).toBeDefined();
    expect((e?.hooks ?? []).map((h) => h.command)).toEqual([cmd('crew-role.sh')]);
  });

  it('every referenced hook file exists and is executable', () => {
    const names = new Set<string>();
    for (const e of entries)
      for (const h of e.hooks) names.add(h.command.replace('${CLAUDE_PROJECT_DIR}/', ''));
    expect(names.size).toBeGreaterThan(0);
    for (const rel of names) {
      const p = join(ROOT, rel);
      expect(existsSync(p)).toBe(true);
      expect(statSync(p).mode & 0o111).not.toBe(0);
    }
  });

  it('every role script the dispatcher runs exists and is executable', () => {
    // The dispatcher runs these through `bash <file>`, so +x is not strictly required, but they
    // are all executable today and the other hooks are, so keep it uniform.
    for (const n of [
      'readonly-bash.sh',
      'db-readonly.sh',
      'tests-only.sh',
      'docs-only.sh',
      'no-tests.sh',
      'crew-role.mjs',
    ]) {
      const p = join(HOOK_DIR, n);
      expect(existsSync(p)).toBe(true);
      expect(statSync(p).mode & 0o111).not.toBe(0);
    }
  });
});

describe('relative paths that normalise to a leading __tests__/ or __snapshots__', () => {
  const cases: Array<[string, string, string, 0 | 2]> = [
    ['developer', '__tests__/a.ts', '__tests__/a.ts', 2],
    ['developer', './__tests__/a.ts', './__tests__/a.ts', 2],
    ['developer', 'x/../__tests__/a.ts', 'x/../__tests__/a.ts', 2],
    ['developer', '__snapshots__/x.snap', '__snapshots__/x.snap', 2],
    ['developer', './__snapshots__/x.snap', './__snapshots__/x.snap', 2],
    ['developer', 'src/index.ts', 'src/index.ts', 0],
    ['developer', '__tests__/../index.ts', '__tests__/../index.ts', 0],
    ['tester', '__tests__/a.ts', '__tests__/a.ts', 0],
    ['tester', './__tests__/a.ts', './__tests__/a.ts', 0],
    ['tester', 'x/../__tests__/a.ts', 'x/../__tests__/a.ts', 0],
    ['tester', 'x/../src/__tests__/a.ts', 'x/../src/__tests__/a.ts', 0],
    ['tester', 'src/index.ts', 'src/index.ts', 2],
    ['tester', '__tests__/../x.ts', '__tests__/../x.ts', 2],
  ];
  it.each(cases)('%s Edit %s', (who, _n, path, want) =>
    expectPayload(editPayload(who, path), want),
  );

  it('no-tests.sh standalone: __tests__/a.ts -> 2', () => {
    expectHook(
      JSON.stringify({ tool_input: { file_path: '__tests__/a.ts' } }),
      2,
      join(HOOK_DIR, 'no-tests.sh'),
    );
  });
  it('tests-only.sh standalone: __tests__/a.ts -> 0', () => {
    expectHook(
      JSON.stringify({ tool_input: { file_path: '__tests__/a.ts' } }),
      0,
      join(HOOK_DIR, 'tests-only.sh'),
    );
  });
});

// ---------------------------------------------------------------------------------------------
// Documented residuals (not asserted as desired behaviour)
// ---------------------------------------------------------------------------------------------
describe('documented residuals', () => {
  it.todo(
    'tester/developer Bash can still write files via shell redirects (db-readonly.sh only gates db commands)',
  );
  it.todo(
    'symlinks are not followed: the path scripts normalise lexically, so a symlink inside __tests__ can point at source',
  );
});
