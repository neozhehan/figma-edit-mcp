import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createShape } from "../../../../../figma_plugin/handlers/nodeCreators.js";
import { transformNode } from "../../../../../figma_plugin/handlers/nodeModifiers.js";
import { getNodesInfo } from "../../../../../figma_plugin/handlers/nodeReaders.js";
import { deleteStyle } from "../../../../../figma_plugin/handlers/styleHandlers.js";
import { deleteComponentProperty, manageComponentProperty, exportNodeAsImage } from "../../../../../figma_plugin/handlers/componentHandlers.js";

// Global stub setup for Figma
(globalThis as any).__html__ = "<html></html>";

describe("Figma Plugin Handlers & Resolvers (WS5 / R5.1b-g)", () => {
    let mockPage: any;
    let mockCreatedNodes: any[];

    beforeEach(() => {
        mockCreatedNodes = [];
        mockPage = {
            id: "page-1",
            name: "Page 1",
            type: "PAGE",
            appendChild: mock((node: any) => {
                mockCreatedNodes.push(node);
            })
        };

        (globalThis as any).figma = {
            currentPage: mockPage,
            getNodeByIdAsync: mock(async (id: string) => {
                if (id === mockPage.id) return mockPage;
                return null;
            }),
            createRectangle: mock(() => ({
                id: "rect-1",
                type: "RECTANGLE",
                name: "Rectangle",
                x: 0,
                y: 0,
                width: 100,
                height: 100,
                resize: mock(function(this: any, w: number, h: number) {
                    this.width = w;
                    this.height = h;
                }),
                fills: [] as any[],
                strokes: [] as any[]
            })),
            createEllipse: mock(() => ({
                id: "ellipse-1",
                type: "ELLIPSE",
                name: "Ellipse",
                x: 0,
                y: 0,
                width: 100,
                height: 100,
                resize: mock(function(this: any, w: number, h: number) {
                    this.width = w;
                    this.height = h;
                }),
                fills: [] as any[],
                strokes: [] as any[],
                arcData: null as any
            })),
            createPolygon: mock(() => ({
                id: "polygon-1",
                type: "POLYGON",
                name: "Polygon",
                x: 0,
                y: 0,
                width: 100,
                height: 100,
                resize: mock(function(this: any, w: number, h: number) {
                    this.width = w;
                    this.height = h;
                }),
                fills: [] as any[],
                strokes: [] as any[],
                pointCount: 3
            })),
            createStar: mock(() => ({
                id: "star-1",
                type: "STAR",
                name: "Star",
                x: 0,
                y: 0,
                width: 100,
                height: 100,
                resize: mock(function(this: any, w: number, h: number) {
                    this.width = w;
                    this.height = h;
                }),
                fills: [] as any[],
                strokes: [] as any[],
                pointCount: 5,
                innerRadius: 0.38
            }))
        };
    });

    // --- R5.1b: create.shape (R3.3) ---
    describe("R5.1b: create.shape", () => {
        it("should create a RECTANGLE and apply fills and strokes", async () => {
            const params = {
                type: "RECTANGLE",
                x: 10,
                y: 20,
                width: 200,
                height: 150,
                name: "Custom Rect",
                fillColor: { r: 1.0, g: 0.5, b: 0.2, a: 0.8 },
                strokeColor: { r: 0.0, g: 1.0, b: 0.0, a: 1.0 }
            };

            const result = await createShape(params);
            expect(result.id).toBe("rect-1");
            expect(mockCreatedNodes.length).toBe(1);
            const created = mockCreatedNodes[0];
            expect(created.type).toBe("RECTANGLE");
            expect(created.name).toBe("Custom Rect");
            expect(created.x).toBe(10);
            expect(created.y).toBe(20);
            expect(created.width).toBe(200);
            expect(created.height).toBe(150);

            // Assert fillColor and strokeColor ported/applied successfully
            expect(created.fills).toEqual([{
                type: "SOLID",
                color: { r: 1.0, g: 0.5, b: 0.2 },
                opacity: 0.8
            }]);
            expect(created.strokes).toEqual([{
                type: "SOLID",
                color: { r: 0.0, g: 1.0, b: 0.0 },
                opacity: 1.0
            }]);
        });

        it("should create an ELLIPSE with optional arcData and reject arcData on others", async () => {
            const params = {
                type: "ELLIPSE",
                arcData: { startingAngle: 0.1, endingAngle: 0.5, innerRadius: 0.2 }
            };

            const result = await createShape(params);
            const created = mockCreatedNodes[0];
            expect(created.type).toBe("ELLIPSE");
            expect(created.arcData).toEqual({
                startingAngle: 0.1,
                endingAngle: 0.5,
                innerRadius: 0.2
            });

            // Rejects arcData on non-ellipses
            expect(createShape({
                type: "RECTANGLE",
                arcData: { startingAngle: 0, endingAngle: 1, innerRadius: 0 }
            })).rejects.toThrow("arcData is only supported for shape type ELLIPSE");
        });

        it("should create a STAR with native pointCount/innerRadius, support odd pointCounts, and reject on invalid types", async () => {
            // STAR with pointCount 5 (an odd count!)
            const params = {
                type: "STAR",
                pointCount: 5,
                innerRadius: 0.45
            };

            const result = await createShape(params);
            const created = mockCreatedNodes[0];
            expect(created.type).toBe("STAR");
            // Native pointCount is preserved, no division, no parity throw
            expect(created.pointCount).toBe(5);
            expect(created.innerRadius).toBe(0.45);

            // Rejects innerRadius on non-stars
            expect(createShape({
                type: "POLYGON",
                pointCount: 5,
                innerRadius: 0.5
            })).rejects.toThrow("innerRadius is only supported for shape type STAR");

            // Rejects if pointCount < 3
            expect(createShape({
                type: "POLYGON",
                pointCount: 2
            })).rejects.toThrow("Polygons require pointCount >= 3");

            expect(createShape({
                type: "STAR",
                pointCount: 2
            })).rejects.toThrow("Stars require pointCount >= 3");
        });
    });

    // --- R5.1c: node.transform (R3.3) ---
    describe("R5.1c: node.transform", () => {
        let mockNode: any;

        beforeEach(() => {
            mockNode = {
                id: "node-2",
                name: "Transform Node",
                x: 10,
                y: 20,
                width: 100,
                height: 80,
                resize: mock(function(this: any, w: number, h: number) {
                    this.width = w;
                    this.height = h;
                })
            };

            (globalThis as any).figma.getNodeByIdAsync = mock(async (id: string) => {
                if (id === "node-2") return mockNode;
                return null;
            });
        });

        it("should apply partial updates correctly (e.g. x-only, width-only)", async () => {
            // Case 1: X only
            let result = await transformNode({ nodeId: "node-2", x: 50 });
            expect(mockNode.x).toBe(50);
            expect(mockNode.y).toBe(20); // unchanged
            expect(mockNode.width).toBe(100); // unchanged
            expect(result.x).toBe(50);
            expect(result.y).toBe(20);

            // Case 2: Width only (should default height from current node and not throw)
            result = await transformNode({ nodeId: "node-2", width: 150 });
            expect(mockNode.width).toBe(150);
            expect(mockNode.height).toBe(80); // defaulted
            expect(mockNode.resize).toHaveBeenCalledWith(150, 80);

            // Case 3: all-undefined is a no-op (no properties modified, no-op return)
            mockNode.resize.mockClear();
            result = await transformNode({ nodeId: "node-2" });
            expect(mockNode.resize).not.toHaveBeenCalled();
            expect(result.id).toBe("node-2");
        });
    });

    // --- R5.1d: node.info library-ref resolution (R3.3/R3.8) ---
    describe("R5.1d: node.info library-ref resolution", () => {
        it("should recursively resolve variable aliases and library styles", async () => {
            const resolvedVars = new Map<string, any>([
                ["var-color", { id: "var-color", name: "Brand/Primary" }],
                ["var-spacing", { id: "var-spacing", name: "Spacing/Medium" }]
            ]);

            const resolvedStyles = new Map<string, any>([
                ["style-fill", { id: "style-fill", name: "Paints/Primary Fill" }],
                ["style-stroke", { id: "style-stroke", name: "Paints/Accent Stroke" }]
            ]);

            (globalThis as any).figma.variables = {
                getVariableByIdAsync: mock(async (id: string) => resolvedVars.get(id) || null),
                getVariableCollectionByIdAsync: mock(async (id: string) => ({
                    id,
                    name: "Default Col",
                    modes: [{ modeId: "mode-1", name: "Dark" }]
                }))
            };

            (globalThis as any).figma.getStyleByIdAsync = mock(async (id: string) => resolvedStyles.get(id) || null);

            const mockNode = {
                id: "node-info-1",
                name: "Reference Node",
                type: "FRAME",
                fillStyleId: "style-fill",
                strokeStyleId: "style-stroke",
                boundVariables: {
                    fills: [
                        {
                            type: "VARIABLE_ALIAS",
                            id: "var-color"
                        }
                    ],
                    componentProperties: {
                        "VisibleProp": {
                            type: "VARIABLE_ALIAS",
                            id: "var-spacing"
                        }
                    }
                },
                explicitVariableModes: {
                    "coll-1": "mode-1"
                }
            };

            (globalThis as any).figma.getNodeByIdAsync = mock(async (id: string) => {
                if (id === "node-info-1") return mockNode;
                return null;
            });

            // Call getNodesInfo asking for style and boundVariables fields
            const result = await getNodesInfo({
                nodeIds: ["node-info-1"],
                properties: ["fillStyleId", "strokeStyleId", "boundVariables", "explicitVariableModes"]
            });

            expect(result.nodes.length).toBe(1);
            const props = result.nodes[0].properties;

            // Assert styleId resolved to {id, name}
            expect(props.fillStyleId).toEqual({ id: "style-fill", name: "Paints/Primary Fill" });
            expect(props.strokeStyleId).toEqual({ id: "style-stroke", name: "Paints/Accent Stroke" });

            // Assert boundVariables resolved recursively into arrays and nested maps
            expect(props.boundVariables).toEqual({
                fills: [
                    { id: "var-color", name: "Brand/Primary" }
                ],
                componentProperties: {
                    "VisibleProp": { id: "var-spacing", name: "Spacing/Medium" }
                }
            });

            // Assert explicitVariableModes resolved
            expect(props.explicitVariableModes).toEqual({
                "coll-1": { id: "mode-1", name: "Default Col: Dark" }
            });
        });
    });

    // --- R5.1e: node.info node-ref mapping (R3.8) ---
    describe("R5.1e: node.info node-ref mapping", () => {
        it("should map node references to ID/IDs instead of raw node objects", async () => {
            const parentNode = { id: "parent-id", type: "FRAME", name: "Parent" };
            const compNode = { id: "comp-id", type: "COMPONENT", name: "Comp" };
            const instNode1 = { id: "inst-1", type: "INSTANCE", name: "Inst 1" };
            const instNode2 = { id: "inst-2", type: "INSTANCE", name: "Inst 2" };
            const stuckNode = { id: "stuck-1", type: "STICKY", name: "Stuck" };
            const connNode = { id: "conn-1", type: "CONNECTOR", name: "Conn" };

            const mockNode = {
                id: "ref-node",
                name: "Ref Node",
                type: "INSTANCE",
                parent: parentNode,
                getMainComponentAsync: mock(async () => compNode),
                getInstancesAsync: mock(async () => [instNode1, instNode2]),
                exposedInstances: [instNode1],
                stuckNodes: [stuckNode],
                attachedConnectors: [connNode]
            };

            (globalThis as any).figma.getNodeByIdAsync = mock(async (id: string) => {
                if (id === "ref-node") return mockNode;
                return null;
            });

            const result = await getNodesInfo({
                nodeIds: ["ref-node"],
                properties: [
                    "parent", "mainComponent", "instances",
                    "exposedInstances", "stuckNodes", "attachedConnectors"
                ]
            });

            expect(result.nodes.length).toBe(1);
            const props = result.nodes[0].properties;

            // Verify they map strictly to string IDs or ID arrays
            expect(props.parent).toBe("parent-id");
            expect(props.mainComponent).toBe("comp-id");
            expect(props.instances).toEqual(["inst-1", "inst-2"]);
            expect(props.exposedInstances).toEqual(["inst-1"]);
            expect(props.stuckNodes).toEqual(["stuck-1"]);
            expect(props.attachedConnectors).toEqual(["conn-1"]);
        });
    });

    // --- R5.1f: component.delete_property (R3.3) ---
    describe("R5.1f: component.delete_property", () => {
        let mockCompNode: any;

        beforeEach(() => {
            mockCompNode = {
                id: "comp-1",
                name: "Button",
                type: "COMPONENT",
                componentPropertyDefinitions: {
                    "Label": { type: "TEXT", defaultValue: "Click" }
                },
                deleteComponentProperty: mock(() => {})
            };

            (globalThis as any).figma.getNodeByIdAsync = mock(async (id: string) => {
                if (id === "comp-1") return mockCompNode;
                return null;
            });
        });

        it("deleteComponentProperty should call deleteComponentProperty on component node", async () => {
            const result = await deleteComponentProperty({
                nodeId: "comp-1",
                propertyName: "Label"
            });

            expect(mockCompNode.deleteComponentProperty).toHaveBeenCalledWith("Label");
            expect(result.id).toBe("comp-1");
            expect(result.name).toBe("Button");
        });

        it("manageComponentProperty should throw on DELETE action", async () => {
            expect(manageComponentProperty({
                nodeId: "comp-1",
                propertyName: "Label",
                action: "DELETE"
            })).rejects.toThrow("Use delete_property tool for deletion.");
        });
    });

    // --- R5.1g: style.delete (R3.3) ---
    describe("R5.1g: style.delete", () => {
        let mockStyle: any;

        beforeEach(() => {
            mockStyle = {
                id: "style-2",
                name: "Brand/Blue",
                type: "PAINT",
                remove: mock(() => {})
            };

            (globalThis as any).figma.getStyleByIdAsync = mock(async (id: string) => {
                if (id === "style-2") return mockStyle;
                return null;
            });
        });

        it("should delete style by ID and verify matching name", async () => {
            const result = await deleteStyle({
                styleId: "style-2",
                styleName: "Brand/Blue"
            });

            expect(mockStyle.remove).toHaveBeenCalled();
            expect(result.success).toBe(true);
        });

        it("should reject deletion if styleName mismatches", async () => {
            expect(deleteStyle({
                styleId: "style-2",
                styleName: "Brand/Red"
            })).rejects.toThrow("Operation Denied: styleName does not match name of styleId");

            expect(mockStyle.remove).not.toHaveBeenCalled();
        });
    });

    // --- node_export_visual format handling ---
    describe("node_export_visual: format handling", () => {
        let exportSettings: any[];
        let mockExpNode: any;

        beforeEach(() => {
            exportSettings = [];
            mockExpNode = {
                id: "exp-1",
                type: "FRAME",
                name: "Exportable",
                exportAsync: mock(async (settings: any) => {
                    exportSettings.push(settings);
                    return new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
                }),
            };
            (globalThis as any).figma.getNodeByIdAsync = mock(async (id: string) =>
                id === "exp-1" ? mockExpNode : null
            );
        });

        it("defaults to PNG with a SCALE constraint", async () => {
            const res = await exportNodeAsImage({ nodeId: "exp-1" });
            expect(res.format).toBe("PNG");
            expect(res.mimeType).toBe("image/png");
            expect(exportSettings[0]).toEqual({ format: "PNG", constraint: { type: "SCALE", value: 1 } });
        });

        it("honors JPG — raster: keeps SCALE constraint, image/jpeg", async () => {
            const res = await exportNodeAsImage({ nodeId: "exp-1", format: "JPG", scale: 2 });
            expect(res.format).toBe("JPG");
            expect(res.mimeType).toBe("image/jpeg");
            expect(exportSettings[0]).toEqual({ format: "JPG", constraint: { type: "SCALE", value: 2 } });
        });

        it("honors SVG — returns raw XML text (not base64), no constraint, image/svg+xml", async () => {
            const svgText = '<svg width="50" height="50"><rect fill="white"/></svg>';
            mockExpNode.exportAsync = mock(async (settings: any) => {
                exportSettings.push(settings);
                return new TextEncoder().encode(svgText);
            });
            const res = await exportNodeAsImage({ nodeId: "exp-1", format: "SVG" });
            expect(res.format).toBe("SVG");
            expect(res.mimeType).toBe("image/svg+xml");
            expect(exportSettings[0]).toEqual({ format: "SVG" });
            expect(res.svg).toBe(svgText);          // raw XML, directly readable
            expect(res.imageData).toBeUndefined();  // not base64-encoded
        });

        it("honors PDF — vector: no constraint, application/pdf", async () => {
            const res = await exportNodeAsImage({ nodeId: "exp-1", format: "PDF" });
            expect(res.format).toBe("PDF");
            expect(res.mimeType).toBe("application/pdf");
            expect(exportSettings[0]).toEqual({ format: "PDF" });
        });

        it("normalizes lowercase format and rejects unsupported formats", async () => {
            const res = await exportNodeAsImage({ nodeId: "exp-1", format: "svg" });
            expect(res.format).toBe("SVG");
            await expect(exportNodeAsImage({ nodeId: "exp-1", format: "GIF" })).rejects.toThrow(/Unsupported export format/);
        });
    });
});
