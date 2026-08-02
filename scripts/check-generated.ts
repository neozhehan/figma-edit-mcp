import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";

/**
 * Fails if any generated file is out of date relative to the source it is
 * generated from. Mirrors check-plugin-build.ts: snapshot the current outputs,
 * regenerate, and compare the resulting contents with that snapshot.
 *
 * Content-based (regenerate + diff), NOT mtime-based: a fresh `git checkout`
 * gives every file the same timestamp, so mtime comparison is meaningless in CI.
 * The comparison deliberately is not against HEAD. An intentional generated
 * change can be current relative to its source while still being uncommitted —
 * the normal state during a version bump. HEAD answers whether a file is
 * committed, not whether it is stale.
 *
 * Two generator sources are covered, and they drift for different reasons, so
 * each group reports its own regenerate command rather than a shared message
 * that would send a contributor to the wrong script:
 *
 * - **Typings-derived** (`gen:node-fields`). Includes
 *   src/mcp_server/tools/bindableFields.generated.ts — the node_bind_variable
 *   allowlist — so a @figma/plugin-typings bump that adds or removes a bindable
 *   field, without a regenerate+commit, fails CI instead of silently drifting.
 * - **Registration-derived** (`gen:manifest`). manifest.json's tool array is
 *   generated from the registered MCP tools, so a tool added, removed, or
 *   re-described without a regenerate+commit leaves the published MCPB manifest
 *   advertising a surface the server no longer serves. Added after v2.3.3
 *   Rev 73 found the committed manifest stale for twelve tool descriptions
 *   accumulated across Phases 4–10, which no existing gate detected.
 */
export const GENERATED_GROUPS = [
    {
        command: "gen:node-fields",
        source: "@figma/plugin-typings",
        files: [
            "figma_plugin/utils/nodeFields.generated.ts",
            "src/mcp_server/tools/bindableFields.generated.ts",
            "skills/figma-edit/references/node-fields.md",
        ],
    },
    {
        command: "gen:manifest",
        source: "the registered MCP tools",
        files: ["manifest.json"],
    },
];

export interface GeneratedFileSnapshot {
    file: string;
    existed: boolean;
    contents?: Buffer;
}

export function snapshotGeneratedFiles(files: string[]): GeneratedFileSnapshot[] {
    return files.map((file) => ({
        file,
        existed: existsSync(file),
        ...(existsSync(file) ? { contents: readFileSync(file) } : {}),
    }));
}

export function changedGeneratedFiles(
    snapshots: GeneratedFileSnapshot[],
): GeneratedFileSnapshot[] {
    return snapshots.filter((snapshot) => {
        if (!snapshot.existed) return existsSync(snapshot.file);
        if (!existsSync(snapshot.file)) return true;
        return !snapshot.contents!.equals(readFileSync(snapshot.file));
    });
}

export function restoreGeneratedFiles(snapshots: GeneratedFileSnapshot[]): void {
    for (const snapshot of snapshots) {
        if (snapshot.existed && snapshot.contents !== undefined) {
            writeFileSync(snapshot.file, snapshot.contents);
        }
    }
}

export function runGeneratedCheck(): number {
    let stale = false;

    for (const { command, source, files } of GENERATED_GROUPS) {
        const snapshots = snapshotGeneratedFiles(files);
        try {
            execSync(`bun run ${command}`, { stdio: "inherit" });
        } catch {
            console.error(`Error: ${command} failed.`);
            return 1;
        }

        const changed = changedGeneratedFiles(snapshots);
        if (changed.length === 0) continue;

        // Do not silently replace a contributor's working state during a check.
        // Existing outputs are restored; a newly generated missing output is
        // intentionally left in place so it can be reviewed and committed.
        restoreGeneratedFiles(changed);
        console.error(`Error: generated files are out of date relative to ${source}.`);
        console.error(`Changed outputs: ${changed.map(({ file }) => file).join(", ")}`);
        console.error(`Run "bun run ${command}" and commit the regenerated files.`);
        stale = true;
    }

    if (stale) return 1;

    console.log("Success: generated files are up to date relative to their sources.");
    return 0;
}

if (import.meta.main) {
    process.exit(runGeneratedCheck());
}
