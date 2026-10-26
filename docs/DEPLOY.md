# Deploying

Deploys run **on the box itself** with `scripts/deploy-local.sh` (T-606). The old root
`deploy.sh` (it scp'd the env file to a hard-coded IP, then ssh'd in to deploy) has been
deleted. Do not bring it back.

## Run it

On the box, as the `ubuntu` user (the user that owns the checkout and the pm2 daemon),
from a login shell so nvm's `node`, `yarn` and `pm2` are on `PATH`:

| Box     | Command                                   |
| ------- | ----------------------------------------- |
| prod    | `~/lawie/scripts/deploy-local.sh main`    |
| develop | `~/lawie/scripts/deploy-local.sh develop` |

Any other argument prints usage and exits 2 without touching anything.

## What it does

1. **Branch guard.** Reads the instance id from EC2 instance metadata (IMDSv2: token, then
   `instance-id`, both with `--noproxy '*'`). It refuses `main` on the develop box and
   `develop` on prod. An unknown instance id, or metadata that cannot be reached, is also
   a refusal (fail closed). The two instance ids are named at the top of the script.
2. **Preflight.** Refuses to run as root, and refuses if any of `git yarn pm2 node curl
sed` is missing from `PATH`.
3. **Clean checkout only.** First restores `apps/web/next-env.d.ts` (that one file only:
   `next build` rewrites it on every build, which would otherwise make every second deploy
   look dirty). It then refuses if any other tracked file has local changes, or if the
   local branch has diverged from `origin/<branch>`. It never runs `git reset --hard` or
   `git push`.
4. `git fetch origin`, `git checkout <branch> --`, `git pull --ff-only origin <branch>`.
5. **Env.** Loads the env file named on line 1 of `ecosystem.config.js`
   (`const ENV_FILE = '...'`); the script has no path of its own. The file is parsed by
   `node --env-file` (dotenv rules, like pm2), not bash `source`. Unquoted values with
   spaces work, and `$`, backticks and quotes in values are kept literally, never run.
   A file Node cannot load stops the deploy with exit 3. Values are never printed.
   Then sets `SENTRY_RELEASE` to the deployed commit (T-586).
6. `yarn install --frozen-lockfile --production=false`, builds `@lawie/shared`,
   `@lawie/email-client`, then all workspaces, and copies web's `public/` and
   `.next/static` into the standalone build.
7. `pm2 reload ecosystem.config.js --update-env`.
8. **Health gate (T-442).** Up to 10 tries, 3 s apart. Each must return HTTP 200:
   gateway `:4000/health`, auth `:4001/health`, drafting `:4002/health`, billing
   `:4003/health`, email worker `:9100/health`, web `GET /` on `:3000`. If any fail, it
   lists them and exits 1. A 503 from the email worker means it is held (live send with an
   unfilled footer placeholder). Next step: `pm2 logs <name> --lines 100`.

Any failed step stops the deploy with a non-zero exit. The script reads itself in full
before it starts, so the `git pull` updating it mid-run does not change the running deploy.

## Through SSM

The SSM deploy action runs the same command on the target box as `ubuntu` in a login
shell, for example `sudo -u ubuntu -i ~/lawie/scripts/deploy-local.sh main`. SSM runs as
root by default, and the script refuses root: as root, git rejects the checkout (it belongs
to another user) and pm2 would talk to a different daemon.

The env file never leaves the box. The script contains no secrets and no `scp` or `ssh`.
The only IP address in it is `169.254.169.254`, AWS's fixed link-local instance metadata
address, which never leaves the box. There is no other IP address.

## Rollback

The script only fast-forwards, so it cannot roll back. To roll back by hand on the box:

1. `cd ~/lawie && git log --oneline -5` and pick the last good SHA.
2. `git checkout <sha>` (detached HEAD), then do steps 5 to 8 above by hand. Load the env
   the way the script does: plain `source` of the prod env file fails (it has an unquoted
   value with a space).
3. Fix forward: revert the bad commit on the branch through the normal flow, then run the
   script again. It checks out the branch itself and deploys the branch tip, so running it
   before the revert lands puts the bad commit straight back.
