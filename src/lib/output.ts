import {Command} from '@oclif/core'

export function outputJSON(data: unknown, isJson: boolean, isQuiet: boolean): void {
  if (isQuiet) {
    if (typeof data === 'object' && data !== null && 'id' in data) {
      process.stdout.write((data as {id: string}).id + '\n')
    } else {
      process.stdout.write(String(data) + '\n')
    }
    return
  }

  process.stdout.write(JSON.stringify(data, null, 2) + '\n')
}

export function logError(ctx: Command, msg: string): void {
  ctx.error(msg, {exit: 1})
}

export function logAuthError(ctx: Command): void {
  ctx.error('Not authenticated. Run "agnt login" first.', {exit: 3})
}