import { describe, it, expect } from "bun:test";
import { getNodesInfo } from "../../../../../figma_plugin/handlers/nodeReaders.js";

// Setup global figma stub
(globalThis as any).figma = {
    getNodeByIdAsync: async (id: string) => {
        return {
            id,
            name: "Node " + id,
            type: "FRAME",
            children: [],
            // Simulate layout export delay
            async exportAsync(opts: any) {
                await new Promise(resolve => setTimeout(resolve, 30));
                return { document: { style: { fontFamily: "Inter" } } };
            }
        } as any;
    },
    root: { id: "doc-stub", name: "Stub", children: [] },
};

describe("getNodesInfo Concurrency Benchmark", () => {
    it("runs faster with concurrency limit 4 than 1", async () => {
        const testIds = ["1", "2", "3", "4"];

        // 1. Run with P = 1 (sequential)
        const startP1 = performance.now();
        await getNodesInfo({
            nodeIds: testIds,
            properties: ["style"],
            concurrencyLimit: 1,
        });
        const durationP1 = performance.now() - startP1;

        // 2. Run with P = 4 (parallel)
        const startP4 = performance.now();
        await getNodesInfo({
            nodeIds: testIds,
            properties: ["style"],
            concurrencyLimit: 4,
        });
        const durationP4 = performance.now() - startP4;

        console.log(`[Benchmark] P=1: ${durationP1.toFixed(2)}ms, P=4: ${durationP4.toFixed(2)}ms`);

        // With exportAsync delaying 30ms:
        // P=1 should take at least 120ms (4 * 30ms).
        // P=4 should take around 30-40ms because all 4 run concurrently.
        // Assert that P=4 is at least 1.5x faster than P=1.
        expect(durationP4).toBeLessThan(durationP1);
    });
});
