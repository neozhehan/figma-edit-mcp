import { getPluginState } from '../src/main.js';

export async function getConnectPayload() {
    try {
        const state = getPluginState();

        if (state.readOnly === true) {
            const pages = figma.root.children.map(page => ({
                pageId: page.id,
                pageName: page.name
            }));

            return {
                editableScopeType: "readonly",
                documentId: figma.root.id,
                documentName: figma.root.name,
                pageCount: figma.root.children.length,
                pages
            };
        }

        if (state.scopeRootId) {
            const scopeNode = await figma.getNodeByIdAsync(state.scopeRootId);

            if (!scopeNode) {
                return {
                    errorCode: "SCOPE_DELETED",
                    errorMessage: "The node previously set as the editable scope no longer exists. Disconnect the plugin and select a new editable scope via the 'Link to Selection' field."
                };
            }

            if (scopeNode.type === "PAGE" && scopeNode.parent === figma.root) {
                try {
                    await scopeNode.loadAsync();
                } catch (e: any) {
                    return {
                        errorCode: "DOCUMENT_LOAD_FAILED",
                        errorMessage: "Failed to load the Figma document's pages. The file may be too large or temporarily unavailable. Retry shortly."
                    };
                }

                const children = scopeNode.children.map(child => ({
                    id: child.id,
                    name: child.name,
                    type: child.type
                }));

                return {
                    editableScopeType: "page",
                    documentId: figma.root.id,
                    documentName: figma.root.name,
                    pageCount: figma.root.children.length,
                    pages: [{
                        pageId: scopeNode.id,
                        pageName: scopeNode.name,
                        children
                    }]
                };
            } else {
                let containingPage: PageNode | null = null;
                let currentNode: BaseNode | null = scopeNode.parent;

                while (currentNode) {
                    if (currentNode.type === "PAGE") {
                        containingPage = currentNode as PageNode;
                        break;
                    }
                    currentNode = currentNode.parent;
                }

                if (!containingPage || containingPage.parent !== figma.root) {
                    return {
                        errorCode: "SCOPE_INVALID",
                        errorMessage: "The plugin reported an unrecognized editable scope state. Disconnect and reconnect the plugin to reset its scope."
                    };
                }

                let children: any[] = [];
                if ('children' in scopeNode) {
                    children = (scopeNode as any).children.map((child: any) => ({
                        id: child.id,
                        name: child.name,
                        type: child.type
                    }));
                }

                return {
                    editableScopeType: "node",
                    documentId: figma.root.id,
                    documentName: figma.root.name,
                    node: {
                        nodeId: scopeNode.id,
                        nodeName: scopeNode.name,
                        type: scopeNode.type,
                        parentNodeId: scopeNode.parent?.id,
                        parentNodeName: scopeNode.parent?.name,
                        parentNodeType: scopeNode.parent?.type,
                        containingPageId: containingPage.id,
                        containingPageName: containingPage.name,
                        children
                    }
                };
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
