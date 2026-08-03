import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { checkContent, checkDirectory } from "../../../../scripts/check-suppressions.js";

/**
 * Negative fixtures for the suppression gate (review finding P3-3): proves the
 * checker actually rejects what it must reject, detects nested files, ignores
 * string literals, and carries the one-round-trip contributor fix in its
 * diagnostics — so a future change that lobotomizes the checker fails CI.
 */
describe("check-suppressions gate (P3-2/P3-3/P3-4 fixtures)", () => {
    it("rejects @ts-ignore with file:line and replacement guidance", () => {
        const violations = checkContent("const a = 1;\n// @ts-ignore\nconst b: string = 2;\n", "fixture.ts");
        expect(violations.length).toBe(1);
        expect(violations[0].file).toBe("fixture.ts");
        expect(violations[0].line).toBe(2);
        expect(violations[0].message).toContain("@ts-ignore is forbidden");
        expect(violations[0].fix).toContain("@ts-expect-error");
    });

    it("rejects @ts-nocheck with removal guidance (P3-2)", () => {
        const violations = checkContent("// @ts-nocheck\nconst a: string = 1;\n", "fixture.ts");
        expect(violations.length).toBe(1);
        expect(violations[0].line).toBe(1);
        expect(violations[0].message).toContain("@ts-nocheck is forbidden");
        expect(violations[0].fix).toContain("Remove the directive");
        expect(violations[0].fix).toContain("fix the underlying type errors");
    });

    it("rejects a bare @ts-expect-error with description guidance", () => {
        const violations = checkContent("// @ts-expect-error\nfoo();\n", "fixture.ts");
        expect(violations.length).toBe(1);
        expect(violations[0].message).toContain("requires a description");
        expect(violations[0].fix).toContain("Add a description");
    });

    it("rejects punctuation-only descriptions like '@ts-expect-error -' (P3-4)", () => {
        expect(checkContent("// @ts-expect-error -\n", "f.ts").length).toBe(1);
        expect(checkContent("// @ts-expect-error ---\n", "f.ts").length).toBe(1);
    });

    it("accepts described @ts-expect-error in line and block comment form", () => {
        expect(checkContent("// @ts-expect-error TS2339: Property does not exist on narrowed type\n", "f.ts").length).toBe(0);
        expect(checkContent("/* @ts-expect-error TS2551: setBoundVariable missing from BaseStyle */\n", "f.ts").length).toBe(0);
    });

    it("does not fail on string literals containing directives (P3-4)", () => {
        const src = [
            `const a = "// @ts-ignore";`,
            `const b = '// @ts-nocheck';`,
            "const c = `// @ts-expect-error`;",
            `const d = "text with @ts-ignore inside";`,
        ].join("\n");
        expect(checkContent(src, "f.ts").length).toBe(0);
    });

    it("does not fail on prose comments that merely mention a directive mid-sentence", () => {
        expect(checkContent("// we removed the @ts-ignore here on purpose\n", "f.ts").length).toBe(0);
    });

    it("P3-4 anchoring: a directive-shaped substring later in a comment is not flagged (inert to TS)", () => {
        // TypeScript honors a directive only at the START of a comment's
        // content, so none of these are active directives.
        expect(checkContent("// Example: // @ts-ignore\n", "f.ts").length).toBe(0);
        expect(checkContent("someCode(); // trailing // @ts-ignore mention\n", "f.ts").length).toBe(0);
        expect(checkContent("// see foo.ts // @ts-nocheck for the reason\n", "f.ts").length).toBe(0);
    });

    it("P3-4 anchoring: a real directive in a trailing comment after code IS flagged", () => {
        // Here @ts-ignore IS the start of the trailing comment's content.
        const violations = checkContent("const x = doThing(); // @ts-ignore\n", "f.ts");
        expect(violations.length).toBe(1);
        expect(violations[0].message).toContain("@ts-ignore is forbidden");
    });

    it("detects directives in nested directories via traversal", () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "suppr-fixture-"));
        try {
            fs.mkdirSync(path.join(tmp, "nested", "deeper"), { recursive: true });
            fs.writeFileSync(path.join(tmp, "clean.ts"), "export const ok = 1;\n");
            fs.writeFileSync(path.join(tmp, "nested", "deeper", "bad.ts"), "// @ts-ignore\nexport const bad = 1;\n");
            const violations = checkDirectory(tmp);
            expect(violations.length).toBe(1);
            expect(violations[0].file).toContain("bad.ts");
        } finally {
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    });

    it("P3-4: does not fail on directive-like text inside a MULTILINE template literal", () => {
        const src = [
            "const help = `",
            "Example: add // @ts-ignore above a line to suppress it.",
            "Or /* @ts-nocheck */ to disable a whole file.",
            "`;",
        ].join("\n");
        expect(checkContent(src, "f.ts").length).toBe(0);
    });

    it("P3-4: a real directive immediately after a closed multiline template is still detected", () => {
        // The parser tracks the template correctly and still reports the real
        // directive on its true line.
        const src = [
            "const help = `",
            "multi",
            "line",
            "`;",
            "// @ts-ignore",
            "const x: string = 1;",
        ].join("\n");
        const violations = checkContent(src, "f.ts");
        expect(violations.length).toBe(1);
        expect(violations[0].line).toBe(5);
    });

    it("P3-4: a directive-like string inside a template literal's ${} interpolation does not trip the gate", () => {
        const src = [
            "const msg = `prefix ${cond ? '// @ts-ignore' : \"// @ts-nocheck\"} suffix`;",
        ].join("\n");
        expect(checkContent(src, "f.ts").length).toBe(0);
    });

    it("P3-4: a real directive still works on a single line", () => {
        expect(checkContent("// @ts-ignore\n", "f.ts").length).toBe(1);
    });

    it("Q28: a regex literal inside a ${} interpolation does not hide a later real directive (was a false NEGATIVE)", () => {
        // The exact repro that the hand-rolled masking lexer failed on: `/\{/`
        // inside `${…}` desynced its brace counter and masked away the real
        // `// @ts-ignore` two lines down, reporting zero violations for an
        // active directive. The TS parser (Option C) tokenizes the regex
        // correctly, so the directive is caught.
        const src = [
            "const re = `${ s.replace(/\\{/, '') }`;",
            "// @ts-ignore",
            "const x: number = undefinedThing;",
        ].join("\n");
        const violations = checkContent(src, "f.ts");
        expect(violations.length).toBe(1);
        expect(violations[0].line).toBe(2);
        expect(violations[0].message).toContain("@ts-ignore is forbidden");
    });

    it("Q28: directive-shaped text inside an ordinary string literal is not a comment", () => {
        expect(checkContent(`const a = "// @ts-ignore inside a string";\n`, "f.ts").length).toBe(0);
        expect(checkContent("const b = '/* @ts-nocheck */';\n", "f.ts").length).toBe(0);
    });

    // Differential fixtures (P3-4 follow-up, 2026-07-24): each asserts the gate
    // matches what TypeScript's OWN commentDirectives/checkJsDirective honor.
    // The starred block was a safety-relevant false NEGATIVE under the earlier
    // "strip delimiters, match comment body" approach; the //// and non-final
    // cases were false POSITIVES. All are now ground-truthed to TS.

    it("P3-4: a starred continuation-line block directive IS honored by TS and is flagged (was a false negative)", () => {
        // TS honors `@ts-ignore` on a ` * ...` final line of a block comment
        // (verified: tsc suppresses TS2304; it is in sourceFile.commentDirectives).
        const src = "/*\n * @ts-ignore */\nmissingSymbol;\n";
        const violations = checkContent(src, "f.ts");
        expect(violations.length).toBe(1);
        expect(violations[0].line).toBe(2);
        expect(violations[0].message).toContain("@ts-ignore is forbidden");
    });

    it("P3-4: a bare starred-block @ts-expect-error is flagged for missing description; a described one passes", () => {
        expect(checkContent("/*\n * @ts-expect-error */\nmissingSymbol;\n", "f.ts").length).toBe(1);
        expect(checkContent("/*\n * @ts-expect-error TS2304 reason */\nmissingSymbol;\n", "f.ts").length).toBe(0);
    });

    it("P3-4: a quadruple-slash //// directive is INERT to TS and is not flagged (was a false positive)", () => {
        expect(checkContent("//// @ts-ignore\nmissingSymbol;\n", "f.ts").length).toBe(0);
    });

    it("P3-4: a triple-slash /// directive IS honored by TS and is flagged", () => {
        expect(checkContent("/// @ts-ignore\nmissingSymbol;\n", "f.ts").length).toBe(1);
    });

    it("P3-4: a directive on a non-final block-comment line is INERT for following code and not flagged", () => {
        expect(checkContent("/* @ts-ignore\n more text */\nmissingSymbol;\n", "f.ts").length).toBe(0);
    });

    it("P3-4: @ts-nocheck is flagged only where TS honors it (top-of-file line comment), not inert forms", () => {
        expect(checkContent("// @ts-nocheck\nmissingSymbol;\n", "f.ts").length).toBe(1);          // honored
        expect(checkContent("const a = 1;\n// @ts-nocheck\nb;\n", "f.ts").length).toBe(0);         // mid-file: inert
        expect(checkContent("/*\n * @ts-nocheck */\nmissingSymbol;\n", "f.ts").length).toBe(0);    // starred block: inert
    });

    // Prefix/suffix classification (P3-4 follow-up, 2026-07-24): TypeScript
    // matches the directive as a PREFIX (no word boundary), so `@ts-ignorefoo`
    // is an active Ignore it honors. The checker now branches on TS's own
    // directive.type rather than searching the comment text, so a suffix cannot
    // hide an ignore and an expect-error's description cannot masquerade as one.

    it("P3-4: a suffixed @ts-ignore is an active Ignore and is flagged (was a false negative)", () => {
        for (const src of [
            "// @ts-ignorefoo\nmissingSymbol;\n",
            "// @ts-ignore_legacy\nmissingSymbol;\n",
            "// @ts-ignore123\nmissingSymbol;\n",
            "/// @ts-ignorefoo\nmissingSymbol;\n",
            "/* @ts-ignore123 */\nmissingSymbol;\n",
            "/*\n * @ts-ignorefoo */\nmissingSymbol;\n",
        ]) {
            const v = checkContent(src, "f.ts");
            expect(v.length, `expected a violation for: ${JSON.stringify(src)}`).toBe(1);
            expect(v[0].message).toContain("@ts-ignore is forbidden");
        }
    });

    it("P3-4: a punctuation-only-suffixed @ts-expect-error has no description and is flagged", () => {
        expect(checkContent("// @ts-expect-error_\nmissingSymbol;\n", "f.ts").length).toBe(1);
        expect(checkContent("// @ts-expect-error-\nmissingSymbol;\n", "f.ts").length).toBe(1);
    });

    it("P3-4: a described @ts-expect-error whose description mentions @ts-ignore is NOT misclassified (was a false positive)", () => {
        const src = "// @ts-expect-error TS2304: replace old @ts-ignore usage\nmissingSymbol;\n";
        expect(checkContent(src, "f.ts").length).toBe(0);
    });

    it("the current plugin tree conforms (gate green on real source)", () => {
        const pluginDir = path.resolve(import.meta.dir, "../../../../figma_plugin");
        expect(checkDirectory(pluginDir).length).toBe(0);
    });
});
