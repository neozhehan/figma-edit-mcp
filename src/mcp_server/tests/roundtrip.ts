import { spawn } from "child_process";
import { readFileSync } from "fs";
import { resolve } from "path";

async function runRoundtrip() {
    console.log("Starting MCP-protocol round-trip verification...");

    const serverPath = resolve(__dirname, "../../../dist/server.js");
    const packagePath = resolve(__dirname, "../../../package.json");
    const expectedVersion = JSON.parse(readFileSync(packagePath, "utf8")).version;
    const child = spawn("node", [serverPath], {
        stdio: ["pipe", "pipe", "inherit"],
    });

    let buffer = "";
    const pendingPromises: Array<{
        id: number;
        resolve: (val: any) => void;
        reject: (err: any) => void;
    }> = [];

    child.stdout.on("data", (data) => {
        buffer += data.toString();
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
            const line = buffer.substring(0, newlineIndex).trim();
            buffer = buffer.substring(newlineIndex + 1);
            if (line) {
                try {
                    const message = JSON.parse(line);
                    console.log(`Received from server:`, JSON.stringify(message).substring(0, 150) + "...");
                    const match = pendingPromises.find((p) => p.id === message.id);
                    if (match) {
                        match.resolve(message);
                    }
                } catch (e) {
                    console.error("Error parsing message line:", line, e);
                }
            }
        }
    });

    function sendRequest(method: string, params: any, id: number): Promise<any> {
        return new Promise((resolve, reject) => {
            pendingPromises.push({ id, resolve, reject });
            const payload = JSON.stringify({
                jsonrpc: "2.0",
                id,
                method,
                params,
            }) + "\n";
            child.stdin.write(payload);
            console.log(`Sent to server:`, payload.trim().substring(0, 150) + "...");
        });
    }

    function sendNotification(method: string, params: any) {
        const payload = JSON.stringify({
            jsonrpc: "2.0",
            method,
            params,
        }) + "\n";
        child.stdin.write(payload);
        console.log(`Sent notification:`, payload.trim());
    }

    try {
        // 1. Initialize
        const initResponse = await sendRequest(
            "initialize",
            {
                protocolVersion: "2024-11-05",
                capabilities: {},
                clientInfo: { name: "test-client", version: "1.0.0" },
            },
            1
        );

        console.log("Verifying initialize response...");
        if (!initResponse.result) {
            throw new Error("Initialization failed: " + JSON.stringify(initResponse));
        }
        const { serverInfo, instructions } = initResponse.result;
        console.log("Server Info:", serverInfo);
        console.log("Instructions:", instructions);

        if (serverInfo.name !== "figma-edit-mcp") {
            throw new Error(`Expected server name "figma-edit-mcp", got "${serverInfo.name}"`);
        }
        if (serverInfo.version !== expectedVersion) {
            throw new Error(
                `Expected server version "${expectedVersion}", got "${serverInfo.version}"`,
            );
        }
        if (!instructions || !instructions.includes("figma-edit://guide/")) {
            throw new Error(`Expected eager instructions breadcrumb, got "${instructions}"`);
        }
        console.log("✅ Initialize response verified successfully.");

        // Send initialized notification
        sendNotification("notifications/initialized", {});

        // 2. Resources List
        const listResponse = await sendRequest("resources/list", {}, 2);
        console.log("Verifying resources/list response...");
        const resources = listResponse.result.resources;
        if (!resources || resources.length !== 5) {
            throw new Error(`Expected 5 guide resources, got ${resources?.length}`);
        }
        const uris = resources.map((r: any) => r.uri);
        const expectedUris = [
            "figma-edit://guide/constraints",
            "figma-edit://guide/error-playbook",
            "figma-edit://guide/workflows",
            "figma-edit://guide/tool-selection",
            "figma-edit://guide/node-fields",
        ];
        for (const uri of expectedUris) {
            if (!uris.includes(uri)) {
                throw new Error(`Missing expected resource URI: ${uri}`);
            }
        }
        console.log("✅ Resources list verified successfully.");

        // 3. Resources Read
        const readResponse = await sendRequest(
            "resources/read",
            { uri: "figma-edit://guide/constraints" },
            3
        );
        console.log("Verifying resources/read response...");
        const contents = readResponse.result.contents;
        if (!contents || contents.length !== 1 || !contents[0].text.includes("Hard constraints")) {
            throw new Error(`Invalid constraints guide contents: ${JSON.stringify(contents)}`);
        }
        console.log("✅ Resources read verified successfully.");

        // 4. Tools List
        const toolsResponse = await sendRequest("tools/list", {}, 4);
        console.log("Verifying tools/list response...");
        const tools = toolsResponse.result.tools;
        if (!tools || tools.length !== 45) {
            throw new Error(`Expected 45 registered tools, got ${tools?.length}`);
        }
        const toolNames = tools.map((tool: any) => tool.name);
        if (toolNames.includes("create_connection")) {
            throw new Error("Removed tool create_connection is still registered");
        }
        for (const name of ["reaction_list", "reaction_update"]) {
            if (!toolNames.includes(name)) {
                throw new Error(`Missing retained reaction tool: ${name}`);
            }
        }
        console.log("✅ Tools list verified successfully (45 tools registered).");

        // 5. Prompts List
        const promptsResponse = await sendRequest("prompts/list", {}, 5);
        console.log("Verifying prompts/list response...");
        const prompts = promptsResponse.result.prompts;
        const promptNames = prompts.map((prompt: any) => prompt.name);
        if (promptNames.includes("reaction_to_connector_strategy")) {
            throw new Error(
                "Removed prompt reaction_to_connector_strategy is still registered",
            );
        }
        if (!promptNames.includes("swap_overrides_instances")) {
            throw new Error("Missing retained prompt: swap_overrides_instances");
        }
        console.log("✅ Prompts list verified successfully.");

        console.log("All round-trip checks passed successfully! 🎉");
        child.kill();
        process.exit(0);
    } catch (e: any) {
        console.error("❌ Verification failed:", e.message);
        child.kill();
        process.exit(1);
    }
}

runRoundtrip();
