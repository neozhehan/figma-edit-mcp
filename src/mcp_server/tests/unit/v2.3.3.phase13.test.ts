import { describe, expect, it } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
    changedGeneratedFiles,
    restoreGeneratedFiles,
    snapshotGeneratedFiles,
} from "../../../../scripts/check-generated.js";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const readJson = (file: string) => JSON.parse(read(file));

describe("v2.3.3 Phase 13 release boundary", () => {
    it("synchronizes every release descriptor and the built plugin handshake at 2.3.3", () => {
        const pkg = readJson("package.json");
        const lock = readJson("package-lock.json");
        const server = readJson("server.json");
        const manifest = readJson("manifest.json");

        expect(pkg.version).toBe("2.3.3");
        expect(lock.version).toBe("2.3.3");
        expect(lock.packages[""].version).toBe("2.3.3");
        expect(server.version).toBe("2.3.3");
        expect(server.packages[0].version).toBe("2.3.3");
        expect(manifest.version).toBe("2.3.3");
        expect(read("figma_plugin/code.js")).toContain(
            'var PLUGIN_VERSION = true ? "2.3.3" : "unknown";',
        );
    });

    it("documents every Phase 13 migration family with before/after examples", () => {
        const changelog = read("CHANGELOG.md");
        const start = changelog.indexOf("## [2.3.3]");
        const end = changelog.indexOf("## [2.3.2]", start);
        expect(start).toBeGreaterThan(-1);
        expect(end).toBeGreaterThan(start);
        const entry = changelog.slice(start, end);

        for (const required of [
            "currentVariableName",
            "currentStyleName",
            "collectionName",
            '"scopes"',
            "parentNodeName",
            "labelMarkdown",
            "annotationId",
            "annotatedNodes",
            "Nested inputs are strict",
            "strict per Figma effect variant",
            "empty and duplicate target sets",
            "requestedCount",
            "partial_success",
            "instanceId",
            "nodeId`/`status`/`error",
            "beforeCountVerified",
            'clientType:"plugin"',
            "PLUGIN_PEER_AMBIGUOUS",
            "create_connection",
            "reaction_to_connector_strategy",
            "VARIABLE_IN_USE",
            "descendantCount",
            "missingPageIds",
            "pageFailedNodes",
            "pagesAttempted",
            "create_instance.componentId",
        ]) {
            expect(entry, `missing Phase 13 changelog item: ${required}`).toContain(required);
        }

        expect(entry.match(/Before:/g)?.length ?? 0).toBeGreaterThanOrEqual(13);
        expect(entry.match(/After:/g)?.length ?? 0).toBeGreaterThanOrEqual(13);
    });

    it("checks generated freshness against the working snapshot, not HEAD", () => {
        const temp = fs.mkdtempSync(path.join(os.tmpdir(), "generated-gate-"));
        const generated = path.join(temp, "generated.txt");
        try {
            fs.writeFileSync(generated, "working-version\n");
            const snapshots = snapshotGeneratedFiles([generated]);

            // An intentional uncommitted output is current when regeneration
            // reproduces it byte-for-byte; repository HEAD is irrelevant.
            fs.writeFileSync(generated, "working-version\n");
            expect(changedGeneratedFiles(snapshots)).toEqual([]);

            fs.writeFileSync(generated, "stale-regeneration\n");
            const changed = changedGeneratedFiles(snapshots);
            expect(changed.map(({ file }) => file)).toEqual([generated]);
            restoreGeneratedFiles(changed);
            expect(fs.readFileSync(generated, "utf8")).toBe("working-version\n");
        } finally {
            fs.rmSync(temp, { recursive: true, force: true });
        }
    });
});
