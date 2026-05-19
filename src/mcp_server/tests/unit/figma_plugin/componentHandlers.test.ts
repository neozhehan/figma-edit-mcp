import { describe, it, expect, beforeEach, mock } from "bun:test";
import { setComponentInstanceProperty, manageComponentProperty } from "../../../../../figma_plugin/handlers/componentHandlers.js";

// === Setup for Security Gate tests via main.ts routing ===
// main.ts must be imported once with globalThis.figma + __html__ already in place,
// because it assigns figma.ui.onmessage at module load and captures the figma global.
const gateNodeMap = new Map<string, any>();
const gatePendingPromises = new Map<string | number, (msg: any) => void>();

function makeGateFigma() {
    return {
        showUI: () => { },
        ui: {
            onmessage: null as any,
            postMessage: (msg: any) => {
                const resolver = gatePendingPromises.get(msg.id);
                if (resolver) {
                    resolver(msg);
                    gatePendingPromises.delete(msg.id);
                }
            },
        },
        on: () => { },
        notify: () => { },
        closePlugin: () => { },
        clientStorage: { setAsync: async () => { } },
        getNodeByIdAsync: async (id: string) => gateNodeMap.get(id) || null,
        currentPage: { selection: [], children: [] },
        root: { children: [] },
        mixed: Symbol("mixed"),
        loadAllPagesAsync: async () => { },
    };
}

const gateFigma = makeGateFigma();
(globalThis as any).__html__ = "<html></html>";
(globalThis as any).figma = gateFigma;

// Import main.ts dynamically after globals are in place; main.ts assigns
// gateFigma.ui.onmessage = handler at module load.
await import("../../../../../figma_plugin/src/main.js?scope=componentHandlers");
const gateOnMessage = gateFigma.ui.onmessage as (msg: any) => Promise<void> | void;

