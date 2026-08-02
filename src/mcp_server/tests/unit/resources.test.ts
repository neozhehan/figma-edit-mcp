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
    for (const id of GUIDE_IDS) {
      const uri = `figma-edit://guide/${id}`;
      const result = await registered[uri].readCallback(new URL(uri), {} as any);
      expect(result.contents).toBeDefined();
      expect(result.contents.length).toBe(1);
      expect(result.contents[0].uri).toBe(uri);

      const expected = readFileSync(`skills/figma-edit/references/${id}.md`, "utf8");
      expect(result.contents[0].text).toBe(expected);
    }

    // NOTE: this reads the guide files, but it asserts a property of the SERVER —
    // that each resource serves its repository source byte-for-byte rather than a
    // stale copy. It makes no claim about what the guides say. The former
    // semantic pins here (phrases each guide had to contain) were removed with
    // every other assertion over documentation content.
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
  it("should read version dynamically from package.json and supply eager instructions breadcrumb", async () => {
    (globalThis as any).mockFsFail = false;
    const serverSrc = readFileSync("src/mcp_server/server.ts", "utf8");
    const versionSrc = readFileSync("src/shared/version.ts", "utf8");
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    const { SERVER_NAME, SERVER_VERSION } = await import("../../../shared/version.js");

    // The shared source is authoritative for both server metadata and the
    // Phase 9 MCP join self-report; neither consumer hard-codes a version.
    expect(serverSrc).toContain("SERVER_NAME, SERVER_VERSION");
    expect(serverSrc).toContain("name: SERVER_NAME");
    expect(serverSrc).toContain("version: SERVER_VERSION");
    expect(versionSrc).toContain("readFileSync");
    expect(versionSrc).toContain("package.json");
    expect(SERVER_NAME).toBe(pkg.name);
    expect(SERVER_VERSION).toBe(pkg.version);

    // Assert eager instructions are present and non-empty
    expect(serverSrc).toContain("instructions:");
    expect(serverSrc).toContain("figma-edit://guide/");
    expect(serverSrc).toContain("figma-edit");
    expect(serverSrc).toContain("skill");
  });
});
