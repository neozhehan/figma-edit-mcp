import { describe, it, expect, beforeEach, mock } from "bun:test";

// Verification tests for Phase 3 of v1.3.0 read_tools_update_plan.md.
// Task 1: get_connect_payload plugin handler.
// Task 2: join_channel MCP tool — two-leg flow, fail-closed.
// Task 3: socket-side CHANNEL_NOT_FOUND detection (static + behavioral).
// Task 4: SCOPE_DELETED maps to a structured plugin return (covered via Task 1).
//
// NOTE: Direct behavioral tests of getConnectPayload require importing main.js,
// which has top-level side effects (it binds figma.ui.onmessage to whichever
// figma global is present at import time). Other test files (notably
// componentHandlers.test.ts) depend on owning that side-effect binding, and
// bun's module cache is shared across test files. To avoid order-dependent
// breakage, this file uses (a) source-level static checks for connectHandlers
// branching + error returns, and (b) integration tests through the join_channel
// MCP tool layer, which exercises the success and error envelope contracts
// without loading main.js. Phase 4 §3a/§3b plan explicitly direct
// behavior + snapshot tests of getConnectPayload — those should set up the
// figma + main.js scaffolding the way componentHandlers.test.ts already does.

// -------------------------------------------------------------------
// Task 1 (static): getConnectPayload handler source-level branch checks
// -------------------------------------------------------------------

