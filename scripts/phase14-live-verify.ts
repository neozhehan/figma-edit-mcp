import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as wait } from "node:timers/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import WebSocket from "ws";
import {
    FigmaError,
    connectToFigma,
    joinChannel as joinRawChannel,
    resetChannel as resetRawChannel,
    sendCommandToFigma,
} from "../src/mcp_server/figma-client.js";
import { logger } from "../src/mcp_server/logger.js";

// The raw-client probes intentionally traverse the same verbose socket path as
// production. Keep this standalone verifier's stdout reserved for its compact
// evidence report; assertion failures still include the returned payload.
Object.assign(logger, {
    info: () => {}, debug: () => {}, warn: () => {}, error: () => {}, log: () => {},
});

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const serverPath = resolve(process.argv[2] ?? resolve(repoRoot, "dist/server.js"));
const channel = process.argv[3] ?? "2g4h";
const port = Number(process.argv[4] ?? "3055");
const runId = `p14-${Date.now().toString(36)}`;
const legacyBatchKeys = [
    "nodesDeleted", "nodesFailed", "replacementsApplied", "replacementsFailed",
    "annotationsApplied", "annotationsFailed", "totalCount", "totalNodes",
    "totalReplacements", "totalAnnotations",
];

type AnyRecord = Record<string, any>;
type LiveClient = { client: Client; transport: StdioClientTransport };

const evidence: AnyRecord[] = [];
const record = (name: string, details: AnyRecord = {}) => evidence.push({ name, ...details });
let operationNumber = 0;

function structured(result: any): AnyRecord {
    return (result?.structuredContent ?? {}) as AnyRecord;
}

function resultText(result: any): string {
    return Array.isArray(result?.content)
        ? result.content.map((item: any) => item?.text ?? "").join("\n")
        : "";
}

async function openClient(name: string): Promise<LiveClient> {
    const transport = new StdioClientTransport({
        command: "node",
        args: [serverPath, "--port", String(port)],
        cwd: repoRoot,
        stderr: "pipe",
    });
    // The server logs its socket traffic on stderr. Keep it drained but out of
    // the evidence stream; failed assertions below retain the actual tool result.
    transport.stderr?.on("data", () => {});
    const client = new Client({ name, version: "1.0.0" });
    await client.connect(transport);
    await wait(700);
    return { client, transport };
}

async function call(client: Client, name: string, args: AnyRecord = {}): Promise<any> {
    const current = ++operationNumber;
    process.stderr.write(`[live ${current}] ${name} start\n`);
    const result = await client.callTool(
        { name, arguments: args },
        undefined,
        { timeout: 180_000 },
    );
    process.stderr.write(`[live ${current}] ${name} done\n`);
    return result;
}

async function success(client: Client, name: string, args: AnyRecord = {}): Promise<AnyRecord> {
    const result = await call(client, name, args);
    assert.equal(result.isError, undefined, `${name} failed: ${resultText(result)}`);
    const payload = structured(result);
    assert.equal(payload?.error, undefined, `${name} returned an error envelope: ${JSON.stringify(payload)}`);
    return payload;
}

async function expectSchemaRefusal(
    client: Client,
    name: string,
    args: AnyRecord,
    requiredText: string,
): Promise<void> {
    const result = await call(client, name, args);
    const text = resultText(result);
    assert.equal(result.isError, true, `${name} should have been refused at the MCP boundary`);
    assert.match(text, /MCP error -32602/);
    assert.match(text, /Input validation error/);
    assert.ok(text.includes(requiredText), `${name} validation did not name ${requiredText}: ${text}`);
}

async function expectCodedRefusal(
    client: Client,
    name: string,
    args: AnyRecord,
    code: string,
): Promise<AnyRecord> {
    const result = await call(client, name, args);
    assert.equal(result.isError, true, `${name} should have returned coded refusal ${code}`);
    const error = structured(result).error;
    assert.equal(error?.code, code, `${name} returned ${JSON.stringify(error)}`);
    return error;
}

