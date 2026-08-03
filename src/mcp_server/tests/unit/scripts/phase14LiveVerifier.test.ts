import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
    DiagnosticTail,
    diagnosticBlock,
    positiveInteger,
    retryTransient,
    verifierFailure,
} from "../../../../../scripts/liveVerifierSupport.js";

describe("Phase 14 live verifier diagnostics", () => {
    it("retains a bounded tail instead of discarding server stderr", () => {
        const diagnostics = new DiagnosticTail(8);
        diagnostics.append("first-");
        diagnostics.append("second\n");
        expect(diagnostics.snapshot()).toBe("-second");

        const hostile = { toString() { throw new Error("nope"); } };
        const guarded = new DiagnosticTail(64);
        expect(() => guarded.append(hostile)).not.toThrow();
        expect(guarded.snapshot()).toContain("unrenderable diagnostic");
    });

    it("adds elapsed-operation context and retained diagnostics to failures", () => {
        const diagnostics = new DiagnosticTail();
        diagnostics.append("Progress update for node_info: page 2/3\n");
        const cause = new Error("Request timed out");
        const failure = verifierFailure(cause, "node_info failed after 60001ms", diagnostics);

        expect(failure.message).toContain("node_info failed after 60001ms");
        expect(failure.message).toContain("Request timed out");
        expect(failure.message).toContain("Progress update for node_info: page 2/3");
        expect(failure.cause).toBe(cause);
        expect(diagnosticBlock("server", new DiagnosticTail())).toContain("empty");
    });

    it("uses only positive integer environment overrides", () => {
        expect(positiveInteger("9000", 10)).toBe(9000);
        expect(positiveInteger("0", 10)).toBe(10);
        expect(positiveInteger("1.5", 10)).toBe(10);
        expect(positiveInteger("invalid", 10)).toBe(10);
        expect(positiveInteger(undefined, 10)).toBe(10);
    });
});

describe("Phase 14 live verifier readiness", () => {
    it("retries only a classified transient connection race", async () => {
        let attempts = 0;
        const result = await retryTransient(
            async () => {
                attempts += 1;
                if (attempts < 3) throw new Error("Not connected to Figma");
                return "ready";
            },
            (error) => error instanceof Error && error.message.includes("Not connected"),
            { timeoutMs: 100, intervalMs: 1, label: "test bridge" },
        );

        expect(result).toBe("ready");
        expect(attempts).toBe(3);
    });

    it("does not retry a non-transient refusal", async () => {
        let attempts = 0;
        await expect(retryTransient(
            async () => {
                attempts += 1;
                throw new Error("CHANNEL_IN_USE");
            },
            (error) => error instanceof Error && error.message.includes("Not connected"),
            { timeoutMs: 100, intervalMs: 1, label: "test bridge" },
        )).rejects.toThrow("CHANNEL_IN_USE");
        expect(attempts).toBe(1);
    });
});

describe("Phase 14 live verifier source invariants", () => {
    const source = readFileSync(
        resolve(import.meta.dir, "../../../../../scripts/phase14-live-verify.ts"),
        "utf8",
    );

    it("has no fixed startup sleep or discarded stderr sink", () => {
        expect(source).not.toContain("await wait(700)");
        expect(source).not.toContain('transport.stderr?.on("data", () => {})');
        expect(source).toContain('transport.stderr?.on("data", (chunk) => diagnostics.append(chunk))');
        expect(source).toContain("joinMcpChannelWhenReady");
        expect(source).toContain("joinRawChannelWhenReady");
    });

    it("keeps the verifier timeout outside the product timeout and reports raw-peer state", () => {
        expect(source).toContain("FIGMA_LIVE_TOOL_TIMEOUT_MS");
        expect(source).toContain("10 * 60 * 1000");
        expect(source).toContain("FIGMA_LIVE_RAW_MESSAGE_TIMEOUT_MS");
        expect(source).toContain("readyState=${this.socket.readyState}");
        expect(source).toContain("queuedTypes=[${queuedTypes}]");
    });

    it("observes refused-peer traffic only after the routed command completes", () => {
        const command = 'await success(primary.client, "page_info", { pageIds: [pageId] });';
        const settle = "await wait(rawSettleMs);";
        const assertion = "refusedPlugin.hasReceived";
        expect(source.indexOf(command)).toBeLessThan(source.indexOf(settle));
        expect(source.indexOf(settle)).toBeLessThan(source.indexOf(assertion));
        expect(source).not.toContain("const silence = refusedPlugin.next");
    });
});
