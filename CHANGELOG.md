# Changelog

CLI release history. `@agntdev/cli` follows semver. The skill bundle
(`agntdev/skills`) and the CLI are versioned independently but share
a major.minor by convention.

## v0.19.0 (2026-06-27) — drop chat, build-mode, pause, feedback (operator-in-session model)

**MINOR** cut. The skill bundle ships at v0.19.0 alongside this;
the two are paired but versioned independently.

**Commands removed (four):**

- `agnt project chat` — creator concern (TMA / mini-app), not
  builder. Builder reads the project via `agnt project show`;
  owners interact with the chat in the mini-app only.
- `agnt project build-mode` — local_agent / platform_agent split
  no longer surfaced. Running both cloud and local on the same
  project is a user-fault scenario; the CLI doesn't expose a
  knob to switch modes.
- `agnt project pause` — owner-only. Pause / resume lives in
  the mini-app; builders don't pause or resume projects mid-pass.
- `agnt project feedback` — operator steers the agent **in the
  LLM session** (Claude Code / Claude.ai / similar), not via an
  out-of-band CLI command. Cloud agent has no operator at all;
  local agent's operator types feedback to the LLM directly.
  Async owner → bot change requests stay on the mini-app's
  `FeedbackComposer` (POST /builder/projects/:id/feedback) — the
  API endpoint is untouched, only the CLI wrapper goes away.

**`agnt project show` output trimmed:**

The human output no longer renders the `Build mode:` line or
the mode-specific hint (`YOU build the whole bot` /
`cloud agent drives the build`). The field is still in the
JSON response for backward compat with any existing scripts, but
the agent doesn't branch on it.

```
$ agt project show my-bot
Project: My Project (my-bot)
Status:  building
Pipeline: whole_bot (N-pass build against docs/blueprint.md; you
            build the bot and ship a PR, platform gates/reviews/
            publishes)
```

**Final command surface (v0.19.0):**

```
agnt connect <code>            # link via one-time mini-app code
agnt login --token <key>       # headless: paste a key
agnt logout
agnt whoami

agnt project list --status live
agnt project show <slug>            # status + pipeline + build_progress
agnt project blueprint <slug>       # the spec you build against
agnt project rebuild <slug> --yes   # retry a failed whole_bot

agnt bot show <slug>            # post-publish bot identity + @username
agnt bot logs <slug> [--tail N] # download build log (when deploy fails)
```

**Pair:** `@agntdev/cli@0.19.0` + `v0.19.0` skills.

---

## v0.18.0 (2026-06-25) — whole_bot only (drop task_manager + phase + TON)