describe("Component Handlers", () => {
    let mockNode: any;

    beforeEach(() => {
        // Reset global figma mock
        (globalThis as any).figma = {
            getNodeByIdAsync: mock(async (id: string) => {
                if (id === mockNode?.id) {
                    return mockNode;
                }
                return null;
            })
        };
    });

    describe("setComponentInstanceProperty", () => {
        it("should successfully set a property on an instance", async () => {
            mockNode = {
                id: "1:1",
                name: "Instance 1",
                type: "INSTANCE",
                componentProperties: {
                    "Show Icon#5:0": { type: "BOOLEAN", value: false }
                },
                setProperties: mock(() => {})
            };

            const result = await setComponentInstanceProperty({
                nodeId: "1:1",
                propertyName: "Show Icon",
                value: true
            });

            expect(mockNode.setProperties).toHaveBeenCalledWith({ "Show Icon#5:0": true });
            expect(result.updatedProperty).toBe("Show Icon");
            expect(result.value).toBe(true);
        });

        it("should throw error if node is not an instance", async () => {
            mockNode = {
                id: "1:1",
                name: "Frame 1",
                type: "FRAME"
            };

            expect(setComponentInstanceProperty({
                nodeId: "1:1",
                propertyName: "Show Icon",
                value: true
            })).rejects.toThrow("Target node must be an INSTANCE");
        });

        it("should throw error with available properties if property not found", async () => {
            mockNode = {
                id: "1:1",
                name: "Instance 1",
                type: "INSTANCE",
                componentProperties: {
                    "Show Icon#5:0": { type: "BOOLEAN", value: false },
                    "State#6:0": { type: "VARIANT", value: "Default" }
                }
            };

            expect(setComponentInstanceProperty({
                nodeId: "1:1",
                propertyName: "Wrong Prop",
                value: true
            })).rejects.toThrow('Property "Wrong Prop" not found. Available properties: Show Icon, State');
        });
    });

    describe("manageComponentProperty", () => {
        beforeEach(() => {
            mockNode = {
                id: "1:1",
                name: "Component 1",
                type: "COMPONENT",
                componentPropertyDefinitions: {
                    "Show Icon#5:0": { type: "BOOLEAN", defaultValue: false },
                    "State#6:0": { type: "VARIANT", defaultValue: "Default" }
                },
                addComponentProperty: mock(() => "NewProp#7:0"),
                editComponentProperty: mock(() => {}),
                deleteComponentProperty: mock(() => {})
            };
        });

        describe("ADD", () => {
            it("should add a new TEXT property", async () => {
                await manageComponentProperty({
                    nodeId: "1:1",
                    action: "ADD",
                    propertyName: "New Prop",
                    propertyType: "TEXT",
                    defaultValue: "Hello"
                });

                expect(mockNode.addComponentProperty).toHaveBeenCalledWith("New Prop", "TEXT", "Hello", {});
            });

            it("should add a new BOOLEAN property", async () => {
                await manageComponentProperty({
                    nodeId: "1:1",
                    action: "ADD",
                    propertyName: "New Toggle",
                    propertyType: "BOOLEAN",
                    defaultValue: true
                });

                expect(mockNode.addComponentProperty).toHaveBeenCalledWith("New Toggle", "BOOLEAN", true, {});
            });

            it("should add a new INSTANCE_SWAP property and forward preferredValues", async () => {
                const preferredValues = [
                    { type: "COMPONENT", key: "preferred-key-1" },
                    { type: "COMPONENT_SET", key: "preferred-key-2" }
                ];
                await manageComponentProperty({
                    nodeId: "1:1",
                    action: "ADD",
                    propertyName: "Slot",
                    propertyType: "INSTANCE_SWAP",
                    defaultValue: "42:8",
                    preferredValues
                });

                expect(mockNode.addComponentProperty).toHaveBeenCalledWith(
                    "Slot",
                    "INSTANCE_SWAP",
                    "42:8",
                    { preferredValues }
                );
            });

            it("should reject duplicate property name", async () => {
                expect(manageComponentProperty({
                    nodeId: "1:1",
                    action: "ADD",
                    propertyName: "Show Icon",
                    propertyType: "BOOLEAN",
                    defaultValue: true
                })).rejects.toThrow('Property "Show Icon" already exists.');
            });

            it("should reject VARIANT propertyType", async () => {
                expect(manageComponentProperty({
                    nodeId: "1:1",
                    action: "ADD",
                    propertyName: "New Variant",
                    propertyType: "VARIANT",
                    defaultValue: "Val"
                })).rejects.toThrow('VARIANT properties cannot be added manually');
            });
        });

        describe("EDIT", () => {
            it("should rename property when only newPropertyName provided", async () => {
                await manageComponentProperty({
                    nodeId: "1:1",
                    action: "EDIT",
                    propertyName: "Show Icon",
                    newPropertyName: "Show Icon Renamed"
                });

                expect(mockNode.editComponentProperty).toHaveBeenCalledWith("Show Icon#5:0", { name: "Show Icon Renamed" });
            });

            it("should update defaultValue when only newDefaultValue provided", async () => {
                await manageComponentProperty({
                    nodeId: "1:1",
                    action: "EDIT",
                    propertyName: "Show Icon",
                    newDefaultValue: true
                });

                expect(mockNode.editComponentProperty).toHaveBeenCalledWith("Show Icon#5:0", { defaultValue: true });
            });

            it("should update preferredValues when only preferredValues provided", async () => {
                const preferredValues = [
                    { type: "COMPONENT", key: "key1" },
                    { type: "COMPONENT_SET", key: "key2" }
                ];
                await manageComponentProperty({
                    nodeId: "1:1",
                    action: "EDIT",
                    propertyName: "Show Icon",
                    preferredValues
                });

                expect(mockNode.editComponentProperty).toHaveBeenCalledWith("Show Icon#5:0", { preferredValues });
            });

            it("should resolve human-readable name to qualified name and forward all mutations together", async () => {
                const preferredValues = [{ type: "COMPONENT", key: "key1" }];
                await manageComponentProperty({
                    nodeId: "1:1",
                    action: "EDIT",
                    propertyName: "Show Icon",
                    newPropertyName: "Show Icon Updated",
                    newDefaultValue: true,
                    preferredValues
                });

                expect(mockNode.editComponentProperty).toHaveBeenCalledWith(
                    "Show Icon#5:0",
                    { name: "Show Icon Updated", defaultValue: true, preferredValues }
                );
            });

            it("should throw on missing property", async () => {
                expect(manageComponentProperty({
                    nodeId: "1:1",
                    action: "EDIT",
                    propertyName: "Missing Prop",
                    newPropertyName: "Updated Prop"
                })).rejects.toThrow('Property "Missing Prop" not found. Available properties: Show Icon, State');
            });
        });

        describe("DELETE", () => {
            it("should delete an existing property", async () => {
                await manageComponentProperty({
                    nodeId: "1:1",
                    action: "DELETE",
                    propertyName: "Show Icon"
                });

                expect(mockNode.deleteComponentProperty).toHaveBeenCalledWith("Show Icon#5:0");
            });

            it("should throw on missing property", async () => {
                expect(manageComponentProperty({
                    nodeId: "1:1",
                    action: "DELETE",
                    propertyName: "Missing Prop"
                })).rejects.toThrow('Property "Missing Prop" not found. Available properties: Show Icon, State');
            });
        });
    });
});

