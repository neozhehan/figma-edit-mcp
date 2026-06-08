import { describe, it, expect } from "bun:test";
import { spawn } from "child_process";
import { resolve } from "path";

/**
 * WS5 — orphan-process guard. The stdio MCP server must exit when its host
 * disconnects (closes stdin); otherwise the figma-client reconnect loop keeps
 * the event loop alive and orphaned servers accumulate, spinning forever
 * against the socket on :3055. See server.ts shutdown wiring + figma-client
 * reconnect-timer unref().
 */
describe("Server lifecycle (WS5): exits when the stdio host disconnects", () => {
    it("exits with code 0 within 3s after stdin closes", async () => {
        const serverPath = resolve(import.meta.dir, "../server.ts");
        // Point at a port with no socket server so the client just sits in its
        // (harmless, unref'd) reconnect loop — proving exit isn't merely a side
        // effect of an idle/closed socket.
        const child = spawn(process.execPath, [serverPath, "--port", "3999"], {
            stdio: ["pipe", "pipe", "pipe"],
        });

        try {
            // Wait for the server to report it's up (logger writes to stderr).
            await new Promise<void>((res, rej) => {
                const t = setTimeout(() => rej(new Error("server did not start in time")), 8000);
                const onData = (d: Buffer) => {
                    if (d.toString().includes("running on stdio")) {
                        clearTimeout(t);
                        child.stderr.off("data", onData);
                        res();
                    }
                };
                child.stderr.on("data", onData);
            });

            // Simulate the host going away: close the child's stdin (EOF).
            const exited = new Promise<number | null>((res) => {
                child.on("exit", (code) => res(code));
            });
            child.stdin.end();

            const code = await Promise.race([
                exited,
                new Promise<never>((_, rej) =>
                    setTimeout(() => rej(new Error("process did not exit after stdin close")), 3000)
                ),
            ]);
            expect(code).toBe(0);
        } finally {
            if (!child.killed && child.exitCode === null) child.kill("SIGKILL");
        }
    }, 15000);
});
