import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { logger } from "./logger.js";
import {
  connectToFigma,
  setFigmaServerUrl
} from "./figma-client.js";
import { registerAllTools } from "./tools/index.js";
import { registerAllResources } from "./resources.js";
import { parseCliArgs } from "../cli.js";
import { readFileSync, existsSync } from "fs";

// Resolve package.json version and name dynamically
let packageJsonUrl = new URL("../package.json", import.meta.url);
if (!existsSync(packageJsonUrl)) {
  packageJsonUrl = new URL("../../package.json", import.meta.url);
}
const pkg = JSON.parse(readFileSync(packageJsonUrl, "utf-8"));

// Create MCP server
const server = new McpServer({
  name: pkg.name || "figma-edit-mcp",
  version: pkg.version || "2.0.0",
}, {
  instructions: "Edits a **live** Figma file under hard, plugin-enforced constraints (scope, name verification, batch validation) that return structured error codes. Before writing, and on any error, load the guidance: read the MCP resources under `figma-edit://guide/*` (constraints, error-playbook, workflows, tool-selection) or use the `figma-edit` skill. Always discover before acting (`page.info` → `node.info`) and pass node names back verbatim."
});

// Add command line argument parsing
const { port } = parseCliArgs("figma-edit-mcp");
const WS_URL = `ws://localhost:${port}`;
setFigmaServerUrl(WS_URL);

// Register all tools and resources
registerAllTools(server);
registerAllResources(server);

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
