import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCreationTools } from "./creation.js";
import { registerModificationTools } from "./modification.js";
import { registerStylingTools } from "./styling.js";
import { registerTextTools } from "./text.js";
import { registerLayoutTools } from "./layout.js";
import { registerComponentTools } from "./components.js";
import { registerVariablesTools } from "./variables.js";
import { registerAnnotationTools } from "./annotations.js";
import { registerPrototypingTools } from "./prototyping.js";
import { registerDocumentTools } from "./document.js";
import { registerAssetTools } from "./assets.js";

export function registerAllTools(server: McpServer) {
    registerCreationTools(server);
    registerModificationTools(server);
    registerStylingTools(server);
    registerTextTools(server);
    registerLayoutTools(server);
    registerComponentTools(server);
    registerVariablesTools(server);
    registerAnnotationTools(server);
    registerPrototypingTools(server);
    registerDocumentTools(server);
    registerAssetTools(server);
}
