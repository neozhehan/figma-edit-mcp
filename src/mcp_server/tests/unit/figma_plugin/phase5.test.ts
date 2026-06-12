import { describe, it, expect, vi, beforeEach } from "vitest";
import { setComponentInstanceProperty, manageComponentProperty, createComponentSet } from "../../../../../figma_plugin/handlers/componentHandlers.js";
import { deleteVariables } from "../../../../../figma_plugin/handlers/variableHandlers.js";
import { deleteStyle } from "../../../../../figma_plugin/handlers/styleHandlers.js";

describe("Phase 5 Validations", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.figma = {
            getNodeByIdAsync: vi.fn(),
            combineAsVariants: vi.fn(),
            variables: {
                getVariableCollectionByIdAsync: vi.fn(),
                getVariableByIdAsync: vi.fn(),
            },
            getStyleByIdAsync: vi.fn(),
        } as any;
    });

    describe("§5 Component property type validation", () => {
        it("BOOLEAN coerces true/false string and rejects invalid", async () => {
            const instance = {
                id: "1:1", type: "INSTANCE",
                componentProperties: { "Prop#1": { type: "BOOLEAN", value: false } },
                setProperties: vi.fn()
            };
            (global.figma.getNodeByIdAsync as any).mockResolvedValue(instance);

            const res = await setComponentInstanceProperty({ nodeId: "1:1", propertyName: "Prop", value: "true" });
            expect(res.value).toBe(true);
            expect(instance.setProperties).toHaveBeenCalledWith({ "Prop#1": true });

            await expect(setComponentInstanceProperty({ nodeId: "1:1", propertyName: "Prop", value: "invalid" }))
                .rejects.toThrow("Operation Denied: BOOLEAN property 'Prop' requires true or false");
        });

        it("VARIANT lists options on miss", async () => {
            const componentSet = {
                id: "0:1", type: "COMPONENT_SET",
                variantGroupProperties: { "State": { values: ["Default", "Hover"] } }
            };
            const mainComponent = {
                id: "0:2", type: "COMPONENT",
                parent: componentSet
            };
            const instance = {
                id: "1:1", type: "INSTANCE",
                componentProperties: { "State#1": { type: "VARIANT", value: "Default" } },
                getMainComponentAsync: vi.fn().mockResolvedValue(mainComponent),
                setProperties: vi.fn()
            };
            (global.figma.getNodeByIdAsync as any).mockResolvedValue(instance);

            await expect(setComponentInstanceProperty({ nodeId: "1:1", propertyName: "State", value: "Active" }))
                .rejects.toThrow("Operation Denied: 'Active' is not a valid value for variant property 'State'. Valid values: Default, Hover.");
        });

        it("INSTANCE_SWAP rejects wrong-type but passes a plausible id", async () => {
            const instance = {
                id: "1:1", type: "INSTANCE",
                componentProperties: { "Swap#1": { type: "INSTANCE_SWAP", value: "" } },
                setProperties: vi.fn()
            };
            
            // First call for the instance itself
            (global.figma.getNodeByIdAsync as any).mockImplementation(async (id: string) => {
                if (id === "1:1") return instance;
                if (id === "2:2") return { type: "FRAME" };
                if (id === "3:3") return { type: "COMPONENT" };
                throw new Error("Not found");
            });

            await expect(setComponentInstanceProperty({ nodeId: "1:1", propertyName: "Swap", value: "" }))
                .rejects.toThrow("Operation Denied: INSTANCE_SWAP property 'Swap' requires a non-empty string");

            await expect(setComponentInstanceProperty({ nodeId: "1:1", propertyName: "Swap", value: "2:2" }))
                .rejects.toThrow("Operation Denied: INSTANCE_SWAP value must refer to a component, got FRAME");

            const res = await setComponentInstanceProperty({ nodeId: "1:1", propertyName: "Swap", value: "3:3" });
            expect(res.value).toBe("3:3");

            // Plausible (not found) passes through
            const res2 = await setComponentInstanceProperty({ nodeId: "1:1", propertyName: "Swap", value: "4:4" });
            expect(res2.value).toBe("4:4");
        });

        it("TEXT requires a string and accepts one", async () => {
            const instance = {
                id: "1:1", type: "INSTANCE",
                componentProperties: { "Label#1": { type: "TEXT", value: "hello" } },
                setProperties: vi.fn()
            };
            (global.figma.getNodeByIdAsync as any).mockResolvedValue(instance);

            await expect(setComponentInstanceProperty({ nodeId: "1:1", propertyName: "Label", value: true }))
                .rejects.toThrow("Operation Denied: TEXT property 'Label' requires a string");

            const res = await setComponentInstanceProperty({ nodeId: "1:1", propertyName: "Label", value: "world" });
            expect(res.value).toBe("world");
            expect(instance.setProperties).toHaveBeenCalledWith({ "Label#1": "world" });
        });

        it("variant-member guard rejects managing properties on a variant member", async () => {
            const componentSet = { id: "0:1", type: "COMPONENT_SET", name: "MySet" };
            const variant = { id: "0:2", type: "COMPONENT", name: "Size=sm", parent: componentSet };
            (global.figma.getNodeByIdAsync as any).mockResolvedValue(variant);

            await expect(manageComponentProperty({ nodeId: "0:2", action: "ADD", propertyName: "Foo", propertyType: "TEXT", defaultValue: "x" }))
                .rejects.toThrow("Operation Denied: 'Size=sm' is a variant inside a component set; manage properties on the set ('MySet'), not the individual variant.");
        });
    });

    describe("§11 Duplicate-variant guard", () => {
        it("rejects duplicate combinations", async () => {
            const comp1 = { id: "1:1", type: "COMPONENT", name: "Comp1" };
            const comp2 = { id: "1:2", type: "COMPONENT", name: "Comp2" };
            
            (global.figma.getNodeByIdAsync as any).mockImplementation(async (id: string) => {
                if (id === "1:1") return comp1;
                if (id === "1:2") return comp2;
                return null;
            });

            const params = {
                components: [
                    { nodeId: "1:1", propertyValues: ["A"] },
                    { nodeId: "1:2", propertyValues: ["A"] }
                ],
                properties: ["Prop1"]
            };

            await expect(createComponentSet(params))
                .rejects.toThrow("Operation Denied: Duplicate variant combination 'Prop1=A' across components 'Comp1' and 'Comp2'. Each component in a set must have a unique property-value combination.");
        });
    });

    describe("§6B name required validations", () => {
        it("variable_delete rejects on mismatch", async () => {
            const v1 = { id: "1:1", name: "Var1" };
            (global.figma.variables.getVariableByIdAsync as any).mockResolvedValue(v1);

            await expect(deleteVariables({ variableIds: ["1:1"], variableNames: ["Wrong"] }))
                .rejects.toThrow("Operation Denied: variableName 'Wrong' does not match name of variableId 'Var1'");
        });

        it("variable_delete collection mode rejects on mismatch", async () => {
            const col = { id: "1:1", name: "Col1", variableIds: [] };
            (global.figma.variables.getVariableCollectionByIdAsync as any).mockResolvedValue(col);

            await expect(deleteVariables({ collectionId: "1:1", collectionName: "Wrong" }))
                .rejects.toThrow("Operation Denied: collectionName 'Wrong' does not match name of collectionId 'Col1'");
        });

        it("style_delete rejects on mismatch with tightened guard", async () => {
            const style = { id: "1:1", name: "Style1" };
            (global.figma.getStyleByIdAsync as any).mockResolvedValue(style);

            await expect(deleteStyle({ styleId: "1:1" }))
                .rejects.toThrow("Operation Denied: styleName does not match name of styleId");

            await expect(deleteStyle({ styleId: "1:1", styleName: "Wrong" }))
                .rejects.toThrow("Operation Denied: styleName does not match name of styleId");
        });
    });
});
