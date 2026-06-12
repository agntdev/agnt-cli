import {Args, Command, Flags} from '@oclif/core'
import {execFileSync} from 'node:child_process'
import {readFileSync} from 'node:fs'
import chalk from 'chalk'

import {isLoggedIn} from '../lib/auth.js'
import {client, authHeaders} from '../lib/client.js'
import {logAuthError, outputJSON} from '../lib/output.js'
import {outputFlags} from '../lib/flags.js'

// Matches the server-side cap in builder_preview_review.go.
const MAX_DIFF_BYTES = 256 * 1024

// Suggested bases to try, in order. We pick the first that has commits not on
// HEAD so `git diff <base>...HEAD` is meaningful. "origin/<default-branch>" is
// the common case for builders who forked; "main" / "master" are the
// single-repo fallbacks.
const DEFAULT_BASE_CANDIDATES = [
  'origin/main',
  'origin/master',
  'main',
  'master',
  'HEAD~1',
]

type PreviewVerdict = 'approve' | 'reject' | 'manual_review'

interface PreviewResponse {
  verdict: PreviewVerdict
  reasons?: string[]
  suggestions?: string[]
  engine?: string
  disclaimer?: string
}

export default class Test extends Command {
  static description =
    'Dry-run review your unpushed diff against a task spec before opening a PR (preview-review)'

  static examples = [
    '<%= config.bin %> test townbuilder-rpg-bot T911',
    '<%= config.bin %> test my-project T01 --base origin/main',
    '<%= config.bin %> test my-project fix-1bae2 --diff ./changes.patch --json',
    'git diff origin/main...HEAD | agnt test my-project T01 --diff -',
  ]

  static flags = {
    ...outputFlags,
    base: Flags.string({
      description:
        'Git ref to diff against (default: auto-detect origin/main, origin/master, main, master, HEAD~1). Ignored when --diff is set.',
    }),
    diff: Flags.string({
      description:
        'Path to a diff file to review (use "-" for stdin). Defaults to `git diff <base>...HEAD`.',
    }),
    'no-color': Flags.boolean({
      default: false,
      description: 'Disable color in verdict rendering',
    }),
  }

