import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { errorEnvelope } from "./_result.js";
import { describeThrownForToolBoundary } from "./_error.js";
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
 * D8's complete input catchall inventory — a CLOSED, ENUMERATED list, not a
 * list derived from a principle (open-questions Q34, resolved 2026-07-25:
 * Option B). Every other object in every registered input schema is strict,
 * including objects nested through arrays, unions, records, and lazy schemas.
 *
 * Do not read "polymorphic Figma payload" as the membership rule and extend the
 * list by analogy. Other tools take Figma union payloads too — notably
 * `node_set_effects.effects[]` and the paint objects on the `node_set_*`
 * setters — and they are deliberately STRICT. Their schemas are the authority
 * for known fields and cross-variant gates; `normalizeEffects` overlays defaults
 * while preserving those validated fields. Accepting an unknown key would make
 * intent ambiguous even if the handler happened to forward it, which is
 * precisely the intent loss recursive strictness exists to prevent. The test in
 * `v2.3.3.phase7.test.ts` pins this list exactly, so membership changes only by
 * explicit decision.
 *
 * `style_manage.properties.effects[]` WAS a third entry and was removed
 * (open-questions Q35, resolved 2026-07-25): it never satisfied the rule —
 * `style_manage` runs effects through the same `normalizeEffects`, so extra keys
 * were accepted here and then discarded. It is now a per-variant discriminated
 * union pinned to the typings (see `style.ts`). The two remaining entries are
 * load-bearing: `styleHandlers` assigns `paints` and `layoutGrids` verbatim.
 */
export const INTENTIONAL_INPUT_CATCHALL_PATHS = [
    "style_manage.properties.paints[]",
    "style_manage.properties.layoutGrids[]",
] as const;

function parseRelativeSchemaPath(formattedPath: string, toolName: string): string[] | null {
    if (formattedPath === toolName) {
        return [];
    }
    if (!formattedPath.startsWith(`${toolName}.`)) {
        return null;
    }
    return formattedPath
        .slice(toolName.length + 1)
        .match(/[^.[\]]+|\[\]|\{\}/g) ?? [];
}

/**
 * Clone a Zod input schema while making every nested object strict.
 *
 * Zod's `.strict()` only affects the object on which it is called. Tool inputs
 * also contain objects behind arrays, optionals, unions, records, and recursive
 * lazy schemas, so a top-level call silently leaves those nested objects in
 * Zod's default strip mode. This traversal rebuilds the schema graph and sets a
 * `z.never()` catchall on every object except the two explicitly inventoried
 * polymorphic style payloads above. Checks/refinements and all non-object
 * constraints are preserved by reusing leaf schemas and cloning only containers
 * whose descendants change.
 *
 * Exported so the boundary tests exercise this exact implementation.
 */
