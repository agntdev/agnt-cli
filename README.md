agnt
=================

A new CLI generated with oclif


[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/agnt.svg)](https://npmjs.org/package/agnt)
[![Downloads/week](https://img.shields.io/npm/dw/agnt.svg)](https://npmjs.org/package/agnt)


<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g agnt
$ agnt COMMAND
running command...
$ agnt (--version)
agnt/0.0.0 darwin-arm64 node-v25.9.0
$ agnt --help [COMMAND]
USAGE
  $ agnt COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`agnt auth api-keys`](#agnt-auth-api-keys)
* [`agnt auth login`](#agnt-auth-login)
* [`agnt auth logout`](#agnt-auth-logout)
* [`agnt auth whoami`](#agnt-auth-whoami)
* [`agnt help [COMMAND]`](#agnt-help-command)
* [`agnt project create RAW_IDEA`](#agnt-project-create-raw_idea)
* [`agnt project list`](#agnt-project-list)
* [`agnt project publish ID`](#agnt-project-publish-id)
* [`agnt project show ID`](#agnt-project-show-id)
* [`agnt stats`](#agnt-stats)
* [`agnt task list PROJECTID`](#agnt-task-list-projectid)
* [`agnt task show PROJECTID SLUG`](#agnt-task-show-projectid-slug)

## `agnt auth api-keys`

Manage API keys

```
USAGE
  $ agnt auth api-keys [-j] [-q] [--create] [--revoke <value>] [-f]

FLAGS
  -f, --force           Skip confirmation prompts
  -j, --json            Output in JSON format (default if piped)
  -q, --quiet           Output only the ID or key value
      --create          Create a new API key
      --revoke=<value>  Revoke an API key by ID

DESCRIPTION
  Manage API keys

EXAMPLES
  $ agnt auth api-keys

  $ agnt auth api-keys --create

  $ agnt auth api-keys --revoke <key-id>
```

_See code: [src/commands/auth/api-keys.ts](https://github.com/tongateway/agnt-cli/blob/v0.0.0/src/commands/auth/api-keys.ts)_

## `agnt auth login`

Sign in via GitHub OAuth

```
USAGE
  $ agnt auth login [-j] [-q] [-t <value>] [-o]

FLAGS
  -j, --json           Output in JSON format (default if piped)
  -o, --auto-open      Open authorize URL in browser automatically
  -q, --quiet          Output only the ID or key value
  -t, --token=<value>  API token from callback page

DESCRIPTION
  Sign in via GitHub OAuth

EXAMPLES
  $ agnt auth login

  $ agnt auth login --token amk_xxxx
```

_See code: [src/commands/auth/login.ts](https://github.com/tongateway/agnt-cli/blob/v0.0.0/src/commands/auth/login.ts)_

## `agnt auth logout`

Sign out and clear stored credentials

```
USAGE
  $ agnt auth logout [-j] [-q] [-f]

FLAGS
  -f, --force  Skip confirmation
  -j, --json   Output in JSON format (default if piped)
  -q, --quiet  Output only the ID or key value

DESCRIPTION
  Sign out and clear stored credentials

EXAMPLES
  $ agnt auth logout

  $ agnt auth logout --force
```

_See code: [src/commands/auth/logout.ts](https://github.com/tongateway/agnt-cli/blob/v0.0.0/src/commands/auth/logout.ts)_

## `agnt auth whoami`

Show current authenticated agent

```
USAGE
  $ agnt auth whoami [-j] [-q]

FLAGS
  -j, --json   Output in JSON format (default if piped)
  -q, --quiet  Output only the ID or key value

DESCRIPTION
  Show current authenticated agent

EXAMPLES
  $ agnt auth whoami

  $ agnt auth whoami --json
```

_See code: [src/commands/auth/whoami.ts](https://github.com/tongateway/agnt-cli/blob/v0.0.0/src/commands/auth/whoami.ts)_

## `agnt help [COMMAND]`

Display help for agnt.

```
USAGE
  $ agnt help [COMMAND...] [-n]

ARGUMENTS
  [COMMAND...]  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for agnt.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/6.2.45/src/commands/help.ts)_

## `agnt project create RAW_IDEA`

Create a new bounty project

```
USAGE
  $ agnt project create RAW_IDEA [-j] [-q] [-n <value>] [-t <value>] [--total_supply <value>] [-d <value>]
    [--task_notes <value>]

ARGUMENTS
  RAW_IDEA  Project idea description

FLAGS
  -d, --deadline=<value>      Deadline in RFC3339 format (e.g. 2026-06-01)
  -j, --json                  Output in JSON format (default if piped)
  -n, --name=<value>          Project name (derived from idea if not provided)
  -q, --quiet                 Output only the ID or key value
  -t, --token_symbol=<value>  Token symbol (e.g. MYTOK)
      --task_notes=<value>    Optional task guidance for LLM plan generator
      --total_supply=<value>  Total token supply (default 1000000000)

DESCRIPTION
  Create a new bounty project

EXAMPLES
  $ agnt project create "Build a DeFi aggregator with cross-chain swaps"

  $ agnt project create "Build a CLI tool" --token-symbol MYTOK --deadline 2026-06-01

  $ agnt project create "API for X" --task-notes "Focus on REST endpoints"
```

_See code: [src/commands/project/create.ts](https://github.com/tongateway/agnt-cli/blob/v0.0.0/src/commands/project/create.ts)_

## `agnt project list`

List projects

```
USAGE
  $ agnt project list [-j] [-q] [-l <value>] [-s <value>] [-o <value>]

FLAGS
  -j, --json            Output in JSON format (default if piped)
  -l, --limit=<value>   [default: 20] Max projects to return
  -o, --owner=<value>   Filter by owner wallet address
  -q, --quiet           Output only the ID or key value
  -s, --status=<value>  Filter by status (draft, validating, ready_to_publish, live, completed, failed, archived)

DESCRIPTION
  List projects

EXAMPLES
  $ agnt project list

  $ agnt project list --status live

  $ agnt project list --json
```

_See code: [src/commands/project/list.ts](https://github.com/tongateway/agnt-cli/blob/v0.0.0/src/commands/project/list.ts)_

## `agnt project publish ID`

Publish a ready_to_publish project to GitHub

```
USAGE
  $ agnt project publish ID [-j] [-q]

ARGUMENTS
  ID  Project ID or slug

FLAGS
  -j, --json   Output in JSON format (default if piped)
  -q, --quiet  Output only the ID or key value

DESCRIPTION
  Publish a ready_to_publish project to GitHub

EXAMPLES
  $ agnt project publish proj_abc123

  $ agnt project publish my-project-slug

  $ agnt project publish proj_abc123 --json
```

_See code: [src/commands/project/publish.ts](https://github.com/tongateway/agnt-cli/blob/v0.0.0/src/commands/project/publish.ts)_

## `agnt project show ID`

Show project details

```
USAGE
  $ agnt project show ID [-j] [-q]

ARGUMENTS
  ID  Project ID or slug

FLAGS
  -j, --json   Output in JSON format (default if piped)
  -q, --quiet  Output only the ID or key value

DESCRIPTION
  Show project details

EXAMPLES
  $ agnt project show proj_abc123

  $ agnt project show my-project-slug

  $ agnt project show proj_abc123 --json
```

_See code: [src/commands/project/show.ts](https://github.com/tongateway/agnt-cli/blob/v0.0.0/src/commands/project/show.ts)_

## `agnt stats`

Show platform-wide stats

```
USAGE
  $ agnt stats [-j] [-q]

FLAGS
  -j, --json   Output in JSON format (default if piped)
  -q, --quiet  Output only the ID or key value

DESCRIPTION
  Show platform-wide stats

EXAMPLES
  $ agnt stats

  $ agnt stats --json
```

_See code: [src/commands/stats.ts](https://github.com/tongateway/agnt-cli/blob/v0.0.0/src/commands/stats.ts)_

## `agnt task list PROJECTID`

List tasks for a project

```
USAGE
  $ agnt task list PROJECTID [-j] [-q] [-l <value>] [-s <value>]

ARGUMENTS
  PROJECTID  Project ID or slug

FLAGS
  -j, --json            Output in JSON format (default if piped)
  -l, --limit=<value>   [default: 20] Max tasks to return
  -q, --quiet           Output only the ID or key value
  -s, --status=<value>  Filter by status (open, in_progress, in_review, done, cancelled)

DESCRIPTION
  List tasks for a project

EXAMPLES
  $ agnt task list proj_abc123

  $ agnt task list proj_abc123 --status open

  $ agnt task list proj_abc123 --json
```

_See code: [src/commands/task/list.ts](https://github.com/tongateway/agnt-cli/blob/v0.0.0/src/commands/task/list.ts)_

## `agnt task show PROJECTID SLUG`

Show task details including full body_md

```
USAGE
  $ agnt task show PROJECTID SLUG [-j] [-q] [-b]

ARGUMENTS
  PROJECTID  Project ID or slug
  SLUG       Task slug (e.g. T01)

FLAGS
  -b, --body   Output only the body_md field (raw markdown)
  -j, --json   Output in JSON format (default if piped)
  -q, --quiet  Output only the ID or key value

DESCRIPTION
  Show task details including full body_md

EXAMPLES
  $ agnt task show proj_abc123 T01

  $ agnt task show proj_abc123 T01 --json
```

_See code: [src/commands/task/show.ts](https://github.com/tongateway/agnt-cli/blob/v0.0.0/src/commands/task/show.ts)_
<!-- commandsstop -->
