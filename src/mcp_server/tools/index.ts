import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { errorEnvelope } from "./_result.js";
import { UNKNOWN_ERROR } from "../../shared/errorCodes.js";
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
 *
 * Exported so transport tests can exercise this exact wrapper rather than a copy.
 */
export function withStrictInputSchemas(server: McpServer): McpServer {
    return new Proxy(server, {
        get(target, prop) {
            if (prop === "registerTool") {
                return (name: string, config: any, cb: any) => {
                    const schema = config?.inputSchema;
                    if (schema && typeof schema.strict === "function") {
                        config = { ...config, inputSchema: schema.strict() };
                    }
                    // Every advertised output schema must accept the common D9
                    // error envelope: the pinned SDK client validates any present
                    // `structuredContent` against the advertised schema even on
                    // isError results (client/index.js), and the SDK cannot
                    // advertise a union (`normalizeObjectSchema` drops non-object
                    // schemas from tools/list). So declared fields become
                    // optional — their types still validate when present; exact
                    // field-name conformance is enforced by the registered-
                    // callback tests — and the envelope is advertised explicitly
                    // as an optional `error` field.
                    const out = config?.outputSchema;
                    if (out && typeof out.partial === "function" && typeof out.extend === "function") {
                        config = {
                            ...config,
                            outputSchema: out.partial().extend({ error: errorEnvelope.optional() }).catchall(z.any()),
                        };
                    }
                    const wrappedCb = async (args: any, extra: any) => {
                        try {
                            return await cb(args, extra);
                        } catch (error: any) {
                            const isObj = error !== null && typeof error === "object";
                            const code = (isObj && typeof error.code === "string") ? error.code : UNKNOWN_ERROR;
                            const message = (isObj && error.message) ? error.message : String(error);
                            const details = isObj ? error.details : undefined;
                            return {
                                content: [
                                    {
                                        type: "text" as const,
                                        text: `Error [${code}]: ${message}`
                                    }
                                ],
                                isError: true,
                                structuredContent: {
                                    error: {
                                        code,
                                        message,
                                        details
                                    }
                                }
                            };
                        }
                    };
                    return (target as any).registerTool(name, config, wrappedCb);
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
