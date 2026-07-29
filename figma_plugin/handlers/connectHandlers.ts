import { getPluginState } from '../src/main.js';
import { buildPathArray, countDescendants } from '../utils/nodeUtils.js';
import { UNKNOWN_ERROR } from '../utils/errors.js';
import { createPageLoadCoordinator, PageLoadCoordinator } from '../utils/pageLoad.js';

export async function getConnectPayload(
    pageLoads: PageLoadCoordinator = createPageLoadCoordinator(),
) {
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
                // Change 8 (F3): this was the one page load outside the Phase 10
                // coordinator, and it sits on `channel_join`'s second leg — so a
                // hung load wedged the join itself, which is exactly the failure
                // mode Q12's bounded timeout exists to remove. It now shares the
                // 10s bound and reports the ratified PAGE_LOAD_FAILED /
                // PAGE_LOAD_TIMEOUT codes instead of the hand-rolled
                // `DOCUMENT_LOAD_FAILED`, which was never in the D9 inventory
                // and therefore could never earn a playbook entry.
                const loaded = await pageLoads.load(scopeNode as PageNode);
                if (!loaded.ok) {
                    return {
                        errorCode: loaded.error.code,
                        errorMessage: loaded.error.message,
                        errorDetails: loaded.error.details,
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
            errorCode: UNKNOWN_ERROR,
            errorMessage: `An unexpected error occurred while joining the channel: ${e.message || String(e)}.`
        };
    }
}
