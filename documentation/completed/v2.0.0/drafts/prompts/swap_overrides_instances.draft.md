<!-- DRAFT: new body for the `swap_overrides_instances` server.prompt in src/mcp_server/tools/components.ts -->

# Swap Component Instance and Override Strategy

## Overview
This strategy enables transferring content and property overrides from a source instance to one or more target instances in Figma, maintaining design consistency while reducing manual work.

## Step-by-Step Process

### 1. Selection Analysis
- Use `page.info()` to explore the document structure and identify node IDs.
- Determine which is the source node (with content to copy) and which are targets (where to apply content).

### 2. Extract Source Overrides
- Use `instance.get_overrides()` to extract customizations from the source instance
- This captures text content, property values, and style overrides
- Command syntax: `instance.get_overrides({ nodeId: "source-instance-id" })`
- Look for a successful response like "Got component information from [instance name]"

### 3. Apply Overrides to Targets
- Apply captured overrides using `instance.set_overrides()`
- Command syntax:
  ```
  instance.set_overrides({
    sourceInstanceId: "source-instance-id",
    targetNodes: [
      { nodeId: "target-id-1", nodeName: "Target Name 1" },
      { nodeId: "target-id-2", nodeName: "Target Name 2" }
    ]
  })
  ```

### 4. Verification
- Verify results with `node.info(nodeIds, fields: ["componentProperties", "characters", "overrides"])`
- Confirm text content and style overrides have transferred successfully

## Key Tips
- Always join the appropriate channel first with `channel.join()`
- When working with multiple targets, verify their IDs with `page.info()`.
- Preserve component relationships by using instance overrides rather than direct text manipulation