function assertBatch(payload: AnyRecord, ids: string[]): void {
    assert.equal(payload.success, true);
    assert.equal(payload.status, "success");
    assert.equal(payload.requestedCount, ids.length);
    assert.equal(payload.succeededCount, ids.length);
    assert.equal(payload.failedCount, 0);
    assert.equal(payload.skippedCount, 0);
    assert.deepEqual(payload.results.map((row: AnyRecord) => row.nodeId), ids);
    for (const row of payload.results) {
        assert.equal(row.status, "success");
        assert.equal(typeof row.nodeId, "string");
    }
    for (const key of legacyBatchKeys) assert.equal(payload[key], undefined, `legacy key survived: ${key}`);
}

function dashId(id: string): string {
    return id.replace(":", "-");
}

async function expectRawCode(
    command: string,
    params: AnyRecord,
    code: string,
): Promise<FigmaError> {
    try {
        await sendCommandToFigma(command, params);
    } catch (error: any) {
        assert.equal(error?.code, code, `${command} returned ${error?.code}: ${error?.message}`);
        return error;
    }
    assert.fail(`${command} should have failed with ${code}`);
}

class RawPeer {
    readonly socket: WebSocket;
    private readonly queue: any[] = [];
    private readonly listeners: Array<() => void> = [];

    constructor(url: string) {
        this.socket = new WebSocket(url);
        this.socket.on("message", (data) => {
            try { this.queue.push(JSON.parse(data.toString())); } catch { return; }
            for (const listener of this.listeners.splice(0)) listener();
        });
    }

    async open(): Promise<void> {
        await new Promise<void>((resolveOpen, rejectOpen) => {
            this.socket.once("open", () => resolveOpen());
            this.socket.once("error", rejectOpen);
        });
        await this.next((message) => message?.type === "system" && typeof message?.peerId === "string");
    }

    send(message: AnyRecord): void {
        this.socket.send(JSON.stringify(message));
    }

    async next(predicate: (message: any) => boolean, timeoutMs = 1800): Promise<any> {
        const take = () => {
            const index = this.queue.findIndex(predicate);
            return index === -1 ? undefined : this.queue.splice(index, 1)[0];
        };
        const immediate = take();
        if (immediate !== undefined) return immediate;
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            await new Promise<void>((resolveWait) => {
                const timer = setTimeout(resolveWait, Math.min(80, Math.max(1, deadline - Date.now())));
                this.listeners.push(() => { clearTimeout(timer); resolveWait(); });
            });
            const found = take();
            if (found !== undefined) return found;
        }
        throw new Error("raw peer message timeout");
    }

    async close(): Promise<void> {
        if (this.socket.readyState === WebSocket.CLOSED) return;
        await new Promise<void>((resolveClose) => {
            this.socket.once("close", () => resolveClose());
            this.socket.close();
            setTimeout(resolveClose, 300);
        });
    }
}

async function rawPluginDefense(): Promise<void> {
    connectToFigma(port);
    await wait(700);
    await joinRawChannel(channel);
    try {
        // Use pre-existing dedicated-file fixtures for refusal probes. These raw
        // calls bypass the MCP schema specifically to reach the plugin's
        // defense-in-depth gates, and none can mutate by contract.
        const listedVariables = await sendCommandToFigma("variable_list", {});
        const variable = listedVariables.variables?.[0];
        const collection = listedVariables.collections?.[0];
        assert.ok(variable, "the MCP Test fixture needs at least one local variable");
        assert.ok(collection, "the MCP Test fixture needs at least one local variable collection");
        await expectRawCode("variable_manage", {
            action: "UPDATE_VARIABLE",
            variableId: variable.id,
            description: "must not apply",
        }, "VARIABLE_NAME_MISSING");
        await expectRawCode("variable_manage", {
            action: "CREATE_VARIABLE",
            collectionId: collection.id,
            name: `${runId} rejected missing collection name`,
            type: "STRING",
            scopes: ["TEXT_CONTENT"],
        }, "COLLECTION_NAME_MISSING");
        await expectRawCode("variable_manage", {
            action: "CREATE_VARIABLE",
            collectionId: collection.id,
            collectionName: collection.name,
            name: `${runId} rejected missing scopes`,
            type: "STRING",
        }, "VARIABLE_SCOPES_MISSING");

        const listedStyles = await sendCommandToFigma("style_list", {});
        const style = [
            ...(listedStyles.colors ?? []).map((candidate: AnyRecord) => ({ ...candidate, styleType: "PAINT" })),
            ...(listedStyles.texts ?? []).map((candidate: AnyRecord) => ({ ...candidate, styleType: "TEXT" })),
            ...(listedStyles.effects ?? []).map((candidate: AnyRecord) => ({ ...candidate, styleType: "EFFECT" })),
            ...(listedStyles.grids ?? []).map((candidate: AnyRecord) => ({ ...candidate, styleType: "GRID" })),
        ][0];
        assert.ok(style, "the MCP Test fixture needs at least one local style");
        await expectRawCode("style_manage", {
            type: style.styleType,
            styleId: style.id,
            description: "must not apply",
        }, "STYLE_NAME_MISSING");
        record("plugin defense-in-depth refusals", {
            codes: [
                "VARIABLE_NAME_MISSING", "COLLECTION_NAME_MISSING",
                "VARIABLE_SCOPES_MISSING", "STYLE_NAME_MISSING",
            ],
            existingVariableId: variable.id,
            existingCollectionId: collection.id,
            existingStyleId: style.id,
        });
    } finally {
        await resetRawChannel().catch(() => {});
        await wait(200);
    }
}

