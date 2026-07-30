import { describe, expect, it, mock } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

mock.module("../../../figma-client.js", () => ({
    sendCommandToFigma: mock(() => Promise.resolve({})),
    joinChannel: mock(() => Promise.resolve({})),
    resetChannel: mock(() => {}),
}));

const { registerAllTools } = await import("../../../tools/index.js");

const ROOT = join(import.meta.dir, "../../../../..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("v2.3.3 Phase 11: connector-visualization surface removal", () => {
    it("does not register the removed tool or prompt and retains native reaction tools", () => {
        const server = new McpServer({ name: "phase11", version: "2.3.3" });
        registerAllTools(server);

        const tools = (server as any)._registeredTools as Record<string, unknown>;
        const prompts = ((server as any)._registeredPrompts ?? {}) as Record<
            string,
            unknown
        >;

        expect(tools.create_connection).toBeUndefined();
        expect(prompts.reaction_to_connector_strategy).toBeUndefined();
        expect(tools.reaction_list).toBeDefined();
        expect(tools.reaction_update).toBeDefined();
        expect(tools.create_component_set).toBeDefined();
        expect(prompts.swap_overrides_instances).toBeDefined();
    });

    it("removes the wire command, plugin dispatcher, handler module, and refusal code", () => {
        expect(read("src/mcp_server/figma-client.ts")).not.toContain(
            '| "create_connection"',
        );
        expect(read("figma_plugin/src/main.ts")).not.toContain(
            'case "create_connection"',
        );
        expect(
            existsSync(join(ROOT, "figma_plugin/handlers/connectorHandlers.ts")),
        ).toBe(false);
        expect(read("figma_plugin/utils/errors.ts")).not.toContain(
            "CONNECTOR_TEMPLATE_REQUIRED",
        );
        expect(read("src/shared/errorCodes.ts")).not.toContain(
            "CONNECTOR_TEMPLATE_REQUIRED",
        );
        expect(read("figma_plugin/code.js")).not.toContain(
            'case "create_connection"',
        );
    });

    it("keeps current public inventories free of actionable references", () => {
        const manifest = JSON.parse(read("manifest.json"));
        const manifestTools = manifest.tools as Array<{
            name: string;
            description: string;
        }>;
        expect(manifestTools).toHaveLength(45);
        expect(
            manifestTools.some((tool) => tool.name === "create_connection"),
        ).toBe(false);
        expect(
            manifestTools.find((tool) => tool.name === "reaction_list")
                ?.description,
        ).not.toContain("reaction_to_connector_strategy");

        for (const path of [
            "README.md",
            "SAFETY.md",
            "figma_plugin/README.md",
            "skills/figma-edit/references/workflows.md",
            "skills/figma-edit/references/tool-selection.md",
            "documentation/future/Graph-based Operational Plans/prd.md",
        ]) {
            expect(read(path), `${path} advertises a removed surface`).not.toMatch(
                /\bcreate_connection\b|\breaction_to_connector_strategy\b/,
            );
        }

        expect(read("CHANGELOG.md")).toContain(
            "v2.3.3 connector-visualization removal (breaking)",
        );
        expect(read("CHANGELOG.md")).toContain(
            "Use `reaction_list` and `reaction_update`",
        );
        expect(
            read("documentation/v2.3.3/reviews/revised-prd.md"),
        ).toContain("Historical adversarial-review draft; superseded");
        const currentPrd = read("documentation/v2.3.3/prd.md");
        expect(currentPrd).toContain(
            "the official MCP registries exposing exactly 45 tools",
        );
        expect(currentPrd).not.toContain(
            "`create_connection` without a valid template returning",
        );
        expect(currentPrd).not.toContain(
            "Rev 73 Phase 14 correction (authoritative)",
        );
    });
});
