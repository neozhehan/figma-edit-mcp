import { getPluginState } from '../src/main.js';
import { buildPathArray, countDescendants } from '../utils/nodeUtils.js';

export async function getConnectPayload() {
    try {
        const state = getPluginState();

        const basePayload = {
            allowEditNode: state.allowEditNode,
            allowEditVariable: state.allowEditVariable,
            allowEditStyle: state.allowEditStyle,
            editableScopeType: state.allowEditNode || "readonly",
            documentId: figma.root.id,
            documentName: figma.root.name,
        };

        if (!state.allowEditNode) {
            const pages = figma.root.children.map(page => ({
                pageId: page.id,
                pageName: page.name
            }));

            // Read-only mode: no descendantCount (pages are not loaded)
            return Object.assign({}, basePayload, {
                pageCount: figma.root.children.length,
                pages
            });
        }

        if (state.scopeRootId) {
            const scopeNode = await figma.getNodeByIdAsync(state.scopeRootId);

            if (!scopeNode) {
                return {
                    errorCode: "SCOPE_DELETED",
                    errorMessage: "The node previously set as the editable scope no longer exists. Disconnect the plugin and select a new editable scope via the 'Link to Selection' field."
                };
            }

            if (state.allowEditNode === "page") {
                try {
                    await (scopeNode as PageNode).loadAsync();
                } catch (e: any) {
                    return {
                        errorCode: "DOCUMENT_LOAD_FAILED",
                        errorMessage: "Failed to load the Figma document's pages. The file may be too large or temporarily unavailable. Retry shortly."
                    };
                }

                const children = ('children' in scopeNode ? scopeNode.children : []).map((child: any) => ({
                    id: child.id,
                    name: child.name,
                    type: child.type
                }));

                return Object.assign({}, basePayload, {
                    pageCount: figma.root.children.length,
                    pages: [{
                        pageId: scopeNode.id,
                        pageName: scopeNode.name,
                        descendantCount: countDescendants(scopeNode),
                        children
                    }]
                });
            } else if (state.allowEditNode === "node") {
                let children: any[] = [];
                if ('children' in scopeNode) {
                    children = (scopeNode as any).children.map((child: any) => ({
                        id: child.id,
                        name: child.name,
                        type: child.type
                    }));
                }

                // v1.4.0: Replace 5 legacy fields with path array + descendantCount
                return Object.assign({}, basePayload, {
                    node: {
                        nodeId: scopeNode.id,
                        nodeName: scopeNode.name,
                        type: scopeNode.type,
                        path: buildPathArray(scopeNode),
                        descendantCount: countDescendants(scopeNode),
                        children
                    }
                });
            }
        }

        return {
            errorCode: "SCOPE_INVALID",
            errorMessage: "The plugin reported an unrecognized editable scope state. Disconnect and reconnect the plugin to reset its scope."
        };

    } catch (e: any) {
        return {
            errorCode: "UNKNOWN_ERROR",
            errorMessage: `An unexpected error occurred while joining the channel: ${e.message || String(e)}.`
        };
    }
}
