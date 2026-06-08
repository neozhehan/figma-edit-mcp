# v2.0.0 — Document Drafts

Final-content drafts for every reader-facing surface that v2.0.0 changes. Each is written as the **finished file** (or finished fragment, where only part of a file changes). When execution begins (WS2/WS4/WS6), copy each draft to its destination below.

> **Draft naming:** every file here carries a `.draft.<ext>` suffix so it can't be mistaken for a live file. The destination paths in the tables are the **real** filenames (no `.draft.`).
>
> **Internal links:** the navigation links in *this* index point at the `.draft.` files. But each draft's **own internal links** (e.g. `SKILL.draft.md` → `references/constraints.md`) intentionally use the **production** paths *without* `.draft.`, because that content ships verbatim — do not "fix" them to the draft names.
>
> Names/descriptions/annotations follow [tool-reference.md](../tool-reference.md); the field guidance follows [node-fields.md](../node-fields.md). Drafts use **new tool names only** (per R-DOC-2); the CHANGELOG entry is the sole place old names appear.

## End-user–facing

| Draft | Destination | Action | Task |
|---|---|---|---|
| [skills/figma-edit/SKILL.draft.md](skills/figma-edit/SKILL.draft.md) | `skills/figma-edit/SKILL.md` | New | R2.4 |
| [references/constraints.draft.md](skills/figma-edit/references/constraints.draft.md) | `skills/figma-edit/references/constraints.md` | New (canonical) | R2.1 |
| [references/error-playbook.draft.md](skills/figma-edit/references/error-playbook.draft.md) | `skills/figma-edit/references/error-playbook.md` | New (canonical) | R2.1 |
| [references/workflows.draft.md](skills/figma-edit/references/workflows.draft.md) | `skills/figma-edit/references/workflows.md` | New — includes the folded-in `text_replacement` recipe | R2.1, R6.2 |
| [references/tool-selection.draft.md](skills/figma-edit/references/tool-selection.draft.md) | `skills/figma-edit/references/tool-selection.md` | New — incl. fast/slow field guidance | R2.1 |
| [AGENTS.draft.md](AGENTS.draft.md) | `AGENTS.md` | Replace with slim pointer | R2.5 |
| [README.draft.md](README.draft.md) | `README.md` | Rewrite (tool table rebuilt from tool-reference; prompts trimmed to the 2 kept; skill-install note added) | R6.1, R2.7 |
| [CHANGELOG-2.0.0-entry.draft.md](CHANGELOG-2.0.0-entry.draft.md) | **prepend** into `CHANGELOG.md` above `[1.5.3]` | Add `[2.0.0]` entry + migration table | R5.2, R6.7 |
| [prompts/reaction_to_connector_strategy.draft.md](prompts/reaction_to_connector_strategy.draft.md) | body of the `reaction_to_connector_strategy` `server.prompt` in `src/mcp_server/tools/prototyping.ts` | Rewrite to new names | R6.3 |
| [prompts/swap_overrides_instances.draft.md](prompts/swap_overrides_instances.draft.md) | body of the `swap_overrides_instances` `server.prompt` in `src/mcp_server/tools/components.ts` | Rewrite to new names | R6.3 |
| [instructions-breadcrumb.draft.md](instructions-breadcrumb.draft.md) | the eager `instructions` string in `src/mcp_server/server.ts` | New | R2.3 |

## Contributor–facing

| Draft | Destination | Action | Task |
|---|---|---|---|
| [CONTRIBUTING.draft.md](CONTRIBUTING.draft.md) | `CONTRIBUTING.md` | Rewrite (live tool refs → new names; AGENTS pointers → skill references; tag `v2.0.0`) | R6.5 |
| [CLAUDE.draft.md](CLAUDE.draft.md) | `CLAUDE.md` | Rewire (keeps `@AGENTS.md`; adds contributor note) | R2.6 |
| [.draft.cursorrules](.draft.cursorrules) | `.cursorrules` | Repoint to skill / resources | R6.6 |
| [copilot-instructions.draft.md](copilot-instructions.draft.md) | `.github/copilot-instructions.md` | Repoint to skill / resources | R6.6 |

## Registry / metadata

| Draft | Destination | Action | Task |
|---|---|---|---|
| [manifest.tools.draft.json](manifest.tools.draft.json) | the `tools` array in `manifest.json` | Populate (45 tools) | R4.1 |
| [glama.draft.json](glama.draft.json) | `glama.json` (repo root) | New | R4.4 |

## Not drafted (no content change)

- `DESIGN_PHILOSOPHY.md` — **verify-clean only** (already tool-name-free; keep it so). R6.8
- Frozen archival docs (`documentation/completed/**`, `legacy/**`, `v1.5.1/**`) — untouched. R-DOC-4

## Out of scope for these drafts (handled in code, WS3)

The per-tool **descriptions, parameter `.describe(...)`s, annotations, and output schemas** are authored directly in `src/mcp_server/tools/*.ts` from [tool-reference.md](../tool-reference.md) + [node-fields.md](../node-fields.md) (R3.4–R3.8). They aren't prose docs, so they're not drafted here — `manifest.tools.draft.json` above captures the name+description slice that the registry needs.
