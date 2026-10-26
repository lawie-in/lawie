#!/usr/bin/env node
/**
 * T-570: checker behind .claude/hooks/no-env-print.sh (global PreToolUse hook on Bash).
 *
 * Reads the hook JSON on stdin and exits 2 (block) if the Bash command would print the
 * environment, which holds real secrets in agent sessions (incident 22 Oct 2026). Exit 0
 * allows. Any parse failure blocks: the hook fails closed.
 *
 * The block message names the rule only. It never echoes the command, which may itself
 * carry a secret.
 *
 * Blocked (also inside `a && b`, `a; b`, pipes, `$(..)`, backticks, `<(..)`, `bash -c`,
 * `sh -c`, `su -c`, `eval`, `xargs`, `find -exec`, `watch`, `sudo`, `exec`, `command`,
 * `nohup`, `timeout`, `yarn`/`npm`/`npx` wrappers, `echo .. | sh`, heredocs into a shell):
 *   env / printenv           env with no command to run (any options), printenv in any form
 *   export                   bare, options only, or any -p / -n
 *   declare / typeset        bare, options only (e.g. -x), or any -p
 *   readonly                 bare, options only, or -p
 *   set                      bare
 *   /proc/<pid>/environ      any mention, also dequoted (env""iron, envir\on) or as a glob
 *                            that can match `environ` (env*, e?viron, [e]nviron) next to /proc
 *   ps e / ps -E             BSD flags that print process environments
 *   yarn/npm/pnpm run env    the package managers' built-in env dump
 *   systemctl show-environment
 *   jq                       `env` or `$ENV` as a whole object (jq -n env, jq -n '$ENV')
 *   awk/gawk/mawk/nawk       ENVIRON other than ENVIRON["NAME"]
 *   interpreters (node, bun, deno, python, perl, ruby, php) whose code dumps the whole
 *   environment object (process.env, process.env.toJSON()/valueOf()/toString(),
 *   require('process').env, const { env } = process, os.environ, %ENV, ENV, getenv())
 *   or shells out to one of the commands above.
 * Allowed: `env [-u NAME] [NAME=value] cmd ...` (runs cmd; prints nothing itself), set
 * with options (`set -euo pipefail`), `export NAME=value`, `unset`, single-variable checks
 * (`[ -n "$VAR" ] && echo set`, `test -n "$VAR"`, `[ -z "${VAR+x}" ]`, `process.env.X`,
 * `os.environ.get("X")`, `'X' in os.environ`), and the subshell form
 * `(unset REDIS_URL SENTRY_DSN; yarn workspace @lawie/<ws> test)`.
 *
 * Accepted false positive: any command that mentions /proc and environ is blocked, even
 * git, grep or a commit message quoting them (no exemptions, by design).
 *
 * Known out of scope (not caught; this guards against accidents, not a determined agent):
 * command names built from variables or globs (`$C`, `/usr/bin/pr*env`), eval or
 * execution of command output (`$(echo printenv)`, `cat x.sh | bash`), shell aliases and
 * functions, other hosts or processes (ssh host env, docker exec, gdb attach), `set -x`
 * tracing that echoes expanded values, scripts run from a file, and printing a single
 * variable (`echo "$X"`, `node -p process.env.X`).
 */
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MAX_DEPTH = 12;

class ParseError extends Error {}
class Blocked extends Error {
  constructor(rule) {
    super(rule);
    this.rule = rule;
  }
}

// ── Tokenizer ────────────────────────────────────────────────────────────────

