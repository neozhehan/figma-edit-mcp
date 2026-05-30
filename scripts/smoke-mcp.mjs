// Node-only smoke test for the published `figma-edit-mcp` bin.
// Run from a directory where `figma-edit-mcp` is installed under `node_modules/`
// (see .github/workflows/ci.yml node-smoke job).
//
// Spawns the MCP server, sends a JSON-RPC `initialize` over stdio, and asserts
// the server returns a well-formed response. Catches runtime regressions in
// the published bundle that --version cannot (missing deps, ESM resolution,
// Bun-only imports, etc.).

import { spawn } from "node:child_process";
import { resolve } from "node:path";

const serverBin = resolve(process.cwd(), "node_modules", "figma-edit-mcp", "dist", "server.js");

const proc = spawn(process.execPath, [serverBin], {
    stdio: ["pipe", "pipe", "inherit"],
});

let buf = "";
const responsePromise = new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error("no initialize response within 10s")), 10000);
    proc.stdout.on("data", (chunk) => {
        buf += chunk.toString();
        let idx;
        while ((idx = buf.indexOf("\n")) !== -1) {
            const line = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 1);
            if (!line) continue;
            try {
                const msg = JSON.parse(line);
                if (msg.id === 1) {
                    clearTimeout(timer);
                    res(msg);
                    return;
                }
            } catch {
                // stdio transport only writes JSON-RPC frames; ignore anything else
            }
        }
    });
    proc.on("exit", (code) => {
        clearTimeout(timer);
        rej(new Error(`server exited before responding (code=${code})`));
    });
});

proc.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "ci-smoke", version: "1.0.0" },
    },
}) + "\n");

try {
    const resp = await responsePromise;
    if (!resp.result?.serverInfo?.name || !resp.result?.protocolVersion) {
        console.error("malformed initialize response:", JSON.stringify(resp));
        proc.kill("SIGKILL");
        process.exit(1);
    }
    console.log(`mcp smoke: ok (${resp.result.serverInfo.name})`);
    proc.kill("SIGKILL");
} catch (err) {
    console.error(err.message);
    proc.kill("SIGKILL");
    process.exit(1);
}
