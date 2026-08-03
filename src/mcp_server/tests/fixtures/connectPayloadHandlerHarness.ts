type Scenario = "failure" | "timeout";

const scenario = process.argv[2] as Scenario | undefined;
if (scenario !== "failure" && scenario !== "timeout") {
    throw new Error(`Expected "failure" or "timeout", received ${String(scenario)}`);
}

const scopePage: any = {
    id: scenario === "failure" ? "page-scope" : "page-slow",
    name: scenario === "failure" ? "Scope Page" : "Slow Page",
    type: "PAGE",
    children: [],
    loadAsync: scenario === "failure"
        ? async () => { throw new Error("scope page unavailable"); }
        : () => new Promise<void>(() => { }),
};
const root: any = {
    id: "doc-1",
    name: "Doc",
    type: "DOCUMENT",
    children: [scopePage],
};
scopePage.parent = root;

(globalThis as any).__html__ = "<html></html>";
(globalThis as any).figma = {
    showUI: () => { },
    ui: { onmessage: null, postMessage: () => { } },
    on: () => { },
    notify: () => { },
    closePlugin: () => { },
    clientStorage: { setAsync: async () => { } },
    getNodeByIdAsync: async (id: string) => id === scopePage.id ? scopePage : null,
    currentPage: scopePage,
    root,
    mixed: Symbol("mixed"),
    loadAllPagesAsync: async () => { },
};

// Importing the plugin entrypoint is intentional: the parent regression runs
// this fixture in a subprocess so main.js's UI bindings cannot pollute another
// test file, while getConnectPayload still reads the real module-owned state.
const mainMod: any = await import("../../../../figma_plugin/src/main.js");
const state: any = mainMod.getPluginState();
state.allowEditNode = "page";
state.scopeRootId = scopePage.id;
state.allowEditVariable = false;
state.allowEditStyle = false;

const { getConnectPayload } =
    await import("../../../../figma_plugin/handlers/connectHandlers.js");
const { createPageLoadCoordinator } =
    await import("../../../../figma_plugin/utils/pageLoad.js");
const payload = await getConnectPayload(
    createPageLoadCoordinator(scenario === "timeout" ? 5 : undefined),
);

process.stdout.write(`__CONNECT_PAYLOAD__${JSON.stringify(payload)}\n`);
