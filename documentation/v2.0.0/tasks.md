# v2.0.0 — Tasks

> Actionable checklist for the v2.0.0 release. For motivation, architecture, success criteria, and open decisions see [plan.md](./plan.md).
>
> **Branch:** `release/v2.0.0` · **Backwards compatibility is NOT required** (zero end-users) — rename/consolidate the tool API freely.

---

## WS1 — Version & metadata hygiene

- [ ] R1.1 Sync version to `2.0.0` in [package.json](../../package.json), [server.json](../../server.json) (both `version` fields), [manifest.json](../../manifest.json).
- [ ] R1.2 Fix [server.ts](../../src/mcp_server/server.ts) hardcoded `version: "1.0.0"` → read from `package.json` at runtime (kills version drift; also corrects server `name`).
- [ ] R1.3 Add `skills` to the `files` allowlist in [package.json](../../package.json) so the skill + references ship in the tarball.
- [ ] R1.4 **Add a server icon** (Smithery Metadata, 8pt) to the `.mcpb` [manifest.json](../../manifest.json) via the `icon` field (and/or `icons` array); include the icon file in the bundle so it ships in the `.mcpb`.

## WS2 — Documentation deferral

- [ ] R2.1 Extract the **operational** content of [AGENTS.md](../../AGENTS.md) into `skills/figma-edit/references/{constraints,error-playbook,workflows,tool-selection}.md` (4 files, the canonical source). **Drop** the "tripartite / who decides" framing and any design-philosophy prose — include only what's needed to *use* the server. Fold the "when a constraint forbids the request" rule into `constraints.md`. Update tool names to the new dot-notation (coordinate with WS3).
- [ ] R2.2 Add an MCP resources handler (`src/mcp_server/resources.ts`) registering one resource per reference file under `figma-edit://guide/*`; read file contents lazily on `resources/read`; `mimeType: text/markdown`; fail soft (return error text, never crash startup).
- [ ] R2.3 Add a tiny eager `instructions` breadcrumb to the `McpServer` options pointing agents at the resources (and the skill) before writes / on errors.
- [ ] R2.4 Create `skills/figma-edit/SKILL.md` — frontmatter (`name`, `description` with trigger guidance) + thin body that points into `references/`.
- [ ] R2.5 Slim [AGENTS.md](../../AGENTS.md) to a pointer (constraints exist → load the skill / read `figma-edit://guide/*`). No duplicated body.
- [ ] R2.6 Verify/adjust [CLAUDE.md](../../CLAUDE.md) wiring so the in-repo experience is no longer an eager full-guide load.
- [ ] R2.7 Document skill installation in [README.md](../../README.md) (one-time copy into the user's skills dir).

## WS3 — Tool API redesign `[breaking — OK]`

> **Three consolidations + one split** (see [consolidation-sweep.md](./consolidation-sweep.md)): `create.shape` (3 shape tools), `node.transform` (`move`+`resize`), folding `get_node_variables` into `node.info` fields (48 → 44), and splitting `component.delete_property` out of `component.manage_property` (→ **45 tools**). No other merges.

> **Source of truth for R3.2/R3.4/R3.7:** [tool-reference.md](./tool-reference.md) — the canonical per-tool table of old→new name, title, description, and annotation values. Apply it verbatim; keep it and the code in sync.

- [ ] R3.1 **Taxonomy** — the full old→new map (45 tools, 11 groups, strictly two levels) is **final** in [plan.md §2.2](./plan.md) / [tool-reference.md](./tool-reference.md); treat that as the source of truth for the rename. Avoid flat names and 3+ level paths (Smithery Naming, 4.44pt).
- [ ] R3.2 **Rename** all tools per the taxonomy (across `src/mcp_server/tools/*.ts`). Update the Figma plugin command strings and any `sendCommandToFigma` keys if they mirror tool names.
- [ ] R3.3 **Apply the three consolidations + one split** (per consolidation-sweep.md):
  - `create.shape({ type: RECTANGLE|ELLIPSE|POLYGON|STAR, x,y,width,height, name?,parentId?,parentNodeName?,useAbsolutePosition?, fillColor?,strokeColor?, arcData?, pointCount?,innerRadius? })` — folds `create_rectangle`+`create_ellipse`+`create_polygon_star`; gives rectangle the missing `fillColor`/`strokeColor`; validate shape-specific params by `type`.
  - `node.transform({ nodeId, nodeName, x?, y?, width?, height? })` — folds `move_node`+`resize_node`.
  - **Fold `get_node_variables` into `node.info`** — drop the standalone tool. ⚠️ `boundVariables` + `explicitVariableModes` are **already** in `SAFE_LIST_PROPERTIES` ([nodeUtils.ts](../../figma_plugin/utils/nodeUtils.ts)) and today return **raw** (alias/mode IDs). The fold must add the **resolved** variant (IDs → variable/collection/mode names) as an async branch like `mainComponent` in [extractProperties](../../figma_plugin/handlers/nodeReaders.ts) — reuse the resolution logic from [variableHandlers.ts](../../figma_plugin/handlers/variableHandlers.ts). Do **not** just expose the raw field.
  - **Split `component.delete_property`** out of `component.manage_property` — keep `ADD`/`EDIT` in `manage_property`; move `DELETE` (needs only `{ nodeId, nodeName, propertyName }`) to `delete_property` so `destructiveHint: true` scopes to the delete alone (rule 4; mirrors `variable.delete`).
  - Keep `variable.delete` and `component.delete_property` separate (destructive). No other merges.
- [ ] R3.4 **Descriptions** (Smithery 10.37pt) — audit every tool: a clear one-line "what it does". Add brief "when to use X vs Y" **only** for genuine concept-overlap-with-divergent-params cases — e.g. `node.set_fill` vs `node.apply_style` (ad-hoc color vs shared paint style). Token-aware, no prose bloat.
- [ ] R3.5 **Parameter descriptions** (Smithery 8.89pt) — audit every input param across all tools; ensure each has a `.describe(...)`. Flag and fix any missing.
- [ ] R3.6 **Output schemas** (Smithery 10.37pt) — migrate tools to `server.registerTool(name, { description, inputSchema, outputSchema, annotations }, cb)` and return `structuredContent`. Start with high-value read tools (`node.info`, `page.info`, `style.list`, `component.list`, `variable.list`); extend to writes.
- [ ] R3.7 **Annotations** (Smithery 5.93pt / Glama) — add `title`, `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` to every tool.
  - `get_*`/list/info → `readOnlyHint: true`.
  - delete tools → `destructiveHint: true`.
  - idempotent setters (`node.set_*`, `node.rename`, `node.transform`, …) → `idempotentHint: true`.
- [ ] R3.8 **`node.info` field set** — replace the stale `SAFE_LIST_PROPERTIES` ([nodeUtils.ts](../../figma_plugin/utils/nodeUtils.ts)) with the official-API field list in [node-fields.md](./node-fields.md). Use it for `node.info`'s output schema (R3.6) and the `tool-selection` field guidance (R2.1). **Generate from `@figma/plugin-typings`** (already a devDependency) at build/doc time so it can't drift; the plugin's `extractProperties` fast/slow routing should track the same source. **Format & delivery** (see [node-fields.md § Format & delivery](./node-fields.md#format--delivery)): JSON/TS is the generated source of truth; the LLM-facing reference renders as **Markdown** (denser + greppable). Emit **`name → type`** from the typings for every field — **no per-field prose** except a terse gloss on the cryptic tail. Ship as a **whole-read** resource (no grep); if it outgrows ~2–3k tokens, split fast vs slow into two resources rather than suggesting grep.

## WS4 — Registry & scannability

> Smithery lists this project via an **`.mcpb` bundle**, so config/metadata come from [manifest.json](../../manifest.json), **not `smithery.yaml`** (which is unused on this path). The published bundle is also stale (manifest `1.5.2`) and must be rebuilt + republished.

- [ ] R4.1 **Populate `manifest.json` `tools` array** — every tool's `name` + `description` from [tool-reference.md](./tool-reference.md) (primary unlock for the 0/40 Capability category; Smithery enumerates tools from here). Keep names in sync with the WS3 dot-notation taxonomy. Consider auto-generating from the registered tools to avoid drift.
- [ ] R4.2 **Rebuild + republish the `.mcpb`** — `mcpb pack` (or current build) then `smithery mcp publish ./figma-edit-mcp.mcpb -n <org/server>`. Confirm the new bundle carries the `2.0.0` manifest, the `tools` array, and the icon.
- [ ] R4.3 **Verify `.mcpb` Capability scanning** — determine whether Smithery scores Capability sub-items (param descriptions / output schemas / annotations) by executing the bundle or only reading the manifest. Republish with `tools`+`icon`, observe which sub-scores move; or inspect a known high-scoring `.mcpb` server. Re-prioritise WS3 Smithery effort based on the result.
- [ ] R4.4 **`glama.json`** — maintainers/metadata at repo root (Glama path, independent of Smithery).

## WS5 — Release mechanics

- [ ] R5.1 Update tests in [src/mcp_server/tests](../../src/mcp_server/tests) for renamed tools / new schemas.
- [ ] R5.2 CHANGELOG `[2.0.0]` entry — see **R6.7** (the migration table lives there).
- [ ] R5.3 `bun run build:all` succeeds; `bun test` green.
- [ ] R5.4 Remove the `temp/` scratch dir.
- [ ] R5.5 Prep publish only — leave `npm publish` + git tag to the maintainer (npm 2FA).

## WS6 — Documentation sweep (new-reader, new names)

> Governed by [plan.md §5](./plan.md#5-documentation-requirements). All reader-facing docs use **only** the new dot-notation names and assume a new reader; the CHANGELOG is the sole place old names appear.

- [ ] R6.1 **README.md** — rewrite the tool reference table + usage examples to the 45 new names; collapse the 3 shape rows into one `create.shape` row and `move_node`/`resize_node` into `node.transform`. No "renamed from" framing.
- [ ] R6.2 **`skills/figma-edit/references/**`** — author from `AGENTS.md` with new names only (canonical source; coordinates with R2.1). Update every workflow recipe and the `node.info` tool-selection table. **Absorb the `text_replacement_strategy` prompt's recipe skeleton** (clone → chunked `text.set_content` → `node.export_visual` verify) into `workflows.md`, stripped of generic-advice padding (see R6.3).
- [ ] R6.3 **MCP prompt disposition** — prompts are user-initiated/deferred (zero context cost, score-neutral); keep only the non-derivable ones (see [plan.md §5 → Prompt disposition](./plan.md#5-documentation-requirements)). Net: **keep 2, fold 1, cut 1** (rewrite surface shrinks from 4 prompts to 2):
  - **Keep + rewrite to new names:** `reaction_to_connector_strategy` (the `create.connection` default-connector handshake + reaction action-type filter) and `swap_overrides_instances` (`instance.get_overrides` → `instance.set_overrides`, source→targets).
  - **Fold + drop:** move `text_replacement_strategy`'s skeleton into `workflows.md` (R6.2), then **remove** the `server.prompt` from [text.ts](../../src/mcp_server/tools/text.ts).
  - **Cut:** delete the `annotation_conversion_strategy` `server.prompt` from [annotations.ts](../../src/mcp_server/tools/annotations.ts) (niche + fictional pseudo-code).
- [ ] R6.4 **Tool/prompt cross-references** — during the WS3 rename, update every tool/prompt description that names another tool (e.g. `update_reactions`→`reaction.list`, `get_reactions`→`create.connection`).
- [ ] R6.5 **CONTRIBUTING.md** — update its tool references to new names.
- [ ] R6.6 **`.cursorrules` + `.github/copilot-instructions.md`** — repoint to the slimmed guide / skill (they currently defer to `AGENTS.md`).
- [ ] R6.7 **CHANGELOG.md** — add the `[2.0.0]` entry documenting the breaking rename + the three consolidations, **with an old→new mapping table** (the only doc that keeps old names).
- [ ] R6.8 **Verify clean** — confirm `DESIGN_PHILOSOPHY.md` stays tool-name-free; do **not** touch frozen archival docs (`documentation/completed/**`, `legacy/**`, `v1.5.1/**`).

---

## Score-impact cheat sheet

| Fix | Task | Smithery pts | Confidence |
|---|---|---|---|
| Populate manifest `tools` + republish `.mcpb` | R4.1, R4.2 | unlocks Capability 0/40 | high |
| Descriptions (already exist in code) | R3.4 / manifest | 10.37 | high |
| Server icon (manifest) | R1.4 | 8.00 | high |
| Dot-notation naming | R3.1, R3.2 | 4.44 | med (needs manifest tool names) |
| Parameter descriptions | R3.5 | 8.89 | **pending (R4.3)** |
| Output schemas | R3.6 | 10.37 | **pending (R4.3)** |
| Annotations | R3.7 | 5.93 | **pending (R4.3)** |

> Items marked **pending (R4.3)** may not be scoreable on the `.mcpb` path if Smithery reads only the static manifest. They still benefit **Glama** regardless (R4.4).
