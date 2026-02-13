interface Logger {
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}

let log: Logger

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const electronLog = require('electron-log/main')
  electronLog.transports.file.level = 'info'
  electronLog.transports.console.level = 'info'
  electronLog.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {text}'
  log = electronLog
} catch {
  // Fallback for ELECTRON_RUN_AS_NODE mode where electron-log can't load.
  // All output goes to stderr (stdout is reserved for MCP protocol).
  const write = (...args: unknown[]): void => {
    process.stderr.write(args.map(String).join(' ') + '\n')
  }
  log = { info: write, warn: write, error: write }
}

export default log
