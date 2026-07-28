import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";

const TEST_PLUGIN_VERSION = "9.9.9-phase9-test";
const previousFigma = (globalThis as any).figma;
const previousHtml = (globalThis as any).__html__;
const previousPluginVersion = (globalThis as any).__PLUGIN_VERSION__;

const pluginMessages: any[] = [];
const scopeReadyStateSnapshots: any[] = [];
let mainModule: any;

const phase9Figma = {
    showUI: () => {},
    ui: {
        onmessage: null as any,
        postMessage: (message: any) => {
            pluginMessages.push(message);
            if (message.type === "scope-ready" && mainModule) {
                scopeReadyStateSnapshots.push({ ...mainModule.getPluginState() });
            }
        },
    },
    on: () => {},
    notify: () => {},
    closePlugin: () => {},
};

(globalThis as any).figma = phase9Figma;
(globalThis as any).__html__ = "<html></html>";
(globalThis as any).__PLUGIN_VERSION__ = TEST_PLUGIN_VERSION;

mainModule = await import(
    "../../../../../figma_plugin/src/main.js?scope=phase9-scope-ready"
);
const pluginOnMessage = phase9Figma.ui.onmessage as (message: any) => Promise<void> | void;

afterAll(() => {
    (globalThis as any).figma = previousFigma;
    (globalThis as any).__html__ = previousHtml;
    (globalThis as any).__PLUGIN_VERSION__ = previousPluginVersion;
});

describe("Phase 9 Q11: plugin-main scope-ready acknowledgement", () => {
    beforeEach(() => {
        pluginMessages.length = 0;
        scopeReadyStateSnapshots.length = 0;
    });

    it("echoes the request only after committing scoped permissions", async () => {
        await pluginOnMessage({
            type: "set-scope",
            requestId: "scope-request-1",
            scopeNodeId: "scope-1",
            scopeNodeType: "PAGE",
            allowEditVariable: true,
            allowEditStyle: false,
        });

        expect(pluginMessages).toEqual([{
            type: "scope-ready",
            requestId: "scope-request-1",
            pluginVersion: TEST_PLUGIN_VERSION,
        }]);
        expect(scopeReadyStateSnapshots).toHaveLength(1);
        expect(scopeReadyStateSnapshots[0]).toMatchObject({
            scopeRootId: "scope-1",
            allowEditNode: "page",
            allowEditVariable: true,
            allowEditStyle: false,
        });
    });

    it("acknowledges read-only node scope only after committing asset permissions", async () => {
        await pluginOnMessage({
            type: "set-scope",
            requestId: "scope-request-2",
            allowEditVariable: false,
            allowEditStyle: true,
        });

        expect(pluginMessages).toEqual([{
            type: "scope-ready",
            requestId: "scope-request-2",
            pluginVersion: TEST_PLUGIN_VERSION,
        }]);
        expect(scopeReadyStateSnapshots).toHaveLength(1);
        expect(scopeReadyStateSnapshots[0]).toMatchObject({
            scopeRootId: null,
            allowEditNode: false,
            allowEditVariable: false,
            allowEditStyle: true,
        });
    });
});

class FakeClassList {
    private readonly values = new Set<string>();

    add(...names: string[]) {
        for (const name of names) this.values.add(name);
    }

    remove(...names: string[]) {
        for (const name of names) this.values.delete(name);
    }
}

class FakeElement {
    readonly classList = new FakeClassList();
    readonly style: Record<string, string> = {};
    readonly listeners = new Map<string, (event: any) => void>();
    value = "";
    checked = false;
    disabled = false;
    textContent = "";
    innerHTML = "";
    className = "";
    placeholder = "";
    onclick: ((event?: any) => void) | null = null;

    constructor(readonly id: string) {}

    addEventListener(type: string, listener: (event: any) => void) {
        this.listeners.set(type, listener);
    }

    click() {
        this.onclick?.({ target: this });
    }

    select() {}
}

