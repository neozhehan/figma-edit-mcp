import { execSync } from "child_process";
import { readFileSync, existsSync, writeFileSync } from "fs";

/**
 * Fails if figma_plugin/code.js is out of date relative to its TypeScript
 * sources (figma_plugin/src/main.ts + figma_plugin/handlers/*.ts +
 * figma_plugin/utils/*.ts).
 *
 * Content-based (rebuild + compare), NOT mtime-based: a fresh `git checkout`
 * gives every file the same checkout timestamp, so an mtime comparison is
 * meaningless in CI.
 *
 * The comparison is against the bundle AS IT WAS BEFORE this rebuild, not
 * against HEAD. Diffing against HEAD conflates two different states: a genuinely
 * stale bundle, and a correctly-rebuilt bundle that simply is not committed yet.
 * The second is the normal state of any work in progress, and reporting it as
 * "out of date relative to its TypeScript sources" is a false statement that
 * sends the contributor to re-run a build they already ran. Staleness is a
 * property of the file versus the sources, so that is what this checks; whether
 * the result is committed is reported separately, as information.
 */
const BUNDLE = "figma_plugin/code.js";

const before = existsSync(BUNDLE) ? readFileSync(BUNDLE, "utf8") : null;

try {
    execSync("bun run plugin:build", { stdio: "inherit" });
} catch {
    console.error("Error: plugin build failed.");
    process.exit(1);
}

const after = readFileSync(BUNDLE, "utf8");

if (before === null) {
    console.error(`Error: ${BUNDLE} did not exist and has now been built.`);
    console.error(`Commit the generated ${BUNDLE}.`);
    process.exit(1);
}

if (before !== after) {
    // Restore the committed/working state so the check does not silently mutate
    // the tree it is inspecting — the contributor decides when to rebuild.
    writeFileSync(BUNDLE, before);
    console.error(`Error: ${BUNDLE} is out of date relative to its TypeScript sources.`);
    console.error('Run "bun run build:all" and commit the rebuilt bundle.');
    process.exit(1);
}

// In sync with the sources. Report the commit state separately — uncommitted is
// a normal working state, not a failure.
try {
    execSync(`git diff --quiet -- ${BUNDLE}`, { stdio: "ignore" });
    console.log(`Success: ${BUNDLE} is up to date relative to its sources.`);
} catch {
    console.log(`Success: ${BUNDLE} is up to date relative to its sources (rebuilt, not yet committed).`);
}
process.exit(0);
