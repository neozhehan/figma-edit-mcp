import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";

/**
 * Suppression-comment gate for the plugin source (v2.3.3 Phase 3, review
 * decision 2; hardened per review findings P3-2/P3-4, and rebuilt onto
 * TypeScript's own directive detection per open-questions Q28, resolved
 * 2026-07-23: Option C, with the P3-4 follow-up remediation on 2026-07-24):
 *
 *  - `@ts-ignore` is forbidden — replace with a described `@ts-expect-error`.
 *  - `@ts-nocheck` is forbidden — it is a file-wide opt-out that silently
 *    reintroduces the lost-safety-net condition Track 1 exists to prevent.
 *  - `@ts-expect-error` requires a meaningful description (at least one
 *    alphanumeric character — bare punctuation does not count).
 *
 * Directive RECOGNITION is delegated to TypeScript itself, not re-derived:
 *  - `@ts-ignore` / `@ts-expect-error` come from `sourceFile.commentDirectives`
 *    — the exact list the compiler builds and later honors, so the gate matches
 *    the type checker by construction (from the SAME `typescript` version
 *    `check:types:plugin` runs). Each directive is classified by TypeScript's
 *    own `directive.type`, never re-derived from the comment text. This is what
 *    makes both the multiline grammar and the prefix grammar correct: a starred
 *    continuation-line directive (an `@ts-ignore` on a ` * ...`-prefixed final
 *    line of a block comment) is honored and caught; a suffixed form
 *    (`@ts-ignorefoo`, `@ts-ignore123`) is an active `Ignore` TypeScript honors
 *    (it matches the directive as a prefix, no word boundary) and is caught;
 *    and inert forms (a quadruple-slash `////` directive, a directive on a
 *    non-final block line) are not in the list and so not rejected. An earlier
 *    re-classification by regex over the range text got all of these wrong.
 *  - `@ts-nocheck` comes from `sourceFile.checkJsDirective` (`enabled === false`)
 *    — TypeScript honors it only as a leading-comment file directive, so inert
 *    mid-file / starred-block forms are correctly not rejected.
 *
 * The only project-specific rule layered on top is the `@ts-expect-error`
 * description requirement, applied to the directive's own source range.
 *
 * NOTE: `commentDirectives` and `checkJsDirective` are internal SourceFile
 * fields (not in the public typings), reached via a narrow local cast. The
 * unit suite's fixtures fail loudly if a future `typescript` stops populating
 * them, so a silent regression to "detect nothing" cannot ship.
 *
 * The checking logic is exported so the unit suite can run differential
 * fixtures against it (P3-3); executing the script directly checks
 * `figma_plugin/`.
 */

export interface SuppressionViolation {
    file: string;
    line: number;
    lineText: string;
    message: string;
    fix: string;
}

// Minimal shapes for the internal SourceFile fields we read.
interface CommentDirective { range: { pos: number; end: number }; type: number }
interface CheckJsDirective { enabled: boolean; pos: number; end: number }
interface SourceFileInternals {
    commentDirectives?: CommentDirective[];
    checkJsDirective?: CheckJsDirective;
}

// TypeScript's internal CommentDirectiveType enum (stable): ExpectError = 0,
// Ignore = 1. We branch on this, NOT on a regex over the range text —
// TypeScript recognizes `@ts-ignore`/`@ts-expect-error` as PREFIXES (no word
// boundary), so `@ts-ignorefoo` / `@ts-ignore123` are active `Ignore`
// directives, and an `@ts-expect-error` whose description merely mentions
// `@ts-ignore` is still an `ExpectError`. A range-text search misclassifies
// both. The canonical marker length lets us read an expect-error's description
// without a word boundary, so `@ts-expect-error_` is correctly description-less.
const TS_DIRECTIVE_EXPECT_ERROR = 0;
const TS_DIRECTIVE_IGNORE = 1;
const EXPECT_ERROR_MARKER = "@ts-expect-error";

export function checkContent(content: string, relativePath: string): SuppressionViolation[] {
    const violations: SuppressionViolation[] = [];
    const rawLines = content.split(/\r?\n/);

    const sourceFile = ts.createSourceFile(
        relativePath || "file.ts",
        content,
        ts.ScriptTarget.Latest,
        /*setParentNodes*/ false,
        ts.ScriptKind.TS,
    );
    const internals = sourceFile as unknown as SourceFileInternals;

    const lineOf = (pos: number) => sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
    const lineTextOf = (lineNum: number) => (rawLines[lineNum - 1] ?? "").trim();

    // @ts-nocheck — an honored file-wide opt-out (checkJsDirective.enabled is
    // false for @ts-nocheck, true for @ts-check).
    const checkJs = internals.checkJsDirective;
    if (checkJs && checkJs.enabled === false) {
        const line = lineOf(checkJs.pos);
        violations.push({
            file: relativePath,
            line,
            lineText: lineTextOf(line),
            message: "@ts-nocheck is forbidden (file-wide type-check opt-out)",
            fix: "Remove the directive and fix the underlying type errors (suppress individual lines with described '@ts-expect-error' only where unavoidable).",
        });
    }

    // @ts-ignore / @ts-expect-error — exactly TypeScript's own recognized set,
    // classified by TypeScript's own directive type (never re-derived).
    for (const directive of internals.commentDirectives ?? []) {
        const line = lineOf(directive.range.pos);
        const lineText = lineTextOf(line);

        if (directive.type === TS_DIRECTIVE_IGNORE) {
            violations.push({
                file: relativePath,
                line,
                lineText,
                message: "@ts-ignore is forbidden",
                fix: "Replace with '@ts-expect-error <description of what is suppressed>'.",
            });
        } else if (directive.type === TS_DIRECTIVE_EXPECT_ERROR) {
            // Require a meaningful description. Read the suffix after the
            // canonical marker (fixed length — no word boundary, so a
            // punctuation-only suffix like `@ts-expect-error_` still counts as
            // description-less), minus any trailing block-comment close.
            const rangeText = content.slice(directive.range.pos, directive.range.end);
            const markerIdx = rangeText.indexOf(EXPECT_ERROR_MARKER);
            const suffix = markerIdx >= 0
                ? rangeText.slice(markerIdx + EXPECT_ERROR_MARKER.length).replace(/\*+\/\s*$/, "")
                : "";
            if (!/[A-Za-z0-9]/.test(suffix)) {
                violations.push({
                    file: relativePath,
                    line,
                    lineText,
                    message: "@ts-expect-error requires a description",
                    fix: "Add a description, e.g. '@ts-expect-error TS2339: <what is suppressed and why>'.",
                });
            }
        } else {
            // Fail closed: TypeScript recognized a directive we do not classify
            // (a future directive type). Forbid it rather than let it through.
            violations.push({
                file: relativePath,
                line,
                lineText,
                message: "unrecognized TypeScript suppression directive is forbidden",
                fix: "Remove the directive, or replace it with a described '@ts-expect-error'.",
            });
        }
    }

    violations.sort((a, b) => a.line - b.line);
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
