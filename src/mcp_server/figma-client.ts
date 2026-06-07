import { WebSocket as WsWebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import { normalizeNodeId, normalizeNodeIds } from "./utils.js";
import { logger } from "./logger.js";

// Prefer the runtime's native WebSocket (bun, and node >= 22) over the `ws`
// package's client. The `ws` client mishandles the HTTP 101 upgrade under bun:
// it surfaces the *successful* handshake as "Unexpected server response: 101",
// drops the connection, and reconnect-loops forever. The native WebSocket
// handles the upgrade correctly. Fall back to `ws` on older node (20/21) that
// lack a global WebSocket. We drive it through the browser-style event API
// (addEventListener / event.data), which both implementations support.
const WSImpl: any = (globalThis as any).WebSocket ?? WsWebSocket;
const WS_OPEN = 1; // WebSocket.OPEN === 1 in every implementation

// Define TypeScript interfaces for Figma responses
export interface FigmaResponse {
    id: string;
    result?: any;
    error?: string;
}

// Define interface for command progress updates
export interface CommandProgressUpdate {
    type: 'command_progress';
    commandId: string;
    commandType: string;
    status: 'started' | 'in_progress' | 'completed' | 'error';
    progress: number;
    totalItems: number;
    processedItems: number;
    currentChunk?: number;
    totalChunks?: number;
    chunkSize?: number;
    message: string;
    payload?: any;
    timestamp: number;
}

// Update the getInstanceOverridesResult interface to match the plugin implementation
export interface getInstanceOverridesResult {
    success: boolean;
    message: string;
    sourceInstanceId: string;
    mainComponentId: string;
    overridesCount: number;
}

export interface setInstanceOverridesResult {
    success: boolean;
    message: string;
    totalCount?: number;
    results?: Array<{
        success: boolean;
        instanceId: string;
        instanceName: string;
        appliedCount?: number;
        message?: string;
    }>;
}

// Command strings accepted by sendCommandToFigma: the v2.0.0 dot-notation tool
// commands plus the two internal transport commands (`join`, `get_connect_payload`).
// Keep in sync with the tool registrations (src/mcp_server/tools/*) and the plugin
// command router (figma_plugin/src/main.ts). Note: the `channel.join` tool is not a
// wire command — it calls joinChannel(), which sends `join`.
export type FigmaCommand =
    // transport / internal
    | "join"
    | "get_connect_payload"
    // page
    | "page.info"
    // node
    | "node.info"
    | "node.transform"
    | "node.rename"
    | "node.delete"
    | "node.clone"
    | "node.select"
    | "node.group"
    | "node.ungroup"
    | "node.flatten"
    | "node.insert_child"
    | "node.set_auto_layout"
    | "node.set_fill"
    | "node.set_stroke"
    | "node.set_corner_radius"
    | "node.set_effects"
    | "node.apply_style"
    | "node.bind_variable"
    | "node.export_visual"
    // create
    | "create.shape"
    | "create.frame"
    | "create.text"
    | "create.svg"
    | "create.component"
    | "create.instance"
    | "create.component_set"
    | "create.connection"
    // style
    | "style.list"
    | "style.manage"
    | "style.delete"
    // text
    | "text.set_content"
    | "text.set_style"
    // component
    | "component.list"
    | "component.manage_property"
    | "component.delete_property"
    // instance
    | "instance.set_property"
    | "instance.get_overrides"
    | "instance.set_overrides"
    // variable
    | "variable.list"
    | "variable.manage"
    | "variable.delete"
    // annotation
    | "annotation.list"
    | "annotation.set"
    // reaction
    | "reaction.list"
    | "reaction.update";

// State management
let ws: any = null;
let currentChannel: string | null = null;
let wsUrl: string = 'ws://localhost:3055'; // Default
let defaultPort: number = 3055;

const pendingRequests = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
    timeout: ReturnType<typeof setTimeout>;
    lastActivity: number;
}>();

export function setFigmaServerUrl(url: string) {
    wsUrl = url;
}