/** Index just past the `)` that closes the `(` before `start`, skipping quotes. */
function findClose(s, start) {
  let depth = 1;
  const pending = [];
  for (let i = start; i < s.length; i += 1) {
    const c = s[i];
    if (c === '\\') {
      i += 1;
    } else if (c === "'") {
      const j = s.indexOf("'", i + 1);
      if (j < 0) throw new ParseError('quote');
      i = j;
    } else if (c === '"') {
      i = skipDouble(s, i + 1);
    } else if (c === '`') {
      i = skipBacktick(s, i + 1);
    } else if (c === '<' && s[i + 1] === '<' && s[i + 2] !== '<') {
      // Heredoc inside $(..): its body is skipped at the end of this line (it may hold
      // unbalanced quotes or parens, e.g. an apostrophe in a commit message).
      const m = /^<<-?\s*(['"]?)([^\s'"();&|<>]+)\1/.exec(s.slice(i));
      if (m) {
        pending.push(m[2]);
        i += m[0].length - 1;
      }
    } else if (c === '\n' && pending.length) {
      let k = i + 1;
      while (pending.length) {
        const delim = pending.shift();
        for (;;) {
          let e = s.indexOf('\n', k);
          if (e < 0) e = s.length;
          const line = s.slice(k, e).replace(/^\t+/, '');
          k = e + 1;
          if (line === delim || e >= s.length) break;
        }
      }
      i = k - 2; // the loop's i += 1 lands on the line after the last delimiter
    } else if (c === '(') {
      depth += 1;
    } else if (c === ')') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  throw new ParseError('paren');
}

/** Index of the closing `"` of a double-quoted string starting at `i`. */
function skipDouble(s, i) {
  for (; i < s.length; i += 1) {
    if (s[i] === '\\') i += 1;
    else if (s[i] === '"') return i;
    else if (s[i] === '$' && s[i + 1] === '(') i = findClose(s, i + 2) - 1;
    else if (s[i] === '`') i = skipBacktick(s, i + 1);
  }
  throw new ParseError('quote');
}

function skipBacktick(s, i) {
  for (; i < s.length; i += 1) {
    if (s[i] === '\\') i += 1;
    else if (s[i] === '`') return i;
  }
  throw new ParseError('backtick');
}

/**
 * Splits a shell command into simple-command segments. Returns
 * { segments: [{ words: string[], op, heredocs: string[], herestrings: string[] }], subs }
 * where `op` is the operator before the segment and `subs` are command/process
 * substitution bodies to analyze on their own.
 */
function tokenize(s) {
  const segments = [];
  const subs = [];
  let seg = { words: [], op: null, heredocs: [], herestrings: [] };
  let word = '';
  let inWord = false;
  let wordQuoted = false;
  let parenOpen = 0;
  let redirect = null; // null | 'file' | 'heredoc' | 'herestring'
  let heredocDash = false;
  const pendingHeredocs = []; // { delim, dash, seg }

  const endWord = () => {
    if (!inWord) return;
    if (redirect === 'file') {
      // redirection target: dropped
    } else if (redirect === 'heredoc') {
      pendingHeredocs.push({ delim: word, dash: heredocDash, quoted: wordQuoted, seg });
    } else if (redirect === 'herestring') {
      seg.herestrings.push(word);
    } else {
      seg.words.push(word);
    }
    redirect = null;
    word = '';
    inWord = false;
    wordQuoted = false;
  };
  const endSeg = (op) => {
    endWord();
    segments.push(seg);
    seg = { words: [], op, heredocs: [], herestrings: [] };
  };

  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t') {
      endWord();
      i += 1;
    } else if (c === '\n') {
      endSeg(';');
      i += 1;
      // Heredoc bodies start on the line after their operator.
      while (pendingHeredocs.length > 0) {
        const h = pendingHeredocs.shift();
        const body = [];
        let found = false;
        while (i <= s.length) {
          let j = s.indexOf('\n', i);
          if (j < 0) j = s.length;
          const line = s.slice(i, j);
          i = j + 1;
          if ((h.dash ? line.replace(/^\t+/, '') : line) === h.delim) {
            found = true;
            break;
          }
          body.push(line);
          if (j >= s.length) break;
        }
        // An unterminated heredoc runs to the end of the input (bash warns and does the same).
        void found;
        // An unquoted delimiter means bash expands $(..) and backticks in the body.
        if (!h.quoted) collectSubs(body.join('\n'), subs);
        h.seg.heredocs.push(body.join('\n'));
      }
    } else if (c === '#' && !inWord) {
      const j = s.indexOf('\n', i);
      i = j < 0 ? s.length : j;
    } else if (c === '\\') {
      if (s[i + 1] === '\n') {
        i += 2;
      } else {
        word += s[i + 1] ?? '';
        inWord = true;
        wordQuoted = true;
        i += 2;
      }
    } else if (c === "'") {
      const j = s.indexOf("'", i + 1);
      if (j < 0) throw new ParseError('quote');
      word += s.slice(i + 1, j);
      inWord = true;
      wordQuoted = true;
      i = j + 1;
    } else if (c === '$' && s[i + 1] === "'") {
      let j = i + 2;
      let out = '';
      for (; j < s.length && s[j] !== "'"; j += 1) {
        if (s[j] === '\\') {
          j += 1;
          const e = s[j];
          out += e === 'n' ? '\n' : e === 't' ? '\t' : e;
        } else out += s[j];
      }
      if (j >= s.length) throw new ParseError('quote');
      word += out;
      inWord = true;
      wordQuoted = true;
      i = j + 1;
    } else if (c === '"') {
      const j = skipDouble(s, i + 1);
      const inner = s.slice(i + 1, j);
      collectSubs(inner, subs);
      word += inner.replace(/\\(["\\$`])/g, '$1');
      inWord = true;
      wordQuoted = true;
      i = j + 1;
    } else if (c === '$' && s[i + 1] === '(') {
      const j = findClose(s, i + 2);
      subs.push(s.slice(i + 2, j - 1));
      word += '$_';
      inWord = true;
      i = j;
    } else if (c === '$' && s[i + 1] === '{') {
      let depth = 1;
      let j = i + 2;
      for (; j < s.length && depth > 0; j += 1) {
        if (s[j] === '{') depth += 1;
        else if (s[j] === '}') depth -= 1;
      }
      if (depth > 0) throw new ParseError('brace');
      const inner = s.slice(i + 2, j - 1);
      collectSubs(inner, subs);
      word += '$_';
      inWord = true;
      i = j;
    } else if (c === '`') {
      const j = skipBacktick(s, i + 1);
      subs.push(s.slice(i + 1, j));
      word += '$_';
      inWord = true;
      i = j + 1;
    } else if ((c === '<' || c === '>') && s[i + 1] === '(') {
      endWord();
      const j = findClose(s, i + 2);
      subs.push(s.slice(i + 2, j - 1));
      i = j;
    } else if (c === '<' || c === '>' || (c === '&' && s[i + 1] === '>')) {
      // A word of digits right before a redirection is its fd (2>&1): not a word.
      if (inWord && /^\d+$/.test(word)) {
        word = '';
        inWord = false;
      } else endWord();
      let op = c;
      let j = i + 1;
      while (j < s.length && '<>&|-'.includes(s[j]) && op.length < 3) {
        op += s[j];
        j += 1;
      }
      if (op.startsWith('<<<')) redirect = 'herestring';
      else if (op.startsWith('<<')) {
        redirect = 'heredoc';
        heredocDash = op === '<<-';
      } else {
        redirect = 'file';
        // `>&2`, `<&0`, `>&-`: the target is attached.
        if (/[>&]&$|<&$/.test(op) && /[\d-]/.test(s[j] ?? '')) {
          while (j < s.length && /[\d-]/.test(s[j])) j += 1;
          redirect = null;
        }
      }
      i = j;
    } else if (c === ';' || c === '&' || c === '|' || c === '(' || c === ')') {
      let op = c;
      if ((c === '&' || c === '|' || c === ';') && s[i + 1] === c) op += c;
      else if (c === '|' && s[i + 1] === '&') op = '|&';
      // Count subshell parens; an unclosed `(` is a syntax error and fails closed below.
      // Extra `)` are tolerated (case patterns: `a) cmd;;`).
      if (op === '(') parenOpen += 1;
      else if (op === ')' && parenOpen > 0) parenOpen -= 1;
      endSeg(op);
      i += op.length;
    } else {
      word += c;
      inWord = true;
      i += 1;
    }
  }
  if (redirect === 'heredoc' || redirect === 'herestring' || redirect === 'file') {
    if (!inWord) throw new ParseError('redirect');
  }
  if (parenOpen > 0) throw new ParseError('paren');
  endSeg(null);
  return {
    segments: segments.filter((g) => g.words.length || g.heredocs.length || g.herestrings.length),
    subs,
  };
}

/** `$(..)` and backtick bodies inside a double-quoted string or `${..}`. */
function collectSubs(inner, subs) {
  for (let i = 0; i < inner.length; i += 1) {
    if (inner[i] === '\\') i += 1;
    else if (inner[i] === '$' && inner[i + 1] === '(') {
      const j = findClose(inner, i + 2);
      subs.push(inner.slice(i + 2, j - 1));
      i = j - 1;
    } else if (inner[i] === '`') {
      const j = skipBacktick(inner, i + 1);
      subs.push(inner.slice(i + 1, j));
      i = j;
    }
  }
}

// ── Analysis ─────────────────────────────────────────────────────────────────

const base = (w) => w.replace(/^.*\//, '');
const isAssign = (w) => /^[A-Za-z_][A-Za-z0-9_]*(\[[^\]]*\])?\+?=/.test(w);
const RESERVED = new Set([
  '!',
  '{',
  '}',
  'then',
  'do',
  'else',
  'elif',
  'if',
  'while',
  'until',
  'fi',
  'done',
  'esac',
  'coproc',
]);
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'mksh', 'ash', 'fish', 'yash']);
const INTERP =
  /^(node|nodejs|bun|deno|tsx|ts-node|python[0-9.]*|pypy[0-9.]*|perl[0-9.]*|ruby[0-9.]*|irb|php[0-9.]*)$/;

/** Simple wrappers: name -> options that take a separate argument; `pos` leading positionals. */
const WRAPPERS = {
  sudo: {
    arg: [
      '-u',
      '-g',
      '-C',
      '-D',
      '-h',
      '-p',
      '-r',
      '-t',
      '-U',
      '-T',
      '--user',
      '--group',
      '--chdir',
      '--prompt',
      '--host',
    ],
  },
  doas: { arg: ['-u', '-C'] },
  exec: { arg: ['-a'] },
  builtin: { arg: [] },
  nohup: { arg: [] },
  setsid: { arg: [] },
  unbuffer: { arg: [] },
  chronic: { arg: [] },
  busybox: { arg: [] },
  time: { arg: ['-f', '-o', '--format', '--output'] },
  nice: { arg: ['-n', '--adjustment'] },
  ionice: { arg: ['-c', '-n', '-p', '-t', '--class', '--classdata'] },
  stdbuf: { arg: ['-i', '-o', '-e'] },
  timeout: { arg: ['-s', '-k', '--signal', '--kill-after'], pos: 1 },
  xargs: {
    arg: [
      '-I',
      '-n',
      '-L',
      '-d',
      '-s',
      '-P',
      '-E',
      '-a',
      '--arg-file',
      '--delimiter',
      '--max-args',
      '--max-procs',
      '--max-lines',
      '--max-chars',
      '--replace',
      '--eof',
    ],
  },
};

function dropOptions(words, argOpts, pos = 0) {
  let k = 1;
  while (k < words.length) {
    const a = words[k];
    if (a === '--') {
      k += 1;
      break;
    }
    if (a.startsWith('-') && a.length > 1) {
      k += argOpts.includes(a) ? 2 : 1;
      continue;
    }
    break;
  }
  return words.slice(k + pos);
}

const optsOnly = (args) => args.every((a) => /^[-+]/.test(a));
const optHas = (args, letters) =>
  args.some((a) => /^-[A-Za-z]+$/.test(a) && [...letters].some((l) => a.includes(l)));

function checkInterpreterCode(code, name) {
  const js = /^(node|nodejs|bun|deno|tsx|ts-node)$/.test(name);
  const py = /^(python|pypy)/.test(name);
  const pl = /^perl/.test(name);
  const rb = /^(ruby|irb)/.test(name);
  const php = /^php/.test(name);
  if (js) {
    if (
      /(?<!['"`]\s*in\s+)(?:\b(?:process|Bun)|\brequire\s*\(\s*['"`](?:node:)?process['"`]\s*\))\s*\.\s*env\b(?!\s*(?:(?:\.|\?\.)\s*(?!(?:valueOf|toJSON|toString|toLocaleString|constructor|__proto__)\b)[A-Za-z_$]|\[))/.test(
        code,
      )
    )
      throw new Blocked('interpreter-env-dump');
    if (/\bprocess\s*\[\s*['"`]env['"`]\s*\]/.test(code)) throw new Blocked('interpreter-env-dump');
    // Destructured whole object: const { env } = process; import { env } from 'process'.
    if (
      /\{[^}]*\benv\b[^}]*\}\s*=\s*(?:globalThis\s*\.\s*)?(?:process\b|require\s*\(\s*['"`](?:node:)?process['"`])/.test(
        code,
      )
    )
      throw new Blocked('interpreter-env-dump');
    if (/\bimport\s*\{[^}]*\benv\b[^}]*\}\s*from\s*['"`](?:node:)?process['"`]/.test(code))
      throw new Blocked('interpreter-env-dump');
    if (/\bDeno\s*\.\s*env\s*\.\s*toObject\b/.test(code)) throw new Blocked('interpreter-env-dump');
  }
  if (py) {
    if (/(?<!['"]\s*in\s+)\bos\s*\.\s*environ\b(?!\s*(?:\[|\.\s*get\s*\())/.test(code))
      throw new Blocked('interpreter-env-dump');
    if (/\bfrom\s+os\s+import\b[^\n;]*\benviron\b/.test(code))
      throw new Blocked('interpreter-env-dump');
  }
  if (pl && /%ENV\b/.test(code)) throw new Blocked('interpreter-env-dump');
  if (
    rb &&
    /(?<![\w$.])ENV\b(?!\s*(?:\[|\.\s*(?:fetch|key\?|has_key\?|include\?|member\?)))/.test(code)
  )
    throw new Blocked('interpreter-env-dump');
  if (php && /\bgetenv\s*\(\s*\)|\$_ENV\b|\$_SERVER\b|\bphpinfo\s*\(/.test(code))
    throw new Blocked('interpreter-env-dump');
  if (py && /\bgetenv\s*\(\s*\)/.test(code)) throw new Blocked('interpreter-env-dump');
  // Shelling out: exec('env'), execSync("printenv"), os.system('env'), subprocess.run(['env']), qx(env).
  const shellOut =
    /\b(?:exec|execSync|spawn|spawnSync|execFile|execFileSync|system|popen|check_output|check_call|getoutput|getstatusoutput|run|call|Popen|shell_exec|passthru|qx)\s*[(\s]\s*\[?\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
  for (const m of code.matchAll(shellOut)) analyze(m[2], 1);
  if (pl || rb || php) for (const m of code.matchAll(/`([^`]*)`/g)) analyze(m[1], 1);
}

/** Checks one simple command (already split into words). */
function analyzeWords(input, seg, prevSeg, depth) {
  let words = input.slice();
  let viaXargs = false;
  for (let guard = 0; guard < 64; guard += 1) {
    while (words.length && (RESERVED.has(words[0]) || isAssign(words[0]))) words = words.slice(1);
    if (!words.length) return;
    const name = base(words[0]);
    const args = words.slice(1);

    if (name === 'printenv') throw new Blocked('printenv');

    if (name === 'env') {
      let k = 1;
      while (k < words.length) {
        const a = words[k];
        if (a === '--') {
          k += 1;
          break;
        }
        if (a === '-S' || a === '--split-string') {
          analyze(['env', ...words.slice(k + 1)].join(' '), depth + 1);
          return;
        }
        if (/^-S./.test(a) || a.startsWith('--split-string=')) {
          analyze(
            ['env', a.replace(/^-S|^--split-string=/, ''), ...words.slice(k + 1)].join(' '),
            depth + 1,
          );
          return;
        }
        if (['-u', '--unset', '-C', '--chdir'].includes(a)) {
          k += 2;
          continue;
        }
        if (a === '-' || (a.startsWith('-') && a.length > 1)) {
          k += 1;
          continue;
        }
        break;
      }
      while (k < words.length && isAssign(words[k])) k += 1;
      if (k >= words.length) throw new Blocked('env');
      words = words.slice(k);
      continue;
    }

    if (name === 'export') {
      if (optsOnly(args) || optHas(args, 'pn')) throw new Blocked('export');
      return;
    }
    if (name === 'declare' || name === 'typeset') {
      if (optsOnly(args) || optHas(args, 'p')) throw new Blocked('declare');
      return;
    }
    if (name === 'readonly') {
      if (optsOnly(args) || optHas(args, 'p')) throw new Blocked('readonly');
      return;
    }
    if (name === 'set') {
      if (args.length === 0) throw new Blocked('set');
      return;
    }
    if (name === 'jq' || name === 'gojq') {
      // The filter (not option values, not files): `env` / `$ENV` as a whole object.
      const withArg = ['--arg', '--argjson', '--slurpfile', '--rawfile'];
      const filters = [];
      for (let k = 0; k < args.length; k += 1) {
        const a = args[k];
        if (withArg.includes(a)) k += 2;
        else if (['-f', '--from-file', '-L', '--indent', '--tab'].includes(a))
          k += a === '--tab' ? 0 : 1;
        else if (a === '--args' || a === '--jsonargs') break;
        else if (!a.startsWith('-')) filters.push(a);
      }
      const code = filters.join('\n');
      if (
        /(?<![.\w$])env\b(?!\s*(?:\.\s*[A-Za-z_"]|\[))|\$ENV\b(?!\s*(?:\.\s*[A-Za-z_"]|\[))|\$__prog_args\b/.test(
          code,
        )
      )
        throw new Blocked('jq-env');
      return;
    }
    if (/^[gmn]?awk$/.test(name)) {
      if (/\bENVIRON\b(?!\s*\[\s*"[^"]+"\s*\])/.test(args.join('\n')))
        throw new Blocked('awk-environ');
      return;
    }
    if (name === 'ps') {
      if (args.length && /^[A-Za-z]*e[A-Za-z]*$/.test(args[0])) throw new Blocked('ps-environment');
      if (args.some((a) => /^-[A-Za-z]*E/.test(a))) throw new Blocked('ps-environment');
      return;
    }
    if (name === 'systemctl' || name === 'launchctl') {
      if (args.includes('show-environment') || args.includes('export'))
        throw new Blocked('service-manager-environment');
      return;
    }

    if (name === 'command') {
      if (args.some((a) => /^-[a-zA-Z]*[vV]/.test(a))) return; // lookup, prints a path
      words = dropOptions(words, []);
      continue;
    }
    if (name === 'eval') {
      analyze(args.join(' '), depth + 1);
      return;
    }
    if (name === 'watch') {
      const rest = dropOptions(words, ['-n', '--interval', '-d', '-q', '--equexit', '-g']);
      analyze(rest.join(' '), depth + 1);
      return;
    }
    if (SHELLS.has(name)) {
      let k = 1;
      let cflag = false;
      while (k < words.length) {
        const a = words[k];
        if (a === '--') {
          k += 1;
          break;
        }
        if (
          ['-o', '+o', '-O', '+O', '--rcfile', '--init-file', '-C'].includes(a) &&
          name !== 'fish'
        ) {
          k += 2;
          continue;
        }
        if (/^[-+][A-Za-z]+$/.test(a)) {
          if (a.includes('c')) cflag = true;
          k += 1;
          continue;
        }
        if (a.startsWith('--')) {
          if (a === '--command') cflag = true;
          k += 1;
          continue;
        }
        break;
      }
      if (cflag) {
        if (k < words.length) analyze(words[k], depth + 1);
        // `... | xargs sh -c`: the script is xargs input this hook cannot see. Fail closed.
        else if (viaXargs) throw new Blocked('xargs-shell-input');
        return;
      }
      if (k < words.length) return; // runs a script file
      // Reads commands from stdin: heredoc, here-string, or `echo .. | sh`.
      for (const b of [...seg.heredocs, ...seg.herestrings]) analyze(b, depth + 1);
      if (seg.op === '|' && prevSeg) {
        const pw = prevSeg.words;
        if (pw.length && ['echo', 'printf'].includes(base(pw[0])))
          analyze(pw.slice(1).join(' '), depth + 1);
      }
      return;
    }
    if (['su', 'runuser', 'script', 'flock'].includes(name)) {
      const k = args.findIndex((a) => a === '-c' || a === '--command');
      if (k >= 0 && k + 1 < args.length) analyze(args[k + 1], depth + 1);
      return;
    }
    if (name === 'find') {
      for (let k = 0; k < args.length; k += 1) {
        if (/^-(exec|execdir|ok|okdir)$/.test(args[k])) {
          let e = k + 1;
          while (e < args.length && args[e] !== ';' && args[e] !== '+') e += 1;
          analyzeWords(args.slice(k + 1, e), { heredocs: [], herestrings: [] }, null, depth + 1);
          k = e;
        }
      }
      return;
    }
    if (['yarn', 'npm', 'pnpm', 'npx', 'bunx', 'pnpx'].includes(name)) {
      let k = 1;
      while (k < words.length) {
        const a = words[k];
        if (
          [
            '--cwd',
            '--prefix',
            '-w',
            '--workspace',
            '--filter',
            '-C',
            '--dir',
            '-p',
            '--package',
          ].includes(a)
        )
          k += 2;
        else if (a === '-c' || a === '--call') {
          if (k + 1 < words.length) analyze(words[k + 1], depth + 1);
          return;
        } else if (a === 'workspace') k += 2;
        else if (['workspaces', 'exec', 'x', 'dlx', '--'].includes(a) || a.startsWith('-')) k += 1;
        else break;
      }
      if (k >= words.length) return;
      if (['run', 'run-script', 'rum', 'urn'].includes(words[k])) {
        if (words[k + 1] === 'env') throw new Blocked('package-manager-env');
        words = words.slice(k + 1);
        continue;
      }
      if (words[k] === 'env' && words.length === k + 1) throw new Blocked('package-manager-env');
      words = words.slice(k);
      continue;
    }
    if (name === 'bun' && (args[0] === 'run' || args[0] === 'x')) {
      if (args[1] === 'env') throw new Blocked('package-manager-env');
      words = args.slice(1);
      continue;
    }
    if (name === 'xargs') {
      // xargs runs its command with the input words appended (or substituted for the -I
      // replace string). When the input is a visible `echo`/`printf` on the left of the
      // pipe, check the command as xargs will actually run it.
      let replace = null;
      for (let k = 1; k < words.length; k += 1) {
        const a = words[k];
        if (a === '-I' || a === '--replace') replace = words[k + 1] ?? '{}';
        else if (/^-I./.test(a)) replace = a.slice(2);
        else if (a.startsWith('--replace=')) replace = a.slice(10) || '{}';
        else if (a === '-i') replace = '{}';
        else if (!a.startsWith('-')) break;
      }
      const rest = dropOptions(words, WRAPPERS.xargs.arg);
      if (!rest.length) return; // xargs with no command runs echo
      viaXargs = true;
      const pw = seg.op === '|' && prevSeg ? prevSeg.words : [];
      const input = pw.length && ['echo', 'printf'].includes(base(pw[0])) ? pw.slice(1) : null;
      if (input && replace !== null)
        words = rest.map((x) => x.split(replace).join(input.join(' ')));
      else if (input) words = [...rest, ...input];
      else words = rest;
      continue;
    }
    if (WRAPPERS[name]) {
      const w = WRAPPERS[name];
      words = dropOptions(words, w.arg, w.pos ?? 0);
      continue;
    }

    if (INTERP.test(name)) {
      checkInterpreterCode(
        [...args, ...seg.heredocs, ...seg.herestrings].join('\n'),
        name.replace(/[0-9.]+$/, ''),
      );
      return;
    }
    return;
  }
  throw new ParseError('depth');
}

/** Whether a glob path component (*, ?, [..]) can match the whole name `environ`. */
function globCanMatchEnviron(component) {
  if (!/[*?[]/.test(component)) return component === 'environ';
  let re = '';
  for (let i = 0; i < component.length; i += 1) {
    const c = component[i];
    if (c === '*') re += '.*';
    else if (c === '?') re += '.';
    else if (c === '[') {
      const j = component.indexOf(']', i + 2);
      if (j < 0) re += '\\[';
      else {
        re += `[${component
          .slice(i + 1, j)
          .replace(/^!/, '^')
          .replace(/\\/g, '\\\\')}]`;
        i = j;
      }
    } else re += c.replace(/[.+^${}()|\\]/g, '\\$&');
  }
  try {
    return new RegExp(`^${re}$`).test('environ');
  } catch {
    return true; // an unreadable glob next to /proc fails closed
  }
}

function analyze(s, depth) {
  if (depth > MAX_DEPTH) throw new ParseError('depth');
  if (/\/proc\b/.test(s) && /environ\b/.test(s)) throw new Blocked('proc-environ');
  const { segments, subs } = tokenize(s);
  // Dequoted words: /proc/self/env""iron, envir\on, /proc/*/env*, or `cd /proc/1; cat e*`.
  const words = segments.flatMap((g) => g.words);
  if (/\/proc\b/.test(s) || words.some((w) => w.includes('/proc'))) {
    for (const w of words) {
      if (w.split('/').some((c) => c !== '' && globCanMatchEnviron(c)))
        throw new Blocked('proc-environ');
    }
  }
  segments.forEach((seg, idx) =>
    analyzeWords(seg.words, seg, idx > 0 ? segments[idx - 1] : null, depth),
  );
  for (const sub of subs) analyze(sub, depth + 1);
}

// ── Hook entry ───────────────────────────────────────────────────────────────

const ADVICE =
  'Never print the environment: agent sessions hold real secrets. To check a variable, test it ' +
  'without printing it: [ -n "$VAR" ] && echo set. To drop variables for a test run, use the ' +
  'subshell form: (unset REDIS_URL SENTRY_DSN; yarn workspace @lawie/<ws> test).';

function block(rule, why) {
  process.stderr.write(`Blocked (no-env-print, rule: ${rule}): ${why} ${ADVICE}\n`);
  process.exit(2);
}

/** Returns the block rule for a command string, or null if allowed. Exported for tests. */
export function check(command) {
  try {
    analyze(command, 0);
    return null;
  } catch (e) {
    if (e instanceof Blocked) return e.rule;
    if (e instanceof ParseError) return 'parse-error';
    return 'checker-error';
  }
}

function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    block('parse-error', 'the hook input is not valid JSON, so the hook fails closed.');
  }
  if (!input || typeof input !== 'object' || Array.isArray(input))
    block('parse-error', 'the hook input is not a JSON object, so the hook fails closed.');
  const cmd = input.tool_input ? input.tool_input.command : undefined;
  if (cmd === undefined || cmd === null || cmd === '') process.exit(0);
  if (typeof cmd !== 'string')
    block('parse-error', 'tool_input.command is not a string, so the hook fails closed.');
  const rule = check(cmd);
  if (rule === null) process.exit(0);
  if (rule === 'parse-error' || rule === 'checker-error')
    block(
      rule,
      'the hook could not parse this command, so it fails closed. Simplify the command (balanced quotes and parentheses).',
    );
  block(rule, 'this command would print environment variables.');
}

const isMain = () => {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
};
if (process.argv[1] && isMain()) main();
