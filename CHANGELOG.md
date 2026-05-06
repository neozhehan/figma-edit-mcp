# Changelog

## [1.3.0]
### Breaking changes
- \`get_document_info\` removed (no deprecation period; clients receive tool-not-found if they call it).
- \`get_page_info\` renamed to \`get_pages_info\` with new parameter shape (\`pageIds?: string[]\` replacing \`pageId?: string\`) and new response shape.
- \`join_channel\` response shape changed from prose to JSON with \`status\` / \`channel\` / \`editableScopeType\` envelope.
- Removed fields from connect/page payloads: \`childCount\`, \`currentPageId\`, \`currentPageName\`, \`isCurrent\`, root \`type: "DOCUMENT"\`.

### New
- \`editableScopeType\` discriminator.
- \`get_pages_info\` streaming with progress events.
- Structured connect-flow error codes (\`CHANNEL_NOT_FOUND\` / \`CHANNEL_JOIN_FAILED\` / \`PLUGIN_DISCONNECTED\` / \`SCOPE_DELETED\` / \`SCOPE_INVALID\` / \`DOCUMENT_LOAD_FAILED\` / \`UNKNOWN_ERROR\`).

For the full specification, see [read_tools_update.md](./documentation/v1.3.0%20-%20read_tools_update/read_tools_update.md).