describe("Security Gates via main.ts routing", () => {
    function executeCommand(command: string, params: any): Promise<any> {
        const id = `cmd-${Math.random()}`;
        return new Promise<any>((resolve) => {
            gatePendingPromises.set(id, resolve);
            // Fire-and-forget: command result arrives via postMessage callback.
            void Promise.resolve(gateOnMessage({ type: "execute-command", command, params, id }));
        });
    }

    beforeEach(async () => {
        // Restore the figma global to the instance main.ts captured.
        // The "Component Handlers" describe's beforeEach replaces it for handler-only tests.
        (globalThis as any).figma = gateFigma;
        gateNodeMap.clear();
        gatePendingPromises.clear();
        // Reset state to readOnly via set-scope without scopeNodeId.
        await gateOnMessage({ type: "set-scope" });
    });

    describe("set_component_instance_property", () => {
        it("blocks when state.readOnly is true", async () => {
            // beforeEach already put us in readOnly mode.
            const result = await executeCommand("set_component_instance_property", {
                nodeId: "1:1",
                nodeName: "Instance",
                propertyName: "Show Icon",
                value: true,
            });

            expect(result.type).toBe("command-error");
            expect(result.error).toContain("Read-Only Mode");
        });

        it("blocks when checkScopeAccess fails (target outside scope)", async () => {
            const scopeNode = { id: "scope-1", name: "Scope", parent: null };
            const outOfScope = { id: "1:1", name: "Instance", parent: null };
            gateNodeMap.set("scope-1", scopeNode);
            gateNodeMap.set("1:1", outOfScope);

            await gateOnMessage({ type: "set-scope", scopeNodeId: "scope-1" });

            const result = await executeCommand("set_component_instance_property", {
                nodeId: "1:1",
                nodeName: "Instance",
                propertyName: "Show Icon",
                value: true,
            });

            expect(result.type).toBe("command-error");
            expect(result.error).toContain("outside editable scope");
        });

        it("blocks when verifyNodeName fails (name mismatch)", async () => {
            const scopeNode: any = { id: "scope-1", name: "Scope", parent: null };
            const target: any = { id: "1:1", name: "Real Name", parent: scopeNode };
            gateNodeMap.set("scope-1", scopeNode);
            gateNodeMap.set("1:1", target);

            await gateOnMessage({ type: "set-scope", scopeNodeId: "scope-1" });

            const result = await executeCommand("set_component_instance_property", {
                nodeId: "1:1",
                nodeName: "Wrong Name",
                propertyName: "Show Icon",
                value: true,
            });

            expect(result.type).toBe("command-error");
            expect(result.error).toContain("nodeName does not match");
        });
    });

    describe("manage_component_property", () => {
        const addParams = {
            action: "ADD",
            propertyName: "New Prop",
            propertyType: "TEXT",
            defaultValue: "Default",
        };

        it("blocks when state.readOnly is true (any action)", async () => {
            const result = await executeCommand("manage_component_property", {
                nodeId: "1:1",
                nodeName: "Component",
                ...addParams,
            });

            expect(result.type).toBe("command-error");
            expect(result.error).toContain("Read-Only Mode");
        });

        it("blocks when checkScopeAccess fails (any action)", async () => {
            const scopeNode = { id: "scope-1", name: "Scope", parent: null };
            const outOfScope = { id: "1:1", name: "Component", parent: null };
            gateNodeMap.set("scope-1", scopeNode);
            gateNodeMap.set("1:1", outOfScope);

            await gateOnMessage({ type: "set-scope", scopeNodeId: "scope-1" });

            const result = await executeCommand("manage_component_property", {
                nodeId: "1:1",
                nodeName: "Component",
                ...addParams,
            });

            expect(result.type).toBe("command-error");
            expect(result.error).toContain("outside editable scope");
        });

        it("blocks when verifyNodeName fails (any action)", async () => {
            const scopeNode: any = { id: "scope-1", name: "Scope", parent: null };
            const target: any = { id: "1:1", name: "Real Name", parent: scopeNode };
            gateNodeMap.set("scope-1", scopeNode);
            gateNodeMap.set("1:1", target);

            await gateOnMessage({ type: "set-scope", scopeNodeId: "scope-1" });

            const result = await executeCommand("manage_component_property", {
                nodeId: "1:1",
                nodeName: "Wrong Name",
                ...addParams,
            });

            expect(result.type).toBe("command-error");
            expect(result.error).toContain("nodeName does not match");
        });
    });
});
