/**
 * MemoryLane MCP Server
 * 
 * Exposes the context database to AI assistants via the Model Context Protocol.
 * Supports stdio transport for use with Claude Desktop, Cursor, and other MCP clients.
 */

// eslint-disable-next-line import/no-unresolved
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
// eslint-disable-next-line import/no-unresolved
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const SERVER_NAME = 'memorylane';
const SERVER_VERSION = '1.0.0';

export class MemoryLaneMCPServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer(
      {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.registerTools();
  }

  private registerTools(): void {
    this.server.registerTool(
      'search_context',
      {
        description: 'Search your personal context vault for relevant information based on what you\'ve been doing on your computer. Uses semantic search to find contextually relevant results.',
        inputSchema: {
          query: z.string().describe('The search query - describe what context you\'re looking for'),
          limit: z.number().optional().describe('Maximum number of results to return (default: 5)'),
        },
      },
      async ({ query, limit }) => {
        // Placeholder implementation - will be wired up in Ticket 4
        const effectiveLimit = limit ?? 5;

        return {
          content: [
            {
              type: 'text' as const,
              text: `[Placeholder] Search for "${query}" with limit ${effectiveLimit}\n\nThis will be implemented in the next ticket.`,
            },
          ],
        };
      }
    );
  }

  /**
   * Start the MCP server with stdio transport.
   * This is the main entry point for standalone execution.
   */
  public async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    // Log to stderr so it doesn't interfere with MCP protocol on stdout
    console.error(`${SERVER_NAME} MCP server started`);
  }

  /**
   * Get the underlying McpServer instance for testing or advanced usage.
   */
  public getServer(): McpServer {
    return this.server;
  }
}

export default MemoryLaneMCPServer;
