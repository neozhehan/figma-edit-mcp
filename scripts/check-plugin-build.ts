import { execSync } from "child_process";

/**
 * Fails if the committed figma_plugin/code.js is out of date relative to its
 * TypeScript sources (figma_plugin/src/main.ts + figma_plugin/handlers/*.ts +
 * figma_plugin/utils/*.ts).
 *
 * Content-based (rebuild + `git diff`), NOT mtime-based: a fresh `git checkout`
 * gives every file the same checkout timestamp, so an mtime comparison is
 * meaningless in CI. Rebuilding from source and diffing the bundle is reliable
 * everywhere.
 */
try {
    execSync("bun run plugin:build", { stdio: "inherit" });
} catch {
    console.error("Error: plugin build failed.");
    process.exit(1);
}

try {
    // Exits non-zero if the freshly-built bundle differs from the committed one.
    execSync("git diff --exit-code -- figma_plugin/code.js", { stdio: "inherit" });
} catch {
    console.error("Error: figma_plugin/code.js is out of date relative to its TypeScript sources.");
    console.error('Run "bun run build:all" and commit the rebuilt figma_plugin/code.js.');
    process.exit(1);
}

console.log("Success: figma_plugin/code.js is up to date relative to its sources.");
process.exit(0);
