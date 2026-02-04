#!/usr/bin/env npx tsx
/**
 * Standalone MCP server entry point.
 * 
 * This script starts the MemoryLane MCP server with stdio transport,
 * suitable for testing and integration with MCP clients like Claude Desktop.
 * 
 * Usage:
 *   npm run mcp:start
 *   
 * Or test with MCP Inspector:
 *   npx @modelcontextprotocol/inspector npm run mcp:start
 */

import { MemoryLaneMCPServer } from '../src/main/mcp/server';

async function main() {
  const server = new MemoryLaneMCPServer();
  await server.start();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
