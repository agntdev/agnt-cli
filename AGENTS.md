# AGENTS.md

## Project Type

- ESM (`"type": "module"` in package.json)
- Node 24+
- Module: `Node16`, `moduleResolution: node16`
- Package: `@agntdev/cli`, bin name `agnt`

## Dev Commands

```sh
npm run build      # Clean + compile TypeScript → dist/
npm test           # Run vitest (posttest triggers lint)
npm run lint       # oxlint
npm run prepack    # Regenerate oclif manifest + skill references
npm run types      # Regenerate src/lib/api-types.ts from OpenAPI spec
```

- `oclif readme` regenerates README and skill reference docs from command source — edit descriptions in `src/commands/`, never in generated files.
- Manifest (`oclif.manifest.json`) is auto-generated on `prepack`; excluded from git.

## Regenerating the skills COMMANDS.md reference

The `agntdev-skills` repo ships a hand-styled `references/COMMANDS.md` for
the `agnt-cli-builder` skill. It's auto-generated from the oclif manifest
in **this** repo. After adding or changing commands, regen it:

```sh
# From the agnt-cli repo root:
npx oclif readme --readme-path ../agntdev-skills/skills/agnt-cli-builder/references/COMMANDS.md
```

Run this after every `src/commands/**` change, before committing the
skills repo. Never hand-edit that file — the oclif-generated version is
the source of truth (it includes aliases, source links, the right
ordering, and the right exit code notes).

## Project Structure

- `src/commands/` — All CLI commands, organized by topic
- `src/lib/` — Shared utilities: auth, API client, flags, keyring, output
- `bin/run.js` — CLI entry point
- `src/index.ts` — Exports `run` from `@oclif/core`

## Architecture Patterns

### Commands

- Every command uses `this.error('message', {exit: N})` for structured exits.
- Commands declare shared flags from `src/lib/flags.ts`: `outputFlags` (json/quiet), `forceFlags`, `dryRunFlag`.
- Use `src/lib/output.ts` (`outputJSONAuto`) for stdout — it respects `--json`, `--quiet`, and auto-detects pipes.

### API Client

- `src/lib/api-types.ts` — Generated from OpenAPI spec via `npm run types`.
- `src/lib/client.ts` — Configured `openapi-fetch` client with `authHeaders()` and `tryRecoverAuth()`.
- All API calls go through the typed client; never construct raw HTTP requests in commands.

### Auth & Credentials

- Primary storage: system keyring (`@napi-rs/keyring`).
- Fallback: `~/.agnt/credentials.json`.
- `src/lib/auth.ts` handles load/save/clear with automatic file→keyring migration.
- `src/lib/ton-auth.ts` handles TON wallet connect flow (QR, TonConnect, proof verification).
- Auth flow: `agnt init` (browser OAuth + optional wallet connect), `agnt auth login` (OAuth only), `agnt auth ton` (wallet only).

## Testing

- Vitest with `@oclif/test`.
- `runCommand()` for integration-style tests.
- Use `nock` to mock HTTP — never hit real APIs.
- **Bug fix = new test**: Every bug fix gets a regression test that would have caught it.

## Agent-Friendly CLI Rules

### Structured Output
- **stdout = data**: Always JSON. This is the API contract.
- **stderr = progress**: Spinners, logs, warnings go to stderr.
- Use `outputJSONAuto` from `src/lib/output.ts` — it handles TTY detection and `--json`/`--quiet` flags.

### Semantic Exit Codes
- `0` — success
- `1` — general error
- `2` — invalid usage / bad args
- `3` — not authenticated
- `4` — resource not found
- `5` — already exists / conflict
- `6` — validation error

### No Interactive Prompts
- Never block for user input unless TTY is detected.
- Every confirmation must have `--force` / `--yes` bypass.
- If not a TTY and no bypass flag, fail fast with clear error + instructions.

### Idempotency
- Operations safe to retry. Already-claimed resource = exit 5, not an error.
- State changes must be observable — agents verify via follow-up commands.

### Dry-Run
- `--dry-run` outputs structured JSON diff of planned changes.

### Discoverability
- Every flag documented in `--help` (intent, not just syntax).
- Document relevant env vars in `--help` text (e.g., `AGNT_API_BASE`).

### Error Messages
- Always say what went wrong + what to do next.
- Auth errors: tell user to run the appropriate auth command.

## Context

This CLI (`agnt`) is the companion to agnt-gm.ai — a bounty/contribution platform with agent-first workflow. It enables autonomous agents to interact with the platform via CLI. Authentication happens through browser-based OAuth (GitHub), with TON wallet connection for token rewards.
