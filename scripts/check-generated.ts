import { execSync } from "child_process";

/**
 * Fails if any committed generated file is out of date relative to
 * @figma/plugin-typings. Mirrors check-plugin-build.ts: regenerate, then
 * `git diff --exit-code` the outputs of scripts/gen-node-fields.ts.
 *
 * Content-based (regenerate + diff), NOT mtime-based: a fresh `git checkout`
 * gives every file the same timestamp, so mtime comparison is meaningless in CI.
 *
 * Covers src/mcp_server/tools/bindableFields.generated.ts — the node_bind_variable
 * allowlist — so a @figma/plugin-typings bump that adds or removes a bindable
 * field, without a regenerate+commit, fails CI instead of silently drifting.
 */
const GENERATED = [
    "figma_plugin/utils/nodeFields.generated.ts",
    "src/mcp_server/tools/bindableFields.generated.ts",
    "skills/figma-edit/references/node-fields.md",
];

try {
    execSync("bun run gen:node-fields", { stdio: "inherit" });
} catch {
    console.error("Error: gen:node-fields failed.");
    process.exit(1);
}

try {
    execSync(`git diff --exit-code -- ${GENERATED.join(" ")}`, { stdio: "inherit" });
} catch {
    console.error("Error: generated files are out of date relative to @figma/plugin-typings.");
    console.error('Run "bun run gen:node-fields" and commit the regenerated files.');
    process.exit(1);
}

console.log("Success: generated files are up to date relative to the typings.");
process.exit(0);
