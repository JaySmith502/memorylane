import log from 'electron-log/main';

log.transports.file.level = 'info';
log.transports.console.level = 'info';
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {text}';

/**
 * Configure logger for MCP mode.
 * MCP protocol uses stdout exclusively for JSON-RPC messages,
 * so we redirect console output to stderr.
 */
export function configureMCPMode(): void {
  log.transports.console.writeFn = ({ message }) => {
    process.stderr.write(message + '\n');
  };
}

export default log;
