import { describe, it, expect, beforeEach } from "bun:test";

const gateNodeMap = new Map<string, any>();
let mockResizeThrow = false;
let mockFillsThrow = false;
let mockImportByKeyThrow = false;
let mockCloneThrow = false;
let customImportComponentByKeyAsync: any = null;

// Spies proving the checklist's "throws BEFORE the create method is called".
let createFrameCalls = 0;
let createTextCalls = 0;
let createNodeFromSvgCalls = 0;
let createRectangleCalls = 0;
let createEllipseCalls = 0;
let createPolygonCalls = 0;
let createStarCalls = 0;

const gateFigma = {
    getNodeByIdAsync: async (id: string) => gateNodeMap.get(id) || null,
    loadFontAsync: async () => {},
    createEllipse: () => {
        createEllipseCalls++;
        return { id: "ellipse-1", name: "Ellipse", type: "ELLIPSE", resize: () => {}, remove: () => {}, removed: false };
    },
    createPolygon: () => {
        createPolygonCalls++;
        return { id: "polygon-1", name: "Polygon", type: "POLYGON", resize: () => {}, remove: () => {}, removed: false };
    },
    createStar: () => {
        createStarCalls++;
        return { id: "star-1", name: "Star", type: "STAR", resize: () => {}, remove: () => {}, removed: false };
    },
    createFrame: () => {
        createFrameCalls++;
        const frame = {
            id: "frame-1",
            name: "Frame",
            type: "FRAME",
            resize: (w: number, h: number) => {
                if (mockResizeThrow) throw new Error("Mock resize throw");
            },
            remove: () => { (frame as any).removed = true; },
            removed: false
        };
        return frame;
    },
    createText: () => {
        createTextCalls++;
        const text = {
            id: "text-1",
            name: "Text",
            type: "TEXT",
            remove: () => { (text as any).removed = true; },
            removed: false
        };
        Object.defineProperty(text, "fills", {
            set: () => {
                if (mockFillsThrow) throw new Error("Mock fills throw");
            }
        });
        return text;
    },
    createRectangle: () => {
        createRectangleCalls++;
        const rect = {
            id: "rect-1",
            name: "Rectangle",
            type: "RECTANGLE",
            resize: (w: number, h: number) => {
                if (mockResizeThrow) throw new Error("Mock resize throw");
            },
            remove: () => { (rect as any).removed = true; },
            removed: false
        };
        return rect;
    },
    createNodeFromSvg: (svg: string) => {
        createNodeFromSvgCalls++;
        const svgNode = {
            id: "svg-1",
            name: "SVG",
            type: "FRAME",
            remove: () => { (svgNode as any).removed = true; },
            removed: false
        };
        Object.defineProperty(svgNode, "x", {
            set: () => {
                if (mockResizeThrow) throw new Error("Mock x position throw");
            }
        });
        return svgNode;
    },
    createComponent: () => {
        const comp = {
            id: "comp-1",
            name: "Component",
            type: "COMPONENT",
            children: [],
            resize: (w: number, h: number) => {
                if (mockResizeThrow) throw new Error("Mock resize throw");
            },
            remove: () => { (comp as any).removed = true; },
            removed: false
        };
        return comp;
    },
    importComponentByKeyAsync: async (key: string) => {
        if (customImportComponentByKeyAsync) {
            return await customImportComponentByKeyAsync(key);
        }
        if (mockImportByKeyThrow || key === "bad-key") {
            throw new Error("Figma API connection error");
        }
        return {
            id: "remote-comp-id",
            name: "Remote Component",
            type: "COMPONENT",
            createInstance: () => {
                const inst = {
                    id: "inst-1",
                    name: "Instance",
                    type: "INSTANCE",
                    remove: () => { (inst as any).removed = true; },
                    removed: false
                };
                Object.defineProperty(inst, "x", {
                    set: () => {
                        if (mockResizeThrow) throw new Error("Mock x position throw");
                    }
                });
                return inst;
            }
        };
    }
};

(globalThis as any).figma = gateFigma;

// Import handlers directly
const nodeCreatorsMod: any = await import("../../../../../figma_plugin/handlers/nodeCreators.js?scope=phase3");
const vectorHandlersMod: any = await import("../../../../../figma_plugin/handlers/vectorHandlers.js?scope=phase3");
const componentHandlersMod: any = await import("../../../../../figma_plugin/handlers/componentHandlers.js?scope=phase3");