async function main(): Promise<void> {
    await rawPluginDefense();

    const primary = await openClient("phase14-live-primary");
    let secondary: LiveClient | undefined;
    let outer: AnyRecord | undefined;
    let style: AnyRecord | undefined;
    let collection: AnyRecord | undefined;
    let variable: AnyRecord | undefined;
    let pageId = "";
    let pageName = "";
    let baselineDescendants = -1;
    let baselineTopLevel = -1;
    let baselineVariableCount = -1;
    let baselineCollectionCount = -1;
    let baselineStyleCounts: number[] = [];

    try {
        const inventory = await primary.client.listTools();
        const prompts = await primary.client.listPrompts();
        const toolNames = inventory.tools.map((tool) => tool.name);
        const promptNames = prompts.prompts.map((prompt) => prompt.name);
        assert.equal(toolNames.length, 45);
        assert.equal(toolNames.includes("create_connection"), false);
        assert.equal(promptNames.includes("reaction_to_connector_strategy"), false);
        for (const retained of ["reaction_list", "reaction_update"]) assert.ok(toolNames.includes(retained));
        assert.ok(promptNames.includes("swap_overrides_instances"));

        const joined = structured(await call(primary.client, "channel_join", { channel }));
        assert.equal(joined.status, "success", JSON.stringify(joined));
        assert.equal(joined.channel, channel);
        assert.equal(joined.serverVersion, "2.3.3");
        assert.equal(joined.pluginVersion, "2.3.3");
        assert.equal(joined.documentName, "MCP Test");
        assert.equal(joined.allowEditNode, "page");
        assert.equal(joined.allowEditVariable, true);
        assert.equal(joined.allowEditStyle, true);
        pageId = joined.pages[0].pageId;
        pageName = joined.pages[0].pageName;
        record("channel join and inventory", {
            channel, serverVersion: joined.serverVersion, pluginVersion: joined.pluginVersion,
            tools: toolNames.length, documentName: joined.documentName,
        });

        const baselinePage = await success(primary.client, "page_info", { pageIds: [pageId] });
        baselineDescendants = baselinePage.pages[0].descendantCount;
        baselineTopLevel = baselinePage.pages[0].children.length;
        assert.equal(baselinePage.coverage.complete, true);
        const pageNode = await success(primary.client, "node_info", { nodeIds: [pageId], maxDepth: 0 });
        assert.equal(pageNode.nodes[0].name, pageName);
        const baselineVariables = await success(primary.client, "variable_list", {});
        baselineVariableCount = baselineVariables.variables.length;
        baselineCollectionCount = baselineVariables.collections.length;
        const baselineStyles = await success(primary.client, "style_list", {});
        baselineStyleCounts = [baselineStyles.colors.length, baselineStyles.texts.length, baselineStyles.effects.length, baselineStyles.grids.length];
        const baselineTree = await success(primary.client, "node_info", {
            nodeIds: [pageId], maxDepth: 12,
        });
        const staleNames: string[] = [];
        const visit = (node: AnyRecord): void => {
            if (String(node?.name ?? "").startsWith("p14-")) staleNames.push(node.name);
            for (const child of node?.children ?? []) visit(child);
        };
        visit(baselineTree.nodes[0]);
        for (const candidate of [
            ...baselineVariables.variables,
            ...baselineVariables.collections,
            ...baselineStyles.colors,
            ...baselineStyles.texts,
            ...baselineStyles.effects,
            ...baselineStyles.grids,
        ]) {
            if (String(candidate?.name ?? "").startsWith("p14-")) staleNames.push(candidate.name);
        }
        assert.deepEqual(staleNames, [], `stale Phase 14 artifacts must be removed first: ${staleNames.join(", ")}`);

        // D13 live protocol refusals while the real plugin/MCP pair stays bound.
        secondary = await openClient("phase14-live-secondary");
        let joinResult = structured(await call(secondary.client, "channel_join", { channel }));
        assert.equal(joinResult.status, "error");
        assert.equal(joinResult.errorCode, "CHANNEL_IN_USE");
        const unavailableChannel = `z${runId.slice(-3)}`;
        joinResult = structured(await call(secondary.client, "channel_join", { channel: unavailableChannel }));
        assert.equal(joinResult.status, "error");
        assert.equal(joinResult.errorCode, "PLUGIN_PEER_UNAVAILABLE");

        // Match the production client's localhost resolution exactly. This
        // machine intentionally has separate IPv4 and IPv6 dev listeners on
        // the same port; pinning 127.0.0.1 can probe the listener that does not
        // own the real plugin pair and manufacture a false non-ambiguity.
        const socketUrl = `ws://localhost:${port}`;
        const refusedPlugin = new RawPeer(socketUrl);
        await refusedPlugin.open();
        refusedPlugin.send({
            id: `${runId}-ambiguous`, type: "join", channel,
            clientType: "plugin", pluginVersion: "2.3.3",
        });
        const ambiguous = await refusedPlugin.next((message) => message?.id === `${runId}-ambiguous`);
        assert.equal(ambiguous.type, "join_error");
        assert.equal(ambiguous.code, "PLUGIN_PEER_AMBIGUOUS");
        const silence = refusedPlugin.next((message) => message?.message?.command === "page_info", 350)
            .then(() => false, () => true);
        await success(primary.client, "page_info", { pageIds: [pageId] });
        assert.equal(await silence, true, "refused plugin received pair traffic");
        await refusedPlugin.close();

        const mismatchChannel = `m${runId.slice(-3)}`;
        const mismatchedPlugin = new RawPeer(socketUrl);
        await mismatchedPlugin.open();
        mismatchedPlugin.send({
            id: `${runId}-mismatch-plugin`, type: "join", channel: mismatchChannel,
            clientType: "plugin", pluginVersion: "0.0.0",
        });
        await mismatchedPlugin.next((message) => message?.message?.id === `${runId}-mismatch-plugin`);
        joinResult = structured(await call(secondary.client, "channel_join", { channel: mismatchChannel }));
        assert.equal(joinResult.status, "error");
        assert.equal(joinResult.errorCode, "VERSION_MISMATCH");
        await mismatchedPlugin.close();
        await secondary.client.close();
        secondary = undefined;
        record("peer-bound refusal matrix", {
            codes: ["CHANNEL_IN_USE", "PLUGIN_PEER_UNAVAILABLE", "PLUGIN_PEER_AMBIGUOUS", "VERSION_MISMATCH"],
            refusedPluginPairTraffic: 0,
        });

        outer = await success(primary.client, "create_frame", {
            x: 2400, y: 100, width: 900, height: 900,
            name: `${runId} live root`, parentId: pageId, parentNodeName: pageName,
        });
        assert.equal(outer.parentId, pageId);

        const beforeMismatch = await success(primary.client, "node_info", { nodeIds: [outer.id], maxDepth: 0 });
        const mismatchError = await expectCodedRefusal(primary.client, "create_shape", {
            type: "RECTANGLE", x: 0, y: 0, width: 20, height: 20,
            name: `${runId} must not exist`, parentId: outer.id, parentNodeName: `${outer.name} stale`,
        }, "PARENT_NAME_MISMATCH");
        assert.ok(mismatchError.message.includes("node_info"));
        const afterMismatch = await success(primary.client, "node_info", { nodeIds: [outer.id], maxDepth: 0 });
        assert.equal(afterMismatch.nodes[0].descendantCount, beforeMismatch.nodes[0].descendantCount);

        collection = await success(primary.client, "variable_manage", {
            action: "CREATE_COLLECTION", name: `${runId} sdk collection`,
        });
        await expectSchemaRefusal(primary.client, "variable_manage", {
            action: "CREATE_VARIABLE", collectionId: collection.id,
            name: `${runId} rejected collectionName`, type: "STRING", scopes: ["TEXT_CONTENT"],
        }, "collectionName");
        await expectSchemaRefusal(primary.client, "variable_manage", {
            action: "CREATE_VARIABLE", collectionId: collection.id, collectionName: collection.name,
            name: `${runId} rejected scopes`, type: "STRING",
        }, "scopes");
        variable = await success(primary.client, "variable_manage", {
            action: "CREATE_VARIABLE", collectionId: collection.id, collectionName: collection.name,
            name: `${runId} sdk variable`, type: "STRING", scopes: ["TEXT_CONTENT"],
        });
        await expectSchemaRefusal(primary.client, "variable_manage", {
            action: "UPDATE_VARIABLE", variableId: variable.id, description: "must not apply",
        }, "currentVariableName");

        style = await success(primary.client, "style_manage", {
            type: "PAINT", name: `${runId} sdk style`,
        });
        await expectSchemaRefusal(primary.client, "style_manage", {
            type: "PAINT", styleId: style.id, description: "must not apply",
        }, "currentStyleName");
        const updatedStyle = await success(primary.client, "style_manage", {
            type: "PAINT", styleId: style.id, currentStyleName: style.name,
            description: `${runId} properties-only update`,
        });
        assert.equal(updatedStyle.name, style.name);
        const styleList = await success(primary.client, "style_list", {});
        assert.equal(styleList.colors.find((candidate: AnyRecord) => candidate.id === style!.id)?.name, style.name);
        record("design-system schema and no-rename checks", {
            variableId: variable.id, styleId: style.id, propertiesOnlyName: updatedStyle.name,
        });

        const rectA = await success(primary.client, "create_shape", {
            type: "RECTANGLE", x: 20, y: 20, width: 80, height: 50,
            name: `${runId} rect A`, parentId: outer.id, parentNodeName: outer.name,
        });
        const rectB = await success(primary.client, "create_shape", {
            type: "RECTANGLE", x: 120, y: 20, width: 80, height: 50,
            name: `${runId} rect B`, parentId: outer.id, parentNodeName: outer.name,
        });
        await expectSchemaRefusal(primary.client, "node_delete", { nodes: [] }, "nodes");
        await expectSchemaRefusal(primary.client, "node_delete", {
            nodes: [
                { nodeId: rectA.id, nodeName: rectA.name },
                { nodeId: dashId(rectA.id), nodeName: rectA.name },
            ],
        }, "Duplicate target");

        const textA = await success(primary.client, "create_text", {
            x: 20, y: 100, text: "before A", name: `${runId} text A`,
            parentId: outer.id, parentNodeName: outer.name,
        });
        const textB = await success(primary.client, "create_text", {
            x: 160, y: 100, text: "before B", name: `${runId} text B`,
            parentId: outer.id, parentNodeName: outer.name,
        });
        await expectSchemaRefusal(primary.client, "text_set_content", { text: [] }, "text");
        await expectSchemaRefusal(primary.client, "text_set_content", {
            text: [
                { nodeId: textA.id, nodeName: textA.name, characters: "one" },
                { nodeId: dashId(textA.id), nodeName: textA.name, characters: "two" },
            ],
        }, "Duplicate target");
        const textBatch = await success(primary.client, "text_set_content", {
            text: [
                { nodeId: textA.id, nodeName: textA.name, characters: "after A" },
                { nodeId: textB.id, nodeName: textB.name, characters: "after B" },
            ],
        });
        assertBatch(textBatch, [textA.id, textB.id]);

        const annotationLabels = [`${runId} annotation A`, `${runId} annotation B`];
        const annotationBatch = await success(primary.client, "annotation_set", {
            annotations: [
                { nodeId: rectA.id, nodeName: rectA.name, labelMarkdown: annotationLabels[0] },
                { nodeId: rectB.id, nodeName: rectB.name, labelMarkdown: annotationLabels[1] },
            ],
        });
        assertBatch(annotationBatch, [rectA.id, rectB.id]);
        for (const row of annotationBatch.results) {
            assert.equal(row.beforeCountVerified, true);
            assert.equal(row.afterCountVerified, true);
            assert.equal(row.afterCount, row.beforeCount + 1);
        }
        const annotations = await success(primary.client, "annotation_list", {
            nodeId: outer.id, includeCategories: false,
        });
        assert.equal(annotations.coverage.complete, true);
        const rediscovered = annotations.annotatedNodes
            .flatMap((node: AnyRecord) => node.annotations)
            .map((annotation: AnyRecord) => annotation.labelMarkdown ?? annotation.label);
        for (const label of annotationLabels) assert.ok(rediscovered.includes(label));

        const deleteBatch = await success(primary.client, "node_delete", {
            nodes: [
                { nodeId: rectA.id, nodeName: rectA.name },
                { nodeId: rectB.id, nodeName: rectB.name },
            ],
        });
        assertBatch(deleteBatch, [rectA.id, rectB.id]);
        record("batch and annotation live matrix", {
            textRows: textBatch.results.length, annotationRows: annotationBatch.results.length,
            deleteRows: deleteBatch.results.length, rediscoveredLabels: annotationLabels.length,
        });

        const nested = await success(primary.client, "create_frame", {
            x: 20, y: 180, width: 180, height: 130, name: `${runId} flatten parent`,
            parentId: outer.id, parentNodeName: outer.name,
        });
        const nestedShape = await success(primary.client, "create_shape", {
            type: "ELLIPSE", x: 15, y: 15, width: 50, height: 50,
            name: `${runId} flatten source`, parentId: nested.id, parentNodeName: nested.name,
        });
        const flattened = await success(primary.client, "node_flatten", {
            nodeId: nestedShape.id, nodeName: nestedShape.name,
        });
        const flattenedInfo = await success(primary.client, "node_info", {
            nodeIds: [flattened.id], maxDepth: 0, properties: ["parent"],
        });
        assert.equal(flattenedInfo.nodes[0].properties.parent, nested.id);

        const frameA = await success(primary.client, "create_frame", {
            x: 250, y: 180, width: 120, height: 80, name: `${runId} component A`,
            parentId: outer.id, parentNodeName: outer.name,
        });
        const frameB = await success(primary.client, "create_frame", {
            x: 390, y: 180, width: 120, height: 80, name: `${runId} component B`,
            parentId: outer.id, parentNodeName: outer.name,
        });
        const componentA = await success(primary.client, "create_component", {
            nodeId: frameA.id, nodeName: frameA.name,
        });
        const componentB = await success(primary.client, "create_component", {
            nodeId: frameB.id, nodeName: frameB.name,
        });
        const componentSet = await success(primary.client, "create_component_set", {
            components: [
                { nodeId: componentA.id, nodeName: componentA.name, propertyValues: ["One"] },
                { nodeId: componentB.id, nodeName: componentB.name, propertyValues: ["Two"] },
            ],
            properties: ["State"], componentSetName: `${runId} set`,
            parentId: outer.id, parentNodeName: outer.name,
        });
        assert.equal(componentSet.parentId, outer.id);
        const setInfo = await success(primary.client, "node_info", {
            nodeIds: [componentSet.id], maxDepth: 0, properties: ["parent"],
        });
        assert.equal(setInfo.nodes[0].properties.parent, outer.id);

        const sourceInstance = await success(primary.client, "create_instance", {
            componentId: componentA.id, x: 250, y: 320,
            parentId: outer.id, parentNodeName: outer.name,
        });
        const targetInstance = await success(primary.client, "create_instance", {
            componentId: componentA.id, x: 390, y: 320,
            parentId: outer.id, parentNodeName: outer.name,
        });
        assert.equal(sourceInstance.componentId, componentA.id);
        assert.equal(targetInstance.componentId, componentA.id);
        assert.equal(sourceInstance.parentId, outer.id);
        await expectSchemaRefusal(primary.client, "instance_set_overrides", {
            sourceInstanceId: sourceInstance.id, targetNodes: [],
        }, "targetNodes");
        await expectSchemaRefusal(primary.client, "instance_set_overrides", {
            sourceInstanceId: sourceInstance.id,
            targetNodes: [
                { nodeId: targetInstance.id, nodeName: targetInstance.name },
                { nodeId: dashId(targetInstance.id), nodeName: targetInstance.name },
            ],
        }, "Duplicate target");
        const overrideBatch = await success(primary.client, "instance_set_overrides", {
            sourceInstanceId: sourceInstance.id,
            targetNodes: [{ nodeId: targetInstance.id, nodeName: targetInstance.name }],
        });
        assertBatch(overrideBatch, [targetInstance.id]);
        assert.equal(overrideBatch.totalCount, undefined);
        record("containment, component response, and dynamic-page instance success", {
            flattenedParentId: nested.id, componentSetParentId: componentSet.parentId,
            componentId: sourceInstance.componentId, overrideStatus: overrideBatch.status,
        });

        // Final cleanup, then exact reconciliation against the live baseline.
        await success(primary.client, "style_delete", { styleId: style.id, styleName: style.name });
        style = undefined;
        await success(primary.client, "variable_delete", {
            variableIds: [variable.id], variableNames: [variable.name],
        });
        variable = undefined;
        await success(primary.client, "variable_delete", {
            collectionId: collection.id, collectionName: collection.name,
        });
        collection = undefined;
        await success(primary.client, "node_delete", {
            nodes: [{ nodeId: outer.id, nodeName: outer.name }],
        });
        outer = undefined;

        const finalPage = await success(primary.client, "page_info", { pageIds: [pageId] });
        assert.equal(finalPage.pages[0].descendantCount, baselineDescendants);
        assert.equal(finalPage.pages[0].children.length, baselineTopLevel);
        const finalVariables = await success(primary.client, "variable_list", {});
        assert.equal(finalVariables.variables.length, baselineVariableCount);
        assert.equal(finalVariables.collections.length, baselineCollectionCount);
        assert.equal(finalVariables.variables.some((candidate: AnyRecord) => String(candidate.name).startsWith(runId)), false);
        assert.equal(finalVariables.collections.some((candidate: AnyRecord) => String(candidate.name).startsWith(runId)), false);
        const finalStyles = await success(primary.client, "style_list", {});
        assert.deepEqual(
            [finalStyles.colors.length, finalStyles.texts.length, finalStyles.effects.length, finalStyles.grids.length],
            baselineStyleCounts,
        );
        assert.equal(
            [...finalStyles.colors, ...finalStyles.texts, ...finalStyles.effects, ...finalStyles.grids]
                .some((candidate: AnyRecord) => String(candidate.name).startsWith(runId)),
            false,
        );
        record("exact live reconciliation", {
            descendants: `${baselineDescendants}->${finalPage.pages[0].descendantCount}`,
            topLevel: `${baselineTopLevel}->${finalPage.pages[0].children.length}`,
            variables: `${baselineVariableCount}->${finalVariables.variables.length}`,
            collections: `${baselineCollectionCount}->${finalVariables.collections.length}`,
            styles: `${baselineStyleCounts.join("/")}->${[
                finalStyles.colors.length, finalStyles.texts.length,
                finalStyles.effects.length, finalStyles.grids.length,
            ].join("/")}`,
        });
    } finally {
        if (secondary) await secondary.client.close().catch(() => {});
        if (style) await call(primary.client, "style_delete", { styleId: style.id, styleName: style.name }).catch(() => {});
        if (variable) await call(primary.client, "variable_delete", {
            variableIds: [variable.id], variableNames: [variable.name],
        }).catch(() => {});
        if (collection) await call(primary.client, "variable_delete", {
            collectionId: collection.id, collectionName: collection.name,
        }).catch(() => {});
        if (outer) await call(primary.client, "node_delete", {
            nodes: [{ nodeId: outer.id, nodeName: outer.name }],
        }).catch(() => {});
        await primary.client.close().catch(() => {});
    }

    console.log(JSON.stringify({ ok: true, runId, channel, evidence }, null, 2));
}

main().then(
    () => process.exit(0),
    (error) => {
        console.error(error?.stack ?? error);
        process.exit(1);
    },
);
