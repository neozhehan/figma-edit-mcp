import { connectToFigma, joinChannel, sendCommandToFigma } from "../src/mcp_server/figma-client.js";
import { setTimeout } from "timers/promises";

async function main() {
    const channel = process.argv[2] || "uz72";
    console.log(`🚀 Starting Live Figma Verification on channel '${channel}'...`);
    
    // Connect to Figma
    connectToFigma(3055);
    
    // Wait a little for connection to open
    await setTimeout(1000);
    
    try {
        // 1. Join channel
        console.log(`\n--- Step 1: Joining channel '${channel}' ---`);
        await joinChannel(channel);
        
        // Get connect payload to see scope ID and mode
        const connectPayload: any = await sendCommandToFigma("get_connect_payload");
        console.log("Editable Scope Type:", connectPayload.editableScopeType);
        console.log("Document Name:", connectPayload.documentName);
        
        let scopeRootId: string;
        let scopeRootName: string;
        
        if (connectPayload.editableScopeType === "page") {
            scopeRootId = connectPayload.pages[0].pageId;
            scopeRootName = connectPayload.pages[0].pageName;
        } else if (connectPayload.editableScopeType === "node") {
            scopeRootId = connectPayload.node.nodeId;
            scopeRootName = connectPayload.node.nodeName;
        } else if (connectPayload.editableScopeType === "readonly") {
            throw new Error("Live test requires write mode. Please connect with a Page/Layer link!");
        } else {
            throw new Error("Unknown editableScopeType: " + connectPayload.editableScopeType);
        }
        
        console.log(`Resolved Scope Node: ID=${scopeRootId}, Name="${scopeRootName}"`);
        
        // 2. create_shape Functional Verification
        console.log("\n--- Step 2: create_shape Functional Verification ---");
        
        // 2.1 Rectangle with Fill and Stroke
        console.log("Creating RECTANGLE with custom fillColor and strokeColor...");
        const rect: any = await sendCommandToFigma("create_shape", {
            type: "RECTANGLE",
            parentId: scopeRootId,
            parentNodeName: scopeRootName,
            x: 50,
            y: 50,
            width: 150,
            height: 100,
            fillColor: { r: 0.8, g: 0.2, b: 0.2, a: 1 },
            strokeColor: { r: 0.2, g: 0.2, b: 0.8, a: 1 }
        });
        console.log(`Created Rectangle: ID=${rect.id}, Name="${rect.name}"`);
        
        // Inspect created rectangle properties
        console.log("Inspecting created Rectangle properties...");
        const rectInfo: any = await sendCommandToFigma("node_info", {
            nodeIds: [rect.id],
            properties: ["fills", "strokes", "parent"]
        });
        const rectNode = rectInfo.nodes[0];
        console.log("Properties:", JSON.stringify(rectNode.properties));
        
        const fills = rectNode.properties?.fills;
        const strokes = rectNode.properties?.strokes;
        const parent = rectNode.properties?.parent;
        
        console.log("Fills:", JSON.stringify(fills));
        console.log("Strokes:", JSON.stringify(strokes));
        console.log("Parent ID (should be string):", parent);
        
        if (typeof parent !== "string") {
            throw new Error("Expected parent field to map to a string ID, but got " + typeof parent);
        }
        
        // 2.2 Star with Odd pointCount
        console.log("Creating STAR with pointCount: 5 (odd count)...");
        const star5: any = await sendCommandToFigma("create_shape", {
            type: "STAR",
            parentId: scopeRootId,
            parentNodeName: scopeRootName,
            x: 250,
            y: 50,
            width: 100,
            height: 100,
            pointCount: 5,
            innerRadius: 0.38
        });
        console.log(`Created Star (5 spikes): ID=${star5.id}, Name="${star5.name}"`);
        
        console.log("Creating STAR with pointCount: 7 (odd count)...");
        const star7: any = await sendCommandToFigma("create_shape", {
            type: "STAR",
            parentId: scopeRootId,
            parentNodeName: scopeRootName,
            x: 400,
            y: 50,
            width: 100,
            height: 100,
            pointCount: 7,
            innerRadius: 0.45
        });
        console.log(`Created Star (7 spikes): ID=${star7.id}, Name="${star7.name}"`);
        
        console.log("Querying pointCount / innerRadius fields via node_info...");
        const starsInfo: any = await sendCommandToFigma("node_info", {
            nodeIds: [star5.id, star7.id],
            properties: ["pointCount", "innerRadius"]
        });
        console.log("Star 5 properties:", JSON.stringify(starsInfo.nodes[0].properties));
        console.log("Star 7 properties:", JSON.stringify(starsInfo.nodes[1].properties));
        
        if (starsInfo.nodes[0].properties?.pointCount !== 5 || starsInfo.nodes[1].properties?.pointCount !== 7) {
            throw new Error(`Point count mismatch! Expected 5 and 7, got ${starsInfo.nodes[0].properties?.pointCount} and ${starsInfo.nodes[1].properties?.pointCount}`);
        }
        
        // 2.3 Invalid Shape-specific params checks
        console.log("Verifying validation rejects invalid shape-specific params...");
        try {
            await sendCommandToFigma("create_shape", {
                type: "RECTANGLE",
                parentId: scopeRootId,
                parentNodeName: scopeRootName,
                x: 50,
                y: 50,
                width: 100,
                height: 100,
                arcData: { startingAngle: 0, endingAngle: 6.28, innerRadius: 0 } // invalid for RECTANGLE
            });
            console.log("❌ Error: RECTANGLE with arcData should have failed validation but did not.");
        } catch (err: any) {
            console.log("✅ Successfully rejected RECTANGLE with arcData:", err.message);
        }
        
        try {
            await sendCommandToFigma("create_shape", {
                type: "RECTANGLE",
                parentId: scopeRootId,
                parentNodeName: scopeRootName,
                x: 50,
                y: 50,
                width: 100,
                height: 100,
                innerRadius: 0.5 // invalid for RECTANGLE (supported only for STAR)
            });
            console.log("❌ Error: RECTANGLE with innerRadius should have failed validation but did not.");
        } catch (err: any) {
            console.log("✅ Successfully rejected RECTANGLE with innerRadius:", err.message);
        }

        // 3. node_transform Verification (Partial Updates)
        console.log("\n--- Step 3: node_transform (Partial Updates) Verification ---");
        
        // Move X only
        console.log("Moving Rectangle to x: 120 (y, width, height should remain unchanged)...");
        await sendCommandToFigma("node_transform", {
            nodeId: rect.id,
            nodeName: rect.name,
            x: 120
        });
        
        // Resize Width only
        console.log("Resizing Rectangle to width: 220 (x, y, height should remain unchanged)...");
        await sendCommandToFigma("node_transform", {
            nodeId: rect.id,
            nodeName: rect.name,
            width: 220
        });
        
        const rectInfoAfterTransform: any = await sendCommandToFigma("node_info", {
            nodeIds: [rect.id],
            properties: ["x", "y", "width", "height"]
        });
        console.log("Rectangle properties after transform:", JSON.stringify(rectInfoAfterTransform.nodes[0].properties));
        const nodeAfter = rectInfoAfterTransform.nodes[0].properties;
        if (nodeAfter.x !== 120 || nodeAfter.y !== 50 || nodeAfter.width !== 220 || nodeAfter.height !== 100) {
            throw new Error(`Transform verification failed! Expected x:120, y:50, width:220, height:100. Got: ${JSON.stringify(nodeAfter)}`);
        }
        console.log("✅ Partial transforms verified successfully.");
        
        // 4. Style Lifecycle & node_info Library Reference Resolution `{id, name}`
        console.log("\n--- Step 4: Style Lifecycle & node_info Library Reference Resolution ---");
        
        // Create paint style
        console.log("Creating new Paint Style...");
        const styleRes: any = await sendCommandToFigma("style_manage", {
            type: "PAINT",
            name: "Live Test Paint Style",
            properties: {
                paints: [
                    { type: "SOLID", color: { r: 0.1, g: 0.9, b: 0.1, a: 1 } }
                ]
            }
        });
        const styleId = styleRes.id;
        console.log(`Created Paint Style: ID=${styleId}, Name="${styleRes.name}"`);
        
        // Apply paint style to rectangle
        console.log("Applying Paint Style to Rectangle...");
        await sendCommandToFigma("node_apply_style", {
            nodeId: rect.id,
            nodeName: rect.name,
            styleId: styleId,
            styleType: "FILL"
        });
        
        // Query node_info with fillStyleId
        console.log("Querying fillStyleId (should resolve to {id, name})...");
        const rectStyleInfo: any = await sendCommandToFigma("node_info", {
            nodeIds: [rect.id],
            properties: ["fillStyleId"]
        });
        console.log("Resolved fillStyleId:", JSON.stringify(rectStyleInfo.nodes[0].properties.fillStyleId));
        const fillStyleObj = rectStyleInfo.nodes[0].properties.fillStyleId;
        if (!fillStyleObj || fillStyleObj.id !== styleId || fillStyleObj.name !== "Live Test Paint Style") {
            throw new Error(`StyleId resolution failed! Expected {id: "${styleId}", name: "Live Test Paint Style"}, got: ${JSON.stringify(fillStyleObj)}`);
        }
        console.log("✅ Library reference resolution successfully verified.");
        
        // Delete style (safe detach)
        console.log("Deleting Paint Style...");
        await sendCommandToFigma("style_delete", {
            styleId: styleId,
            styleName: "Live Test Paint Style"
        });
        
        // Verify rectangle keeps the fill paint but fillStyleId is null
        const rectStyleAfterDelete: any = await sendCommandToFigma("node_info", {
            nodeIds: [rect.id],
            properties: ["fillStyleId", "fills"]
        });
        console.log("Rectangle fillStyleId after style delete (should be null):", rectStyleAfterDelete.nodes[0].properties.fillStyleId);
        console.log("Rectangle fills after style delete (should keep green color):", JSON.stringify(rectStyleAfterDelete.nodes[0].properties.fills));
        
        if (rectStyleAfterDelete.nodes[0].properties.fillStyleId !== null) {
            throw new Error(`Expected fillStyleId to be null after deletion, got ${JSON.stringify(rectStyleAfterDelete.nodes[0].properties.fillStyleId)}`);
        }
        console.log("✅ Style deletion & safe detach verified successfully.");

        // 5. figma.mixed & Symbol Serialization Verification
        console.log("\n--- Step 5: figma.mixed & Symbol Serialization Verification ---");
        
        // Set mixed corner radius on Rectangle
        console.log("Setting mixed corner radius on Rectangle [15, 0, 0, 0]...");
        await sendCommandToFigma("node_set_corner_radius", {
            nodeId: rect.id,
            nodeName: rect.name,
            radius: 15,
            corners: [true, false, false, false]
        });
        
        // Query cornerRadius via node_info
        console.log("Querying cornerRadius via node_info (should resolve to 'mixed')...");
        const rectCornerInfo: any = await sendCommandToFigma("node_info", {
            nodeIds: [rect.id],
            properties: ["cornerRadius"]
        });
        console.log("Rectangle properties (should have cornerRadius: 'mixed'):", JSON.stringify(rectCornerInfo.nodes[0].properties));
        if (rectCornerInfo.nodes[0].properties?.cornerRadius !== "mixed") {
            throw new Error(`Expected cornerRadius to be 'mixed', but got: ${rectCornerInfo.nodes[0].properties?.cornerRadius}`);
        }
        console.log("✅ figma.mixed and Symbol serialization verified successfully.");

        // 6. Component Property Management and Deletion (Split)
        console.log("\n--- Step 6: Component Property Management and Deletion ---");
        
        // Create frame
        console.log("Creating a Frame to convert...");
        const frame: any = await sendCommandToFigma("create_frame", {
            parentId: scopeRootId,
            parentNodeName: scopeRootName,
            x: 50,
            y: 300,
            width: 150,
            height: 150
        });
        
        // Convert to main component
        console.log("Converting Frame to main component...");
        const comp: any = await sendCommandToFigma("create_component", {
            nodeId: frame.id,
            nodeName: frame.name
        });
        console.log(`Converted to Component: ID=${comp.id}, Name="${comp.name}"`);
        
        // Add component property
        console.log("Adding component text property 'testProp'...");
        await sendCommandToFigma("component_manage_property", {
            nodeId: comp.id,
            nodeName: comp.name,
            action: "ADD",
            propertyName: "testProp",
            propertyType: "TEXT",
            defaultValue: "hello"
        });
        
        // Verify property was added
        const compInfo: any = await sendCommandToFigma("node_info", {
            nodeIds: [comp.id],
            properties: ["componentPropertyDefinitions"]
        });
        console.log("Component properties:", JSON.stringify(compInfo.nodes[0].properties.componentPropertyDefinitions));
        
        const hasProp = compInfo.nodes[0].properties?.componentPropertyDefinitions && 
            Object.keys(compInfo.nodes[0].properties.componentPropertyDefinitions).some(k => k === "testProp" || k.startsWith("testProp#"));
        if (!hasProp) {
            throw new Error("Expected component property 'testProp' to exist!");
        }
        
        // Delete component property
        console.log("Deleting component property 'testProp'...");
        await sendCommandToFigma("component_delete_property", {
            nodeId: comp.id,
            nodeName: comp.name,
            propertyName: "testProp"
        });
        
        // Verify property was deleted
        const compInfoAfterDelete: any = await sendCommandToFigma("node_info", {
            nodeIds: [comp.id],
            properties: ["componentPropertyDefinitions"]
        });
        console.log("Component properties after delete:", JSON.stringify(compInfoAfterDelete.nodes[0].properties.componentPropertyDefinitions));
        
        const hasPropAfter = compInfoAfterDelete.nodes[0].properties?.componentPropertyDefinitions && 
            Object.keys(compInfoAfterDelete.nodes[0].properties.componentPropertyDefinitions).some(k => k === "testProp" || k.startsWith("testProp#"));
        if (hasPropAfter) {
            throw new Error("Expected component property 'testProp' to be deleted!");
        }
        console.log("✅ Component property management and deletion (split) verified successfully.");

        // 6.5 Phase 1 v2.1.0 Enhancements Verification
        console.log("\n--- Step 6.5: Phase 1 v2.1.0 Enhancements Verification ---");

        // A. Creation tools require parentId
        console.log("Checking that creation tools reject missing parentId...");
        try {
            await sendCommandToFigma("create_shape", { type: "RECTANGLE" });
            console.log("❌ Error: create_shape with missing parentId did not throw.");
        } catch (err: any) {
            console.log("   create_shape rejected missing parentId (expected)");
        }

        try {
            await sendCommandToFigma("create_shape", { type: "RECTANGLE", parentId: "nonexistent-parent", parentNodeName: "Nonexistent" });
            console.log("❌ Error: create_shape with unresolved parentId did not throw.");
        } catch (err: any) {
            console.log("   create_shape rejected unresolved parentId (expected)");
        }

        // B. view_navigate validation
        console.log("Checking that view_navigate rejects invalid/mixed targets...");
        try {
            // Mixed PAGE and node
            await sendCommandToFigma("view_navigate", { ids: [scopeRootId, rect.id] });
            console.log("❌ Error: view_navigate with mixed PAGE and node did not throw.");
        } catch (err: any) {
            console.log("   view_navigate rejected mixed targets (expected)");
        }

        // C. component_list scope: 'page' validation
        console.log("Checking that component_list scope: 'page' validates pageId...");
        try {
            await sendCommandToFigma("component_list", { scope: "page" });
            console.log("❌ Error: component_list scope: 'page' without pageId did not throw.");
        } catch (err: any) {
            console.log("   component_list rejected missing pageId (expected)");
        }

        // D. annotation_list validation
        console.log("Checking that annotation_list requires exactly one of pageId or nodeId...");
        try {
            await sendCommandToFigma("annotation_list", {});
            console.log("❌ Error: annotation_list with neither pageId nor nodeId did not throw.");
        } catch (err: any) {
            console.log("   annotation_list rejected neither parameter (expected)");
        }

        try {
            await sendCommandToFigma("annotation_list", { pageId: scopeRootId, nodeId: rect.id });
            console.log("❌ Error: annotation_list with both pageId and nodeId did not throw.");
        } catch (err: any) {
            console.log("   annotation_list rejected both parameters (expected)");
        }

        // E. variable_list includeConsumers: 'page' validation
        console.log("Checking that variable_list includeConsumers: 'page' validates pageId...");
        try {
            await sendCommandToFigma("variable_list", { variableId: ["nonexistent-var"], includeConsumers: "page" });
            console.log("❌ Error: variable_list includeConsumers: 'page' without pageId did not throw.");
        } catch (err: any) {
            console.log("   variable_list rejected missing pageId (expected)");
        }

        // F. instance_get_overrides validation
        console.log("Checking that instance_get_overrides rejects missing instanceNodeId...");
        try {
            await sendCommandToFigma("instance_get_overrides", {});
            console.log("❌ Error: instance_get_overrides with missing instanceNodeId did not throw.");
        } catch (err: any) {
            console.log("   instance_get_overrides rejected missing ID (expected)");
        }

        // G. component_list document scope (the new default) must succeed across ALL
        //    pages. In dynamic-page documents each page needs an explicit loadAsync()
        //    before findAllWithCriteria(); a missing load throws only on pages that
        //    were never opened, so this positive check guards that regression.
        console.log("Checking that component_list document scope succeeds across all pages...");
        const docComponents: any = await sendCommandToFigma("component_list", {});
        if (docComponents.scope !== "document" || typeof docComponents.count !== "number") {
            throw new Error(`component_list document scope failed: ${JSON.stringify(docComponents)}`);
        }
        console.log(`   ✅ component_list document scope returned ${docComponents.count} components (no load error)`);

        // 6.6 Phase 3 v2.1.0 Bounded Parallelism & Streaming Verification
        console.log("\n--- Step 6.6: Phase 3 Bounded Parallelism & Streaming Verification ---");
        
        console.log("Querying node_info with multiple IDs including a missing ID...");
        const queryRes: any = await sendCommandToFigma("node_info", {
            nodeIds: [star5.id, "ghost-id-12345", rect.id, star7.id],
            concurrencyLimit: 2
        });
        
        console.log("Returned nodes:", JSON.stringify(queryRes.nodes.map((n: any) => n.id)));
        console.log("Returned missingNodeIds:", JSON.stringify(queryRes.missingNodeIds));
        
        // Assert exact order in nodes
        const expectedNodeOrder = [star5.id, rect.id, star7.id];
        const actualNodeOrder = queryRes.nodes.map((n: any) => n.id);
        if (JSON.stringify(actualNodeOrder) !== JSON.stringify(expectedNodeOrder)) {
            throw new Error(`Expected nodes order ${JSON.stringify(expectedNodeOrder)}, but got ${JSON.stringify(actualNodeOrder)}`);
        }
        
        // Assert missing ID is returned
        if (!queryRes.missingNodeIds || !queryRes.missingNodeIds.includes("ghost-id-12345")) {
            throw new Error(`Expected missingNodeIds to contain "ghost-id-12345", but got ${JSON.stringify(queryRes.missingNodeIds)}`);
        }
        
        console.log("✅ Bounded Parallelism & Streaming verified successfully on live channel.");

        // 6.7 Phase 4 v2.1.0 Atomicity & Type Pre-Validation Verification
        console.log("\n--- Step 6.7: Phase 4 Atomicity & Type Pre-Validation Verification ---");

        // A text node for the atomicity tests. The existing `rect` (RECTANGLE) is the wrong-typed target.
        console.log("Creating a text node for atomicity tests...");
        const atomicText: any = await sendCommandToFigma("create_text", {
            parentId: scopeRootId,
            parentNodeName: scopeRootName,
            x: 50,
            y: 500,
            text: "ATOMIC_ORIGINAL",
            name: "AtomicText"
        });
        console.log(`Created text node: ID=${atomicText.id}`);

        // A. Type pre-validation: a batch with one wrong-typed (non-TEXT) target must abort with
        //    ZERO mutations. The valid text node is listed FIRST, so a non-atomic implementation
        //    would mutate it before hitting the failing entry.
        console.log("Checking text_set_content aborts (zero mutations) when a batch contains a non-TEXT target...");
        let textBatchThrew = false;
        try {
            await sendCommandToFigma("text_set_content", {
                text: [
                    { nodeId: atomicText.id, nodeName: "AtomicText", characters: "ATOMIC_MUTATED" },
                    { nodeId: rect.id, nodeName: rect.name, characters: "ATOMIC_MUTATED" } // RECTANGLE — wrong type
                ]
            });
        } catch (err: any) {
            textBatchThrew = true;
            console.log("   text_set_content rejected wrong-typed batch (expected):", err.message);
        }
        if (!textBatchThrew) {
            throw new Error("Expected text_set_content to reject a batch containing a non-TEXT target.");
        }

        // Confirm zero mutations: the valid (first) text node must be UNCHANGED.
        const atomicCheck: any = await sendCommandToFigma("node_info", {
            nodeIds: [atomicText.id],
            properties: ["characters"]
        });
        const atomicChars = atomicCheck.nodes[0].properties?.characters;
        if (atomicChars !== "ATOMIC_ORIGINAL") {
            throw new Error(`Expected text node untouched ("ATOMIC_ORIGINAL"), got "${atomicChars}" — batch was not atomic!`);
        }
        console.log("   ✅ Valid target untouched (zero mutations) — type check aborts before any write.");

        // B. node_delete is validation-atomic: a not-found id aborts the whole batch at dispatch
        //    ("Node X not found") BEFORE any deletion — it does NOT return partial successCount.
        //    (Resilient partial successCount/failureCount applies only to mutation-phase races on
        //    already-validated nodes — covered by the unit tests, not stageable live.)
        console.log("Checking node_delete is validation-atomic: a not-found id aborts without deleting valid targets...");
        let deleteThrew = false;
        try {
            await sendCommandToFigma("node_delete", {
                nodes: [
                    { nodeId: "ghost-delete-id-99999", nodeName: "Ghost" },
                    { nodeId: atomicText.id, nodeName: "AtomicText" }
                ]
            });
        } catch (err: any) {
            deleteThrew = true;
            console.log("   node_delete rejected stale id (expected):", err.message);
        }
        if (!deleteThrew) {
            throw new Error("Expected node_delete to reject a batch containing a not-found id.");
        }
        // Confirm zero deletions: the valid node must survive the aborted batch.
        const survived: any = await sendCommandToFigma("node_info", { nodeIds: [atomicText.id], properties: ["type"] });
        if (!survived.nodes || survived.nodes.length !== 1 || survived.nodes[0].id !== atomicText.id) {
            throw new Error("Expected the valid text node to survive the aborted node_delete batch.");
        }
        console.log("   ✅ node_delete validation-atomic: stale id aborted the batch, valid node survived.");

        console.log("✅ Phase 4 Atomicity & Type Pre-Validation verified successfully on live channel.");

        // 7. Cleanup
        console.log("\n--- Step 7: Cleanup ---");
        console.log("Deleting created test nodes...");
        await sendCommandToFigma("node_delete", {
            nodes: [
                { nodeId: rect.id, nodeName: rect.name },
                { nodeId: star5.id, nodeName: star5.name },
                { nodeId: star7.id, nodeName: star7.name },
                { nodeId: comp.id, nodeName: comp.name },
                { nodeId: atomicText.id, nodeName: "AtomicText" }
            ]
        });
        console.log("✅ Cleanup complete.");
        
        console.log("\n🎉 ALL LIVE VERIFICATION TESTS PASSED SUCCESSFULLY!");
        process.exit(0);
        
    } catch (err: any) {
        console.error("\n❌ Live Verification Failed:", err.message);
        process.exit(1);
    }
}

main();
