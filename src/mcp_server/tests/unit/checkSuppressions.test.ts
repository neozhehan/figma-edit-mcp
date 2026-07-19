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

    it("rejects a bare @ts-expect-error with same-line-description guidance", () => {
        const violations = checkContent("// @ts-expect-error\nfoo();\n", "fixture.ts");
        expect(violations.length).toBe(1);
        expect(violations[0].message).toContain("requires a same-line description");
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

    it("the current plugin tree conforms (gate green on real source)", () => {
        const pluginDir = path.resolve(import.meta.dir, "../../../../figma_plugin");
        expect(checkDirectory(pluginDir).length).toBe(0);
    });
});