export function connectToFigma(port: number = defaultPort) {
    // If already connected, do nothing
    if (ws && ws.readyState === WS_OPEN) {
        logger.info('Already connected to Figma');
        return;
    }

    // If port is passed, and we are on localhost default, append it.
    // The logic in server.ts: const wsUrl = serverUrl === 'localhost' ? `${WS_URL}:${port}` : WS_URL;
    // Here wsUrl should already be constructed properly or we construct it.
    // To match server.ts logic exactly:
    let finalUrl = wsUrl;
    if (wsUrl.startsWith('ws://localhost') || wsUrl.startsWith('ws://127.0.0.1')) {
        // Check if it already has port
        const hasPort = wsUrl.split(':').length > 2;
        if (!hasPort) {
            finalUrl = `${wsUrl}:${port}`;
        }
    }

    logger.info(`Connecting to Figma socket server at ${finalUrl}...`);
    ws = new WSImpl(finalUrl);

    ws.addEventListener('open', () => {
        logger.info('Connected to Figma socket server');
        // Reset channel on new connection
        currentChannel = null;
    });

    ws.addEventListener("message", (event: any) => {
        try {
            interface ProgressMessage {
                message: FigmaResponse | any;
                type?: string;
                id?: string;
                [key: string]: any;
            }

            // event.data is a string for text frames under native WebSocket; the
            // `ws` package may hand back a Buffer — normalize to a string either way.
            const raw = typeof event.data === "string"
                ? event.data
                : (event.data?.toString?.() ?? String(event.data));
            const json = JSON.parse(raw) as ProgressMessage;

            // Handle join_error
            if (json.type === 'join_error') {
                const requestId = json.id || '';
                if (requestId && pendingRequests.has(requestId)) {
                    const request = pendingRequests.get(requestId)!;
                    clearTimeout(request.timeout);
                    
                    const error = new Error(json.message as string);
                    (error as any).joinErrorCode = json.code;
                    request.reject(error);
                    
                    pendingRequests.delete(requestId);
                }
                return;
            }

            // Handle progress updates
            if (json.type === 'progress_update') {
                const progressData = json.message.data as CommandProgressUpdate;
                const requestId = json.id || '';

                if (requestId && pendingRequests.has(requestId)) {
                    const request = pendingRequests.get(requestId)!;

                    // Update last activity timestamp
                    request.lastActivity = Date.now();

                    // Reset the timeout to prevent timeouts during long-running operations
                    clearTimeout(request.timeout);

                    // Create a new timeout
                    request.timeout = setTimeout(() => {
                        if (pendingRequests.has(requestId)) {
                            logger.error(`Request ${requestId} timed out after extended period of inactivity`);
                            pendingRequests.delete(requestId);
                            request.reject(new Error('Request to Figma timed out'));
                        }
                    }, 60000); // 60 second timeout for inactivity

                    // Log progress
                    logger.info(`Progress update for ${progressData.commandType}: ${progressData.progress}% - ${progressData.message}`);

                    // For completed updates:
                    if (progressData.status === 'completed' && progressData.progress === 100) {
                        logger.info(`Operation ${progressData.commandType} completed, waiting for final result`);
                    }
                }
                return;
            }

            // Handle regular responses
            const myResponse = json.message;
            logger.debug(`Received message: ${JSON.stringify(myResponse)}`);
            // logger.log('myResponse' + JSON.stringify(myResponse)); // Removed extra log

            // Handle response to a request
            if (
                myResponse.id &&
                pendingRequests.has(myResponse.id) &&
                (myResponse.result !== undefined || myResponse.error !== undefined) // Checks result or error presence
            ) {
                const request = pendingRequests.get(myResponse.id)!;
                clearTimeout(request.timeout);

                if (myResponse.error) {
                    logger.error(`Error from Figma: ${myResponse.error}`);
                    request.reject(new Error(myResponse.error));
                } else {
                    request.resolve(myResponse.result);
                }

                pendingRequests.delete(myResponse.id);
            } else {
                // Handle broadcast messages or events
                logger.info(`Received broadcast message: ${JSON.stringify(myResponse)}`);
            }
        } catch (error) {
            logger.error(`Error parsing message: ${error instanceof Error ? error.message : String(error)}`);
        }
    });

    ws.addEventListener('error', (event: any) => {
        const detail = event?.message ?? event?.error ?? event?.type ?? event;
        logger.error(`Socket error: ${detail}`);
    });

    ws.addEventListener('close', () => {
        logger.info('Disconnected from Figma socket server');
        ws = null;

        // Reject all pending requests
        for (const [id, request] of pendingRequests.entries()) {
            clearTimeout(request.timeout);
            request.reject(new Error("Connection closed"));
            pendingRequests.delete(id);
        }

        // Attempt to reconnect. unref() so a pending reconnect alone never
        // keeps the process alive — when the MCP host disconnects, the server
        // must be free to exit instead of lingering as an orphan that spins
        // this loop forever (see server.ts shutdown wiring).
        const reconnectTimer = setTimeout(() => connectToFigma(port), 2000);
        reconnectTimer.unref?.();
    });
}

export function resetChannel() {
    currentChannel = null;
}

