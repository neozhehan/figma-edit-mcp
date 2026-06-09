<!-- DRAFT: new body for the `reaction_to_connector_strategy` server.prompt in src/mcp_server/tools/prototyping.ts -->

# Strategy: Convert Figma Prototype Reactions to Connector Lines

## Goal
Process the JSON output from the `reaction.list` tool to generate an array of connection objects suitable for the `create.connection` tool. This visually represents prototype flows as connector lines on the Figma canvas.

## Input Data
You will receive JSON data from the `reaction.list` tool. This data contains an array of nodes, each with potential reactions. A typical reaction object looks like this:
```json
{
  "trigger": { "type": "ON_CLICK" },
  "action": {
    "type": "NAVIGATE",
    "destinationId": "destination-node-id",
    "navigationTransition": { ... },
    "preserveScrollPosition": false
  }
}
```

## Step-by-Step Process

### 1. Preparation & Context Gathering
   - **Action:** Call `node.info` on the relevant node(s) to get context about the nodes involved (names, types, etc.). This helps in generating meaningful connector labels later.
   - **Action:** Call `create.connection` **without** any parameters (empty object).
   - **Check Result:** Analyze the response to see if a default connector is set.
     - If it confirms a default connector is already set (e.g., "Default connector is already set"), proceed to Step 2.
     - If it indicates no default connector is set, you **cannot** proceed with creating connections yet. Inform the user they need to manually copy a connector from FigJam, paste it onto the current page, select it, and then you can run `create.connection({ connectorId: "SELECTED_NODE_ID" })` before attempting to create the lines. **Do not proceed to Step 2 until a default connector is confirmed.**

### 2. Filter and Transform Reactions from `reaction.list` Output
   - **Iterate:** Go through the JSON array provided by `reaction.list`. For each node in the array:
     - Iterate through its `reactions` array.
   - **Filter:** Keep only reactions where the `action` meets these criteria:
     - Has a `type` that implies a connection (e.g., `NAVIGATE`, `OPEN_OVERLAY`, `SWAP_OVERLAY`). **Ignore** types like `CHANGE_TO`, `CLOSE_OVERLAY`, etc.
     - Has a valid `destinationId` property.
   - **Extract:** For each valid reaction, extract the following information:
     - `sourceNodeId`: The ID of the node the reaction belongs to (from the outer loop).
     - `destinationNodeId`: The value of `action.destinationId`.
     - `actionType`: The value of `action.type`.
     - `triggerType`: The value of `trigger.type`.

### 3. Generate Connector Text Labels
   - **For each extracted connection:** Create a concise, descriptive text label string.
   - **Combine Information:** Use the `actionType`, `triggerType`, and potentially the names of the source/destination nodes to generate the label.
   - **Example Labels:**
     - "On click, navigate to [Destination Node Name]"
     - "On drag, open [Destination Node Name] overlay"
   - **Keep it brief and informative.** Let this generated string be `generatedText`.

### 4. Prepare the `connections` Array for `create.connection`
   - **Structure:** Create a JSON array where each element is an object representing a connection.
   - **Format:** Each object in the array must have the following structure:
     ```json
     {
       "startNodeId": "sourceNodeId_from_step_2",
       "endNodeId": "destinationNodeId_from_step_2",
       "text": "generatedText_from_step_3"
     }
     ```
   - **Result:** This final array is the value you will pass to the `connections` parameter when calling the `create.connection` tool.

### 5. Execute Connection Creation
   - **Action:** Call the `create.connection` tool, passing the array generated in Step 4 as the `connections` argument.
   - **Verify:** Check the response from `create.connection` to confirm success or failure.

This detailed process ensures you correctly interpret the reaction data, prepare the necessary information, and use the appropriate tools to create the connector lines.
