import { describe, it, expect, beforeEach } from "bun:test";

// v1.4.0 §get_components rule 4 — REQUIRED regression test.
//
// After the loadAllPagesAsync removal, get_components({ scope: 'document' })
// iterates figma.root.children and calls page.findAllWithCriteria per page.
// The resulting order is page-then-document-order (intra-page order preserved
// per page; pages in figma.root.children order). This test pins that order so
// any accidental reshuffle — e.g. reintroducing figma.root.findAllWithCriteria,
// parallelizing page processing, or sort-by-name — fails loudly.
//
// Fixture: 3 pages × 3 components per page, deterministic names.

import { getComponents } from "../../../../../figma_plugin/handlers/componentHandlers.js";

type FakeComponent = {
    id: string;
    name: string;
    key: string;
    remote: boolean;
    type: "COMPONENT";
    parent: FakePage;
};

type FakePage = {
    id: string;
    name: string;
    type: "PAGE";
    children: FakeComponent[];
    findAllWithCriteria: (opts: { types: string[] }) => FakeComponent[];
    loadAsync: () => Promise<void>;
};

function makeFixture(): FakePage[] {
    const pageNames = ["Page A", "Page B", "Page C"];
    return pageNames.map((pageName, pageIdx) => {
        const components: FakeComponent[] = [];
        const page: FakePage = {
            id: `${pageIdx + 1}:0`,
            name: pageName,
            type: "PAGE",
            children: components,
            findAllWithCriteria: ({ types }) =>
                types.includes("COMPONENT")
                    ? components
                    : [],
            loadAsync: async () => {},
        };
        for (let c = 1; c <= 3; c++) {
            components.push({
                id: `${pageIdx + 1}:${c}`,
                name: `Comp-${c}`,
                key: `key-${pageName}-${c}`,
                remote: false,
                type: "COMPONENT",
                parent: page,
            });
        }
        return page;
    });
}

describe("get_components ordering regression (v1.4.0 §get_components rule 4)", () => {
    let pages: FakePage[];

    beforeEach(() => {
        pages = makeFixture();
        (globalThis as any).figma = {
            root: { children: pages },
            currentPage: pages[0],
        };
    });

    it("returns components in page-then-document-order", async () => {
        const result = await getComponents({ scope: "document" });

        const expectedOrder = [
            "1:1", "1:2", "1:3",
            "2:1", "2:2", "2:3",
            "3:1", "3:2", "3:3",
        ];
        expect(result.components.map((c: any) => c.id)).toEqual(expectedOrder);
        expect(result.count).toBe(9);
        expect(result.scope).toBe("document");
    });

    it("populates pageId correctly on every entry so callers can re-bucket", async () => {
        const result = await getComponents({ scope: "document" });

        for (const comp of result.components as any[]) {
            const expectedPageId = comp.id.split(":")[0] + ":0";
            expect(comp.pageId).toBe(expectedPageId);
        }
    });

    it("does not call figma.loadAllPagesAsync (smoke test for rule 1)", async () => {
        let loadAllCalled = false;
        (globalThis as any).figma = {
            root: { children: pages },
            currentPage: pages[0],
            loadAllPagesAsync: async () => {
                loadAllCalled = true;
            },
        };

        await getComponents({ scope: "document" });

        expect(loadAllCalled).toBe(false);
    });
});