export async function joinChannel(channelName: string): Promise<void> {
    if (!ws || ws.readyState !== WS_OPEN) {
        throw new Error("Not connected to Figma");
    }

    try {
        await sendCommandToFigma("join", { channel: channelName });
        currentChannel = channelName;
        logger.info(`Joined channel: ${channelName}`);
    } catch (error) {
        logger.error(`Failed to join channel: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
    }
}

export function sendCommandToFigma(
    command: FigmaCommand,
    params: unknown = {},
    timeoutMs: number = 30000
): Promise<unknown> {
    return new Promise((resolve, reject) => {
        // If not connected, try to connect first
        if (!ws || ws.readyState !== WS_OPEN) {
            connectToFigma();
            reject(new Error("Not connected to Figma. Attempting to connect..."));
            return;
        }

        // Check if we need a channel for this command
        const requiresChannel = command !== "join";
        if (requiresChannel && !currentChannel) {
            reject(new Error("Must join a channel before sending commands"));
            return;
        }

        const id = uuidv4();

        // Normalize node IDs in params (convert URL format to API format)
        const normalizedParams = { ...(params as any) };

        // Handle single nodeId parameter
        if (normalizedParams.nodeId) {
            normalizedParams.nodeId = normalizeNodeId(normalizedParams.nodeId);
        }

        // Handle nodeIds array parameter
        if (normalizedParams.nodeIds) {
            normalizedParams.nodeIds = normalizeNodeIds(normalizedParams.nodeIds);
        }

        // Handle sourceInstanceId (used in set_instance_overrides)
        if (normalizedParams.sourceInstanceId) {
            normalizedParams.sourceInstanceId = normalizeNodeId(normalizedParams.sourceInstanceId);
        }

        // Handle targetNodeIds array (used in set_instance_overrides) - DEPRECATED
        if (normalizedParams.targetNodeIds) {
            normalizedParams.targetNodeIds = normalizeNodeIds(normalizedParams.targetNodeIds);
        }

        // Handle nodes array (used in delete_multiple_nodes)
        if (normalizedParams.nodes && Array.isArray(normalizedParams.nodes)) {
            normalizedParams.nodes = normalizedParams.nodes.map((item: any) => ({
                ...item,
                nodeId: normalizeNodeId(item.nodeId) || item.nodeId
            }));
        }

        // Handle targetNodes array (used in set_instance_overrides)
        if (normalizedParams.targetNodes && Array.isArray(normalizedParams.targetNodes)) {
            normalizedParams.targetNodes = normalizedParams.targetNodes.map((item: any) => ({
                ...item,
                nodeId: normalizeNodeId(item.nodeId) || item.nodeId
            }));
        }

        // Handle parentId parameter
        if (normalizedParams.parentId) {
            normalizedParams.parentId = normalizeNodeId(normalizedParams.parentId);
        }

        // Handle connections array (used in create_connections)
        if (normalizedParams.connections && Array.isArray(normalizedParams.connections)) {
            normalizedParams.connections = normalizedParams.connections.map((conn: any) => ({
                ...conn,
                startNodeId: normalizeNodeId(conn.startNodeId) || conn.startNodeId,
                endNodeId: normalizeNodeId(conn.endNodeId) || conn.endNodeId
            }));
        }

        // Handle text array for set_multiple_text_contents
        if (normalizedParams.text && Array.isArray(normalizedParams.text)) {
            normalizedParams.text = normalizedParams.text.map((item: any) => ({
                ...item,
                nodeId: normalizeNodeId(item.nodeId) || item.nodeId
            }));
        }

        // Handle annotations array for set_multiple_annotations
        if (normalizedParams.annotations && Array.isArray(normalizedParams.annotations)) {
            normalizedParams.annotations = normalizedParams.annotations.map((annotation: any) => ({
                ...annotation,
                nodeId: normalizeNodeId(annotation.nodeId) || annotation.nodeId
            }));
        }

        const request = {
            id,
            type: command === "join" ? "join" : "message",
            ...(command === "join"
                ? { channel: normalizedParams.channel, clientType: "mcp" }
                : { channel: currentChannel }),
            message: {
                id,
                command,
                params: {
                    ...normalizedParams,
                    commandId: id, // Include the command ID in params
                },
            },
        };

        // Set timeout for request
        const timeout = setTimeout(() => {
            if (pendingRequests.has(id)) {
                pendingRequests.delete(id);
                reject(new Error(`Request timed out after ${timeoutMs}ms`));
            }
        }, timeoutMs);

        pendingRequests.set(id, {
            resolve,
            reject,
            timeout,
            lastActivity: Date.now()
        });

        try {
            ws.send(JSON.stringify(request));
            logger.debug(`Sent command: ${command}`);
        } catch (error) {
            pendingRequests.delete(id);
            reject(error);
        }
    });
}
