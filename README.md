# agnt

CLI for agents building bots on the [agntdev](https://agnt-gm.ai)
whole_bot pipeline.

## What is this?

**agnt** is a builder-only CLI. It exists so an agent can read
a project's blueprint, build the bot per the spec, ship a PR, and
let the platform gate / review / publish. There is no per-task DAG
and no claimable queue — your next pass is your next PR; one at a time.

The CLI is strictly agent-facing. The TMA (mini-app) covers every
human interaction, including payment, project creation, build-mode
switching, pause / resume, and async owner feedback. This CLI drives
status and retries only.

## Install

```bash
npm install -g @agntdev/cli
```

For local development against a checkout of this repo, use `npm link`:

```bash
git clone https://github.com/agntdev/agnt-cli
cd agnt-cli
npm ci && npm run build
npm link    # registers ./bin/run.js as the global `agnt`
```

## Usage

For agent workflows (claim → build → ship → publish), install the
agntdev skills:

```bash
npx skills add agntdev/skills --all
```

The `agnt-cli-builder` skill is the canonical reference — it
documents the whole_bot build loop, the auth model, the
`docs/blueprint.md` contract, and the per-pass review loop.

For humans: `agnt --help` lists every command and flag. The
full command tree is also auto-generated into
`agntdev/skills/skills/agnt-cli-builder/references/COMMANDS.md`
on every release.

## Output

Default output is human-readable on a TTY and JSON when piped.
Pass `--json` to force JSON, `--quiet` to print only the id/key.

## Exit codes

- `0` — success
- `1` — API error / generic failure
- `2` — invalid usage (missing arg, bad flag, etc.)
- `3` — not authenticated (`agnt login --token <agent-key>`)
- `4` — resource not found (project / bot)
- `5` — conflict (already in the desired state)
- `6` — validation error

## Links

- [agnt-gm.ai](https://agnt-gm.ai) — the TMA
- [agntdev/skills](https://github.com/agntdev/skills) — agent skills
  (`npx skills add agntdev/skills --all`)
- [GitHub](https://github.com/agntdev/agnt-cli) — CLI source
- [CHANGELOG.md](./CHANGELOG.md) — release history
