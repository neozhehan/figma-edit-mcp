import { execFileSync, execSync } from "child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "fs";

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
export interface GeneratedGroup {
    command: string;
    source: string;
    files: string[];
}

export const GENERATED_GROUPS: GeneratedGroup[] = [
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

/**
 * Declared outputs that do not exist after their generator ran.
 *
 * Snapshot comparison alone cannot see this case: a file that was absent BEFORE
 * regeneration and is still absent AFTER it compares equal, so the group would
 * pass while an advertised generated output does not exist at all. The
 * `git diff --exit-code` this check replaced failed on it implicitly (a deleted
 * tracked path is a diff), and `check-plugin-build.ts` fails closed on it
 * explicitly. Realistic trigger: a generator's output path is renamed and the
 * `GENERATED_GROUPS` entry is not updated, silently retiring the gate.
 */
/**
 * Outputs this run created that did not exist before it.
 *
 * On the success paths a newly created output is a legitimate new artifact and is
 * deliberately left in place for review. On the generator-throw path it is a
 * partial write by definition, so leaving it would make a failed run
 * indistinguishable from a successful one that produced a new file.
 */
export function newlyCreatedGeneratedFiles(snapshots: GeneratedFileSnapshot[]): GeneratedFileSnapshot[] {
    return snapshots.filter(({ existed, file }) => !existed && existsSync(file));
}

export function missingGeneratedFiles(snapshots: GeneratedFileSnapshot[]): GeneratedFileSnapshot[] {
    return snapshots.filter(({ file }) => !existsSync(file));
}

/**
 * `groups` and `regenerate` are injectable so the boundary tests can drive this
 * exact loop over a disposable fixture group instead of asserting the helpers in
 * isolation — a helper-only test stays green if the loop reverts to comparing
 * against HEAD, which is the behaviour this function exists to get right.
 */
export function runGeneratedCheck(
    groups: readonly GeneratedGroup[] = GENERATED_GROUPS,
    regenerate: (command: string) => void = (command) =>
        execSync(`bun run ${command}`, { stdio: "inherit" }),
): number {
    let stale = false;

    for (const { command, source, files } of groups) {
        const snapshots = snapshotGeneratedFiles(files);
        try {
            regenerate(command);
        } catch {
            // A generator can write one or more outputs before throwing. Leave the
            // tree exactly as the check found it: restore every output that existed
            // beforehand, and discard any this run created, since a file from a
            // failed generator is partial by definition.
            restoreGeneratedFiles(snapshots);
            for (const { file } of newlyCreatedGeneratedFiles(snapshots)) {
                rmSync(file, { force: true });
            }
            console.error(`Error: ${command} failed.`);
            return 1;
        }

        // Do not silently replace a contributor's working state during a check.
        // Existing outputs are restored; a newly generated missing output is
        // intentionally left in place so it can be reviewed and committed.
        const missing = missingGeneratedFiles(snapshots);
        if (missing.length > 0) {
            // The missing-output condition and a changed sibling can occur in
            // the same group. Restore the whole pre-existing snapshot, not only
            // the missing subset, before moving on to the next group.
            restoreGeneratedFiles(snapshots);
            console.error(`Error: expected generated output missing after "bun run ${command}".`);
            console.error(`Missing outputs: ${missing.map(({ file }) => file).join(", ")}`);
            console.error(
                `Either ${command} no longer produces that path, or its GENERATED_GROUPS entry is stale — fix whichever is wrong; do not delete the entry to make this pass.`,
            );
            stale = true;
            continue;
        }

        const changed = changedGeneratedFiles(snapshots);
        if (changed.length === 0) continue;

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

/**
 * Commit state is reported separately, as information — the same split
 * `check-plugin-build.ts` makes. Uncommitted-but-current is the normal state of
 * a version bump in progress and is not a staleness failure.
 */
export function generatedOutputsHaveUncommittedChanges(
    groups: readonly GeneratedGroup[],
    cwd: string = process.cwd(),
): boolean {
    const files = groups.flatMap(({ files: groupFiles }) => groupFiles);
    if (files.length === 0) return false;

    // Unlike `git diff`, porcelain status includes staged and untracked files.
    // execFileSync also keeps generated pathspecs out of shell interpolation.
    const status = execFileSync(
        "git",
        ["status", "--porcelain=v1", "--untracked-files=all", "--", ...files],
        { cwd, encoding: "utf8" },
    );
    return status.trim().length > 0;
}

export function reportCommitState(
    groups: readonly GeneratedGroup[],
    cwd: string = process.cwd(),
): void {
    try {
        if (generatedOutputsHaveUncommittedChanges(groups, cwd)) {
            console.log("Note: some generated outputs are current but not yet committed.");
        }
    } catch {
        console.log("Note: unable to determine whether generated outputs are committed.");
    }
}

if (import.meta.main) {
    const exitCode = runGeneratedCheck();
    if (exitCode === 0) reportCommitState(GENERATED_GROUPS);
    process.exit(exitCode);
}
