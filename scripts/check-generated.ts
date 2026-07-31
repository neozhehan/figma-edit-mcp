import { execSync } from "child_process";

/**
 * Fails if any committed generated file is out of date relative to the source
 * it is generated from. Mirrors check-plugin-build.ts: regenerate, then
 * `git diff --exit-code` the outputs.
 *
 * Content-based (regenerate + diff), NOT mtime-based: a fresh `git checkout`
 * gives every file the same timestamp, so mtime comparison is meaningless in CI.
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
const GROUPS = [
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

for (const { command } of GROUPS) {
    try {
        execSync(`bun run ${command}`, { stdio: "inherit" });
    } catch {
        console.error(`Error: ${command} failed.`);
        process.exit(1);
    }
}

let stale = false;
for (const { command, source, files } of GROUPS) {
    try {
        execSync(`git diff --exit-code -- ${files.join(" ")}`, { stdio: "inherit" });
    } catch {
        console.error(`Error: generated files are out of date relative to ${source}.`);
        console.error(`Run "bun run ${command}" and commit the regenerated files.`);
        stale = true;
    }
}

if (stale) {
    process.exit(1);
}

console.log("Success: generated files are up to date relative to their sources.");
process.exit(0);
