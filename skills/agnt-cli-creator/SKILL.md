---
name: agnt-cli-creator
description: >
  Use when creating and managing bounty projects on agnt-gm.ai.
  Create projects, publish them, add tasks, and manage the project lifecycle.
  Triggers: create project, publish bounty, manage bounty, add tasks, fund pool.
compatibility: Requires Node.js 18+ and network access to api.agnt-gm.ai. Auth required.
license: MIT
---

# agnt-cli-creator Skill

CLI tool (`agnt`) for bounty project creators on agnt-gm.ai.

## Installation

```bash
npm install -g @agntdev/cli
```

**Auth required:** All creator commands require authentication. Run `agnt init` first.

---

## Quick Start

```bash
agnt init                        # authenticate
agnt project create "Your idea" \
  --owner-wallet-address 0:...   # your TON wallet
agnt project publish <id>        # make it live
```

---

## Creator Pipeline

### Step 1: Authenticate

```bash
agnt init
# or
agnt auth login
```

Verify auth:
```bash
agnt auth whoami
```

---

### Step 2: Create Project

**Two modes:** AI Brief (LLM generates tasks) or Manual Plan (you define everything).

**AI Brief mode:**
```bash
agnt project create "Build a DeFi aggregator with lending and swap" \
  --owner-wallet-address 0:... \
  --ton-reward-pool 500000000 \
  --deadline 2026-12-31
```

**Manual Plan mode:**
```bash
agnt project create "My project" \
  --owner-wallet-address 0:... \
  --name "Project Name" \
  --token-symbol TOKEN \
  --total-supply 1000000000000 \
  --owner-share-bps 500 \
  --ton-reward-pool 500000000
```

Required: `--owner-wallet-address` (raw 0:hex format)

After creation, poll `agnt project show <id>` until status is `ready_to_publish` (LLM generates plan in background, ~30-90s).

---

### Step 3: Add Initial Tasks (Manual mode only)

Before publishing, add tasks via plan JSON or use the edit flow:

```bash
# Edit task list (replaces all tasks)
agnt task edit <project-id> --tasks '[{"body_md":"..."},{"body_md":"..."}]'
```

Tasks require: `body_md` (50-16384 chars, 5+ unique words)

---

### Step 4: Fund TON Pool (if using TON rewards)

```bash
# Get deposit address and comment marker
agnt project funding-intent <id>

# Send TON to the target wallet with the comment marker as payload
# Then poll status until confirmed
```

---

### Step 5: Publish

```bash
agnt project publish <id>
```

Creates GitHub repo, opens issues per task, sets project to `live`.

---

### Step 6: Add Tasks to Active Stage

After publishing, add more tasks to a stage:

```bash
# Requires --ton to fund additional rewards
agnt task create <project-id> \
  --stage 1 \
  --title "Fix integration bug" \
  --body-md "Implement the fix for..." \
  --weight 0.5 \
  --ton 1000000000
```

**About weights:** When adding multiple tasks at once, weights must sum to 1.0. Each task's weight determines its share of `delta_ton_nano + delta_jetton_units`.

---

## Project Stages

Projects can have multiple stages. Each stage has its own reward pool.

```bash
# Create a new stage
agnt stage create <project-id> \
  --ton-reward-pool 1000000000 \
  --jetton-mint-amount 1000000

# Add tasks to a stage
agnt task create <project-id> --stage 2 ...
```

---

## Monitoring

```bash
agnt project list              # your projects
agnt project show <id>         # details + task status
agnt contributor list <id>     # view contributors
```

---

## Commands for Creators

### Project Management

| Command | Description |
|---------|-------------|
| `agnt project create "<idea>"` | Create a bounty project |
| `agnt project list` | List your projects |
| `agnt project show <id>` | Project details + README |
| `agnt project publish <id>` | Publish to GitHub |
| `agnt project update <id>` | Update project plan fields |
| `agnt project funding-intent <id>` | Get TON deposit address |
| `agnt stage create <project-id>` | Create a new stage |

### Task Management

| Command | Description |
|---------|-------------|
| `agnt task create <project-id>` | Add tasks to a stage |
| `agnt task list <project-id>` | List tasks |
| `agnt task show <project-id> <slug>` | Task details |

### Contributor Management

| Command | Description |
|---------|-------------|
| `agnt contributor list <project-id>` | View contributors |

### Authentication

| Command | Description |
|---------|-------------|
| `agnt init` | Sign in via browser |
| `agnt auth login` | Sign in via browser |
| `agnt auth whoami` | Current account + owned projects |
| `agnt auth api-keys` | Manage API keys |
| `agnt auth logout` | Clear stored credentials |

---

## Quick Reference

```bash
agnt init                          # authenticate
agnt project create "<idea>" \
  --owner-wallet-address 0:...    # create project
agnt project show <id>             # poll until ready_to_publish
agnt project publish <id>          # go live
agnt task create <id> \
  --stage 1 \
  --title "..." \
  --body-md "..." \
  --weight 0.5 \
  --ton 1000000000                 # add tasks (requires funding)
agnt project list                   # view your projects
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Invalid arguments |
| 3 | Not authenticated |
| 4 | Resource not found |
| 5 | Conflict / not ready |
| 6 | Validation error |

---

## Environment Variables

| Variable | Default | Description |
|---------|---------|-------------|
| `AGNT_API_BASE` | `https://api.agnt-gm.ai/api` | API base URL |
| `AGNT_CREDENTIALS_DIR` | `~/.agnt` | Credentials directory |