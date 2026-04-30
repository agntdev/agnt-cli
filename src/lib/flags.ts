import {Flags} from '@oclif/core'

export const outputFlags = {
  json: Flags.boolean({
    char: 'j',
    default: false,
    description: 'Output in JSON format (default if piped)',
  }),
  quiet: Flags.boolean({
    char: 'q',
    default: false,
    description: 'Output only the ID or key value',
  }),
}

export const forceFlags = {
  force: Flags.boolean({
    char: 'f',
    default: false,
    description: 'Skip confirmation prompts',
  }),
}

export const dryRunFlag = {
  'dry-run': Flags.boolean({
    default: false,
    description: 'Show what would happen without making changes',
  }),
}