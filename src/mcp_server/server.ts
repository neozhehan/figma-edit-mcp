

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { logger } from "./logger.js";
import {
  connectToFigma,
  setFigmaServerUrl
} from "./figma-client.js";
import { registerAllTools } from "./tools/index.js";

// Create MCP server
const server = new McpServer({
  name: "FigmaEditMCP",
  version: "1.0.0",
});

import { parseCliArgs } from "../cli.js";

// Add command line argument parsing
const { port } = parseCliArgs("figma-edit-mcp");
const WS_URL = `ws://localhost:${port}`;
setFigmaServerUrl(WS_URL);

// Register all tools
registerAllTools(server);

// Start the server
async function main() {
  try {
    // Try to connect to Figma socket server
    connectToFigma();
  } catch (error) {
    logger.warn(`Could not connect to Figma initially: ${error instanceof Error ? error.message : String(error)}`);
    logger.warn('Will try to connect when the first command is sent');
  }

  // Start the MCP server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('FigmaMCP server running on stdio');
}

// Run the server
main().catch(error => {
  logger.error(`Error starting FigmaMCP server: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
