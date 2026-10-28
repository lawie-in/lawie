#!/usr/bin/env node
/**
 * T-633: dispatcher behind .claude/hooks/crew-role.sh (global PreToolUse hook on Bash and on
 * Edit|Write|MultiEdit|NotebookEdit, wired in .claude/settings.json).
 *
 * Why: the CLI does not apply the `hooks:` frontmatter of .claude/agents/dev/*.md to subagents
 * (reproduced 28 Oct 2026: a reviewer ran `git status; echo x`). Settings-level hooks do fire
 * for subagents, and their PreToolUse input carries `agent_type` (the subagent's name; also
 * present on the main thread of a session started with `--agent <name>`) and `agent_id`
 * (subagents only). This dispatcher keys on `agent_type` and runs the crew role's existing
 * script with the same stdin payload:
 *
 *   agent_type    Bash                 Edit / Write / MultiEdit / NotebookEdit
 *   reviewer      readonly-bash.sh     blocked outright (the reviewer has no edit tools)
 *   doc-writer    readonly-bash.sh     docs-only.sh
 *   tester        db-readonly.sh       tests-only.sh
 *   developer     db-readonly.sh       no-tests.sh
 *
 * `agent_type` is matched exactly and case-sensitively on those four names. A plugin-qualified
 * form (`<plugin>:reviewer`), any other agent type, and an absent agent_type (the main thread,
 * i.e. a lead session) pass through with exit 0. Other tools pass through.
 *
 * Fails closed (exit 2):
 *   - the payload is not valid JSON or not a JSON object, whoever sent it (agent_type is then
 *     unknowable; consistent with no-env-print.mjs);
 *   - for a crew role: tool_input missing, Bash command not a string, Edit/Write path missing
 *     or not a string, the role script missing, bash or jq not runnable, the role script
 *     crashing, timing out (15 s, then SIGKILL) or exiting with any non-zero code.
 * Timeouts are kept well under the CLI's 60 s hook timeout, which would fail open.
 * The role script's exit 2 and its stderr are propagated as is. For NotebookEdit the path
 * checked is always `tool_input.notebook_path` (copied into `file_path`, which the role
 * scripts read); a `file_path` that differs from it blocks. Otherwise the payload is passed
 * through byte for byte.
 *
 * This dispatcher logs nothing of its own about the payload: its messages name the role and
 * the rule only, never the command or path.
 */
import { readFileSync, accessSync, constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK_DIR = dirname(fileURLToPath(import.meta.url));

/** Role script per crew agent type. `edit: null` means every edit tool is blocked. */
const ROLES = Object.freeze({
  reviewer: { bash: 'readonly-bash.sh', edit: null },
  'doc-writer': { bash: 'readonly-bash.sh', edit: 'docs-only.sh' },
  tester: { bash: 'db-readonly.sh', edit: 'tests-only.sh' },
  developer: { bash: 'db-readonly.sh', edit: 'no-tests.sh' },
});

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
// The CLI treats a hook that times out (60 s default) as a non-blocking error, i.e. it fails
// OPEN. Worst case here is jq probe + role script = 2 s + 15 s, far inside that limit, and a
// timed-out child is SIGKILLed and blocks.
const PROBE_TIMEOUT_MS = 2_000;
const ROLE_SCRIPT_TIMEOUT_MS = 15_000;
const MAX_STDERR_BYTES = 1024 * 1024;

function block(rule, why) {
  process.stderr.write(`Blocked (crew-role, rule: ${rule}): ${why}\n`);
  process.exit(2);
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function canRun(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'ignore', timeout: PROBE_TIMEOUT_MS, killSignal: 'SIGKILL' });
  return !r.error && r.status === 0;
}

