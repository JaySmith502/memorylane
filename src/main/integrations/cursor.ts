/**
 * Cursor IDE MCP integration
 *
 * Reads and updates Cursor's MCP config to register MemoryLane
 * as an MCP server, so users can enable the integration with one click.
 */

import { app, dialog } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import log from '../logger'

interface CursorMCPConfig {
  mcpServers?: Record<string, MCPServerEntry>
  [key: string]: unknown
}

interface MCPServerEntry {
  command: string
  args?: string[]
  env?: Record<string, string>
  [key: string]: unknown
}

const MCP_SERVER_KEY = 'memorylane'

/**
 * Returns the path to Cursor's global MCP config file (~/.cursor/mcp.json).
 */
function getCursorConfigPath(): string {
  return path.join(os.homedir(), '.cursor', 'mcp.json')
}

/**
 * Read and parse the Cursor MCP config.
 * Returns an empty config object if the file doesn't exist or is invalid.
 */
function readCursorConfig(configPath: string): CursorMCPConfig {
  try {
    const raw = fs.readFileSync(configPath, 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as CursorMCPConfig
    }
    return {}
  } catch {
    return {}
  }
}

/**
 * Write the config back to disk, creating the parent directory if needed.
 */
function writeCursorConfig(configPath: string, config: CursorMCPConfig): void {
  const dir = path.dirname(configPath)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8')
}

/**
 * Check whether MemoryLane is already registered in the Cursor MCP config.
 */
function isRegistered(config: CursorMCPConfig): boolean {
  return config.mcpServers !== undefined && MCP_SERVER_KEY in config.mcpServers
}

/**
 * Build the MCP server entry pointing to the current app executable.
 */
function buildMCPEntry(): MCPServerEntry {
  return {
    command: app.getPath('exe'),
    args: ['--mcp'],
    env: {
      ELECTRON_RUN_AS_NODE: '',
    },
  }
}

/**
 * Register MemoryLane as an MCP server in Cursor's global MCP config.
 *
 * Shows a dialog with the result:
 * - Already registered: informational message
 * - Success: confirmation message
 * - Error: error details
 */
export async function registerWithCursor(): Promise<void> {
  const configPath = getCursorConfigPath()
  log.info(`[Cursor Integration] Config path: ${configPath}`)

  try {
    const config = readCursorConfig(configPath)

    if (isRegistered(config)) {
      log.info('[Cursor Integration] Already registered')
      await dialog.showMessageBox({
        type: 'info',
        title: 'Already Configured',
        message: 'MemoryLane is already registered in Cursor',
        detail:
          'The MCP server entry is already present in your Cursor configuration. ' +
          'Restart Cursor if it is not showing up.',
      })
      return
    }

    if (config.mcpServers === undefined) {
      config.mcpServers = {}
    }
    config.mcpServers[MCP_SERVER_KEY] = buildMCPEntry()

    writeCursorConfig(configPath, config)

    log.info('[Cursor Integration] Registered successfully')
    await dialog.showMessageBox({
      type: 'info',
      title: 'Added to Cursor',
      message: 'MemoryLane has been added to Cursor',
      detail:
        'The MCP server was registered successfully. ' +
        'Please restart Cursor for the changes to take effect.',
    })
  } catch (error) {
    log.error('[Cursor Integration] Registration failed:', error)
    await dialog.showMessageBox({
      type: 'error',
      title: 'Registration Failed',
      message: 'Could not add MemoryLane to Cursor',
      detail:
        `An error occurred while updating the Cursor MCP configuration.\n\n` +
        `Config path: ${configPath}\n` +
        `Error: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}
