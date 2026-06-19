# AGENTS.md — Using figma-edit-mcp from an AI agent

This server enforces hard safety constraints (scope locking, name verification, batch validation) that you cannot bypass, and it returns structured error codes you need to recover from. **Do not operate blind** — load the guidance before writing.

The full operational guide lives in one place and is delivered three ways; use whichever your host supports:

- **MCP resources** (any client, zero setup): read `figma-edit://guide/constraints`, `figma-edit://guide/error-playbook`, `figma-edit://guide/workflows`, `figma-edit://guide/tool-selection`.
- **The `figma-edit` skill** (Claude Code, Copilot, Codex, Cursor, Gemini, Antigravity, …): `skills/figma-edit/SKILL.md` and its `references/`.
- **In this repo:** [skills/figma-edit/references/](skills/figma-edit/references/) — `constraints.md`, `error-playbook.md`, `workflows.md`, `tool-selection.md`, `SAFETY.md`.

Two rules to internalize before anything else:

1. **Discover before acting.** Start every node workflow with a read (`page_info` → `node_info`); pass names back verbatim.
2. **The plugin can refuse you.** Constraints are checked at execution time and return structured errors — plan calls to comply rather than retrying.

> Installing or developing figma-edit-mcp? See [README.md](./README.md) (install) and [CONTRIBUTING.md](./CONTRIBUTING.md) (development).