export function recursivelyStrictInputSchema<T>(schema: T, toolName: string): T {
    const exemptionPaths = INTENTIONAL_INPUT_CATCHALL_PATHS
        .map((formattedPath) => parseRelativeSchemaPath(formattedPath, toolName))
        .filter((path): path is string[] => path !== null);

    /**
     * A schema object can be reused at multiple paths. Cache by the finite set of
     * exemption suffixes still reachable from the current path, not by an
     * unbounded absolute path: recursive lazy schemas then converge to the empty
     * context, while the same shared subtree receives different clones when one
     * occurrence contains an intentional catchall and another does not.
     */
    const exemptionContext = (path: readonly string[]) => {
        const suffixes = exemptionPaths
            .filter((candidate) =>
                path.length <= candidate.length &&
                path.every((segment, index) => candidate[index] === segment)
            )
            .map((candidate) => candidate.slice(path.length).join("\u001f"))
            .sort();
        return {
            preservesCurrentCatchall: suffixes.includes(""),
            key: suffixes.length === 0 ? "-" : suffixes.join("\u001e"),
        };
    };

    const transformed = new WeakMap<object, Map<string, any>>();

    const getCached = (source: object, contextKey: string): any | undefined =>
        transformed.get(source)?.get(contextKey);

    const hasCached = (source: object, contextKey: string): boolean =>
        transformed.get(source)?.has(contextKey) ?? false;

    const cache = (source: object, contextKey: string, value: any): any => {
        let contexts = transformed.get(source);
        if (!contexts) {
            contexts = new Map<string, any>();
            transformed.set(source, contexts);
        }
        contexts.set(contextKey, value);
        return value;
    };

    const preserveMetadata = (source: any, clone: any): any => {
        const metadata = typeof source.meta === "function" ? source.meta() : undefined;
        return metadata && typeof clone.meta === "function" ? clone.meta(metadata) : clone;
    };

    const visit = (current: any, path: readonly string[]): any => {
        if (!current || typeof current !== "object" || !current._def || typeof current.clone !== "function") {
            return current;
        }

        const context = exemptionContext(path);
        if (hasCached(current, context.key)) {
            return getCached(current, context.key);
        }

        const def = current._def as Record<string, any>;

        // Lazies must be cached before their getter is resolved: reaction action
        // schemas are recursive and eventually point back to the same ZodLazy.
        // Their path context becomes empty after leaving the finite exemption
        // prefixes, so this produces at most one stable recursive clone per
        // reachable exemption context.
        if (def.type === "lazy") {
            let resolved: any;
            const lazyClone = preserveMetadata(current, current.clone({
                ...def,
                getter: () => {
                    if (!resolved) {
                        resolved = visit(def.getter(), path);
                    }
                    return resolved;
                },
            }));
            return cache(current, context.key, lazyClone);
        }

        switch (def.type) {
            case "object": {
                const preserveCatchall =
                    context.preservesCurrentCatchall &&
                    def.catchall &&
                    def.catchall._def?.type !== "never";
                const nextShape: Record<string, any> = {};
                for (const [key, child] of Object.entries(def.shape ?? {})) {
                    nextShape[key] = visit(child, [...path, key]);
                }
                const nextDef = {
                    ...def,
                    shape: nextShape,
                    catchall: preserveCatchall
                        ? visit(def.catchall, [...path, "{}"])
                        : z.never(),
                };
                return cache(
                    current,
                    context.key,
                    preserveMetadata(current, current.clone(nextDef))
                );
            }
            case "array": {
                const element = visit(def.element, [...path, "[]"]);
                if (element === def.element) {
                    return cache(current, context.key, current);
                }
                return cache(
                    current,
                    context.key,
                    preserveMetadata(current, current.clone({ ...def, element }))
                );
            }
            case "optional":
            case "nullable":
            case "default":
            case "prefault":
            case "nonoptional":
            case "readonly":
            case "catch":
            case "success":
            case "promise": {
                const innerType = visit(def.innerType, path);
                if (innerType === def.innerType) {
                    return cache(current, context.key, current);
                }
                return cache(
                    current,
                    context.key,
                    preserveMetadata(current, current.clone({ ...def, innerType }))
                );
            }
            case "union": {
                const options = (def.options ?? []).map((option: any) => visit(option, path));
                if (options.every((option: any, index: number) => option === def.options[index])) {
                    return cache(current, context.key, current);
                }
                return cache(
                    current,
                    context.key,
                    preserveMetadata(current, current.clone({ ...def, options }))
                );
            }
            case "intersection": {
                const left = visit(def.left, path);
                const right = visit(def.right, path);
                if (left === def.left && right === def.right) {
                    return cache(current, context.key, current);
                }
                return cache(
                    current,
                    context.key,
                    preserveMetadata(current, current.clone({ ...def, left, right }))
                );
            }
            case "tuple": {
                const items = (def.items ?? []).map((item: any) => visit(item, [...path, "[]"]));
                const rest = def.rest ? visit(def.rest, [...path, "[]"]) : def.rest;
                if (
                    items.every((item: any, index: number) => item === def.items[index]) &&
                    rest === def.rest
                ) {
                    return cache(current, context.key, current);
                }
                return cache(
                    current,
                    context.key,
                    preserveMetadata(current, current.clone({ ...def, items, rest }))
                );
            }
            case "record":
            case "map": {
                // Reuse leaf key schemas exactly. In particular, Zod's
                // `partialRecord` intentionally adjusts its enum key schema's
                // internals; cloning that enum turns the record exhaustive.
                const keyType = visit(def.keyType, [...path, "{}"]);
                const valueType = visit(def.valueType, [...path, "{}"]);
                if (keyType === def.keyType && valueType === def.valueType) {
                    return cache(current, context.key, current);
                }
                return cache(
                    current,
                    context.key,
                    preserveMetadata(current, current.clone({
                        ...def,
                        keyType,
                        valueType,
                    }))
                );
            }
            case "set": {
                const valueType = visit(def.valueType, [...path, "[]"]);
                if (valueType === def.valueType) {
                    return cache(current, context.key, current);
                }
                return cache(
                    current,
                    context.key,
                    preserveMetadata(current, current.clone({ ...def, valueType }))
                );
            }
            case "pipe": {
                const input = visit(def.in, path);
                const output = visit(def.out, path);
                if (input === def.in && output === def.out) {
                    return cache(current, context.key, current);
                }
                return cache(
                    current,
                    context.key,
                    preserveMetadata(current, current.clone({
                        ...def,
                        in: input,
                        out: output,
                    }))
                );
            }
            default:
                // Preserve leaf identity and non-public internal adjustments.
                return cache(current, context.key, current);
        }
    };

    return visit(schema, []) as T;
}

/**
 * Wraps a server so every tool's `inputSchema` is registered with *recursive*
 * strictness (reject unknown keys at every object depth) instead of the Zod
 * default (silently strip them).
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
                    if (schema) {
                        config = {
                            ...config,
                            inputSchema: recursivelyStrictInputSchema(schema, name),
                        };
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
                        // A successful tool result may already have a top-level
                        // `error` field with a tool-specific type. Preserve it
                        // alongside D9's structured error envelope instead of
                        // overwriting it: variable_delete legitimately returns
                        // `{success:false, error:string, variablesInUse}` after
                        // a complete scan finds consumers.
                        const declaredError = (out as any).shape?.error;
                        const advertisedError = declaredError
                            ? z.union([declaredError, errorEnvelope]).optional()
                            : errorEnvelope.optional();
                        config = {
                            ...config,
                            outputSchema: out.partial().extend({ error: advertisedError }).catchall(z.any()),
                        };
                    }
                    const wrappedCb = async (args: any, extra: any) => {
                        try {
                            return await cb(args, extra);
                        } catch (error: any) {
                            // A thrown value is untrusted input. Hostile Proxies
                            // can reject code/message/details reads as well as
                            // String(error); error transport must still resolve
                            // to the canonical in-band UNKNOWN_ERROR envelope.
                            const { code, message, details } =
                                describeThrownForToolBoundary(error);
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