function createUiHarness(script: string) {
    const elements = new Map<string, FakeElement>();
    const getElement = (id: string) => {
        let element = elements.get(id);
        if (!element) {
            element = new FakeElement(id);
            elements.set(id, element);
        }
        return element;
    };

    getElement("port").value = "3055";
    getElement("scope-link").value = "";

    const documentStub = {
        getElementById: (id: string) => getElement(id),
        querySelectorAll: () => [] as FakeElement[],
        createElement: (tag: string) => new FakeElement(tag),
        execCommand: () => true,
        body: {
            appendChild: () => {},
            removeChild: () => {},
        },
    };

    const windowListeners = new Map<string, (event: any) => void>();
    const windowStub: any = {
        onmessage: null,
        addEventListener: (type: string, listener: (event: any) => void) => {
            windowListeners.set(type, listener);
        },
        open: () => {},
    };

    const parentMessages: any[] = [];
    const parentStub = {
        postMessage: (message: any) => {
            parentMessages.push(message);
        },
    };

    const sockets: MockWebSocket[] = [];
    class MockWebSocket {
        onopen: ((event?: any) => void) | null = null;
        onmessage: ((event: { data: string }) => void) | null = null;
        onclose: ((event?: any) => void) | null = null;
        onerror: ((event?: any) => void) | null = null;
        readonly sent: string[] = [];
        closed = false;

        constructor(readonly url: string) {
            sockets.push(this);
        }

        send(message: string) {
            this.sent.push(message);
        }

        close() {
            if (this.closed) return;
            this.closed = true;
            this.onclose?.({ type: "close" });
        }
    }

    const quietConsole = {
        log: () => {},
        error: () => {},
        warn: () => {},
    };
    const execute = new Function(
        "document",
        "window",
        "parent",
        "WebSocket",
        "console",
        "setTimeout",
        "clearTimeout",
        `${script}\nreturn { state };`,
    );
    const runtime = execute(
        documentStub,
        windowStub,
        parentStub,
        MockWebSocket,
        quietConsole,
        () => 1,
        () => {},
    ) as { state: any };

    return {
        elements,
        parentMessages,
        runtime,
        sockets,
        windowStub,
    };
}

const uiHtml = await readFile("figma_plugin/ui.html", "utf8");
const inlineScript = uiHtml.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if (!inlineScript) {
    throw new Error("figma_plugin/ui.html inline script was not found");
}

function clickAndReadScopeRequest(harness: ReturnType<typeof createUiHarness>) {
    const connectButton = harness.elements.get("btn-connect");
    expect(connectButton).toBeDefined();
    connectButton!.click();

    expect(harness.parentMessages).toHaveLength(1);
    const request = harness.parentMessages[0].pluginMessage;
    expect(request.type).toBe("set-scope");
    expect(typeof request.requestId).toBe("string");
    expect(request.requestId.length).toBeGreaterThan(0);
    return request;
}

function deliverScopeReady(
    harness: ReturnType<typeof createUiHarness>,
    requestId: string,
    pluginVersion = "2.3.3",
) {
    harness.windowStub.onmessage({
        data: {
            pluginMessage: {
                type: "scope-ready",
                requestId,
                pluginVersion,
            },
        },
    });
}

describe("Phase 9 Q11: executable plugin UI handshake", () => {
    it("opens no socket before the matching one-shot acknowledgement", () => {
        const harness = createUiHarness(inlineScript);
        const request = clickAndReadScopeRequest(harness);

        expect(harness.sockets).toHaveLength(0);
        expect(harness.runtime.state.pendingScopeRequest).toMatchObject({
            requestId: request.requestId,
            port: 3055,
        });

        deliverScopeReady(harness, "stray-request");
        expect(harness.sockets).toHaveLength(0);

        deliverScopeReady(harness, request.requestId);
        expect(harness.sockets).toHaveLength(1);
        expect(harness.runtime.state.pendingScopeRequest).toBeNull();

        deliverScopeReady(harness, request.requestId);
        expect(harness.sockets).toHaveLength(1);

        const socket = harness.sockets[0];
        expect(socket.url).toBe("ws://localhost:3055");
        socket.onopen?.();
        expect(socket.sent).toHaveLength(1);
        expect(JSON.parse(socket.sent[0])).toEqual({
            type: "join",
            channel: expect.any(String),
            clientType: "plugin",
            pluginVersion: "2.3.3",
        });
    });

    it("keeps a coded join refusal visible after the socket closes", () => {
        const harness = createUiHarness(inlineScript);
        const request = clickAndReadScopeRequest(harness);
        deliverScopeReady(harness, request.requestId);

        const socket = harness.sockets[0];
        socket.onopen?.();
        socket.onmessage?.({
            data: JSON.stringify({
                type: "join_error",
                code: "PLUGIN_PEER_AMBIGUOUS",
                message: "Two plugin peers are waiting in this channel.",
            }),
        });

        const status = harness.elements.get("connection-status");
        expect(socket.closed).toBe(true);
        expect(harness.runtime.state.socket).toBeNull();
        expect(status?.innerHTML).toContain("Join failed (PLUGIN_PEER_AMBIGUOUS)");
        expect(status?.innerHTML).toContain("Two plugin peers are waiting");
    });
});
