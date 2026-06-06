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

> **Three consolidations + one split + one addition** (see [consolidation-sweep.md](./consolidation-sweep.md)): `create.shape` (3 shape tools), `node.transform` (`move`+`resize`), folding `get_node_variables` into `node.info` fields (48 → 44), splitting `component.delete_property` out of `component.manage_property` (→ 45), and adding net-new `style.delete` (→ **46 tools**). No other merges.

> **Source of truth for R3.2/R3.4/R3.7:** [tool-reference.md](./tool-reference.md) — the canonical per-tool table of old→new name, title, description, and annotation values. Apply it verbatim; keep it and the code in sync.

- [ ] R3.1 **Taxonomy** — the full old→new map (46 tools, 11 groups, strictly two levels) is **final** in [plan.md §2.2](./plan.md) / [tool-reference.md](./tool-reference.md); treat that as the source of truth for the rename. Avoid flat names and 3+ level paths (Smithery Naming, 4.44pt).
- [ ] R3.2 **Rename** all tools per the taxonomy (across `src/mcp_server/tools/*.ts`). Update the Figma plugin command strings and any `sendCommandToFigma` keys if they mirror tool names.
- [ ] R3.3 **Apply the three consolidations + one split** (per consolidation-sweep.md):
  - `create.shape({ type: RECTANGLE|ELLIPSE|POLYGON|STAR, x,y,width,height, name?,parentId?,parentNodeName?,useAbsolutePosition?, fillColor?,strokeColor?, arcData?, pointCount?,innerRadius? })` — folds `create_rectangle`+`create_ellipse`+`create_polygon_star`; validate shape-specific params by `type`. ⚠️ The RECTANGLE branch must **port the `fillColor`/`strokeColor` block from `createEllipse`** ([nodeCreators.ts](../../figma_plugin/handlers/nodeCreators.ts)) — `createRectangle` today applies neither, while the ellipse/star handlers do (verified; critique §1.2). `strokeWeight` is **out of scope**: no sibling handler applies it and it's not in this schema. ⚠️ **STAR `pointCount` → native semantics:** the star branch today does `node.pointCount = pointCount / 2` and rejects odd counts ([nodeCreators.ts:479-483](../../figma_plugin/handlers/nodeCreators.ts)); set `node.pointCount = pointCount` directly (drop the `/2` and the even-parity throw) so `pointCount` = spikes, matching Figma-native `StarNode.pointCount`. Otherwise `pointCount: 10` silently yields a 5-spike star and `pointCount: 5` throws (critique §1.3). Rewrite the schema: `pointCount` = 'number of sides (polygon) or points (star), ≥3'; drop the 'must be even' clause from `innerRadius`.
  - `node.transform({ nodeId, nodeName, x?, y?, width?, height? })` — folds `move_node`+`resize_node`. ⚠️ Write a **new merged plugin handler that applies only the provided subset** — the existing `moveNode`/`resizeNode` ([nodeModifiers.ts](../../figma_plugin/handlers/nodeModifiers.ts)) **throw** on missing params, so they can't be naively reused (verified; critique §1.5). Set `x`/`y` only when provided; call `node.resize(width ?? node.width, height ?? node.height)` only when `width` or `height` is given (default the missing dimension from the node); keep the existing resize-capability guard; treat all-undefined as a no-op.
  - **Fold `get_node_variables` into `node.info`** — drop the standalone tool; expose `boundVariables`, `explicitVariableModes`, and the `*StyleId` fields as **resolved `{id, name}`** library-object references (per [node-fields.md → Reference fields](./node-fields.md)). Resolve plugin-side as an async branch like `mainComponent` in [extractProperties](../../figma_plugin/handlers/nodeReaders.ts), reusing [variableHandlers.ts](../../figma_plugin/handlers/variableHandlers.ts). **No raw-id-only variant** — the resolved superset already carries the `id` for round-trips into `node.bind_variable`/`node.apply_style`; an opaque-id-only field would just force an inevitable follow-up for the name (critique §2.1). This reclassifies these fields from FAST → SLOW (one cached async hop). ⚠️ **The existing resolver is shallow** — `getNodeVariables` resolves only a top-level `.id` ([variableHandlers.ts:652](../../figma_plugin/handlers/variableHandlers.ts)), so array-valued bindings (`fills`/`strokes`/`effects`/`layoutGrids`) and nested maps (`componentProperties`) fall through and return **raw IDs** — the most common case (a color token on a fill) never resolves (critique §1.4). The reused resolver **must recurse** into arrays and nested objects.
  - **Split `component.delete_property`** out of `component.manage_property` — keep `ADD`/`EDIT` in `manage_property`; move `DELETE` (needs only `{ nodeId, nodeName, propertyName }`) to `delete_property` so `destructiveHint: true` scopes to the delete alone (rule 4; mirrors `variable.delete`).
  - **Add net-new `style.delete`** ([styleHandlers.ts](../../figma_plugin/handlers/styleHandlers.ts)) — styles have no deletion path today (`manage_style` is create/update only). Thin handler: resolve the style by `styleId`, verify `styleName`, call the style's native `.remove()`; `destructiveHint: true`. **No consumer check** — style deletion is a safe detach (consumers keep resolved values, lose only the link), unlike `variable.delete` (critique §2.2). Lands the `style.*` lifecycle: `style.list` / `style.manage` / `style.delete`.
  - Keep `variable.delete`, `component.delete_property`, and `style.delete` separate (destructive). No other merges.