function runRoleScript(role, script, payload) {
  const scriptPath = join(HOOK_DIR, script);
  try {
    accessSync(scriptPath, constants.R_OK);
  } catch {
    block('missing-role-script', `the ${role} role script ${script} is not readable, so the hook fails closed.`);
  }
  // Kept although tests-only/docs-only/no-tests/readonly-bash check jq themselves:
  // db-readonly.sh does not, and without jq it would allow everything.
  if (!canRun('jq', ['--version']))
    block('no-jq', `jq cannot be run, so the ${role} role script ${script} cannot read its input and the hook fails closed.`);

  const r = spawnSync('bash', [scriptPath], {
    input: payload,
    encoding: 'utf8',
    stdio: ['pipe', 'ignore', 'pipe'],
    timeout: ROLE_SCRIPT_TIMEOUT_MS,
    killSignal: 'SIGKILL',
    maxBuffer: MAX_STDERR_BYTES,
  });
  // r.error covers bash missing (ENOENT), a timeout (ETIMEDOUT, child SIGKILLed) and
  // oversized stderr (ENOBUFS): all block.
  if (r.error) {
    const code = r.error.code;
    if (code === 'ENOENT')
      block('no-bash', `bash cannot be run, so the ${role} role check cannot run and the hook fails closed.`);
    if (code === 'ETIMEDOUT')
      block('role-script-timeout', `the ${role} role script ${script} timed out and was killed, so the hook fails closed.`);
    block('role-script-error', `the ${role} role script ${script} could not be run (${code}), so the hook fails closed.`);
  }
  if (r.status === 0) process.exit(0);
  if (r.stderr) process.stderr.write(r.stderr.endsWith('\n') ? r.stderr : `${r.stderr}\n`);
  if (r.status === 2) process.exit(2);
  const how = r.status === null ? `was killed (${r.signal})` : `exited ${r.status}`;
  block('role-script-error', `the ${role} role script ${script} ${how}, so the hook fails closed.`);
}

function main() {
  let raw;
  let input;
  try {
    raw = readFileSync(0, 'utf8');
    input = JSON.parse(raw);
  } catch {
    block('parse-error', 'cannot parse hook payload (not valid JSON), so the hook fails closed.');
  }
  if (!isPlainObject(input))
    block('parse-error', 'cannot parse hook payload (not a JSON object), so the hook fails closed.');

  const agentType = input.agent_type;
  if (typeof agentType !== 'string' || !Object.hasOwn(ROLES, agentType)) process.exit(0);
  const role = agentType;
  const scripts = ROLES[role];
  const tool = input.tool_name;
  const ti = input.tool_input;

  if (tool === 'Bash') {
    if (!isPlainObject(ti) || typeof ti.command !== 'string')
      block('bad-tool-input', `Bash input for the ${role} role has no command string, so the hook fails closed.`);
    runRoleScript(role, scripts.bash, raw);
    return;
  }

  if (typeof tool === 'string' && EDIT_TOOLS.has(tool)) {
    if (scripts.edit === null)
      block('no-edit', `the ${role} role may not use ${tool}; it reports findings and never changes files.`);
    if (!isPlainObject(ti))
      block('bad-tool-input', `${tool} input for the ${role} role has no tool_input, so the hook fails closed.`);
    let payload = raw;
    let path = ti.file_path;
    if (tool === 'NotebookEdit') {
      // NotebookEdit writes notebook_path. The role scripts read file_path, so it is set from
      // notebook_path; a different file_path alongside it is ambiguous and blocks.
      path = ti.notebook_path;
      if (typeof path !== 'string' || path === '')
        block('bad-tool-input', `NotebookEdit input for the ${role} role has no notebook_path, so the hook fails closed.`);
      if (ti.file_path !== undefined && ti.file_path !== path)
        block('bad-tool-input', `NotebookEdit input for the ${role} role carries a file_path that differs from notebook_path, so the hook fails closed.`);
      payload = JSON.stringify({ ...input, tool_input: { ...ti, file_path: path } });
    }
    if (typeof path !== 'string' || path === '')
      block('bad-tool-input', `${tool} input for the ${role} role has no file path, so the hook fails closed.`);
    runRoleScript(role, scripts.edit, payload);
    return;
  }

  process.exit(0);
}

main();
