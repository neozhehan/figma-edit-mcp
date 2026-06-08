import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPageTools } from "./page.js";
import { registerNodeTools } from "./node.js";
import { registerCreateTools } from "./create.js";
import { registerStyleTools } from "./style.js";
import { registerTextTools } from "./text.js";
import { registerComponentTools } from "./component.js";
import { registerInstanceTools } from "./instance.js";
import { registerVariableTools } from "./variable.js";
import { registerAnnotationTools } from "./annotation.js";
import { registerReactionTools } from "./reaction.js";
import { registerChannelTools } from "./channel.js";

export function registerAllTools(server: McpServer) {
    registerPageTools(server);
    registerNodeTools(server);
    registerCreateTools(server);
    registerStyleTools(server);
    registerTextTools(server);
    registerComponentTools(server);
    registerInstanceTools(server);
    registerVariableTools(server);
    registerAnnotationTools(server);
    registerReactionTools(server);
    registerChannelTools(server);
}
