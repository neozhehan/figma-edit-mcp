import { connectToFigma, joinChannel, sendCommandToFigma } from "../src/mcp_server/figma-client.js";

async function run() {
    connectToFigma();
    await new Promise(r => setTimeout(r, 1000)); // wait for connection
    
    console.log("Joining channel 'rdrm'...");
    await joinChannel("rdrm");
    console.log("Joined.");

    // 1. Get all variables to pick one
    console.log("Fetching variable list...");
    const listRes = await sendCommandToFigma("variable_list", {});
    
    if (!listRes || !listRes.variables || listRes.variables.length === 0) {
        console.log("No variables found in this document. Cannot test consumer scan.");
        process.exit(0);
    }

    const varId = listRes.variables[0].id;
    console.log(`Testing consumer scan on variable ${varId}...`);

    // 2. Invoke variable_list with includeConsumers = 'document'
    // This uses the same findVariableConsumers logic as variable_delete
    // and should trigger the new time-budgeted heartbeat.
    console.log("Starting variable_list (document scan). Look for progress updates in output...");
    
    try {
        const details = await sendCommandToFigma("variable_list", {
            variableId: [varId],
            includeConsumers: "document"
        });
        
        console.log("Successfully completed document scan!");
        console.log(`Found ${details.variables[0].nodeConsumers.length} node consumers for this variable.`);
    } catch (e: any) {
        console.error("Failed:", e.message);
    }
    
    process.exit(0);
}
run().catch(console.error);
