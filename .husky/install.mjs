// Root `prepare` script (T-378). Installs husky git hooks for local checkouts
// and worktrees, but returns silently in CI and in Docker builds, where there
// is no .git and husky (a devDependency) may not be installed.
// Recipe: https://typicode.github.io/husky/how-to.html#ci-server-and-docker
import { existsSync } from 'node:fs';

// `.git` is a directory in a normal checkout and a file in a git worktree;
// existsSync covers both. `prepare` runs from the repo root.
if (process.env.CI || process.env.HUSKY === '0' || !existsSync('.git')) {
  process.exit(0);
}

const husky = (await import('husky')).default;
const message = husky();
if (message) console.log(message);
