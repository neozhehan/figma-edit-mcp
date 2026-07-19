import * as fs from "fs";
import * as path from "path";

/**
 * Suppression-comment gate for the plugin source (v2.3.3 Phase 3, review
 * decision 2; hardened per review findings P3-2/P3-4):
 *
 *  - `@ts-ignore` is forbidden — replace with a described `@ts-expect-error`.
 *  - `@ts-nocheck` is forbidden — it is a file-wide opt-out that silently
 *    reintroduces the lost-safety-net condition Track 1 exists to prevent.
 *  - `@ts-expect-error` requires a meaningful same-line description (at least
 *    one alphanumeric character — bare punctuation does not count).
 *
 * Detection matches TypeScript directive-comment syntax (the directive at the
 * start of a `//` or `/*` comment), not arbitrary substrings, and string
 * literals are stripped first so quoted text like "@ts-ignore" never trips the
 * gate. Every violation names its file:line and states the one-round-trip fix.
 *
 * The checking logic is exported so the unit suite can run negative fixtures
 * against it (P3-3); executing the script directly checks `figma_plugin/`.
 */

export interface SuppressionViolation {
    file: string;
    line: number;
    lineText: string;
    message: string;
    fix: string;
}

// A directive is only honored at the start of a comment: `//`, `///`, or `/*`
// followed by optional whitespace and the @ts- marker.
const DIRECTIVE_RE = /(?:\/\/+|\/\*+)\s*@ts-(ignore|nocheck|expect-error)\b(.*)$/;

// Replace string-literal contents so quoted "@ts-ignore" text cannot match.
// Handles single-, double-, and backtick-quoted spans with escapes; template
// literals spanning lines are out of scope for a line-based gate (none exist
// in the plugin source, and a directive inside one would be inert anyway).
function stripStringLiterals(line: string): string {
    return line.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g, '""');
}

export function checkContent(content: string, relativePath: string): SuppressionViolation[] {
    const violations: SuppressionViolation[] = [];
    const lines = content.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
        const lineNum = i + 1;
        const raw = lines[i];
        const match = stripStringLiterals(raw).match(DIRECTIVE_RE);
        if (!match) continue;

        const [, directive, rest] = match;

        if (directive === "ignore") {
            violations.push({
                file: relativePath,
                line: lineNum,
                lineText: raw.trim(),
                message: "@ts-ignore is forbidden",
                fix: "Replace with '@ts-expect-error <description of what is suppressed>'.",
            });
            continue;
        }

        if (directive === "nocheck") {
            violations.push({
                file: relativePath,
                line: lineNum,
                lineText: raw.trim(),
                message: "@ts-nocheck is forbidden (file-wide type-check opt-out)",
                fix: "Remove the directive and fix the underlying type errors (suppress individual lines with described '@ts-expect-error' only where unavoidable).",
            });
            continue;
        }

        // expect-error: require a meaningful same-line description.
        const description = rest.replace(/\*+\/\s*$/, "").trim();
        if (!/[A-Za-z0-9]/.test(description)) {
            violations.push({
                file: relativePath,
                line: lineNum,
                lineText: raw.trim(),
                message: "@ts-expect-error requires a same-line description",
                fix: "Add a description, e.g. '@ts-expect-error TS2339: <what is suppressed and why>'.",
            });
        }
    }

    return violations;
}

export function checkDirectory(dir: string, baseDir: string = dir): SuppressionViolation[] {
    const violations: SuppressionViolation[] = [];
    for (const entry of fs.readdirSync(dir)) {
        const fullPath = path.join(dir, entry);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            violations.push(...checkDirectory(fullPath, baseDir));
        } else if (stat.isFile() && entry.endsWith(".ts")) {
            const content = fs.readFileSync(fullPath, "utf8");
            violations.push(...checkContent(content, path.relative(path.dirname(baseDir), fullPath)));
        }
    }
    return violations;
}

if (import.meta.main) {
    const PLUGIN_DIR = path.join(__dirname, "../figma_plugin");
    console.log("Checking TypeScript suppression comments in figma_plugin...");
    const violations = checkDirectory(PLUGIN_DIR);

    if (violations.length > 0) {
        for (const v of violations) {
            console.error(`Error: ${v.message} at ${v.file}:${v.line}`);
            console.error(`  Line: ${v.lineText}`);
            console.error(`  Fix: ${v.fix}`);
        }
        process.exit(1);
    }
    console.log("Success: All suppression comments conform to the safety rules.");
    process.exit(0);
}
