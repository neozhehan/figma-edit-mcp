import { describe, it, expect, mock, afterAll } from "bun:test";
import { readFileSync } from "fs";

// Mock the fs module using globalThis to communicate the state safely across tests
mock.module("fs", () => {
  const original = require("fs");
  return {
    ...original,
    existsSync: (path: any) => {
      if ((globalThis as any).mockFsFail) {
        return false;
      }
      return original.existsSync(path);
    },
    readFileSync: (path: any, options: any) => {
      if ((globalThis as any).mockFsFail) {
        throw new Error("Mocked readFileSync failure");
      }
      return original.readFileSync(path, options);
    },
  };
});

// Import the modules under test
const { registerAllResources } = await import("../../resources.js");
const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");

const GUIDE_IDS = [
  "constraints",
  "error-playbook",
  "workflows",
  "tool-selection",
] as const;

describe("WS2 - Resources Handler (R2.2, R5.1h)", () => {
  afterAll(() => {
    delete (globalThis as any).mockFsFail;
  });

  it("should register the 5 guide resources and serve the exact four operational guide sources", async () => {
    (globalThis as any).mockFsFail = false;
    const server = new McpServer({ name: "test", version: "1.0.0" });
    registerAllResources(server);

    const registered = (server as any)._registeredResources;
    const keys = Object.keys(registered);
    expect(keys.length).toBe(5);
    expect(keys).toContain("figma-edit://guide/constraints");
    expect(keys).toContain("figma-edit://guide/error-playbook");
    expect(keys).toContain("figma-edit://guide/workflows");
    expect(keys).toContain("figma-edit://guide/tool-selection");
    expect(keys).toContain("figma-edit://guide/node-fields");

    // Test metadata for one representative guide.
    const constraints = registered["figma-edit://guide/constraints"];
    expect(constraints.title).toBe("Figma Edit constraints guide");
    expect(constraints.metadata.mimeType).toBe("text/markdown");

    // The MCP resources are mirrors by reference, not copied files: verify every
    // published operational guide is byte-for-byte the repository source.
    const guideText: Record<(typeof GUIDE_IDS)[number], string> = {} as any;
    for (const id of GUIDE_IDS) {
      const uri = `figma-edit://guide/${id}`;
      const result = await registered[uri].readCallback(new URL(uri), {} as any);
      expect(result.contents).toBeDefined();
      expect(result.contents.length).toBe(1);
      expect(result.contents[0].uri).toBe(uri);

      const expected = readFileSync(`skills/figma-edit/references/${id}.md`, "utf8");
      expect(result.contents[0].text).toBe(expected);
      guideText[id] = result.contents[0].text;
    }

    // Concise semantic pins for the Phase 7/8 operational contract. These catch
    // a source-and-resource edit that remains byte-identical but drops recovery
    // guidance users need before issuing a second write.
    expect(guideText.constraints).toContain("actual and verified parent IDs");
    expect(guideText.constraints).toContain("removedComponents");
    expect(guideText.constraints).toContain("reparentedComponents");
    expect(guideText.constraints).toContain("beforeCountVerified");
    expect(guideText.constraints).toContain("outcomeUnknown");
    expect(guideText.constraints).toContain(
      "Name **verification** and name **assignment** are different contracts",
    );
    expect(guideText.constraints).toContain("CREATE_COLLECTION.modeName");
    expect(guideText["error-playbook"]).toContain("before.survivingNodeId");
    expect(guideText["error-playbook"]).toContain("survivingParentState");
    expect(guideText["error-playbook"]).toContain("before.removedComponents");
    expect(guideText["error-playbook"]).toContain("retainedVariantComponents");
    expect(guideText["error-playbook"]).toContain("postStateError");
    expect(guideText["error-playbook"]).toContain(
      "A name-assignment request rejects an explicit empty",
    );
    expect(guideText["error-playbook"]).toContain(
      "Never omit a required field merely because another tool has a default",
    );
    expect(guideText.workflows).toContain("GROUP/FRAME roots are valid");
    expect(guideText.workflows).toContain("required parent:");
    expect(guideText.workflows).toContain("afterCountVerified");
    expect(guideText.workflows).toContain(
      "Assigned names: omit only when the field permits it",
    );
    expect(guideText.workflows).toContain(
      "C9's present-empty decision is limited to the protected `parentNodeName` paths",
    );
    expect(guideText["tool-selection"]).toContain("accepts exactly `DROP_SHADOW`");
    expect(guideText["tool-selection"]).toContain("`blendMode` must be one of the 19");
    expect(guideText["tool-selection"]).toContain("Prevalidation atomicity is not a runtime transaction");
    expect(guideText["tool-selection"]).toContain("canonical `UNKNOWN_ERROR` envelope");
    expect(guideText["tool-selection"]).toContain("Name assignment vs. name lookup");
    expect(guideText["tool-selection"]).toContain(
      "A dual-role field such as component-property `propertyName` is classified by action",
    );
  });

  it("should fail soft on a missing file (return error markdown instead of crashing)", async () => {
    (globalThis as any).mockFsFail = true;
    const server = new McpServer({ name: "test", version: "1.0.0" });
    registerAllResources(server);

    const registered = (server as any)._registeredResources;
    const constraints = registered["figma-edit://guide/constraints"];

    const result = await constraints.readCallback(new URL("figma-edit://guide/constraints"), {} as any);
    expect(result.contents).toBeDefined();
    expect(result.contents.length).toBe(1);
    expect(result.contents[0].text).toContain("# Error");
    expect(result.contents[0].text).toContain("not found");
  });
});

describe("WS1 & WS2 - Server Initialization (R1.2, R2.3, R5.1i)", () => {
  it("should read version dynamically from package.json and supply eager instructions breadcrumb", () => {
    (globalThis as any).mockFsFail = false;
    const src = readFileSync("src/mcp_server/server.ts", "utf8");

    // Assert version is read from package.json dynamically
    expect(src).toContain("pkg.version");
    expect(src).toContain("pkg.name");
    expect(src).toContain("readFileSync");
    expect(src).toContain("package.json");

    // Assert eager instructions are present and non-empty
    expect(src).toContain("instructions:");
    expect(src).toContain("figma-edit://guide/");
    expect(src).toContain("figma-edit");
    expect(src).toContain("skill");
  });
});
