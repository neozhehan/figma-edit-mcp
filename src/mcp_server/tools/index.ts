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

/**
 * Wraps a server so every tool's `inputSchema` is registered as a *strict* Zod
 * object (reject unknown keys) instead of the Zod default (silently strip them).
 *
 * Why: by default an agent that sends a misremembered/extra key (e.g. `properties`
 * when the param is `fields`) has that key silently dropped, and the tool runs with
 * the field unset — succeeding while discarding the agent's intent. Strict turns
 * that into an actionable "Unrecognized key(s): …" validation error the agent can
 * recover from. The MCP SDK validates `request.params.arguments` against this
 * schema (see mcp.js `validateToolInput`), so strictness is enforced at the
 * protocol boundary for every client.
 *
 * Applied centrally here so it cannot be forgotten on a per-tool basis or drift as
 * tools are added. Only `registerTool` is intercepted; all other server methods
 * pass through unchanged (bound to the real server).
 */
function withStrictInputSchemas(server: McpServer): McpServer {
    return new Proxy(server, {
        get(target, prop) {
            if (prop === "registerTool") {
                return (name: string, config: any, cb: any) => {
                    const schema = config?.inputSchema;
                    if (schema && typeof schema.strict === "function") {
                        config = { ...config, inputSchema: schema.strict() };
                    }
                    return (target as any).registerTool(name, config, cb);
                };
            }
            const value = Reflect.get(target, prop, target);
            return typeof value === "function" ? value.bind(target) : value;
        },
    }) as McpServer;
}

export function registerAllTools(server: McpServer) {
    const strict = withStrictInputSchemas(server);
    registerPageTools(strict);
    registerNodeTools(strict);
    registerCreateTools(strict);
    registerStyleTools(strict);
    registerTextTools(strict);
    registerComponentTools(strict);
    registerInstanceTools(strict);
    registerVariableTools(strict);
    registerAnnotationTools(strict);
    registerReactionTools(strict);
    registerChannelTools(strict);
}
