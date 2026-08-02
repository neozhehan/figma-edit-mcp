/**
 * Phase 13 release boundary: version synchronization, the public migration
 * entry, and the generated-file freshness gate.
 *
 * This file lives at `tests/unit/` rather than `tests/unit/figma_plugin/` with
 * its sibling `v2.3.3.phase*.test.ts` suites because none of it is plugin-handler
 * behaviour — it asserts repository descriptors, `CHANGELOG.md`, and a build
 * script.
 *
 * RELEASE_VERSION is the one place the release number is written. A version bump
 * updates this constant; every other assertion derives from it, so the suite goes
 * red on a partial bump and green on a complete one.
 */
import { describe, expect, it } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
    changedGeneratedFiles,
    missingGeneratedFiles,
    restoreGeneratedFiles,
    runGeneratedCheck,
    snapshotGeneratedFiles,
} from "../../../../scripts/check-generated.js";

const RELEASE_VERSION = "2.3.3";
const PREVIOUS_VERSION = "2.3.2";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const readJson = (file: string) => JSON.parse(read(file));

const withTempDir = <T>(run: (dir: string) => T): T => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "generated-gate-"));
    try {
        return run(dir);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
};

/** Silences the check's console output so a failing-path test is not noisy. */
const quietly = <T>(run: () => T): T => {
    const { error, log } = console;
    console.error = () => {};
    console.log = () => {};
    try {
        return run();
    } finally {
        console.error = error;
        console.log = log;
    }
};

