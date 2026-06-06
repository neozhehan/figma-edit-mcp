# v2.0.0 — Plan

> **Theme:** Defer the loading of documentation and tool context as much as possible, and raise the third-party quality scores ([Glama](https://glama.ai/mcp/servers/neozhehan/figma-edit-mcp/score), [Smithery](https://smithery.ai/servers/neo-vtqv/figma-edit-mcp/releases)).

This release is the follow-up to `1.5.3`. It was originally scoped as `1.5.4` but promoted to a **major** (`2.0.0`) because it adds new surfaces (MCP resources, a packaged skill, tool annotations, output schemas) and **redesigns the tool API**.

> [!NOTE]
> This document is **high-level planning only**. For the actionable, trackable checklist see [tasks.md](./tasks.md).

> [!IMPORTANT]
> **Backwards compatibility is NOT a goal for this release.** The project has **zero current end-users**, so the tool API may be renamed, consolidated, and restructured freely. We optimize for the *right* long-term design, not migration safety.

---

## 1. Motivation

### 1.1 The documentation-delivery gap

The agent usage guide ([AGENTS.md](../../AGENTS.md)) ships in the npm tarball (it is in the `files` allowlist), but **nothing surfaces it to an end-user's agent**:

- The server passes no `instructions`, exposes no MCP **resources**, and no MCP **prompts**.
- Agent file conventions (`AGENTS.md`, `SKILL.md`, `copilot-instructions.md`) are read from the **user's** project root or global config dir — **never** from inside a dependency's `node_modules/`.
- The only auto-load path today is [CLAUDE.md](../../CLAUDE.md) (`@AGENTS.md`), which fires **only** for contributors working inside the cloned repo, and which loads the **entire** guide **eagerly** every session — the exact anti-pattern this release targets.

Net: for an npm end-user, `AGENTS.md` is present-but-inert in `node_modules`, and for contributors it is loaded eagerly and in full.

### 1.2 The token-efficiency principle

We want guidance to be **available on demand, not loaded eagerly**:

- The MCP `instructions` field is **eager** (delivered once at `initialize`, persists for the whole session). Therefore it must stay a **tiny breadcrumb**, never the guide body.
- True deferral comes from **MCP Resources**: only the lightweight resource metadata (URI/name/description) is advertised eagerly; the **body** is fetched only on `resources/read`.
- `SKILL.md` is now a **cross-tool open standard** (Claude Code, GitHub Copilot, OpenAI Codex, Cursor, Gemini CLI, Google Antigravity, 20+ agents) with built-in progressive disclosure (frontmatter eager, body + `references/` on demand).

### 1.3 The scoring gaps

#### Smithery — **52/100**

| Category | Score | Items (max pts) | Status |
|---|---|---|---|
| **Capability Quality** | **0 / 40** | Descriptions (10.37), Parameter descriptions (8.89), Output schemas (10.37), Annotations (5.93), Naming (4.44) | all ✗ / – |
| **Server Metadata** | **27 / 35** | Description ✓12 · Homepage ✓12 · Display name ✓3 · **Icon ✗8** | Icon missing |
| **Configuration UX** | **25 / 25** | Optional config ✓15 · Config schema ✓10 | maxed |

> [!IMPORTANT]
> **This project is listed on Smithery via an `.mcpb` bundle, not a hosted deploy — so `smithery.yaml` is NOT used on this path.** Confirmed against Smithery's [publish docs](https://smithery.ai/docs/build/publish): configuration comes from either a hosted URL or the `.mcpb` bundle's **`manifest.json`**.
>
> **Root cause of the 0/40:** the `.mcpb` [manifest.json](../../manifest.json) declares **no `tools`** array, so Smithery enumerates zero tools (hence Descriptions/Parameter descriptions show `0/0`). The MCPB manifest spec supports a `tools` array (`name` + `description`), an `icon` field, and a `tools_generated` flag — none of which the current manifest sets.
>
> **Fixes (in `manifest.json`, then rebuild + republish the bundle):** (1) populate the `tools` array → unlocks tool scanning + **Descriptions (10.37)**; (2) add an **`icon`** → Metadata **(8)**; (3) `mcpb pack` + `smithery mcp publish` the updated `.mcpb`.
>
> **⚠ Open verification (see [tasks.md](./tasks.md) R4.3):** the MCPB manifest's `tools` array carries only name+description — it **cannot** express Parameter descriptions, Output schemas, or Annotations. It is unconfirmed whether Smithery scores those by *executing* the bundle (full schema introspection) or only reads the static manifest. This determines whether the in-code WS3 work (param descriptions / output schemas / annotations) is scoreable on the `.mcpb` path at all. Resolve before committing heavily to those sub-items for Smithery's sake (they still help Glama regardless).

Smithery's scoring definitions:
- **Description** — every tool & trigger should describe what it does.
- **Parameter descriptions** — every input parameter should describe what it accepts.
- **Output schemas** — tools should declare an `outputSchema` so callers can type-check responses.
- **Annotations** — tools can declare annotations (`readOnlyHint`, `destructiveHint`, etc.).
- **Naming** — tool/trigger names should form a navigable tree via dot-notation (e.g. `admin.tools.list`). **Both flat lists and over-nested paths reduce the score** → target **two levels** (`group.verb_object`).

#### Glama — **~67% (C-tier)**

High tool count (~48), missing behavioral **annotation**, thin "when to use X vs Y" / return docs, no `glama.json`. Addressed by the same tool-API redesign + `glama.json`. (Glama rewards richer descriptions; reconcile with the token goal via **structured annotations + output schemas**, not prose bloat.)

---

## 2. Architecture

### 2.1 Documentation — "one canonical source, many thin renderings"

To avoid maintaining the same prose in three places (AGENTS.md + SKILL.md + resource bodies), there is **a single source of truth**, consumed by every delivery path.

```
skills/figma-edit/
  SKILL.md                      # Layer B: frontmatter + thin body -> references/
  references/                   # OPERATIONAL CONTENT ONLY — no design philosophy / "tripartite" framing
    constraints.md              # hard, plugin-enforced rules (scope, name verify, batch, URL IDs) + handling a forbidden request
    error-playbook.md           # every structured error code + recovery
    workflows.md                # discover-before-acting + recipes
    tool-selection.md           # node.info usage, batch vs single, streaming
```

| Consumer | Reads from | Loading | Reach |
|---|---|---|---|
| **MCP Resources** (`figma-edit://guide/*`) | `references/*.md` at runtime | Deferred body via `resources/read` | Any MCP client, zero setup |
| **`instructions` breadcrumb** | ~3 lines, hand-written | Eager (kept tiny) | Any client that honors it |
| **`SKILL.md` skill** | its own `references/` | Progressive (frontmatter eager) | Cross-tool, after user install |
| **`AGENTS.md`** (slim pointer) | points at the above | Eager but trivial | Cloned-repo / root-convention |

- **Layer A — in-protocol (zero setup, all clients):** MCP Resources + a tiny eager `instructions` breadcrumb. The only path that ships *with the server* and reaches npm end-users automatically.
- **Layer B — skill (cross-tool, proactive):** an installable `SKILL.md` folder, the direct analog of Figma's `figma-use`. Auto-discovered by 20+ agents once installed.

### 2.2 Tool API — dot-notation tree

The **46 tools** (after three consolidations, one destructive-split, and one net-new tool `style.delete` — see [consolidation-sweep.md](./consolidation-sweep.md)) are renamed into a **two-level** navigable tree (`group.leaf`) across **11 groups**: `page` · `node` · `create` · `style` · `text` · `component` · `instance` · `variable` · `annotation` · `reaction` · `channel`. Reads use noun/`list` leaves; writes use verb leaves. (Names below are **proposed** and may be adjusted.)

| Group | New name | Old name |
|---|---|---|
| **page** | `page.info` | `get_pages_info` |
| **node** | `node.info` | `get_nodes_info` |
| | `node.transform` | `move_node` + `resize_node` *(merged)* |
| | `node.rename` | `set_node_name` |
| | `node.delete` | `delete_multiple_nodes` |
| | `node.clone` | `clone_node` |
| | `node.select` | `set_selections` |
| | `node.group` | `group_nodes` |
| | `node.ungroup` | `ungroup_nodes` |
| | `node.flatten` | `flatten_node` |
| | `node.insert_child` | `insert_child` |
| | `node.set_auto_layout` | `set_auto_layout` |
| | `node.set_fill` | `set_fill_color` |
| | `node.set_stroke` | `set_stroke` |
| | `node.set_corner_radius` | `set_corner_radius` |
| | `node.set_effects` | `set_effects` |
| | `node.apply_style` | `apply_style` |
| | `node.bind_variable` | `set_bound_variable` |
| | `node.export_visual` | `export_node_as_image` |
| **create** | `create.shape` | `create_rectangle` + `create_ellipse` + `create_polygon_star` *(merged)* |
| | `create.frame` | `create_frame` |
| | `create.text` | `create_text` |
| | `create.svg` | `create_node_from_svg` |
| | `create.component` | `create_component` |
| | `create.instance` | `create_component_instance` |
| | `create.component_set` | `create_component_set` |
| | `create.connection` | `create_connections` |
| **style** | `style.list` | `get_styles` |
| | `style.manage` | `manage_style` |
| | `style.delete` | *(net-new — first style-deletion capability)* |
| **text** | `text.set_content` | `set_multiple_text_contents` |
| | `text.set_style` | `set_text_style` |
| **component** | `component.list` | `get_components` |
| | `component.manage_property` | `manage_component_property` *(ADD/EDIT)* |
| | `component.delete_property` | `manage_component_property` *(DELETE)* |
| **instance** | `instance.set_property` | `set_component_instance_property` |
| | `instance.get_overrides` | `get_instance_overrides` |
| | `instance.set_overrides` | `set_instance_overrides` |
| **variable** | `variable.list` | `get_variables` |
| | `variable.manage` | `manage_variables` |
| | `variable.delete` | `delete_variables` |
| **annotation** | `annotation.list` | `get_annotations` |
| | `annotation.set` | `set_multiple_annotations` |
| **reaction** | `reaction.list` | `get_reactions` |
| | `reaction.update` | `update_reactions` |
| **channel** | `channel.join` | `join_channel` |

> Notes: groups follow Figma's **object types**. **Anything that mutates a node lives under `node`** — both raw values (`set_fill`/`set_stroke`/`set_corner_radius`/`set_effects`/`set_auto_layout`) *and* links that attach a library object to a node (`node.apply_style`, `node.bind_variable`). The `style.*` and `variable.*` groups therefore hold only **object-lifecycle** ops (list/manage/delete), since applying/binding doesn't mutate the Style/Variable object itself. `component.*` is the Component/ComponentSet object (`list`, `manage_property`, `delete_property` — the latter split from the former so `destructiveHint` scopes to the delete, mirroring `variable.delete`); instance ops live under `instance.*` (`set_property`, `get_overrides`, `set_overrides`). `create.connection` ← `create_connections` creates connector lines, so it sits in the `create` verb group. There is no `layout` group (`node.set_auto_layout` is a structural node property). **Consolidations:** `create.shape` folds the 3 shape tools (also fixes rectangle's missing `fillColor`/`strokeColor`) via a `type` discriminator; `node.transform` folds `move`+`resize` into `{x?,y?,width?,height?}`; `get_node_variables` is folded into `node.info` as resolvable `boundVariables`/`explicitVariableModes` fields (resolved plugin-side like `mainComponent`). **Split:** `component.delete_property` is broken out of `component.manage_property` (ADD/EDIT) so the destructive hint scopes to the delete. **Addition:** `style.delete` is net-new — styles previously had no deletion path; it completes the `style.*` lifecycle (list/manage/delete) symmetric with `variable.*`. `variable.delete`, `component.delete_property`, and `style.delete` stay separate (destructive, rule 4). See [consolidation-sweep.md](./consolidation-sweep.md).

Each tool additionally gains: behavioral **annotation**, an **`outputSchema`** (typed response), and verified **description** + **parameter descriptions**. The canonical old→new names, **titles, descriptions, and annotation values** for all 46 tools live in [tool-reference.md](./tool-reference.md) — the single source the rename, the `manifest.json` `tools` array, and the doc sweep all draw from.

---

## 3. Success criteria

1. **Smithery ≈ 100**: tools scanned (Capability category unlocked); every tool has description, parameter descriptions, output schema, and annotations; names form a 2-level dot-notation tree; server has an icon.
2. **Glama improves**: annotations on every tool; `glama.json` present; three clarity-driven consolidations (`create.shape`, `node.transform`, folding node-variable reads into `node.info`) + one destructive-split (`component.delete_property`) + one net-new tool (`style.delete`, completing the style lifecycle) → 46 tools.
3. An npm end-user's MCP client can reach the full guidance **through the server connection** (resources), with only a ~3-line eager cost (breadcrumb) + resource metadata.
4. All four version sources report `2.0.0`; the server reports its real version at runtime.
5. Single source of truth — guidance prose exists in exactly one place (`references/`), with all other surfaces pointing at it.

---

## 4. Non-goals

- **Backwards compatibility / migration paths** — explicitly out of scope (zero users); the tool API is redesigned freely.
- **Aggressive consolidation** — only the three clarity-driven consolidations land (`create.shape`, `node.transform`, folding `get_node_variables` into `node.info`); the sweep ([consolidation-sweep.md](./consolidation-sweep.md)) found no others. We do **not** collapse get/set pairs, destructive ops, or params-divergent setters just to cut count.
- **Hosted / remote deployment** — the server is local-only by design (requires the Figma desktop app + plugin on `localhost`); a hosted Smithery deployment is out of scope.
- **Verbose per-tool prose documentation** — conflicts with the token goal; behavioral transparency is delivered via structured annotations + output schemas instead.

---

## 5. Documentation requirements

> v2.0.0 renames every tool and merges 5 tools into 2, so **every reader-facing mention of a tool name is now wrong.** These rules govern the doc sweep (tasks in [tasks.md](./tasks.md) WS6).

**Governing rules**
- **R-DOC-1 — New-reader assumption.** All docs assume the reader is new to the project. No migration / "renamed-from" / "formerly" framing anywhere **except** the CHANGELOG.
- **R-DOC-2 — New names only.** No reader-facing doc may reference a removed, renamed, or merged tool (`create_rectangle`, `move_node`, `set_fill_color`, …). Use the dot-notation names from [§2.2](#22-tool-api--dot-notation-tree).
- **R-DOC-3 — CHANGELOG is the sole exception.** It records history and **must** carry a v2.0.0 old→new rename/merge mapping (the one place old names belong).
- **R-DOC-4 — Archival docs are frozen.** `documentation/completed/**`, `documentation/legacy/**`, `documentation/v1.5.1/**`, and prior CHANGELOG entries are records of past work; leave them unchanged (rewriting falsifies history). They are not onboarding docs.

**Per-surface verdicts**

| Surface | Old-name refs | Verdict |
|---|---|---|
| `README.md` — has a full **tool reference table** + usage examples | 36 | **Rewrite** to new names; collapse the 3 shape rows into one `create.shape` row and `move_node`/`resize_node` into `node.transform` |
| `AGENTS.md` → `skills/figma-edit/references/**` | 44 | **Rewrite during WS2** — the split is the canonical source; every recipe and the `node.info` tool-selection table must use new names |
| MCP **prompt** bodies (4) — see **Prompt disposition** below | many | **Keep 2 / fold 1 / cut 1** — only the kept prompts get the new-name rewrite |
| Tool/prompt **cross-references** in descriptions (e.g. `update_reactions`→"use get_reactions", `get_reactions`→`create_connections`) | several | **Rewrite during the WS3 rename** |
| `CONTRIBUTING.md` | 7 | **Rewrite** to new names |
| `.cursorrules`, `.github/copilot-instructions.md` (both defer to `AGENTS.md`) | 0 | **Repoint** to the slimmed guide / skill |
| `CHANGELOG.md` | history | **Add** v2.0.0 entry **with** an old→new mapping table — only doc allowed to keep old names |
| `DESIGN_PHILOSOPHY.md` | 0 | **Verify clean** (currently tool-name-free; keep it so) |
| `documentation/completed/**`, `legacy/**`, `v1.5.1/**`, `prototype_enhancement_report.md` | many | **Frozen** — archival; do not touch |
| `scratch/**` | — | Gitignored stale install copy; ignore |

**Prompt disposition**

MCP **prompts are user-initiated and deferred** — they surface in the client as pickable templates and cost **zero context tokens until invoked**; they are **not** in the `.mcpb` manifest `tools` array, so they are **score-neutral**. The only cost of keeping one is the R6.3 rewrite to new tool names. Each is therefore judged on **non-derivable workflow value**, not token cost:

| Prompt | Disposition | Why |
|---|---|---|
| `reaction_to_connector_strategy` | **Keep** (rewrite names) | Encodes the non-derivable `create.connection` **default-connector handshake** (empty-call probe; if unset, the user must paste a FigJam connector — the agent cannot proceed otherwise) + the reaction action-type filter. A model won't infer this from tool descriptions. |
| `swap_overrides_instances` | **Keep** (rewrite names) | Lean (~38 ln); pairs `instance.get_overrides` → `instance.set_overrides` with the source→targets shape and the "prefer overrides over direct edits" rule. |
| `text_replacement_strategy` | **Fold → `workflows.md`, then drop** | An **everyday recipe**, not a quirk. Its useful skeleton (clone-for-safety → chunked `text.set_content` → `node.export_visual` verify) belongs in the `workflows` reference; ~60% was generic advice. Don't maintain the same recipe in both a prompt and a resource. |
| `annotation_conversion_strategy` | **Cut** | Longest (~138 ln), most niche (manual-marker → native conversion), and contains **fictional pseudo-code** (`findTargetByPath`, `determineCategory`, … — functions that don't exist). Lowest value-per-line. |

**Principle:** prompts hold **non-derivable, quirk-driven procedures**; the `workflows` resource holds **everyday recipes**. This keeps the two from duplicating content and shrinks the R6.3 rewrite surface from 4 prompts to 2.

---

## 6. Open decisions

| # | Decision | Recommendation |
|---|---|---|
| D1 | Keep slim `AGENTS.md` vs drop it entirely | **Decided: keep slim.** `AGENTS.md` becomes a thin pointer (implemented in [tasks.md](./tasks.md) WS2 R2.5) — preserves the recognized cross-tool root-convention filename at near-zero cost; the full guide lives once in `references/` |
| D2 | Resource granularity / URI scheme | **Decided: 4 resources**, one per `references/*.md` under `figma-edit://guide/<section>` — `constraints`, `error-playbook`, `workflows`, `tool-selection`. **Operational content only** (no philosophy/tripartite framing). Optional index resource skipped (the `instructions` breadcrumb covers discovery) |
| D3 | Embed reference `.md` at build vs read at runtime via `fs` | **Decided: read at runtime** from package root (`fileURLToPath(import.meta.url)` → up from `dist/` → `skills/figma-edit/references/`); keeps `.md` as the single source shared by skill + resources; ship `skills/` in `files` (R1.3); fail-soft on read errors (R2.2). No token-efficiency difference vs embedding |
| D4 | Tool taxonomy — exact group set & leaf names | **Decided.** Full mapping in [§2.2](#22-tool-api--dot-notation-tree) — 46 tools, 11 groups, strictly 2 levels. Last leaf names settled: `variable.of_node` folded into `node.info`; `export_node_as_image` → `node.export_visual` |
| D5 | Output-schema depth (fully-typed vs permissive) | Start with a reasonable typed schema per tool; refine high-value read tools (`node.info`, `page.info`) first. `node.info`'s field set + fast/slow flags come from [node-fields.md](./node-fields.md) (from the official Figma API; regenerate from `@figma/plugin-typings`) |
| D6 | Tool consolidation | **Decided: `create.shape` + `node.transform` merges, and fold `get_node_variables` into `node.info` fields (48→44); plus split `component.delete_property` from `component.manage_property` (→45), and add net-new `style.delete` to complete the style lifecycle (→46).** No other merges. Still applies: **disambiguate** `node.set_fill` vs `node.apply_style`; keep get/set pairs and the destructive deletes (`variable.delete`, `component.delete_property`, `style.delete`) split. See [consolidation-sweep.md](./consolidation-sweep.md) |