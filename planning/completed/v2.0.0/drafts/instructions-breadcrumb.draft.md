<!-- DRAFT: the eager `instructions` string for the McpServer options (src/mcp_server/server.ts).
     Kept tiny on purpose — it is delivered at connection time and persists for the whole session,
     so it must point at the deferred guide rather than contain it. -->

This server edits a **live** Figma document and enforces hard constraints (scope locking, name verification, batch validation) that return structured error codes you cannot bypass. Before reading or editing, load the guide on demand — read the MCP resources `figma-edit://guide/constraints`, `figma-edit://guide/error-playbook`, `figma-edit://guide/workflows`, and `figma-edit://guide/tool-selection` (or use the `figma-edit` skill). Always start a node workflow with a read (`page.info` → `node.info`) and pass node names back verbatim. On a structured error, consult the error-playbook resource before retrying.
