// Node-only smoke test for the published `figma-edit-mcp-socket` bin.
// Run from a directory where `figma-edit-mcp` and `ws` are installed under
// `node_modules/` (see .github/workflows/ci.yml node-smoke job).
//
// Boots the socket server on an ephemeral port, opens a WebSocket, and
// asserts the server sends the documented welcome frame. This catches
// runtime-only regressions (e.g. using Bun-only APIs) that --version cannot.

import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const WebSocket = require("ws");

const socketBin = resolve(process.cwd(), "node_modules", "figma-edit-mcp", "dist", "socket.js");
const port = 13055;

const proc = spawn(process.execPath, [socketBin, "--port", String(port)], {
    stdio: ["ignore", "inherit", "inherit"],
});

let exited = false;
proc.on("exit", (code, signal) => {
    exited = true;
    if (signal !== "SIGKILL" && signal !== "SIGTERM" && code !== 0) {
        console.error(`socket exited prematurely: code=${code} signal=${signal}`);
        process.exit(1);
    }
});

const deadline = Date.now() + 15000;
let ws;
while (Date.now() < deadline && !exited) {
    await sleep(300);
    try {
        const candidate = new WebSocket(`ws://localhost:${port}`);
        await new Promise((res, rej) => {
            candidate.once("open", res);
            candidate.once("error", rej);
        });
        ws = candidate;
        break;
    } catch {
        // not ready yet
    }
}

if (!ws) {
    console.error("socket did not become ready within 15s");
    proc.kill("SIGKILL");
    process.exit(1);
}

const welcome = await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("no welcome frame within 5s")), 5000);
    ws.once("message", (data) => {
        clearTimeout(t);
        try {
            res(JSON.parse(data.toString()));
        } catch (e) {
            rej(e);
        }
    });
    ws.once("error", (e) => {
        clearTimeout(t);
        rej(e);
    });
});

if (welcome.type !== "system" || typeof welcome.message !== "string") {
    console.error("unexpected welcome frame:", welcome);
    ws.close();
    proc.kill("SIGKILL");
    process.exit(1);
}

console.log("socket smoke: ok");
ws.close();
proc.kill("SIGKILL");