- [ ] R3.4 **Descriptions** (Smithery 10.37pt) — audit every tool: a clear one-line "what it does". Add brief "when to use X vs Y" **only** for genuine concept-overlap-with-divergent-params cases — e.g. `node.set_fill` vs `node.apply_style` (ad-hoc color vs shared paint style). Token-aware, no prose bloat.
- [ ] R3.5 **Parameter descriptions** (Smithery 8.89pt) — audit every input param across all tools; ensure each has a `.describe(...)`. Flag and fix any missing.
- [ ] R3.6 **Output schemas** (Smithery 10.37pt) — migrate tools to `server.registerTool(name, { description, inputSchema, outputSchema, annotations }, cb)` and return `structuredContent`. Start with high-value read tools (`node.info`, `page.info`, `style.list`, `component.list`, `variable.list`); extend to writes.
- [ ] R3.7 **Annotations** (Smithery 5.93pt / Glama) — add `title`, `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` to every tool.
  - `get_*`/list/info → `readOnlyHint: true`.
  - delete tools → `destructiveHint: true`.
  - idempotent setters (`node.set_*`, `node.rename`, `node.transform`, …) → `idempotentHint: true`.
- [ ] R3.8 **`node.info` field set** — replace the stale `SAFE_LIST_PROPERTIES` ([nodeUtils.ts](../../figma_plugin/utils/nodeUtils.ts)) with the official-API field list in [node-fields.md](./node-fields.md). Use it for `node.info`'s output schema (R3.6) and the `tool-selection` field guidance (R2.1). **Generate from `@figma/plugin-typings`** (already a devDependency) at build/doc time so it can't drift; the plugin's `extractProperties` fast/slow routing should track the same source. **Format & delivery** (see [node-fields.md § Format & delivery](./node-fields.md#format--delivery)): JSON/TS is the generated source of truth; the LLM-facing reference renders as **Markdown** (denser + greppable). Emit **`name → type`** from the typings for every field — **no per-field prose** except a terse gloss on the cryptic tail. Ship as a **whole-read** resource (no grep); if it outgrows ~2–3k tokens, split fast vs slow into two resources rather than suggesting grep. **Node-reference fields → map to IDs (required):** `extractProperties` ([nodeReaders.ts](../../figma_plugin/handlers/nodeReaders.ts)) must serialize node-reference fields — `parent`, `exposedInstances`, `stuckNodes`, `attachedConnectors` (sync getters) and `mainComponent`, `instances` (async) — to `.id` / `.id[]` **before** the result reaches `figma.ui.postMessage` ([main.ts:195](../../figma_plugin/src/main.ts)). A raw Figma node is a host object that can't be structured-cloned or `JSON.stringify`'d; returning one raw throws `DataCloneError` (today caught → surfaces as a failed `node.info`). Currently `parent`/`mainComponent`/`exposedInstances` are in `SAFE_LIST_PROPERTIES` and read via `node[key]` with **no id-mapping** — a latent bug; the regenerated safe-list will add `stuckNodes`/`attachedConnectors` too. This mapping makes the impl match node-fields.md's documented `string`/`string[]` types. ⚠️ Unit tests mock these as plain objects (clone fine), so it **must be verified in a live Figma session**, not just `bun test` (cf. critique §1.1 / §3). **Library-object references → `{id, name}` (resolved, no raw tier):** `boundVariables`, `explicitVariableModes`, and the `*StyleId` fields are derived/synthetic — `node.info` returns the resolved superset (see R3.3 + node-fields.md → Reference fields), so the generated field set is the official typings fields **plus** this known set of derived reference fields (node-refs → id; library-refs → `{id, name}`); the generator must not assume 1:1 with the sync getters.

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

- [ ] R6.1 **README.md** — rewrite the tool reference table + usage examples to the 46-tool set (new names + net-new `style.delete`); collapse the 3 shape rows into one `create.shape` row and `move_node`/`resize_node` into `node.transform`. No "renamed from" framing.
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