describe("Phase 3: Creation Handlers and Clone Cleanup - Success Containment and Truthful Survivors", () => {
    beforeEach(() => {
        gateNodeMap.clear();
        mockResizeThrow = false;
        mockFillsThrow = false;
        mockImportByKeyThrow = false;
        mockCloneThrow = false;
        customImportComponentByKeyAsync = null;
        createFrameCalls = 0;
        createTextCalls = 0;
        createNodeFromSvgCalls = 0;
        createRectangleCalls = 0;
        createEllipseCalls = 0;
        createPolygonCalls = 0;
        createStarCalls = 0;
    });

    function setupEnvironment() {
        const page: any = {
            id: "page-id",
            name: "Page",
            type: "PAGE"
        };
        const parentNode: any = {
            id: "parent-id",
            name: "Parent Node",
            type: "FRAME",
            appendChild: (child: any) => {
                child.parent = parentNode;
                parentNode.children.push(child);
            },
            insertChild: (index: number, child: any) => {
                child.parent = parentNode;
                parentNode.children.splice(index, 0, child);
            },
            children: []
        };
        gateNodeMap.set("page-id", page);
        gateNodeMap.set("parent-id", parentNode);
        return { page, parentNode };
    }

    describe("resolveAppendableParent validation (parent-missing, parent-not-found, parent-cannot-accept)", () => {
        // Q33 (Rev 46): `create_instance` now resolves its destination AFTER the
        // component, so the component must resolve for the parent refusal to be
        // the failure under test. Production precedence is unaffected — the
        // dispatcher's validateParentWrite rejects a bad parent before the
        // handler runs; this handler-level check is defense in depth.
        beforeEach(() => {
            gateNodeMap.set("c1", { id: "c1", name: "Component", type: "COMPONENT" });
        });

        it("throws when parentId is missing, before any create method is called", async () => {
            await expect(
                nodeCreatorsMod.createFrame({ parentId: "" })
            ).rejects.toThrow("create_frame: missing parentId parameter.");

            await expect(
                nodeCreatorsMod.createText({ parentId: "" })
            ).rejects.toThrow("create_text: missing parentId parameter.");

            await expect(
                vectorHandlersMod.createNodeFromSvg({ svg: "<svg></svg>", parentId: "" })
            ).rejects.toThrow("create_svg: missing parentId parameter.");

            await expect(
                componentHandlersMod.createComponentInstance({ componentId: "c1", parentId: "" })
            ).rejects.toThrow("create_instance: missing parentId parameter.");

            expect(createFrameCalls).toBe(0);
            expect(createTextCalls).toBe(0);
            expect(createNodeFromSvgCalls).toBe(0);
        });

        it("throws when parent node is not found, before any create method is called", async () => {
            await expect(
                nodeCreatorsMod.createFrame({ parentId: "nonexistent" })
            ).rejects.toThrow("create_frame: parent node not found with ID: nonexistent.");

            await expect(
                nodeCreatorsMod.createText({ parentId: "nonexistent" })
            ).rejects.toThrow("create_text: parent node not found with ID: nonexistent.");

            await expect(
                vectorHandlersMod.createNodeFromSvg({ svg: "<svg></svg>", parentId: "nonexistent" })
            ).rejects.toThrow("create_svg: parent node not found with ID: nonexistent.");

            await expect(
                componentHandlersMod.createComponentInstance({ componentId: "c1", parentId: "nonexistent" })
            ).rejects.toThrow("create_instance: parent node not found with ID: nonexistent.");

            expect(createFrameCalls).toBe(0);
            expect(createTextCalls).toBe(0);
            expect(createNodeFromSvgCalls).toBe(0);
        });

        it("throws when parent cannot contain children, before any create method is called", async () => {
            const badParent: any = { id: "bad-parent", name: "Bad Parent", type: "RECTANGLE" };
            gateNodeMap.set("bad-parent", badParent);

            await expect(
                nodeCreatorsMod.createFrame({ parentId: "bad-parent" })
            ).rejects.toThrow("create_frame: parent 'Bad Parent' (type RECTANGLE) cannot contain children.");

            await expect(
                nodeCreatorsMod.createText({ parentId: "bad-parent" })
            ).rejects.toThrow("create_text: parent 'Bad Parent' (type RECTANGLE) cannot contain children.");

            await expect(
                vectorHandlersMod.createNodeFromSvg({ svg: "<svg></svg>", parentId: "bad-parent" })
            ).rejects.toThrow("create_svg: parent 'Bad Parent' (type RECTANGLE) cannot contain children.");

            await expect(
                componentHandlersMod.createComponentInstance({ componentId: "c1", parentId: "bad-parent" })
            ).rejects.toThrow("create_instance: parent 'Bad Parent' (type RECTANGLE) cannot contain children.");

            expect(createFrameCalls).toBe(0);
            expect(createTextCalls).toBe(0);
            expect(createNodeFromSvgCalls).toBe(0);
        });

        it("create_shape validates the parent before createRectangle/createEllipse/createPolygon/createStar", async () => {
            // pointCount is a pre-parent parameter check for POLYGON/STAR, so
            // supply it — this test pins the parent gate, not param validation.
            for (const type of ["RECTANGLE", "ELLIPSE", "POLYGON", "STAR"]) {
                await expect(
                    nodeCreatorsMod.createShape({ type, pointCount: 5, parentId: "nonexistent" })
                ).rejects.toThrow("create_shape: parent node not found with ID: nonexistent.");
            }
            expect(createRectangleCalls).toBe(0);
            expect(createEllipseCalls).toBe(0);
            expect(createPolygonCalls).toBe(0);
            expect(createStarCalls).toBe(0);
        });

        it("valid parent still creates and appends a component instance", async () => {
            const { parentNode } = setupEnvironment();
            const comp: any = {
                id: "c1",
                name: "My Component",
                type: "COMPONENT",
                createInstance: () => ({
                    id: "inst-1",
                    name: "Instance",
                    type: "INSTANCE",
                    componentId: "c1",
                    remove: () => {},
                    removed: false
                })
            };
            gateNodeMap.set("c1", comp);

            const res = await componentHandlersMod.createComponentInstance({ componentId: "c1", parentId: "parent-id", x: 3, y: 4 });
            expect(res.id).toBe("inst-1");
            expect(parentNode.children.map((c: any) => c.id)).toContain("inst-1");
        });
    });

    describe("SVG validation before parent validation", () => {
        it("errors for missing/invalid SVG before parent check", async () => {
            expect(
                vectorHandlersMod.createNodeFromSvg({ svg: "", parentId: "parent-id" })
            ).rejects.toThrow("Missing required parameter: svg string.");
        });
    });

    describe("Cleanup of created nodes on configuration/reparent failure", () => {
        it("createFrame cleans up Frame on configuration error", async () => {
            setupEnvironment();
            mockResizeThrow = true;
            let createdFrame: any = null;
            const originalCreateFrame = gateFigma.createFrame;
            gateFigma.createFrame = () => {
                createdFrame = originalCreateFrame();
                return createdFrame;
            };

            await expect(
                nodeCreatorsMod.createFrame({ parentId: "parent-id", width: 200 })
            ).rejects.toThrow("Mock resize throw");

            expect(createdFrame).not.toBeNull();
            expect(createdFrame.removed).toBe(true);

            gateFigma.createFrame = originalCreateFrame; // restore
        });

        it("createText cleans up Text on configuration error", async () => {
            setupEnvironment();
            mockFillsThrow = true;
            let createdText: any = null;
            const originalCreateText = gateFigma.createText;
            gateFigma.createText = () => {
                createdText = originalCreateText();
                return createdText;
            };

            await expect(
                nodeCreatorsMod.createText({ parentId: "parent-id", text: "Hello" })
            ).rejects.toThrow("Mock fills throw");

            expect(createdText).not.toBeNull();
            expect(createdText.removed).toBe(true);

            gateFigma.createText = originalCreateText; // restore
        });

        it("createShape cleans up Shape on configuration error", async () => {
            setupEnvironment();
            mockResizeThrow = true;
            let createdShape: any = null;
            const originalCreateRectangle = gateFigma.createRectangle;
            gateFigma.createRectangle = () => {
                createdShape = originalCreateRectangle();
                return createdShape;
            };

            await expect(
                nodeCreatorsMod.createShape({ type: "RECTANGLE", parentId: "parent-id", width: 200 })
            ).rejects.toThrow("Mock resize throw");

            expect(createdShape).not.toBeNull();
            expect(createdShape.removed).toBe(true);

            gateFigma.createRectangle = originalCreateRectangle; // restore
        });

        it("createNodeFromSvg cleans up SVG on post-creation error", async () => {
            setupEnvironment();
            mockResizeThrow = true;
            let createdSvg: any = null;
            const originalCreateNodeFromSvg = gateFigma.createNodeFromSvg;
            gateFigma.createNodeFromSvg = (svg) => {
                createdSvg = originalCreateNodeFromSvg(svg);
                return createdSvg;
            };

            await expect(
                vectorHandlersMod.createNodeFromSvg({ svg: "<svg></svg>", parentId: "parent-id", x: 10 })
            ).rejects.toThrow("Mock x position throw");

            expect(createdSvg).not.toBeNull();
            expect(createdSvg.removed).toBe(true);

            gateFigma.createNodeFromSvg = originalCreateNodeFromSvg;
        });

        it("createComponentInstance cleans up instance on post-creation error", async () => {
            setupEnvironment();
            let createdInstance: any = null;
            const comp: any = {
                id: "c1",
                name: "My Component",
                type: "COMPONENT",
                createInstance: () => {
                    const inst = {
                        id: "inst-1",
                        name: "Instance",
                        type: "INSTANCE",
                        remove: () => { (inst as any).removed = true; },
                        removed: false
                    };
                    Object.defineProperty(inst, "x", {
                        set: () => {
                            if (mockResizeThrow) throw new Error("Mock x position throw");
                        }
                    });
                    createdInstance = inst;
                    return inst;
                }
            };
            gateNodeMap.set("c1", comp);

            mockResizeThrow = true; // this will throw when setting instance.x = x
            await expect(
                componentHandlersMod.createComponentInstance({ componentId: "c1", parentId: "parent-id", x: 10 })
            ).rejects.toThrow("Mock x position throw");

            expect(createdInstance).not.toBeNull();
            expect(createdInstance.removed).toBe(true);
        });

        it("createComponent cleans up Component on configuration error", async () => {
            const { parentNode } = setupEnvironment();
            const sourceFrame: any = {
                id: "frame-src",
                name: "My Frame",
                type: "FRAME",
                width: 100,
                height: 100,
                parent: parentNode,
                children: [],
                remove: () => { (sourceFrame as any).removed = true; },
                removed: false,
            };
            gateNodeMap.set("frame-src", sourceFrame);
            parentNode.children.push(sourceFrame);

            mockResizeThrow = true; // throws in component.resize()
            let createdComp: any = null;
            const originalCreateComponent = gateFigma.createComponent;
            gateFigma.createComponent = () => {
                createdComp = originalCreateComponent();
                return createdComp;
            };

            await expect(
                componentHandlersMod.createComponent({ nodeId: "frame-src" })
            ).rejects.toThrow("Mock resize throw");

            expect(createdComp).not.toBeNull();
            expect(createdComp.removed).toBe(true);

            gateFigma.createComponent = originalCreateComponent; // restore
        });

        it("cloneNode cleans up Clone on post-creation error", async () => {
            const page: any = {
                id: "page-1",
                name: "Page",
                type: "PAGE",
                appendChild: (child: any) => {
                    child.parent = page;
                }
            };
            let createdClone: any = null;
            const source: any = {
                id: "c1",
                name: "c1",
                type: "COMPONENT",
                parent: page,
                clone: () => {
                    const cl = {
                        id: "clone-1",
                        name: "c1 (Clone)",
                        type: "COMPONENT",
                        remove: () => { (cl as any).removed = true; },
                        removed: false,
                        x: 0,
                        y: 0
                    };
                    Object.defineProperty(cl, "x", {
                        set: () => {
                            throw new Error("Mock x positioning error");
                        }
                    });
                    createdClone = cl;
                    return cl;
                }
            };
            gateNodeMap.set("c1", source);

            await expect(
                nodeCreatorsMod.cloneNode({ nodeId: "c1", x: 10, y: 20 })
            ).rejects.toThrow("Mock x positioning error");

            expect(createdClone).not.toBeNull();
            expect(createdClone.removed).toBe(true);
        });
    });

    describe("create_instance specific behaviors", () => {
        it("rejects COMPONENT_SET id with variant pointer", async () => {
            setupEnvironment();
            const componentSet: any = {
                id: "comp-set-id",
                name: "Button Set",
                type: "COMPONENT_SET",
                defaultVariant: {
                    id: "variant-id",
                    name: "Button (Variant)"
                }
            };
            gateNodeMap.set("comp-set-id", componentSet);

            await expect(
                componentHandlersMod.createComponentInstance({ componentId: "comp-set-id", parentId: "parent-id" })
            ).rejects.toThrow(
                "create_instance: 'Button Set' is a COMPONENT_SET; pass one of its variant COMPONENTs — e.g. its default variant 'Button (Variant)' (variant-id)."
            );
        });

        it("surfaces targeted W1 wrap on importComponentByKeyAsync failure", async () => {
            setupEnvironment();
            mockImportByKeyThrow = true;

            await expect(
                componentHandlersMod.createComponentInstance({ componentKey: "bad-key", parentId: "parent-id" })
            ).rejects.toThrow(
                "create_instance: failed to import remote component with key 'bad-key': Figma API connection error. Read the key from an existing instance's mainComponent (component_list does not list remote library keys); confirm the source library is enabled for this file; a component-set key needs a variant's key."
            );
        });

        it("never returns legacy 'Error creating component instance:' prefix", async () => {
            setupEnvironment();
            mockImportByKeyThrow = true;

            try {
                await componentHandlersMod.createComponentInstance({ componentKey: "bad-key", parentId: "parent-id" });
                expect(true).toBe(false); // should not reach here
            } catch (err: any) {
                expect(err.message).not.toContain("Error creating component instance:");
                expect(err.message).toContain("create_instance: failed to import remote component");
            }
        });

        it("handles never-settling importComponentByKeyAsync and times out", async () => {
            setupEnvironment();
            const originalTimeout = componentHandlersMod.IMPORT_TIMEOUT_MS;
            componentHandlersMod.setImportTimeoutMs(50); // set short timeout for test

            let resolvePromise: any;
            const pendingPromise = new Promise<any>((resolve) => {
                resolvePromise = resolve;
            });

            customImportComponentByKeyAsync = async (key: string) => {
                return await pendingPromise;
            };

            const startTime = Date.now();
            await expect(
                componentHandlersMod.createComponentInstance({ componentKey: "never-settle", parentId: "parent-id" })
            ).rejects.toThrow(
                /create_instance: failed to import remote component with key 'never-settle': import timed out after 50ms/
            );
            const duration = Date.now() - startTime;
            expect(duration).toBeLessThan(500); // verify it didn't hang indefinitely

            // Clean up: resolve the pending promise to avoid unhandled rejection or leaking promise
            resolvePromise({
                id: "remote-comp-id",
                name: "Remote Component",
                type: "COMPONENT",
                createInstance: () => ({
                    id: "inst-1",
                    name: "Instance",
                    type: "INSTANCE",
                    remove: () => {},
                    removed: false
                })
            });

            componentHandlersMod.setImportTimeoutMs(originalTimeout);
        });

        it("handles late rejection of the abandoned import without unhandled rejection", async () => {
            setupEnvironment();
            const originalTimeout = componentHandlersMod.IMPORT_TIMEOUT_MS;
            componentHandlersMod.setImportTimeoutMs(50); // short timeout

            let rejectPromise: any;
            const pendingPromise = new Promise<any>((resolve, reject) => {
                rejectPromise = reject;
            });

            customImportComponentByKeyAsync = async (key: string) => {
                return await pendingPromise;
            };

            await expect(
                componentHandlersMod.createComponentInstance({ componentKey: "late-reject", parentId: "parent-id" })
            ).rejects.toThrow(/import timed out/);

            // Trigger late rejection
            rejectPromise(new Error("Late failure"));
            
            // Wait a tick to ensure no unhandled rejection propagates
            await new Promise(r => setTimeout(r, 10));

            componentHandlersMod.setImportTimeoutMs(originalTimeout);
        });

        it("succeeds when import resolves quickly", async () => {
            setupEnvironment();
            const parent = {
                id: "parent-id",
                name: "Parent",
                type: "FRAME",
                appendChild: () => {},
                children: []
            };
            gateNodeMap.set("parent-id", parent);

            const res = await componentHandlersMod.createComponentInstance({ componentKey: "valid-key", parentId: "parent-id" });
            expect(res.id).toBe("inst-1");
        });

        it("asserts IMPORT_TIMEOUT_MS is strictly less than 30000ms client timeout", () => {
            expect(componentHandlersMod.IMPORT_TIMEOUT_MS).toBeLessThan(30000);
        });
    });
});