describe("v2.3.3 Phase 13 release boundary", () => {
    it("synchronizes every release descriptor and the built plugin handshake", () => {
        const pkg = readJson("package.json");
        const lock = readJson("package-lock.json");
        const server = readJson("server.json");
        const manifest = readJson("manifest.json");

        expect(pkg.version).toBe(RELEASE_VERSION);
        expect(lock.version).toBe(RELEASE_VERSION);
        expect(lock.packages[""].version).toBe(RELEASE_VERSION);
        expect(server.version).toBe(RELEASE_VERSION);
        expect(server.packages[0].version).toBe(RELEASE_VERSION);
        expect(manifest.version).toBe(RELEASE_VERSION);

        // Tolerant of how esbuild emits the `__PLUGIN_VERSION__` define (today an
        // unfolded `true ? "x" : "unknown"` ternary). Pinning the literal emission
        // turns an esbuild upgrade into a red release-boundary test for a
        // non-semantic reason; what matters is the version the bundle carries.
        const handshake = /PLUGIN_VERSION\s*=\s*(?:[^;"]*\?\s*)?"([^"]+)"/.exec(
            read("figma_plugin/code.js"),
        );
        expect(handshake?.[1]).toBe(RELEASE_VERSION);
    });

    describe("the public migration entry", () => {
        const changelog = read("CHANGELOG.md");
        const start = changelog.indexOf(`## [${RELEASE_VERSION}]`);
        const end = changelog.indexOf(`## [${PREVIOUS_VERSION}]`, start);
        const entry = changelog.slice(start, end);

        it("exists ahead of the previous release entry", () => {
            expect(start).toBeGreaterThan(-1);
            expect(end).toBeGreaterThan(start);
        });

        it("names every field and repair the Phase 13 checklist requires", () => {
            for (const required of [
                // Design-system verification (D5)
                "currentVariableName",
                "currentStyleName",
                "collectionName",
                '"scopes"',
                // Explicit placement (D6/D11)
                "parentNodeName",
                "create_component_set",
                // Annotations (D10)
                "labelMarkdown",
                "annotationId",
                "annotatedNodes",
                "beforeCountVerified",
                // Strictness (D8)
                "Nested inputs are strict",
                "strict per Figma effect variant",
                // Batch contract (D7) — including every dropped legacy count,
                // which task.md Phase 13 enumerates by name.
                "empty and duplicate target sets",
                "requestedCount",
                "partial_success",
                "nodesDeleted",
                "replacementsApplied",
                "annotationsApplied",
                "totalCount",
                "instanceId",
                "nodeId`/`status`/`error",
                // Peer-bound channel (D13) — all four admission refusals.
                'clientType:"plugin"',
                "PLUGIN_PEER_UNAVAILABLE",
                "PLUGIN_PEER_AMBIGUOUS",
                "CHANNEL_IN_USE",
                "VERSION_MISMATCH",
                // Connector removal (D12)
                "create_connection",
                "reaction_to_connector_strategy",
                // Name assignment and typography (Revs 51–54)
                "node_rename.name",
                "fontWeight",
                // Page-load isolation and coded refusals (D9/D14)
                "VARIABLE_IN_USE",
                "descendantCount",
                "missingPageIds",
                "pageFailedNodes",
                "pagesAttempted",
                // Additive repair (Rev 20)
                "create_instance.componentId",
            ]) {
                expect(entry, `missing Phase 13 changelog item: ${required}`).toContain(required);
            }
        });

        it("gives every breaking-change bullet its own before/after example", () => {
            const breaking = entry.slice(
                entry.indexOf("### Breaking changes and migration examples"),
                entry.indexOf("### Added"),
            );
            const bullets = breaking.split(/\n- \*\*/).slice(1);

            // The PRD's Compatibility posture makes a before/after example the
            // acceptance criterion for each breaking change, so assert the pairing
            // per bullet rather than a total count a deleted example could survive.
            expect(bullets.length).toBeGreaterThanOrEqual(15);
            for (const bullet of bullets) {
                const label = bullet.slice(0, bullet.indexOf("**"));
                expect(bullet, `breaking change without a "Before:" example: ${label}`).toContain(
                    "Before:",
                );
                expect(bullet, `breaking change without an "After:" example: ${label}`).toContain(
                    "After:",
                );
            }
        });
    });

    describe("the generated-file freshness gate", () => {
        it("passes when regeneration reproduces an uncommitted output byte-for-byte", () => {
            withTempDir((dir) => {
                const file = path.join(dir, "generated.txt");
                fs.writeFileSync(file, "working-version\n");

                // An intentional uncommitted output is CURRENT when its generator
                // reproduces it; repository HEAD is not the question being asked.
                const exitCode = quietly(() =>
                    runGeneratedCheck(
                        [{ command: "gen:fixture", source: "the fixture source", files: [file] }],
                        () => fs.writeFileSync(file, "working-version\n"),
                    ),
                );

                expect(exitCode).toBe(0);
                expect(fs.readFileSync(file, "utf8")).toBe("working-version\n");
            });
        });

        it("fails and restores the working state when regeneration produces different content", () => {
            withTempDir((dir) => {
                const file = path.join(dir, "generated.txt");
                fs.writeFileSync(file, "stale-committed-version\n");

                const exitCode = quietly(() =>
                    runGeneratedCheck(
                        [{ command: "gen:fixture", source: "the fixture source", files: [file] }],
                        () => fs.writeFileSync(file, "regenerated-version\n"),
                    ),
                );

                expect(exitCode).toBe(1);
                expect(fs.readFileSync(file, "utf8")).toBe("stale-committed-version\n");
            });
        });

        it("fails when a declared output is never produced (absent before and after)", () => {
            withTempDir((dir) => {
                const file = path.join(dir, "never-produced.txt");

                // Regression: snapshot comparison alone reports "unchanged" here,
                // because the file is equally absent on both sides — so the gate
                // silently retires itself when a generator's output path is renamed
                // without updating GENERATED_GROUPS.
                const exitCode = quietly(() =>
                    runGeneratedCheck(
                        [{ command: "gen:fixture", source: "the fixture source", files: [file] }],
                        () => {},
                    ),
                );

                expect(exitCode).toBe(1);
                expect(fs.existsSync(file)).toBe(false);
            });
        });

        it("fails when the generator itself fails", () => {
            withTempDir((dir) => {
                const file = path.join(dir, "generated.txt");
                fs.writeFileSync(file, "working-version\n");

                const exitCode = quietly(() =>
                    runGeneratedCheck(
                        [{ command: "gen:fixture", source: "the fixture source", files: [file] }],
                        () => {
                            throw new Error("generator exploded");
                        },
                    ),
                );

                expect(exitCode).toBe(1);
            });
        });

        it("reports a snapshot restored, a missing output, and an unchanged output distinctly", () => {
            withTempDir((dir) => {
                const present = path.join(dir, "present.txt");
                const absent = path.join(dir, "absent.txt");
                fs.writeFileSync(present, "before\n");

                const snapshots = snapshotGeneratedFiles([present, absent]);
                expect(snapshots.map(({ existed }) => existed)).toEqual([true, false]);

                expect(missingGeneratedFiles(snapshots).map(({ file }) => file)).toEqual([absent]);
                expect(changedGeneratedFiles(snapshots)).toEqual([]);

                fs.writeFileSync(present, "after\n");
                const changed = changedGeneratedFiles(snapshots);
                expect(changed.map(({ file }) => file)).toEqual([present]);

                restoreGeneratedFiles(changed);
                expect(fs.readFileSync(present, "utf8")).toBe("before\n");
                // A never-existing output is not resurrected by a restore.
                expect(fs.existsSync(absent)).toBe(false);
            });
        });
    });

    /**
     * Asserted against the EMITTED schema/description a client actually receives,
     * per the Q21 discipline — not raw registration internals.
     */
    describe("advertised contracts corrected alongside Phase 13", () => {
        const emitted = async () => {
            const { z } = await import("zod");
            const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
            const { registerAllTools } = await import("../../tools/index.js");

            const server = new McpServer({ name: "figma-edit-mcp", version: RELEASE_VERSION });
            registerAllTools(server);
            const registered = (server as any)._registeredTools as Record<string, any>;

            return (tool: string) => {
                const def = registered[tool];
                const json = z.toJSONSchema(def.inputSchema, { io: "input" }) as any;
                return { description: def.description as string, inputSchema: json };
            };
        };

        it("describes annotation_list's real includeCategories default", async () => {
            const { description, inputSchema } = (await emitted())("annotation_list");

            // The handler defaults includeCategories to TRUE
            // (annotationHandlers.getAnnotations). The prior "If true, retrieves…"
            // wording advertised an opt-in and was contradicted live: categories
            // come back in page and node mode without the flag.
            expect(description).toContain("returned by default");
            expect(description).not.toContain("Optionally include");
            expect(inputSchema.properties.includeCategories.description).toContain(
                "Defaults to true",
            );
        });

        it("lists every required effect-variant field in the style_manage prose", async () => {
            const { inputSchema } = (await emitted())("style_manage");
            const effectsSchema = inputSchema.properties.properties.properties.effects;
            const prose: string = effectsSchema.description;

            const requiredFor = (typeLiteral: string): string[] => {
                const variant = effectsSchema.items.oneOf.find(
                    (candidate: any) => candidate.properties?.type?.const === typeLiteral,
                );
                return (variant.required as string[]).filter((field) => field !== "type");
            };

            // A required field absent from the prose guarantees a -32602 the model
            // cannot predict from the description alone — the exact first-call
            // failure Q35 tightened this surface to remove.
            for (const variant of ["NOISE", "GLASS", "TEXTURE"]) {
                for (const field of requiredFor(variant)) {
                    expect(
                        prose,
                        `${variant} required field missing from the effects description: ${field}`,
                    ).toContain(field);
                }
            }
        });
    });
});
