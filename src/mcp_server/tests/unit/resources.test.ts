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

describe("WS2 - Resources Handler (R2.2, R5.1h)", () => {
  afterAll(() => {
    delete (globalThis as any).mockFsFail;
  });

  it("should register the 5 guide resources and read markdown content", async () => {
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

    // Test successful read of a guide
    const constraints = registered["figma-edit://guide/constraints"];
    expect(constraints.title).toBe("Figma Edit constraints guide");
    expect(constraints.metadata.mimeType).toBe("text/markdown");

    const result = await constraints.readCallback(new URL("figma-edit://guide/constraints"), {} as any);
    expect(result.contents).toBeDefined();
    expect(result.contents.length).toBe(1);
    expect(result.contents[0].uri).toBe("figma-edit://guide/constraints");
    expect(result.contents[0].text).toContain("Hard constraints");
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
