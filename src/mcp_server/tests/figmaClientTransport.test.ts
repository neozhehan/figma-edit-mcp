import { describe, it, expect } from "bun:test";
import { spawn, type ChildProcess } from "child_process";
import { resolve } from "path";

/**
 * WS5 regression guard for the bun + `ws`-client reconnect loop. Under bun the
 * `ws` package's client rejected its own successful 101 upgrade ("Unexpected
 * server response: 101"), dropped, and reconnected every 2s forever. The client
 * now uses the runtime's native WebSocket. This spawns the REAL socket server +
 * MCP server under the current runtime (bun, when run via `bun test`) and
 * asserts the client makes a single STABLE connection rather than churning.
 *
 * Mocks can't catch this — it's a runtime/transport handshake issue (cf. R5.6).
 */
describe("figma-client transport (WS5): connects without a reconnect loop", () => {
    it("makes one stable socket connection (no disconnect churn)", async () => {
        const port = 3097;
        const socketPath = resolve(import.meta.dir, "../../socket.ts");
        const serverPath = resolve(import.meta.dir, "../server.ts");

        let socketOut = "";
        const socket = spawn(process.execPath, [socketPath, "--port", String(port)], {
            stdio: ["ignore", "pipe", "pipe"],
        });
        socket.stdout.on("data", (d: Buffer) => { socketOut += d.toString(); });

        // Keep stdin open (pipe, never ended) so the server stays alive.
        let server: ChildProcess | undefined;
        try {
            await new Promise<void>((res, rej) => {
                const t = setTimeout(() => rej(new Error("socket server did not start")), 5000);
                const check = () => { if (socketOut.includes("running on")) { clearTimeout(t); res(); } };
                socket.stdout.on("data", check);
                check();
            });

            server = spawn(process.execPath, [serverPath, "--port", String(port)], {
                stdio: ["pipe", "pipe", "pipe"],
            });

            // Allow time to connect and, if regressed, loop several times (loop is 2s).
            await new Promise((r) => setTimeout(r, 3000));

            const connects = (socketOut.match(/New client connected/g) || []).length;
            const disconnects = (socketOut.match(/Client disconnected/g) || []).length;
            expect(connects).toBeGreaterThanOrEqual(1);
            expect(disconnects).toBe(0); // > 0 means the 101 reconnect loop regressed
        } finally {
            server?.kill("SIGKILL");
            socket.kill("SIGKILL");
        }
    }, 15000);
});
