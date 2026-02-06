/**
 * Claude Desktop MCP integration
 *
 * Reads and updates Claude Desktop's config to register MemoryLane
 * as an MCP server, so users can enable the integration with one click.
 */

import { app, dialog } from 'electron'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import log from '../logger'

interface ClaudeDesktopConfig {
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
 * Returns the platform-specific path to Claude Desktop's config file.
 */
function getClaudeConfigPath(): string {
  switch (process.platform) {
    case 'darwin':
      return path.join(
        os.homedir(),
        'Library',
        'Application Support',
        'Claude',
        'claude_desktop_config.json',
      )
    case 'win32':
      return path.join(
        process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
        'Claude',
        'claude_desktop_config.json',
      )
    default:
      return path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json')
  }
}

/**
 * Read and parse the Claude Desktop config.
 * Returns an empty config object if the file doesn't exist or is invalid.
 */
function readClaudeConfig(configPath: string): ClaudeDesktopConfig {
  try {
    const raw = fs.readFileSync(configPath, 'utf-8')
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as ClaudeDesktopConfig
    }
    return {}
  } catch {
    return {}
  }
}

/**
 * Write the config back to disk, creating the parent directory if needed.
 */
function writeClaudeConfig(configPath: string, config: ClaudeDesktopConfig): void {
  const dir = path.dirname(configPath)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8')
}

/**
 * Check whether MemoryLane is already registered in the Claude Desktop config.
 */
function isRegistered(config: ClaudeDesktopConfig): boolean {
  return config.mcpServers !== undefined && MCP_SERVER_KEY in config.mcpServers
}

/**
 * Build the MCP server entry pointing to the current app executable.
 */
function buildMCPEntry(): MCPServerEntry {
  return {
    command: app.getPath('exe'),
    args: ['--mcp'],
  }
}

/**
 * Register MemoryLane as an MCP server in Claude Desktop's config.
 *
 * Shows a dialog with the result:
 * - Already registered: informational message
 * - Success: confirmation message
 * - Error: error details
 */
export async function registerWithClaudeDesktop(): Promise<void> {
  const configPath = getClaudeConfigPath()
  log.info(`[Claude Integration] Config path: ${configPath}`)

  try {
    const config = readClaudeConfig(configPath)

    if (isRegistered(config)) {
      log.info('[Claude Integration] Already registered')
      await dialog.showMessageBox({
        type: 'info',
        title: 'Already Configured',
        message: 'MemoryLane is already registered in Claude Desktop',
        detail:
          'The MCP server entry is already present in your Claude Desktop configuration. ' +
          'Restart Claude Desktop if it is not showing up.',
      })
      return
    }

    if (config.mcpServers === undefined) {
      config.mcpServers = {}
    }
    config.mcpServers[MCP_SERVER_KEY] = buildMCPEntry()

    writeClaudeConfig(configPath, config)

    log.info('[Claude Integration] Registered successfully')
    await dialog.showMessageBox({
      type: 'info',
      title: 'Added to Claude Desktop',
      message: 'MemoryLane has been added to Claude Desktop',
      detail:
        'The MCP server was registered successfully. ' +
        'Please restart Claude Desktop for the changes to take effect.',
    })
  } catch (error) {
    log.error('[Claude Integration] Registration failed:', error)
    await dialog.showMessageBox({
      type: 'error',
      title: 'Registration Failed',
      message: 'Could not add MemoryLane to Claude Desktop',
      detail:
        `An error occurred while updating the Claude Desktop configuration.\n\n` +
        `Config path: ${configPath}\n` +
        `Error: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}
