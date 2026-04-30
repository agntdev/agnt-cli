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
* [`agnt bounty claim ID`](#agnt-bounty-claim-id)
* [`agnt bounty list`](#agnt-bounty-list)
* [`agnt bounty show ID`](#agnt-bounty-show-id)
* [`agnt help [COMMAND]`](#agnt-help-command)
* [`agnt login`](#agnt-login)
* [`agnt plugins`](#agnt-plugins)
* [`agnt plugins add PLUGIN`](#agnt-plugins-add-plugin)
* [`agnt plugins:inspect PLUGIN...`](#agnt-pluginsinspect-plugin)
* [`agnt plugins install PLUGIN`](#agnt-plugins-install-plugin)
* [`agnt plugins link PATH`](#agnt-plugins-link-path)
* [`agnt plugins remove [PLUGIN]`](#agnt-plugins-remove-plugin)
* [`agnt plugins reset`](#agnt-plugins-reset)
* [`agnt plugins uninstall [PLUGIN]`](#agnt-plugins-uninstall-plugin)
* [`agnt plugins unlink [PLUGIN]`](#agnt-plugins-unlink-plugin)
* [`agnt plugins update`](#agnt-plugins-update)
* [`agnt project list`](#agnt-project-list)
* [`agnt project show ID`](#agnt-project-show-id)

## `agnt bounty claim ID`

Claim a bounty to work on it

```
USAGE
  $ agnt bounty claim ID [-j] [-q] [-f] [--dry-run]

ARGUMENTS
  ID  Bounty ID

FLAGS
  -f, --force    Skip confirmation prompts
  -j, --json     Output in JSON format (default if piped)
  -q, --quiet    Output only the ID or key value
      --dry-run  Show what would happen without claiming

DESCRIPTION
  Claim a bounty to work on it

EXAMPLES
  $ agnt bounty claim bounty_xyz789

  $ agnt bounty claim bounty_xyz789 --dry-run
```

_See code: [src/commands/bounty/claim.ts](https://github.com/tongateway/agnt-cli/blob/v0.0.0/src/commands/bounty/claim.ts)_

## `agnt bounty list`

List available bounties

```
USAGE
  $ agnt bounty list [-j] [-q] [-l <value>] [-p <value>] [-s <value>]

FLAGS
  -j, --json             Output in JSON format (default if piped)
  -l, --limit=<value>    [default: 20] Max bounties to return
  -p, --project=<value>  Filter by project ID
  -q, --quiet            Output only the ID or key value
  -s, --status=<value>   [default: open] Filter by status (open, claimed, closed)

DESCRIPTION
  List available bounties

EXAMPLES
  $ agnt bounty list

  $ agnt bounty list --project proj_abc123

  $ agnt bounty list --status open
```

_See code: [src/commands/bounty/list.ts](https://github.com/tongateway/agnt-cli/blob/v0.0.0/src/commands/bounty/list.ts)_

## `agnt bounty show ID`

Show bounty details

```
USAGE
  $ agnt bounty show ID [-j] [-q]

ARGUMENTS
  ID  Bounty ID

FLAGS
  -j, --json   Output in JSON format (default if piped)
  -q, --quiet  Output only the ID or key value

DESCRIPTION
  Show bounty details

EXAMPLES
  $ agnt bounty show bounty_xyz789
```

_See code: [src/commands/bounty/show.ts](https://github.com/tongateway/agnt-cli/blob/v0.0.0/src/commands/bounty/show.ts)_

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

## `agnt login`

Authenticate with agentmeme via GitHub OAuth

```
USAGE
  $ agnt login [-j] [-q] [-y]

FLAGS
  -j, --json   Output in JSON format (default if piped)
  -q, --quiet  Output only the ID or key value
  -y, --yes    Skip confirmation if already authenticated

DESCRIPTION
  Authenticate with agentmeme via GitHub OAuth

EXAMPLES
  $ agnt login
```

_See code: [src/commands/login/index.ts](https://github.com/tongateway/agnt-cli/blob/v0.0.0/src/commands/login/index.ts)_

## `agnt plugins`

List installed plugins.

```
USAGE
  $ agnt plugins [--json] [--core]

FLAGS
  --core  Show core plugins.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List installed plugins.

EXAMPLES
  $ agnt plugins
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.4.62/src/commands/plugins/index.ts)_

## `agnt plugins add PLUGIN`

Installs a plugin into agnt.

```
USAGE
  $ agnt plugins add PLUGIN... [--json] [-f] [-h] [-s | -v]

ARGUMENTS
  PLUGIN...  Plugin to install.

FLAGS
  -f, --force    Force npm to fetch remote resources even if a local copy exists on disk.
  -h, --help     Show CLI help.
  -s, --silent   Silences npm output.
  -v, --verbose  Show verbose npm output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into agnt.

  Uses npm to install plugins.

  Installation of a user-installed plugin will override a core plugin.

  Use the AGNT_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the AGNT_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ agnt plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ agnt plugins add myplugin

  Install a plugin from a github url.

    $ agnt plugins add https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ agnt plugins add someuser/someplugin
```

## `agnt plugins:inspect PLUGIN...`

Displays installation properties of a plugin.

```
USAGE
  $ agnt plugins inspect PLUGIN...

ARGUMENTS
  PLUGIN...  [default: .] Plugin to inspect.

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Displays installation properties of a plugin.

EXAMPLES
  $ agnt plugins inspect myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.4.62/src/commands/plugins/inspect.ts)_

## `agnt plugins install PLUGIN`

Installs a plugin into agnt.

```
USAGE
  $ agnt plugins install PLUGIN... [--json] [-f] [-h] [-s | -v]

ARGUMENTS
  PLUGIN...  Plugin to install.

FLAGS
  -f, --force    Force npm to fetch remote resources even if a local copy exists on disk.
  -h, --help     Show CLI help.
  -s, --silent   Silences npm output.
  -v, --verbose  Show verbose npm output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into agnt.

  Uses npm to install plugins.

  Installation of a user-installed plugin will override a core plugin.

  Use the AGNT_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the AGNT_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ agnt plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ agnt plugins install myplugin

  Install a plugin from a github url.

    $ agnt plugins install https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ agnt plugins install someuser/someplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.4.62/src/commands/plugins/install.ts)_

## `agnt plugins link PATH`

Links a plugin into the CLI for development.

```
USAGE
  $ agnt plugins link PATH [-h] [--install] [-v]

ARGUMENTS
  PATH  [default: .] path to plugin

FLAGS
  -h, --help          Show CLI help.
  -v, --verbose
      --[no-]install  Install dependencies after linking the plugin.

DESCRIPTION
  Links a plugin into the CLI for development.

  Installation of a linked plugin will override a user-installed or core plugin.

  e.g. If you have a user-installed or core plugin that has a 'hello' command, installing a linked plugin with a 'hello'
  command will override the user-installed or core plugin implementation. This is useful for development work.


EXAMPLES
  $ agnt plugins link myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.4.62/src/commands/plugins/link.ts)_

## `agnt plugins remove [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ agnt plugins remove [PLUGIN...] [-h] [-v]

ARGUMENTS
  [PLUGIN...]  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ agnt plugins unlink
  $ agnt plugins remove

EXAMPLES
  $ agnt plugins remove myplugin
```

## `agnt plugins reset`

Remove all user-installed and linked plugins.

```
USAGE
  $ agnt plugins reset [--hard] [--reinstall]

FLAGS
  --hard       Delete node_modules and package manager related files in addition to uninstalling plugins.
  --reinstall  Reinstall all plugins after uninstalling.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.4.62/src/commands/plugins/reset.ts)_

## `agnt plugins uninstall [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ agnt plugins uninstall [PLUGIN...] [-h] [-v]

ARGUMENTS
  [PLUGIN...]  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ agnt plugins unlink
  $ agnt plugins remove

EXAMPLES
  $ agnt plugins uninstall myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.4.62/src/commands/plugins/uninstall.ts)_

## `agnt plugins unlink [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ agnt plugins unlink [PLUGIN...] [-h] [-v]

ARGUMENTS
  [PLUGIN...]  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ agnt plugins unlink
  $ agnt plugins remove

EXAMPLES
  $ agnt plugins unlink myplugin
```

## `agnt plugins update`

Update installed plugins.

```
USAGE
  $ agnt plugins update [-h] [-v]

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Update installed plugins.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/5.4.62/src/commands/plugins/update.ts)_

## `agnt project list`

List projects with open bounties

```
USAGE
  $ agnt project list [-j] [-q] [-l <value>]

FLAGS
  -j, --json           Output in JSON format (default if piped)
  -l, --limit=<value>  [default: 20] Max projects to return
  -q, --quiet          Output only the ID or key value

DESCRIPTION
  List projects with open bounties

EXAMPLES
  $ agnt project list

  $ agnt project list --json
```

_See code: [src/commands/project/list.ts](https://github.com/tongateway/agnt-cli/blob/v0.0.0/src/commands/project/list.ts)_

## `agnt project show ID`

Show project details

```
USAGE
  $ agnt project show ID [-j] [-q]

ARGUMENTS
  ID  Project ID

FLAGS
  -j, --json   Output in JSON format (default if piped)
  -q, --quiet  Output only the ID or key value

DESCRIPTION
  Show project details

EXAMPLES
  $ agnt project show proj_abc123

  $ agnt project show proj_abc123 --quiet
```

_See code: [src/commands/project/show.ts](https://github.com/tongateway/agnt-cli/blob/v0.0.0/src/commands/project/show.ts)_
<!-- commandsstop -->