**MINOR** cut that mirrors the upstream agnt-api removals: the
backend is whole_bot-only now (agnt-api #240, #242, #233, #244),
the task_manager + phase pipelines are gone, TON economy is gone,
deploy is free, and the cloud agent is paid for from the mini-app.
The CLI slims down to that surface.

**Removed (whole_bot-only mode):**

- `agnt task *` (8 commands: claim, claims, clarify, comment,
  progress, show, submit, thread) — task_manager is gone. Use
  `agnt project chat` for project chat or `agnt project feedback`
  to ship an update to a built whole_bot.
- `agnt tasks <slug>` — the DAG endpoint (`/projects/:id/dag`) is
  gone; whole_bot projects have no per-task DAG by design.
- `agnt ready` — the `GET /builder/tasks` endpoint is gone; there
  is no task pool to browse. Agents are routed in via a connect
  code (`agnt connect`) and read the project's blueprint.
- `agnt test <slug> <task>` — the dry-run reviewer called
  `/builder/projects/:id/tasks/:slug/preview-review`, a task_manager
  route deleted in agnt-api #240. No replacement: whole_bot
  validation runs inline on PR open (build-gate + completeness
  review + tests gate). Local validation lives in the bot's own
  `npm test`, which the publish gate mirrors.
- `lib/project-pipeline.ts` — no more `BuildPipeline` enum (whole_bot
  is the only value stamped on new projects, legacy rows still
  carry `phase` / `task_manager` and the CLI renders a "(legacy)"
  hint).
- TON / TON pool / `ton_reward` flag references — TON economy is
  gone. The 10★ Telegram Stars payment for cloud-agent assignment
  stays (paid by the owner from the mini-app; the CLI does NOT
  touch payment).

**Modified:**

- `src/commands/project/show.ts` — whole_bot-only label. The
  `BUILD_PIPELINES` map is gone; `pipelineHint` no longer branches
  on task_manager / phase. The build_mode hint is the only thing
  that distinguishes local_agent (you build per docs/blueprint.md
  and open a PR) from platform_agent (cloud agent drives; watch
  via build_progress).
- `src/commands/connect.ts` — the "Next:" hint now points at
  `agnt project show <slug>` (was `agnt task list <slug>`).

**Added (whole_bot owner surface):**

- `agnt project blueprint <slug>` — `GET /projects/:id/quality/blueprint`.
  Reads the build spec the platform wrote during finalizeWholeBot.
  For local_agent projects this IS your build spec; read it before
  you touch any code.
- `agnt project rebuild <slug> --yes` — `POST /projects/:id/rebuild`.
  Owner retry for a failed whole_bot (agnt-api #229). Refuses
  without `--yes`; 409 if not a failed whole_bot or no repo.
- `agnt project chat <slug>` — project chat (agnt-api builder_chat.go).
  - `chat start <idea>` → POST /chat (drafts a new project)
  - `chat <slug>`       → GET  /projects/:id/chat/messages (poll)
  - `chat <slug> <msg>` → POST /projects/:id/chat/messages (send)
  Post-draft the chat carries BUILD LOGS, not ideas — to change
  a finished bot, use `project feedback` instead.
- `agnt project build-mode <slug> --mode local_agent|platform_agent` —
  `PUT /projects/:id/build-mode`. Switch the driver. Does NOT
  deploy a cloud agent (owner does that from the mini-app, 10★).
- `agnt project feedback <slug> <text>` — `POST /projects/:id/feedback`.
  The "Ship an update" entry (agnt-api #239 + agnt-gm.ai #76/#78).
  Enqueues an update round; the next pass's prompt carries the
  owner's ask forward. 409 if a build is already running.
- `agnt project pause <slug> --on|--off` — `PUT /projects/:id/bot/pause`.
  Owner pause/resume toggle.

**Test count:** 180 → 122 (removed ~50 task / phase / DAG tests; added
~50 new whole_bot command tests + restructured project.show tests
to drop the task_manager + phase branches).

**Pair:** `agnt-cli@0.18.0` + `v0.18.0` skills.

---

## v0.17.1 (2026-06-25) — whole_bot hint: local_agent vs platform_agent

**Patch.** v0.17.0's `whole_bot` pipeline label was correct but
the hint message was actively misleading on the most common
configuration: `build_pipeline: whole_bot` + `build_mode: local_agent`.
On that combination, **the agent IS the one who builds the bot** —
agnt-api #208 added the local-agent path (platform gates/reviews/
publishes the owner's PRs; the `BuilderWholeBotWorker` only scans
projects with a cloud agent or `build_mode=local_agent`). v0.17.0's
hint said "nothing for an agent to claim here — watch this project's
phase/status" which sent agents straight to the Step 1.5 exit ramp
when they should have been cloning the repo.

**Changes:**

- `src/commands/project/show.ts` — `BUILD_PIPELINES.whole_bot`
  label shortens to "N-pass build against docs/blueprint.md; check
  build_mode below for who builds" (avoids mis-implying "platform
  always builds"). The pipeline hint now branches on `build_mode`:
  - `local_agent`: "YOU build the whole bot per docs/blueprint.md,
    open a PR; platform gates/reviews/publishes."
  - `platform_agent`: "the platform cloud agent builds the whole bot
    automatically; watch via build_progress."

**Tests:** replaced the v0.17.0 "renders whole_bot correctly" test
with a `describe` block that pins both branches. 180/180 pass.

**Pair:** `agnt-cli@0.17.1` + `v0.17.1` skills (cut in lockstep).
Skill side: corrected the "If you see `build_pipeline: whole_bot`"
section in `agnt-cli-builder/SKILL.md` to teach agents to actually
build the bot on `local_agent` projects (with the one-pass build
flow: clone, read blueprint, ship a PR).

---

## v0.17.0 (2026-06-25) — whole_bot pipeline support

**Goal.** Add `whole_bot` as a third `build_pipeline` value the CLI
recognises. The platform's BuilderWholeBotWorker (agnt-api #200–#205,
pivot 06) runs N passes on the WHOLE bot per project — there's
nothing for a per-task agent to claim, and a bare assertion failure
on `whole_bot` projects was the worst possible UX.

**Why now.** Whole-bot is no longer dormant. New projects
(when `BUILDER_WHOLE_BOT_ENABLED` is set on the platform) are
stamped with `build_pipeline: whole_bot` and live in `PhaseBuilding`
until the loop converges (min 3 / max 6 passes, reward split
pool/K per merged pass at publish). The CLI used to throw
"unknown pipeline — upgrade agnt-api?" on every such project.

**Changes:**

- `src/lib/project-pipeline.ts` — `BuildPipeline` type now
  includes `"whole_bot"`. `fetchProjectBuildPipeline` accepts it
  (no longer throws). `assertTaskManager` returns a pipeline-
  specific message: `whole_bot` projects get pointed at
  `agnt project show <id>` (the platform drives the loop).
- `src/commands/project/show.ts` — `BUILD_PIPELINES` map gets a
  `whole_bot` entry; `ProjectResponse.build_pipeline` type accepts
  it; human output adds a `whole_bot` hint explaining that nothing
  is claimable here.
- All five task_manager write commands (`submit`, `comment`,
  `progress`, `clarify`, `thread`) and `task claim` automatically
  benefit — they all go through `assertTaskManager`. Behaviour
  unchanged for `task_manager` / `phase` projects.

**Out of scope:** pass-state endpoint, whole-bot-specific CLI
commands. The whole-bot loop worker handles the lifecycle; nothing
for the CLI to drive. Deferred until the platform exposes
per-project pass info via API.

**Pair:** `agnt-cli@0.17.0` + `v0.17.0` skills (cut in lockstep).

---

## v0.16.0 (2026-06-19) — phase pipeline cut + task_manager write surface

**Big CLI cut.** The phase-pipeline (`agnt phase show`,
`agnt phase advance`) is gone — the backend routes were deleted in
agnt-api PR `chore/remove-phase-pipeline` (commit 5fb5530, Jun 19).
In its place: 5 first-class task_manager write commands + 3 new
flags + the `phase`-vs-`task_manager` legacy fallback in
`agnt project show` removed.

**Removed:**
- `agnt phase show` — backend `GET /phase` + `GET /phases/:phase/runs` deleted
- `agnt phase advance` — backend `POST /phase/advance` deleted
- The silent `build_pipeline='phase'` fallback in `agnt project show`
  (the v0.15.1 unwrap fix revealed the field; pre-v0.16.0 the CLI
  silently defaulted to `phase` when the field was missing, masking
  the bug. Now: missing `build_pipeline` throws a clear
  "upgrade agnt-api to v0.14.0 or later" error.)

**Added — 5 task_manager write commands:**
- `agnt task submit <p> <s> <pr-url>` — register a PR URL with the
  platform. Transitions the task to `in_review`. (The recipe at the
  end of `agnt task claim` now prints this command instead of the
  old `curl POST /tasks/:slug/pr`.)
- `agnt task comment <p> <s> "msg"` — persistent note (visible
  via `agnt task thread`). Add `--body` for longer-form markdown.
- `agnt task progress <p> <s> "msg"` — ephemeral chat message
  (prefixed `🔧` in the chat UI).
- `agnt task clarify <p> <s> "q"` — blocking question. Spawns a
  Q-task that gates the parent. Idempotent on
  `sha256(projectId:slug:question).slice(0,16)`.
- `agnt task thread <p> <s>` — read all comments on a task.
  Chronological. Always call before posting again to check for
  owner replies.

**Added — 3 flags:**
- `agnt task claim <p> <s> --cancel` — release the claim.
- `agnt tasks <p> --blocked` — owner-only blocked-list (open
  question tasks + blocked/failed builds). Non-owners get 403
  with a hint to use the default `agnt tasks` view.
- `agnt tasks <p> --next` — platform-recommended next task to claim.
  Returns 204 → "no work right now" if nothing is available.

**Modified:**
- `agnt project show` — fails loud on missing `build_pipeline`
  (no more silent fallback). Renders the raw enum value if the
  field is a value the CLI doesn't recognise.
- `agnt task claim` — replaces the `curl POST /tasks/:slug/pr` in
  the task_manager recipe with `agnt task submit`. Adds `--cancel`.
  The shared `fetchProjectBuildPipeline` + `assertTaskManager`
  helpers now live in `src/lib/project-pipeline.ts` (used by all
  5 new commands + the modified claim flow).
- `agnt tasks` — `--blocked` and `--next` short-circuit the
  existing `/dag` fetch and hit dedicated endpoints.

**Migration note:** anyone calling `agnt phase show` /
`agnt phase advance` directly needs to switch to `agnt tasks`
(read) or `agnt task claim` (workflow). The `agnt-cli-builder`
skill is updated for v0.16.1 with the new command reference.

**Backend coordination:** ships in lockstep with the agnt-api PR
`chore/remove-phase-pipeline` (5fb5530). If the agnt-api PR
review changes the route list, we'll patch in v0.16.1.

**Test count:** 153 → 176 (+23). oxlint + tsc clean.

---

## v0.15.1 (2026-06-19) — unwrap `ProjectDetailResponse` in 4 commands

**Hotfix.** `GET /builder/projects/{id}` was changed to return a
`{ project, task_count, ... }` wrapper as part of the M1 build_pipeline
patch. The CLI never unwrapped it: every call site that read project
fields from the response got `undefined` for everything except
`task_count`, then fell back to legacy defaults.

**Symptom in the wild:** `agnt project show <slug>` rendered
`Build mode: platform_agent (legacy, full pipeline: ...)` and
`Build pipeline: phase (legacy 6-phase flow: ...)` for every project
on the new task_manager + local_agent flow. Project name fell back
to the slug. The actual API response was correct — the CLI was
reading the wrapper, not the project. `agnt task claim` was the
worst silent failure: it always returned `"phase"` for
`fetchProjectBuildPipeline` and never printed the task_manager
PR-registration step to agents claiming on task_manager projects.

**Fix.** New `unwrapProject()` helper in `src/lib/client.ts` accepts
both the wrapped (current) and flat (legacy) shapes. Four call sites
updated:

- `project/show.ts` — human + JSON output now shows real
  `name`, `build_mode`, `build_pipeline`.
- `phase/show.ts` — renders the correct verdict-history view for
  task_manager (skips the runs fetch, no longer confuses agents with
  an empty list).
- `phase/advance.ts` — safety gate now correctly identifies
  `local_agent` projects (the bug defaulted every project to
  `platform_agent` for this check too).
- `task/claim.ts` — `fetchProjectBuildPipeline` now reads the
  real `build_pipeline` value, so task_manager agents see the
  `POST /tasks/:slug/pr` registration step.

**Tests.**
- `test/commands/project.show.test.ts` — every existing test
  updated to use the wrapped response shape (they all asserted
  flat-shape behavior, which masked the bug). Added 3 new tests
  pinning the fix: `build_pipeline: task_manager` rendering, real
  name not falling back to slug.
- `test/lib/client.test.ts` — new file, 4 cases for
  `unwrapProject` (wrapped, flat, null/undefined, generic type).
- 153/153 tests pass. oxlint + tsc clean.

---

## v0.15.0 (2026-06-18) — `agnt bot logs` command

**Feature.** `agnt bot logs <slug>` — owner-only download of managed
bot build logs.

```
agnt bot logs <slug>                 -> ./<slug>-bot-build.log
agnt bot logs <slug> --output <path> -> explicit path
agnt bot logs <slug> --tail 80       -> last 80 lines
```

Exit codes match the rest of the CLI: 0 ok, 1 401/5xx, 2 no logs
available (`BOT_LOG_DIR` unset or no build has run yet — admin issue,
not a retry candidate).

Use this when the platform auto-opens a `fix-*` task for a
bot-deploy failure. The real `tsc` / `npm` error is in the persisted
build log, not in the truncated snippet the fix task body quotes.

---

## v0.14.1 (2026-06-18) — CI test fix + devDep refresh

- `project/show.ts`: drop 4-space pad in Build mode line
- `task.test.ts`: sync stale M6 expectations to v0.14.0 M7
  (no `/builder/agents/me` lookup, plain `--head <branch>`)
- `keyring.test.ts`: `vi.hoisted` + `function` keyword for vitest 4
- devDeps: `@types/node ^25`, `oxfmt ^0.55.0`, `vitest ^4.1.9`
  (closes 3 Dependabot CVEs via vite 8 + esbuild 0.28.1+)

---

## v0.14.0 (2026-06-17) — task_manager awareness + build_pipeline surface

The big CLI cut for the new task_manager (living-DAG) flow. The CLI
was a phase-pipeline-only tool; this release makes it dual-aware.

**New surface:**
- `agnt project show` now prints `build_mode` and `build_pipeline`
  (orthogonal flags — both can be in any combination). The
  `local_agent` and `task_manager` hints replace the old
  `platform_agent` / `phase` defaults when relevant.
- `agnt phase show` renders a different view for `build_pipeline =
  task_manager` (skips verdict-history fetch, since task_manager
  projects don't have phase runs).
- `agnt phase advance` reads `build_mode` from the project detail
  response (refuses to advance on `local_agent`, since
  `local_agent` projects auto-advance on PR merge).
- `agnt task claim` now reads `build_pipeline` and prints the
  task_manager PR-registration step (`POST /tasks/:slug/pr`) for
  task_manager projects. Phase-pipeline projects see the old
  "wait for the verdict" hint.
- `agnt tasks` renamed from `agnt dag`. The `agnt dag` alias was
  removed; old `agnt dag show <slug>` and `agnt task list` users
  need to switch to `agnt tasks <slug>`.

**Command surface delta:**
- 12 commands cut (init, balance, payouts, leaderboard, stats,
  contributor list, project create/fund/confirm-fund, dag).
- 5 renames: `dag show` → `tasks`, `task list` → `tasks`, etc.
- 1 unification: `agnt tasks` replaces both `agnt dag show` and
  `agnt task list`.

**Test count:** 86 → 143 (+57). Lint + build clean.

**⚠️ v0.15.1 retro:** This release shipped the `build_pipeline`
field but the CLI didn't unwrap the new `ProjectDetailResponse`
wrapper. Every command that read `build_pipeline` or `build_mode`
got `undefined` and fell back to legacy defaults. The v0.14.0
tests used flat-shape responses and never caught it. Fixed in
v0.15.1.

---

## v0.13.2 (2026-06-15) — bypass keyring when `AGNT_CREDENTIALS_DIR` is set

`npm test` was overwriting the developer's real OS keychain entry.
Setting `AGNT_CREDENTIALS_DIR` now bypasses the keyring too, so
test runs no longer touch the developer's auth.

143/143 tests passing. oxlint + tsc clean.

---

## v0.13.1 (2026-06-14) — fix: phase advance was missing the Authorization header

Hotfix on top of v0.13.0. The v0.13.0 cut shipped `phase advance`
without `headers: authHeaders()` on the POST. The router has
`AuthMiddleware` on the `/phase/advance` endpoint, so the server
returned 401 for every advance attempt.

Fix: add the header, wire `tryRecoverAuth` retry on 401, distinguish
real auth failures from "owner agent disconnected" edge cases.

---

## v0.13.0 (2026-06-13) — the simplification + build_mode cut

12 commands cut, 5 renames, 1 unification (`agnt tasks`).
C7 (phase show verdict history) + C11 (phase advance owner override)
+ C12 (build_mode in project show).
`NO_COLOR` env var support.
Skill rewrite for build_mode awareness.

---

## v0.12.0 (2026-06-12) — `agnt test` + claim error hint + claimers

New features:
- `agnt test` (preview-review dry-run) — runs the LLM reviewer
  on the unpushed diff before `gh pr create`. Catches the bot's
  complaints early so the PR doesn't auto-close 3 seconds later.
- `agnt task claim` prints an escape-hatch hint on phase-failed
  error (so builders know they can `agnt phase advance` to break
  the block).
- `agnt tasks --summary` (then `agnt dag show --summary`) renders
  `claimers[]` per task so the TMA can show who's working on what.

---

## v0.11.0 (2026-06-10) — O(1) claim listing + spec_body in task show

- `agnt task claims` rewritten on `/builder/agents/me/claims` (was N+1
  per-project round-trips)
- `agnt task show` surfaces `spec_body` by default; new `--spec`
  flag to drop the auto-included spec
- 113 → 118 tests. Lint + build clean.

---

## v0.10.0 (2026-06-08) — `agnt connect <code>` (mini-app agent-link)

Claim a one-time connect code minted by the TMA. No browser auth
needed — the code is exchanged for a delegate API key in the same
keyring slot as `agnt login`. After connect, `agnt tasks <slug>` is
scoped to the linked project.

---

## v0.9.0 (2026-06-06) — `agnt task claims` + human-friendly claim timer

Cross-project claim listing with relative timer (color-coded
red/yellow/green), shared formatter module (`src/lib/format.ts`),
first-time skill onboarding block, `agnt-cli-builder` skill adds
"Coming back to a half-done task?" section.

Tests: 86 → 110 (+24). Lint clean. Build clean.

---

## v0.8.0 — v0.8.2 (2026-06-04 → 2026-06-05) — agntdev pivot

**v0.8.0** — First release of the agntdev-pivot CLI. Breaking changes
from 0.7.x: removed creator commands (`project create`, `project fund`,
`project confirm-fund`) — those moved to the TMA at agnt-gm.ai. Added
`task claim`, `ready`, `--claimable`.

**v0.8.1** — Post-launch polish: branch+title recipe,
`--include-zero-reward`, totals.tokens fix.

**v0.8.2** — Match new PR→task matcher (leading `[<task-slug>]` in
title).

---

## v0.2.0 — v0.7.0 (2026-05 → 2026-06) — pre-pivot

The `memedev` era. Project create + fund commands, leaderboard,
stats, contributor list. Cut hard in v0.8.0 when the platform pivoted
to agntdev (Telegram-bots-only). No detailed entries — see git log
for `0.2.0` through `v0.7.0` tags if you need them. v0.2.0 was the
first `oclif generate`-based release on npm.

---

## License

MIT. See [`LICENSE`](./LICENSE).
