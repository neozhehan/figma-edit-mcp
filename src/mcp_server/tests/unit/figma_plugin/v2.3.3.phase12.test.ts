import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";
import { RATIFIED_CODES } from "../../../../shared/errorCodes.js";

const GUIDE_PATHS = [
    "skills/figma-edit/references/constraints.md",
    "skills/figma-edit/references/error-playbook.md",
    "skills/figma-edit/references/tool-selection.md",
    "skills/figma-edit/references/workflows.md",
] as const;

const GUIDE_G2_SENTENCE =
    "No write against an existing object proceeds unless the caller-supplied current name matches the resolved object's actual name — nodes, variables, styles, and collections alike; creation verifies the identified parent or collection instead.";

function read(path: string): string {
    return readFileSync(path, "utf8");
}

function occurrenceCount(text: string, needle: string): number {
    return text.split(needle).length - 1;
}

describe("v2.3.3 Phase 12 contract sync", () => {
    it("publishes the universal G2 rule exactly once in each operational guide", () => {
        for (const path of GUIDE_PATHS) {
            expect(
                occurrenceCount(read(path), GUIDE_G2_SENTENCE),
                `${path} must carry one universal existing-object rule`,
            ).toBe(1);
        }
    });

    it("covers every ratified D9 code and retires DOCUMENT_LOAD_FAILED", () => {
        const playbook = read(
            "skills/figma-edit/references/error-playbook.md",
        );

        for (const code of RATIFIED_CODES) {
            expect(
                playbook,
                `error playbook is missing ratified code ${code}`,
            ).toContain(`\`${code}\``);
        }

        expect(playbook).not.toContain("DOCUMENT_LOAD_FAILED");
        expect(playbook).toContain("coverage.pageErrors");
        expect(playbook).toContain("details.variablesInUse");
        expect(playbook).toContain(
            "This refusal is delivered to the **joining plugin's UI**, never to `channel_join`",
        );
    });

    it("teaches one batch interpretation and the annotation retry carve-out", () => {
        const combined = GUIDE_PATHS.map(read).join("\n");

        expect(combined).toContain('status: "partial_success"');
        expect(combined).toContain("failed");
        expect(combined).toContain("skipped");
        expect(combined).toContain("`nodeId`/`status`/`error`");
        expect(combined).toContain("append is not idempotent");
        expect(combined).toContain("identical-text duplicates remain ambiguous");
    });

    it("teaches the current native prototype surface without reviving removed names", () => {
        for (const path of GUIDE_PATHS) {
            const guide = read(path);
            expect(guide).toContain("reaction_list");
            expect(guide).toContain("reaction_update");
            expect(guide).toContain("connector-template discovery");
            expect(guide).toContain("v2.3.4");
            expect(guide).not.toMatch(
                /\bcreate_connection\b|\breaction_to_connector_strategy\b/,
            );
        }
    });

    it("records the Phase 12 safety-manual guarantees and residuals", () => {
        const safety = read("SAFETY.md");

        expect(safety).toContain(
            "No write against an existing object proceeds unless the caller-supplied current name matches the resolved object's actual name — nodes, variables, styles, and collections alike. Creation verifies the identified parent or collection instead.",
        );
        expect(safety).toContain(
            "peer-bound, self-reported version check — not cryptographic attestation",
        );
        expect(safety).toContain(
            "Figma APIs without a parent parameter construct on `currentPage` for part of one synchronous stack",
        );
        expect(safety).toContain(
            "Creator destination freshness is bounded, not fully re-asserted",
        );
        expect(safety).toContain(
            "a creation is reported or reproduced as landing outside its verified destination",
        );
        expect(safety).not.toMatch(
            /\| `create_connection` \||\breaction_to_connector_strategy\b/,
        );
    });
});
