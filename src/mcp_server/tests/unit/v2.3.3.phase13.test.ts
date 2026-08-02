/**
 * Phase 13 release boundary: version synchronization and the generated-file
 * freshness gate.
 *
 * This file lives at `tests/unit/` rather than `tests/unit/figma_plugin/` with
 * its sibling `v2.3.3.phase*.test.ts` suites because none of it is plugin-handler
 * behaviour — it asserts repository descriptors and a build script.
 *
 * It deliberately asserts nothing about `CHANGELOG.md`. The removed suite checked
 * whether a human-facing release note contained or lacked particular sentences —
 * a completeness checklist, not a correctness check. It stayed green across four
 * separate factual errors in the entry it was guarding.
 *
 * RELEASE_VERSION is the one place the release number is written. A version bump
 * updates this constant; every other assertion derives from it, so the suite goes
 * red on a partial bump and green on a complete one.
 */
import { describe, expect, it } from "bun:test";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
    changedGeneratedFiles,
    missingGeneratedFiles,
    reportCommitState,
    restoreGeneratedFiles,
    runGeneratedCheck,
    snapshotGeneratedFiles,
} from "../../../../scripts/check-generated.js";

const RELEASE_VERSION = "2.3.3";

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

        it("restores changed siblings when another declared output remains missing", () => {
            withTempDir((dir) => {
                const present = path.join(dir, "present.txt");
                const absent = path.join(dir, "never-produced.txt");
                fs.writeFileSync(present, "working-version\n");

                const exitCode = quietly(() =>
                    runGeneratedCheck(
                        [{
                            command: "gen:fixture",
                            source: "the fixture source",
                            files: [present, absent],
                        }],
                        () => fs.writeFileSync(present, "generator-version\n"),
                    ),
                );

                expect(exitCode).toBe(1);
                expect(fs.readFileSync(present, "utf8")).toBe("working-version\n");
                expect(fs.existsSync(absent)).toBe(false);
            });
        });

        it("fails and restores the working state when the generator writes then throws", () => {
            withTempDir((dir) => {
                const file = path.join(dir, "generated.txt");
                fs.writeFileSync(file, "working-version\n");

                const exitCode = quietly(() =>
                    runGeneratedCheck(
                        [{ command: "gen:fixture", source: "the fixture source", files: [file] }],
                        () => {
                            fs.writeFileSync(file, "partial-generator-version\n");
                            throw new Error("generator exploded");
                        },
                    ),
                );

                expect(exitCode).toBe(1);
                expect(fs.readFileSync(file, "utf8")).toBe("working-version\n");
            });
        });

        it("discards a partial new output when the generator writes it then throws", () => {
            withTempDir((dir) => {
                const existing = path.join(dir, "existing.txt");
                const created = path.join(dir, "created-by-failed-run.txt");
                fs.writeFileSync(existing, "working-version\n");

                const exitCode = quietly(() =>
                    runGeneratedCheck(
                        [{
                            command: "gen:fixture",
                            source: "the fixture source",
                            files: [existing, created],
                        }],
                        () => {
                            fs.writeFileSync(existing, "partial\n");
                            fs.writeFileSync(created, "partial\n");
                            throw new Error("generator exploded");
                        },
                    ),
                );

                // The check must leave the tree exactly as it found it: a file that
                // existed is restored, and one this failed run created is removed
                // rather than left to look like a legitimate new output.
                expect(exitCode).toBe(1);
                expect(fs.readFileSync(existing, "utf8")).toBe("working-version\n");
                expect(fs.existsSync(created)).toBe(false);
            });
        });

        it("reports an untracked generated output as uncommitted", () => {
            withTempDir((dir) => {
                execFileSync("git", ["init", "--quiet"], { cwd: dir });
                fs.writeFileSync(path.join(dir, "new-generated.txt"), "current\n");

                const messages: string[] = [];
                const originalLog = console.log;
                console.log = (...args: unknown[]) => messages.push(args.join(" "));
                try {
                    reportCommitState(
                        [{
                            command: "gen:fixture",
                            source: "the fixture source",
                            files: ["new-generated.txt"],
                        }],
                        dir,
                    );
                } finally {
                    console.log = originalLog;
                }

                expect(messages).toEqual([
                    "Note: some generated outputs are current but not yet committed.",
                ]);
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
                return {
                    description: def.description as string,
                    inputSchema: json,
                    // The registered (recursively strict) zod schema — the real
                    // validation path, so a bound can be compared against what
                    // `tools/list` advertises for the same field.
                    zodSchema: def.inputSchema,
                };
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

        /**
         * Advertised bounds and enforced bounds must agree, in both directions.
         *
         * `.superRefine()` is dropped by the zod→JSON-Schema conversion — this
         * repo already shipped that bug once (Rev 61 / C8-D1, where `coverage`'s
         * invariant reached callers as no constraint at all). A bound expressed
         * so that zod enforces it but the emitted schema omits it is invisible to
         * `v2.3.3.phase7.test.ts`, which only exercises `safeParse`.
         *
         * Both sides are derived: the bounds are read from the emitted schema and
         * probed against the registered schema. Nothing here is hardcoded except
         * one minimal valid fixture per variant.
         */
        it("advertises exactly the numeric effect bounds it enforces", async () => {
            const { inputSchema, zodSchema } = (await emitted())("style_manage");
            const effectsSchema = inputSchema.properties.properties.properties.effects;

            const rgba = { r: 0.5, g: 0.5, b: 0.5, a: 1 };
            const VALID: Record<string, Record<string, unknown>> = {
                DROP_SHADOW: { type: "DROP_SHADOW" },
                INNER_SHADOW: { type: "INNER_SHADOW" },
                LAYER_BLUR: { type: "LAYER_BLUR" },
                BACKGROUND_BLUR: { type: "BACKGROUND_BLUR" },
                NOISE: { type: "NOISE", noiseType: "MONOTONE", color: rgba, noiseSize: 2, density: 0.4 },
                TEXTURE: { type: "TEXTURE", noiseSize: 2, radius: 1, clipToShape: true },
                GLASS: {
                    type: "GLASS", lightIntensity: 0.5, lightAngle: 45, refraction: 0.5,
                    depth: 1, dispersion: 0.5, radius: 1,
                },
            };

            const accepts = (effect: Record<string, unknown>) =>
                zodSchema.safeParse({
                    type: "EFFECT",
                    name: "bounds probe",
                    properties: { effects: [effect] },
                }).success;

            let checked = 0;
            for (const variant of effectsSchema.items.oneOf) {
                const literal = variant.properties.type.const as string;
                const base = VALID[literal];
                expect(base, `no fixture for effect variant ${literal}`).toBeDefined();
                expect(accepts(base), `fixture for ${literal} must be valid`).toBe(true);

                for (const [field, spec] of Object.entries<any>(variant.properties)) {
                    if (spec.type !== "number" && spec.type !== "integer") continue;

                    // Skip fields this base configuration gates rather than bounds.
                    // The progressive ramp (`startRadius`, offsets) is refused on a
                    // normal blur by the secondary-discriminator rule, which is a
                    // variant gate — reading that refusal as a missing bound is what
                    // this probe got wrong on its first run.
                    const inRange = spec.minimum ?? spec.maximum ?? 1;
                    if (!accepts({ ...base, [field]: inRange })) continue;

                    if (spec.minimum !== undefined) {
                        expect(
                            accepts({ ...base, [field]: spec.minimum - 1 }),
                            `${literal}.${field} advertises minimum ${spec.minimum} but accepts below it`,
                        ).toBe(false);
                        checked++;
                    }
                    if (spec.maximum !== undefined) {
                        expect(
                            accepts({ ...base, [field]: spec.maximum + 1 }),
                            `${literal}.${field} advertises maximum ${spec.maximum} but accepts above it`,
                        ).toBe(false);
                        checked++;
                    }
                    if (!accepts({ ...base, [field]: -1e6 })) {
                        expect(
                            spec.minimum,
                            `${literal}.${field} rejects large negatives but advertises no minimum`,
                        ).toBeDefined();
                    }
                    if (!accepts({ ...base, [field]: 1e6 })) {
                        expect(
                            spec.maximum,
                            `${literal}.${field} rejects large positives but advertises no maximum`,
                        ).toBeDefined();
                    }
                }
            }

            // Guards the guard: a conversion that emitted no bounds at all would
            // otherwise satisfy every branch above vacuously.
            expect(checked).toBeGreaterThanOrEqual(12);
        });
    });
});
