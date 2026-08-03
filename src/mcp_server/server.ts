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
import { SERVER_NAME, SERVER_VERSION } from "../shared/version.js";

// Create MCP server
const server = new McpServer({
  name: SERVER_NAME,
  version: SERVER_VERSION,
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

  // Exit when the host disconnects (closes our stdin) or on a termination
  // signal. Without this the process lingers after the host quits — the
  // figma-client reconnect timer and any open socket keep the event loop
  // alive — so orphaned MCP servers pile up across host restarts and spin
  // forever against the socket on :3055. The stdin EOF path is the reliable
  // signal (the host talks to us over the stdin pipe); transport.onclose and
  // the signal handlers are belt-and-suspenders. Set onclose AFTER connect so
  // the SDK's own handler isn't clobbered.
  const shutdown = () => process.exit(0);
  const sdkOnClose = transport.onclose;
  transport.onclose = () => {
    try { sdkOnClose?.(); } finally { shutdown(); }
  };
  process.stdin.on("end", shutdown);
  process.stdin.on("close", shutdown);
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  logger.info('FigmaMCP server running on stdio');
}

// Run the server
main().catch(error => {
  logger.error(`Error starting FigmaMCP server: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