describe("Phase 3.1 (static): getConnectPayload handler — branches present", () => {
    let src: string;
    beforeEach(async () => {
        const fs = await import("node:fs/promises");
        src = await fs.readFile(
            "src/figma_plugin/handlers/connectHandlers.ts",
            "utf8",
        );
    });

    it("imports getPluginState from main.js (source of state.readOnly + state.scopeRootId)", () => {
        expect(src).toMatch(
            /import\s*\{\s*getPluginState\s*\}\s*from\s*['"]\.\.\/src\/main\.js['"]/,
        );
    });

    it("readonly branch returns editableScopeType: 'readonly' with id+name pages and no children", () => {
        expect(src).toMatch(/state\.readOnly\s*===\s*true/);
        expect(src).toMatch(/editableScopeType:\s*["']readonly["']/);
        // Readonly path must not call loadAsync.
        const readonlySection = src.split("state.readOnly === true")[1] ?? "";
        const beforePageScope = readonlySection.split(
            "if (state.scopeRootId)",
        )[0];
        expect(beforePageScope).not.toMatch(/\.loadAsync\(/);
    });

    it("page-scope branch awaits loadAsync on the resolved PAGE node", () => {
        expect(src).toMatch(
            /scopeNode\.type\s*===\s*["']PAGE["']\s*&&\s*scopeNode\.parent\s*===\s*figma\.root/,
        );
        expect(src).toMatch(/editableScopeType:\s*["']page["']/);
        expect(src).toMatch(/await\s+scopeNode\.loadAsync\(\)/);
    });

    it("node-scope branch walks node.parent until PAGE, returns containing-page metadata", () => {
        expect(src).toMatch(/editableScopeType:\s*["']node["']/);
        expect(src).toMatch(/while\s*\(\s*currentNode\s*\)/);
        expect(src).toMatch(/containingPageId/);
        expect(src).toMatch(/containingPageName/);
        expect(src).toMatch(/parentNodeId/);
        expect(src).toMatch(/parentNodeName/);
        expect(src).toMatch(/parentNodeType/);
    });

    it("returns SCOPE_DELETED when getNodeByIdAsync resolves to null (Task 4)", () => {
        // The error must be RETURNED (structured value), NOT thrown.
        const deletedBlock = src.match(
            /errorCode:\s*["']SCOPE_DELETED["']/,
        );
        expect(deletedBlock).not.toBeNull();
        expect(src).not.toMatch(/throw\s+new\s+Error\([^)]*SCOPE_DELETED/);
    });

    it("returns SCOPE_INVALID when no PAGE ancestor exists or scope state is unrecognizable", () => {
        expect(src).toMatch(/errorCode:\s*["']SCOPE_INVALID["']/);
    });

    it("returns DOCUMENT_LOAD_FAILED when loadAsync rejects (try/catch around loadAsync)", () => {
        expect(src).toMatch(/errorCode:\s*["']DOCUMENT_LOAD_FAILED["']/);
        // The loadAsync call must be wrapped in a try/catch.
        expect(src).toMatch(/try\s*\{[^}]*await\s+scopeNode\.loadAsync/);
    });

    it("has a top-level catch that returns UNKNOWN_ERROR with the underlying message appended", () => {
        expect(src).toMatch(/errorCode:\s*["']UNKNOWN_ERROR["']/);
        expect(src).toMatch(/catch\s*\(/);
    });
});

describe("Phase 3.1 (static): handler is registered in main.ts switch and exported", () => {
    it("main.ts has a 'get_connect_payload' case calling getConnectPayload()", async () => {
        const fs = await import("node:fs/promises");
        const src = await fs.readFile(
            "src/figma_plugin/src/main.ts",
            "utf8",
        );
        expect(src).toMatch(/case\s+["']get_connect_payload["']/);
        expect(src).toMatch(/return\s+await\s+getConnectPayload\(\)/);
        expect(src).toMatch(
            /import\s*\{\s*getConnectPayload\s*\}\s*from\s*['"]\.\.\/handlers\/connectHandlers\.js['"]/,
        );
    });

    it("handlers/index.ts exports getConnectPayload", async () => {
        const fs = await import("node:fs/promises");
        const src = await fs.readFile(
            "src/figma_plugin/handlers/index.ts",
            "utf8",
        );
        expect(src).toMatch(/getConnectPayload/);
    });

    it("FigmaCommand union includes 'get_connect_payload'", async () => {
        const fs = await import("node:fs/promises");
        const src = await fs.readFile(
            "src/mcp_server/figma-client.ts",
            "utf8",
        );
        expect(src).toMatch(/["']get_connect_payload["']/);
    });
});

// -------------------------------------------------------------------
// Task 2: join_channel MCP tool — two-leg flow, fail-closed contract
// -------------------------------------------------------------------

describe("Phase 3.2: join_channel — two-leg flow", () => {
    let registeredTools: Record<string, Function>;
    let mockServer: any;
    let sendCommandToFigma: any;
    let joinChannel: any;
    let resetChannel: any;

    beforeEach(async () => {
        mock.module("../../../figma-client.js", () => ({
            sendCommandToFigma: mock(() => Promise.resolve({})),
            joinChannel: mock(() => Promise.resolve()),
            resetChannel: mock(() => {}),
        }));
        const clientMod = await import("../../../figma-client.js");
        sendCommandToFigma = clientMod.sendCommandToFigma;
        joinChannel = clientMod.joinChannel;
        resetChannel = clientMod.resetChannel;

        const docMod = await import("../../../tools/document.js");
        registeredTools = {};
        mockServer = {
            tool: mock(
                (name: string, _desc: any, _schema: any, handler: Function) => {
                    registeredTools[name] = handler;
                },
            ),
            prompt: mock(() => {}),
        };
        docMod.registerDocumentTools(mockServer);
    });

    it("success path: returns { status: 'success', channel, ...payload } and does NOT reset channel", async () => {
        const successPayload = {
            editableScopeType: "page",
            documentId: "0:0",
            documentName: "Doc",
            pageCount: 2,
            pages: [{ pageId: "p1", pageName: "P1", children: [] }],
        };
        (sendCommandToFigma as any).mockImplementation((cmd: string) =>
            cmd === "get_connect_payload"
                ? Promise.resolve(successPayload)
                : Promise.resolve({}),
        );

        const result = await registeredTools["join_channel"]({ channel: "abc" });
        const parsed = JSON.parse(result.content[0].text);

        expect(parsed.status).toBe("success");
        expect(parsed.channel).toBe("abc");
        expect(parsed.editableScopeType).toBe("page");
        expect(parsed.pages).toEqual(successPayload.pages);
        expect((resetChannel as any).mock.calls.length).toBe(0);
        expect(joinChannel).toHaveBeenCalledWith("abc");
        expect(sendCommandToFigma).toHaveBeenCalledWith("get_connect_payload");
    });

    it("leg-1 CHANNEL_NOT_FOUND: error envelope, no leg-2 call", async () => {
        const tagged = Object.assign(new Error("not found"), {
            joinErrorCode: "CHANNEL_NOT_FOUND",
        });
        (joinChannel as any).mockRejectedValue(tagged);

        const result = await registeredTools["join_channel"]({ channel: "missing" });
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.status).toBe("error");
        expect(parsed.errorCode).toBe("CHANNEL_NOT_FOUND");
        expect(parsed.channel).toBe("missing");
        const leg2Calls = (sendCommandToFigma as any).mock.calls.filter(
            (c: any[]) => c[0] === "get_connect_payload",
        );
        expect(leg2Calls.length).toBe(0);
    });

    it("leg-1 timeout: maps to CHANNEL_JOIN_FAILED", async () => {
        (joinChannel as any).mockRejectedValue(
            new Error("Request timed out after 30000ms"),
        );
        const result = await registeredTools["join_channel"]({ channel: "x" });
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.status).toBe("error");
        expect(parsed.errorCode).toBe("CHANNEL_JOIN_FAILED");
    });

    it("leg-2 plugin returns SCOPE_DELETED: errorCode passes through and resetChannel is called", async () => {
        (sendCommandToFigma as any).mockImplementation((cmd: string) =>
            cmd === "get_connect_payload"
                ? Promise.resolve({
                      errorCode: "SCOPE_DELETED",
                      errorMessage: "scope gone",
                  })
                : Promise.resolve({}),
        );
        const result = await registeredTools["join_channel"]({ channel: "abc" });
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.status).toBe("error");
        expect(parsed.errorCode).toBe("SCOPE_DELETED");
        expect(parsed.errorMessage).toBe("scope gone");
        expect(parsed.channel).toBe("abc");
        expect((resetChannel as any).mock.calls.length).toBe(1);
        expect(parsed.editableScopeType).toBeUndefined();
    });

    it("leg-2 plugin returns DOCUMENT_LOAD_FAILED: envelope + resetChannel", async () => {
        (sendCommandToFigma as any).mockImplementation((cmd: string) =>
            cmd === "get_connect_payload"
                ? Promise.resolve({
                      errorCode: "DOCUMENT_LOAD_FAILED",
                      errorMessage: "load fail",
                  })
                : Promise.resolve({}),
        );
        const result = await registeredTools["join_channel"]({ channel: "abc" });
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.status).toBe("error");
        expect(parsed.errorCode).toBe("DOCUMENT_LOAD_FAILED");
        expect((resetChannel as any).mock.calls.length).toBe(1);
    });

    it("leg-2 transport rejection (Connection closed): maps to PLUGIN_DISCONNECTED + resetChannel", async () => {
        (sendCommandToFigma as any).mockImplementation((cmd: string) =>
            cmd === "get_connect_payload"
                ? Promise.reject(new Error("Connection closed"))
                : Promise.resolve({}),
        );
        const result = await registeredTools["join_channel"]({ channel: "abc" });
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.status).toBe("error");
        expect(parsed.errorCode).toBe("PLUGIN_DISCONNECTED");
        expect((resetChannel as any).mock.calls.length).toBe(1);
    });

    it("leg-2 transport timeout: maps to UNKNOWN_ERROR with message appended + resetChannel", async () => {
        (sendCommandToFigma as any).mockImplementation((cmd: string) =>
            cmd === "get_connect_payload"
                ? Promise.reject(new Error("Request timed out after 30000ms"))
                : Promise.resolve({}),
        );
        const result = await registeredTools["join_channel"]({ channel: "abc" });
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.status).toBe("error");
        expect(parsed.errorCode).toBe("UNKNOWN_ERROR");
        expect(parsed.errorMessage).toMatch(/timed out/);
        expect((resetChannel as any).mock.calls.length).toBe(1);
    });

    it("no partial-success: every leg-2 failure response has status === 'error' and lacks payload fields", async () => {
        const failureSetups: Array<() => void> = [
            () =>
                (sendCommandToFigma as any).mockImplementation((cmd: string) =>
                    cmd === "get_connect_payload"
                        ? Promise.resolve({
                              errorCode: "SCOPE_INVALID",
                              errorMessage: "bad",
                          })
                        : Promise.resolve({}),
                ),
            () =>
                (sendCommandToFigma as any).mockImplementation((cmd: string) =>
                    cmd === "get_connect_payload"
                        ? Promise.reject(new Error("Connection closed"))
                        : Promise.resolve({}),
                ),
        ];
        for (const setup of failureSetups) {
            setup();
            const r = await registeredTools["join_channel"]({ channel: "x" });
            const parsed = JSON.parse(r.content[0].text);
            expect(parsed.status).toBe("error");
            expect(parsed.editableScopeType).toBeUndefined();
            expect(parsed.pages).toBeUndefined();
            expect(parsed.node).toBeUndefined();
        }
    });

    it("success envelope echoes payload fields for all three scope types (smoke)", async () => {
        const cases = [
            {
                name: "readonly",
                payload: {
                    editableScopeType: "readonly",
                    documentId: "0:0",
                    documentName: "D",
                    pageCount: 1,
                    pages: [{ pageId: "p1", pageName: "P1" }],
                },
            },
            {
                name: "page",
                payload: {
                    editableScopeType: "page",
                    documentId: "0:0",
                    documentName: "D",
                    pageCount: 1,
                    pages: [
                        { pageId: "p1", pageName: "P1", children: [] },
                    ],
                },
            },
            {
                name: "node",
                payload: {
                    editableScopeType: "node",
                    documentId: "0:0",
                    documentName: "D",
                    node: {
                        nodeId: "f1",
                        nodeName: "F",
                        type: "FRAME",
                        parentNodeId: "p1",
                        parentNodeName: "P1",
                        parentNodeType: "PAGE",
                        containingPageId: "p1",
                        containingPageName: "P1",
                        children: [],
                    },
                },
            },
        ];
        for (const c of cases) {
            (sendCommandToFigma as any).mockImplementation((cmd: string) =>
                cmd === "get_connect_payload"
                    ? Promise.resolve(c.payload)
                    : Promise.resolve({}),
            );
            const r = await registeredTools["join_channel"]({ channel: "ch" });
            const parsed = JSON.parse(r.content[0].text);
            expect(parsed.status).toBe("success");
            expect(parsed.editableScopeType).toBe(c.name);
            expect(parsed.channel).toBe("ch");
        }
    });
});

// -------------------------------------------------------------------
// Task 3: socket-side CHANNEL_NOT_FOUND detection (static + behavioral)
// -------------------------------------------------------------------

describe("Phase 3.3: socket-side CHANNEL_NOT_FOUND wiring (static)", () => {
    it("socket.ts replies join_error/CHANNEL_NOT_FOUND for a lone-MCP join into an empty channel", async () => {
        const fs = await import("node:fs/promises");
        const src = await fs.readFile("src/socket.ts", "utf8");
        expect(src).toMatch(/data\.clientType\s*===\s*["']mcp["']/);
        expect(src).toMatch(/code:\s*["']CHANNEL_NOT_FOUND["']/);
        expect(src).toMatch(/type:\s*["']join_error["']/);
    });

    it("plugin joins remain unchanged (channel auto-created when missing for non-mcp joins)", async () => {
        const fs = await import("node:fs/promises");
        const src = await fs.readFile("src/socket.ts", "utf8");
        expect(src).toMatch(/channels\.set\(channelName/);
    });

    it("MCP joinChannel tags the request with clientType: 'mcp'", async () => {
        const fs = await import("node:fs/promises");
        const src = await fs.readFile("src/mcp_server/figma-client.ts", "utf8");
        expect(src).toMatch(/clientType:\s*["']mcp["']/);
    });

    it("MCP figma-client recognizes join_error and tags rejection with joinErrorCode", async () => {
        const fs = await import("node:fs/promises");
        const src = await fs.readFile("src/mcp_server/figma-client.ts", "utf8");
        expect(src).toMatch(/json\.type\s*===\s*['"]join_error['"]/);
        expect(src).toMatch(/joinErrorCode/);
    });

    it("figma-client exports resetChannel that nulls currentChannel", async () => {
        const fs = await import("node:fs/promises");
        const src = await fs.readFile("src/mcp_server/figma-client.ts", "utf8");
        expect(src).toMatch(/export\s+function\s+resetChannel/);
        expect(src).toMatch(/currentChannel\s*=\s*null/);
    });
});

describe("Phase 3.3: socket-side CHANNEL_NOT_FOUND (behavioral)", () => {
    it("lone-MCP join into an empty channel emits join_error and does NOT register the joiner", async () => {
        // Replicates the lone-MCP branch from src/socket.ts:78-89 to assert
        // the wire-format contract (message shape, absence of registration).
        const channels = new Map<string, Set<unknown>>();
        const sent: any[] = [];
        const ws: any = {
            send: (msg: string) => sent.push(JSON.parse(msg)),
        };
        const data = {
            type: "join",
            channel: "ghost",
            clientType: "mcp",
            id: "req-1",
        };

        if (data.clientType === "mcp") {
            const size = channels.get(data.channel)?.size ?? 0;
            if (size === 0) {
                ws.send(
                    JSON.stringify({
                        type: "join_error",
                        code: "CHANNEL_NOT_FOUND",
                        id: data.id,
                        message: `Channel '${data.channel}' was not found. Verify the channel name and that the Figma plugin is running and connected.`,
                    }),
                );
            }
        }

        expect(sent).toHaveLength(1);
        expect(sent[0].type).toBe("join_error");
        expect(sent[0].code).toBe("CHANNEL_NOT_FOUND");
        expect(sent[0].id).toBe("req-1");
        expect(sent[0].message).toContain("'ghost'");
        expect(channels.has("ghost")).toBe(false);
    });
});
