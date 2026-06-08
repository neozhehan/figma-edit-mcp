#!/usr/bin/env bun
/**
 * WS4 R4.1 — generate the `tools` array from the live tool registrations so it can
 * never drift from the code.
 *
 *   bun run gen:manifest          → writes MCPB-spec tools (name + description) into
 *                                   manifest.json (what `mcpb pack` / Claude Desktop accept).
 *   bun run gen:manifest --rich   → prints the Smithery-shaped tools array (name +
 *                                   description + inputSchema + outputSchema + annotations)
 *                                   to stdout, for building a Smithery-targeted bundle.
 *
 * WS4 R4.3 (resolved): the MCPB manifest schema (all versions v0.1–v0.4) defines a tool
 * as `{ name, description }` with `additionalProperties: false`, and `mcpb pack` enforces
 * it. Smithery's `mcp publish`, however, validates each tool with a schema that REQUIRES
 * `inputSchema` (and reads `outputSchema` + `annotations`). The two are incompatible, so a
 * single `mcpb pack`-built bundle cannot satisfy both — see the README of this script's
 * caller / WS4 notes for the chosen bundle strategy.
 */
import { readFileSync, writeFileSync } from "fs";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools } from "../src/mcp_server/tools/index.js";

const rich = process.argv.includes("--rich");

const server = new McpServer({ name: "figma-edit-mcp", version: "0.0.0" });
registerAllTools(server);
const registered = (server as any)._registeredTools as Record<string, any>;

const asZod = (s: any) => (s && typeof s.safeParse === "function" ? s : z.object(s ?? {}));
const toJson = (s: any) => {
    const json = z.toJSONSchema(asZod(s), { io: "input" }) as Record<string, unknown>;
    delete json.$schema;
    return json;
};

const tools = Object.entries(registered).map(([name, def]) => {
    const entry: Record<string, unknown> = { name, description: def.description ?? "" };
    if (rich) {
        entry.inputSchema = toJson(def.inputSchema);
        if (def.outputSchema) entry.outputSchema = toJson(def.outputSchema);
        if (def.annotations && Object.keys(def.annotations).length) entry.annotations = def.annotations;
    }
    return entry;
});

const missing = tools.filter((t) => !t.description);
if (missing.length) {
    console.error(`ERROR: ${missing.length} tool(s) missing a description: ${missing.map((t) => t.name).join(", ")}`);
    process.exit(1);
}

if (rich) {
    process.stdout.write(JSON.stringify(tools, null, 2) + "\n");
} else {
    const manifestUrl = new URL("../manifest.json", import.meta.url);
    const manifest = JSON.parse(readFileSync(manifestUrl, "utf-8"));
    manifest.tools_generated = false;
    manifest.tools = tools;
    writeFileSync(manifestUrl, JSON.stringify(manifest, null, 2) + "\n");
    console.log(`manifest.json: wrote ${tools.length} tools (name + description, MCPB-spec)`);
}