  static args = {
    projectId: Args.string({
      description: 'Project ID or slug',
      required: true,
    }),
    slug: Args.string({
      description: 'Task slug (e.g. T01, fix-1bae2)',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Test)

    if (!isLoggedIn()) {
      logAuthError(this)
      return
    }

    const diffPatch = await loadDiff(flags.diff, flags.base)
    if (!diffPatch.trim()) {
      this.error(
        'Empty diff — nothing to review. Pass --diff <file>, pipe via --diff -, or run inside a git repo with unpushed changes.',
        {exit: 2},
      )
    }
    if (Buffer.byteLength(diffPatch, 'utf8') > MAX_DIFF_BYTES) {
      this.error(
        `Diff is ${formatBytes(Buffer.byteLength(diffPatch, 'utf8'))}, max is ${formatBytes(MAX_DIFF_BYTES)}. Split the change or pre-check the core files only.`,
        {exit: 2},
      )
    }

    // The /preview-review endpoint is not yet in the generated OpenAPI types;
    // cast to a loose shape matching builder_preview_review.go's response.
    const {data, error} = await client.POST(
      '/builder/projects/{id}/tasks/{slug}/preview-review' as never,
      {
        headers: authHeaders(),
        params: {path: {id: args.projectId, slug: args.slug}},
        body: {diff_patch: diffPatch} as never,
      } as never,
    )

    if (error) {
      const errObj = error as unknown as {error?: string}
      const msg = errObj.error ?? 'Unknown'
      if (msg.toLowerCase().includes('not found')) {
        this.error(
          `Project or task not found: ${args.projectId}/${args.slug}`,
          {exit: 4},
        )
        return
      }
      if (msg.toLowerCase().includes('llm not configured')) {
        this.error(
          `Preview review unavailable on the server: ${msg}. Ask ops to enable the LLM.`,
          {exit: 5},
        )
        return
      }
      this.error(`Preview review failed: ${msg}`, {exit: 1})
      return
    }

    const result = data as PreviewResponse | undefined
    if (!result || !result.verdict) {
      this.error('Preview review returned an empty response.', {exit: 1})
      return
    }

    if (flags.json || flags.quiet) {
      outputJSON(result, flags.json, flags.quiet)
    } else {
      renderVerdict(result, flags['no-color'] === true, diffPatch)
    }

    // Exit codes: 0 = approve / manual_review (advisory pass), 1 = reject.
    // Builders can use this in a pre-push hook: `agnt test ... || exit 1`.
    if (result.verdict === 'reject') {
      this.exit(1)
    }
  }
}

// =============================================================================
// Diff loading
// =============================================================================

// Load the diff to review. Precedence:
//   1. --diff <file>  (use "-" for stdin)
//   2. git diff <base>...HEAD  (base from --base or auto-detect)
async function loadDiff(
  diffPath: string | undefined,
  baseRef: string | undefined,
): Promise<string> {
  if (diffPath !== undefined) {
    if (diffPath === '-') {
      return readStdin()
    }
    try {
      return readFileSync(diffPath, 'utf8')
    } catch (err) {
      throw new Error(`Could not read diff file ${diffPath}: ${(err as Error).message}`)
    }
  }

  const base = baseRef ?? (await pickGitBase())
  try {
    return execFileSync('git', ['diff', `${base}...HEAD`], {
      encoding: 'utf8',
      maxBuffer: MAX_DIFF_BYTES * 2,
    })
  } catch (err) {
    const msg = (err as Error).message
    if (/not a git repository/i.test(msg)) {
      throw new Error(
        'Not a git repository and no --diff given. Pass --diff <file> or run from inside the project repo.',
      )
    }
    throw new Error(`git diff ${base}...HEAD failed: ${msg}`)
  }
}

function readStdin(): string {
  // In tests oclif captures stdin; in normal use the user pipes the diff.
  // We read whatever is on stdin synchronously up to MAX_DIFF_BYTES*2.
  try {
    return require('node:fs').readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

// Auto-detect a sensible base ref: the first of origin/main, origin/master,
// main, master, HEAD~1 that exists. This is the common case for builders
// who forked the project repo and want to review the diff vs the upstream
// default branch.
async function pickGitBase(): Promise<string> {
  for (const candidate of DEFAULT_BASE_CANDIDATES) {
    if (gitRefExists(candidate)) return candidate
  }
  // No candidate exists — fall back to HEAD~1 (diff of last commit only).
  // Worst case the diff is empty and loadDiff surfaces that to the user.
  return 'HEAD~1'
}

function gitRefExists(ref: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', ref], {
      stdio: 'ignore',
    })
    return true
  } catch {
    return false
  }
}

// =============================================================================
// Rendering
// =============================================================================

function renderVerdict(
  result: PreviewResponse,
  noColor: boolean,
  diffPatch: string,
): void {
  const verdict = result.verdict
  // chalk auto-disables color when stdout is not a TTY; --no-color is the
  // user override. chalk.level = 0 forces plain output either way.
  if (noColor) chalk.level = 0
  const lines: string[] = []

  const header =
    verdict === 'approve'
      ? chalk.green.bold('✓ APPROVE')
      : verdict === 'reject'
        ? chalk.red.bold('✗ REJECT')
        : chalk.yellow.bold('~ MANUAL_REVIEW')

  lines.push('')
  lines.push(`  ${header}  (engine: ${result.engine ?? 'llm-preview'})`)
  lines.push('')

  if (result.reasons && result.reasons.length > 0) {
    lines.push(chalk.bold('  Reasons:'))
    for (const r of result.reasons) {
      lines.push(`    • ${r}`)
    }
    lines.push('')
  }

  if (result.suggestions && result.suggestions.length > 0) {
    lines.push(chalk.bold('  Suggestions:'))
    for (const s of result.suggestions) {
      lines.push(`    • ${s}`)
    }
    lines.push('')
  }

  if (result.disclaimer) {
    lines.push(chalk.dim(`  ℹ ${result.disclaimer}`))
    lines.push('')
  }

  // Action prompt by verdict.
  if (verdict === 'approve') {
    lines.push(chalk.green('  → Safe to push. Open the PR when ready.'))
  } else if (verdict === 'reject') {
    lines.push(chalk.red('  → Fix the reasons above, then re-run `agnt test`.'))
  } else {
    lines.push(
      chalk.yellow(
        '  → Advisory only. A human or the post-push reviewer will make the call.',
      ),
    )
  }
  lines.push(
    chalk.dim(
      `  Reviewed ${formatBytes(Buffer.byteLength(diffPatch, 'utf8'))} of diff.`,
    ),
  )
  lines.push('')

  process.stdout.write(lines.join('\n'))
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`
  return `${(n / 1024 / 1024).toFixed(1)} MiB`
}
