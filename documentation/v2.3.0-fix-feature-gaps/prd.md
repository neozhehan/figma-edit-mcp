# v2.3.0 PRD: Feature-Gap & Contract Fixes

This document is the product/implementation spec for the **v2.3.0** release of `figma-edit-mcp`. Where v2.2.0 hardened the plugin against unsafe edits, v2.3.0 closes four concrete **capability and contract gaps** surfaced by real agent usage:

1. **§1 — No image fill.** `node_set_fill` can only set a literal RGBA solid; there is no end-to-end way to put an image fill on a node.
2. **§2 — `variable_delete` stalls the WebSocket link on large documents.** The full-document consumer scan monopolises the plugin's single JS thread, so the link goes quiet long enough to trip the inactivity timeout.
3. **§3 — No way to set `variable.scopes`.** `variable_manage` exposes name/type/value/mode but no `scopes` field, so every variable is created with Figma's default `["ALL_SCOPES"]`.
4. **§4 — `style_manage` effect schema↔runtime mismatch.** The published schema marks `blendMode` optional (it is not even named in the typed schema), but Figma's runtime rejects shadow effects that omit it — a guaranteed hard failure for any agent that trusts the schema.

Each issue below has been verified against the current code; see **§Provenance** for the file:line evidence.

---

## Release identity

> [!IMPORTANT]
> **This is v2.3.0.** v2.2.0 is tagged and merged (PR #42, "Phase 7 tasks completed & verified", commit `74d7178`); it shipped the safety/validation enhancements in `documentation/v2.2.0-safety-enhancement/`. `package.json` currently reads `"version": "2.2.0"` (verified) — bump it to `2.3.0` as part of this release.

## API Change Notice (informational)

> [!NOTE]
> v2.3.0 changes the input contract of `node_set_fill` (§1: solid-RGBA-only → solid-or-image) and `variable_manage` (§3: adds `scopes`), and corrects the `style_manage` effect contract (§4). **No sign-off required** — the project has zero end-users and backwards compatibility is explicitly not a constraint (see project memory). Each change is additive or fail-soft except the `node_set_fill` shape change, which is covered by §1's migration note.

---

## Decisions

> [!NOTE]
> **D1 — Version.** This release is **v2.3.0**. Bump `package.json` `2.2.0 → 2.3.0`.

> [!NOTE]
> **D2 — Image-fill API shape (§1) — DECIDED.** Extend the existing **`node_set_fill`** tool rather than adding a new tool: the input becomes "one of {solid color, image}". `r/g/b` become optional; a new `image` object carries the source. The plugin creates the `Image` via `figma.createImageAsync(url)` (URL source, **recommended/primary** — the plugin fetches) with an optional raw-bytes path (`figma.createImage(bytes)`), then assigns an `IMAGE` paint with a `scaleMode`. Rationale: this keeps "set a node's fill" one tool with one mental model, mirrors how `create_shape`/`create_frame` already centralise `fillColor`, and avoids a second tool the model has to disambiguate. *(Rejected alternative: a dedicated `node_set_image_fill` tool and/or a standalone `create_image` → imageHash tool feeding `style_manage`'s paint passthrough.)*

> [!NOTE]
> **D3 — `variable_delete` responsiveness (§2).** Three coordinated changes, all plugin-side: (a) replace the fixed every-500-nodes yield in the shared tree walk with a **time-budgeted yield** (yield when ≥~50 ms have elapsed since the last yield), keeping a node-count fallback; (b) scan pages **concurrently** via `Promise.all(figma.root.children.map(...))` instead of the sequential `for…await`; (c) emit periodic `sendProgressUpdate`s during the delete scan so the MCP server's 60 s inactivity timer is reset (the same mechanism `variable_list`'s document scan already uses). (a)+(b) keep the JS thread responsive; (c) is the belt-and-braces safeguard. The fix lands in the **shared** `findVariableConsumers` walk, so `variable_list`'s document consumer scan benefits too.

> [!NOTE]
> **D4 — Variable `scopes` (§3).** Add an optional **`scopes`** field (array of `VariableScope` enum values) to `variable_manage`, honoured on both `CREATE_VARIABLE` and `UPDATE_VARIABLE`; the handler sets `variable.scopes`. Schema validates the **enum shape only**; Figma arbitrates type-compatibility (e.g. `ALL_FILLS` is COLOR-only) and any rejection degrades to a normal handler error (same advisory philosophy as v2.2.0 D10). `scopes` is **optional, not required**, so an `UPDATE` that omits it does not wipe existing scopes — but the tool description and the `figma-edit` guidance both instruct agents to **always set `scopes` explicitly on create** (matching the official figma-use guidance). *(`codeSyntax` is a related write gap but is out of scope for v2.3.0 — note as a follow-up.)*

> [!NOTE]
> **D5 — `style_manage` effect contract (§4).** Fix **both** sides: (a) **plugin** — normalise effects before assigning, injecting `blendMode: "NORMAL"` (and the other shadow defaults) for `DROP_SHADOW`/`INNER_SHADOW` that omit them, so an agent that trusts the schema never hits a hard failure; (b) **schema** — name `blendMode` in the typed effect schema and document it. The normalisation already exists and works in `setEffects` (`node_set_effects`, `stylingHandlers.ts:248-275`); **extract it into one shared helper and reuse it in `createStyle`'s EFFECT branch** so the two effect-writing paths can never diverge again. Primary lever is (a) — the schema fix makes the contract honest, but the plugin default is what removes the failure.

> [!NOTE]
> **All decisions recorded and confirmed.** D2 (image-fill API shape) is locked to extending `node_set_fill`; D1/D3/D4/D5 carry sensible defaults. No open questions remain for this release.

---

## Scope & priority

| # | Change | Priority | Primary location |
| :- | :- | :-: | :- |
| §1 | Image fill on `node_set_fill` (feature gap) | **P1** | `src/mcp_server/tools/node.ts`, `figma_plugin/handlers/stylingHandlers.ts` |
| §2 | `variable_delete` WS-link stall on large docs (reliability) | **P0** | `figma_plugin/handlers/variableHandlers.ts` |
| §3 | Variable `scopes` write support (correctness gap) | **P1** | `src/mcp_server/tools/variable.ts`, `figma_plugin/handlers/variableHandlers.ts` |
| §4 | `style_manage` effect `blendMode` schema↔runtime repair (hard-failure bug) | **P1** | `src/mcp_server/tools/style.ts`, `figma_plugin/handlers/styleHandlers.ts` |

All four also require doc updates (see **§Documentation impact**).

---

## §1. Image fill on `node_set_fill` (P1)

**The gap.** There is no way for an agent to set an image fill on a node. `node_set_fill` accepts only a literal RGBA solid (`r/g/b` required, `a` optional) and the plugin builds a single `SOLID` paint. No `figma.createImage`/`createImageAsync` wrapper exists anywhere in the codebase, so even the `style_manage` PAINT passthrough — which *can* carry an `IMAGE` paint via its `.catchall` — is unusable in practice, because nothing produces the required `imageHash`.

**Current behavior.**
- Schema: `node_set_fill` requires `nodeId, nodeName, r, g, b` (+ optional `a`) and forwards `color:{r,g,b,a}` to the plugin (`src/mcp_server/tools/node.ts:415-450`).
- Plugin: `setFillColor` constructs `{type:"SOLID", color, opacity}` and assigns `node.fills = [paintStyle]` (`figma_plugin/handlers/stylingHandlers.ts:13-61`).
- No image-creation path: grep for `createImage`/`createImageAsync`/`imageHash`/`scaleMode` finds only the `style.ts` paint-passthrough *description* and the export tools — no producer of an `imageHash`.

**v2.3.0 change (D2).** Make `node_set_fill` accept exactly one of {solid color, image}.

*Schema (`node.ts`):* `r/g/b` become `.optional()`; add an `image` object and a `.superRefine` requiring **exactly one** of (`r`+`g`+`b` present) or (`image` present):

```
image: z.object({
  url: z.string().url().optional().describe("HTTPS URL the plugin fetches via createImageAsync (recommended source)"),
  bytesBase64: z.string().optional().describe("Base64-encoded image bytes (alternative to url; heavier over the socket)"),
  scaleMode: z.enum(["FILL","FIT","CROP","TILE"]).optional().describe("default FILL"),
  opacity: z.number().min(0).max(1).optional(),
}).optional()
```

*Plugin (`stylingHandlers.ts`):* in `setFillColor`, branch on the payload:
- **Solid** (unchanged): build the `SOLID` paint as today.
- **Image:** resolve an `Image` — `figma.createImageAsync(url)` when `url` is given (the plugin fetches it), or `figma.createImage(base64ToBytes(bytesBase64))` for the bytes path — then assign `node.fills = [{ type:"IMAGE", imageHash: image.hash, scaleMode: scaleMode ?? "FILL", opacity }]`.

**Error strings.**
> `node_set_fill: provide either a solid color (r,g,b[,a]) or an image, not both/neither.`

> `node_set_fill: could not load image from URL '<url>'. Figma's createImageAsync requires a directly fetchable, CORS-accessible image; check the URL is public and points at a raw PNG/JPG.`

**Notes.**
- Keep the tool's existing scope/lock/name guards (it is a single-target write covered by v2.2.0 §2) — no change to those.
- Document the `createImageAsync` caveats (public URL, supported format/size) in the error-playbook so agents recover instead of retrying blindly.
- Out of scope: gradient fills via this tool (still flow through `style_manage`'s paint passthrough or a future enhancement).

**Tests.** Unit: solid-only still works; image-via-url produces an `IMAGE` paint with the resolved hash (mock `createImageAsync`); both-provided and neither-provided are rejected by the refine; unsupported-node (`!("fills" in node)`) still throws.

---

## §2. `variable_delete` WebSocket-link stall on large documents (P0)

**The risk.** `variable_delete` runs a full-document consumer scan before deleting. On a large file the scan ties up Figma's single JS thread for long stretches: the plugin can't pump the socket or post progress, so the MCP server sees no activity and the request trips its inactivity timeout — the delete appears to hang and the link looks dead.

**Current behavior.**
- The shared tree walk `findVariableConsumers` yields only **every 500 nodes** (`variableHandlers.ts:125-127`), and `walkCount` is a per-call closure variable, so the cadence resets per page.
- `deleteVariables` scans pages **sequentially**: `for (const page of figma.root.children) { _nodeMaps.push(await findVariableConsumers(page, idSet)); }` (`variableHandlers.ts:547-549`). (The style and alias scans at `541-544` are already kicked off concurrently; the node walk is the hot path.)
- `deleteVariables` emits **no** `sendProgressUpdate` during the scan (the progress calls at `variableHandlers.ts:340/406/430` are in `getVariables`, not here), so nothing resets the server's timer.
- The server arms a **60 s inactivity** timeout that is reset only by `progress_update` messages (`src/mcp_server/figma-client.ts:216-226`), on top of the default per-request timeout (`figma-client.ts:427-432`).

**v2.3.0 change (D3).**
1. **Time-budgeted yield** in `findVariableConsumers`' `walk`: track `lastYield = Date.now()` and `await new Promise(r => setTimeout(r, 0))` when `Date.now() - lastYield >= ~50ms` (keep a node-count fallback so pathological deep trees still yield). This adapts to node density instead of a fixed count.
2. **Concurrent page scan** in `deleteVariables`: replace the sequential loop with
   `const _nodeMaps = await Promise.all(figma.root.children.map(p => findVariableConsumers(p, idSet)));`
   so page walks interleave on the event loop and no single page monopolises a long uninterrupted stretch.
3. **Progress heartbeat:** emit `sendProgressUpdate` periodically during the scan (e.g. per page completed, or on each time-budget yield) so the server's 60 s timer is reset — mirroring the page-by-page streaming `getVariables` already does (`variableHandlers.ts:397-430`).

Because the fix lands in the **shared** `findVariableConsumers` walk, `variable_list`'s `includeConsumers:"document"` path inherits the improved responsiveness for free.

**Notes.**
- This is a responsiveness fix, **not** a semantics change: the consumer set computed, the in-use rejection, and the collection-mode intra-collection alias filtering (`variableHandlers.ts:559-570`) are all unchanged.
- Verify the time-budget threshold against a large synthetic document; 50 ms is a starting point, tune so the link never goes quiet for more than a fraction of the 60 s window.

**Tests.** Unit/coverage: the walk yields at least once for a tree that exceeds the time budget (fake-timers); concurrent scan returns the same merged consumer map as the previous sequential scan for a fixture document; a progress update is emitted at least once during a multi-page delete scan.

---

## §3. Variable `scopes` write support (P1)

**The gap.** Agents cannot set `variable.scopes`, so every variable is created with Figma's default `["ALL_SCOPES"]`. The official figma-use guidance explicitly says "Always set `variable.scopes` explicitly," and this server makes that impossible. The omission is **asymmetric**: the read side already surfaces scopes (`getVariables` returns `scopes: variable.scopes`, `variableHandlers.ts:371`), so agents can see scopes they can never set.

**Current behavior.**
- Schema: `variable_manage` exposes `action, name, description, modeName, collectionId, type, value, variableId, currentVariableName, modeId` — **no `scopes`** (`src/mcp_server/tools/variable.ts:49-94`).
- Handler: `handleVariableRequest` `CREATE_VARIABLE` (`variableHandlers.ts:878-935`) and `UPDATE_VARIABLE` (`variableHandlers.ts:937-982`) never read or write `variable.scopes`.

**v2.3.0 change (D4).**
- *Schema (`variable.ts`):* add
  `scopes: z.array(z.enum([...VariableScope])).optional().describe("Editor surfaces this variable may bind to. ALWAYS set explicitly on create; omit on update to leave unchanged. e.g. ['ALL_FILLS'] for a color token, ['WIDTH_HEIGHT','GAP'] for spacing.")`
  using the full `VariableScope` enum (`ALL_SCOPES, TEXT_CONTENT, CORNER_RADIUS, WIDTH_HEIGHT, GAP, ALL_FILLS, FRAME_FILL, SHAPE_FILL, TEXT_FILL, STROKE_COLOR, STROKE_FLOAT, EFFECT_FLOAT, EFFECT_COLOR, OPACITY, FONT_FAMILY, FONT_STYLE, FONT_SIZE, LINE_HEIGHT, LETTER_SPACING, PARAGRAPH_SPACING, PARAGRAPH_INDENT, FONT_WEIGHT, FONT_VARIATIONS`).
- *Handler:* in `CREATE_VARIABLE`, after `createVariable`, set `if (scopes) variable.scopes = scopes;`. In `UPDATE_VARIABLE`, set `if (scopes !== undefined) variable.scopes = scopes;`.

**Error string (advisory, surfaced from Figma).** Type-incompatible scopes (e.g. `ALL_FILLS` on a `FLOAT`) are passed through and degrade to Figma's own error; the tool description warns that scope/type compatibility is enforced by Figma.

**Notes.**
- `scopes` optional-not-required so `UPDATE_VARIABLE` doesn't clobber existing scopes; the "always set on create" instruction lives in the tool description + `figma-edit` guidance, not in schema enforcement.
- Follow-up (out of scope): `codeSyntax` is the other variable write gap; note it for a later release.

**Tests.** Unit (extend `annotationsAndVariables.test.ts`): `CREATE_VARIABLE` with `scopes` sets them; without `scopes` leaves Figma's default; `UPDATE_VARIABLE` with `scopes` updates and without `scopes` leaves them untouched; invalid enum value is rejected by Zod.

---

## §4. `style_manage` effect `blendMode` schema↔runtime repair (P1)

**The bug.** An agent that authors a shadow effect per the **published `style_manage` schema** hits a hard failure. The schema's `effects` items are typed as `{ type: string }` with everything else flowing through `.catchall(z.any())`, and the field description lists `{type:'DROP_SHADOW', color, offset, radius, spread?, visible?}` — **`blendMode` is never named and is not required**. But `createStyle` assigns `s.effects = properties.effects` directly, and Figma's runtime validation rejects a shadow without `blendMode`:

> `Property "effects" failed validation: ... Required value missing at [0].blendMode`

Adding `blendMode:"NORMAL"` makes it succeed — confirming the schema-vs-runtime mismatch.

**Current behavior.**
- Schema: `effects: z.array(z.object({ type: z.string()… }).catchall(z.any()))` with a `blendMode`-free description (`src/mcp_server/tools/style.ts:49-51`).
- Plugin: `createStyle`'s EFFECT branch does a raw `s.effects = properties.effects` — **no normalisation** (`figma_plugin/handlers/styleHandlers.ts:76-80`).
- **Precedent that already works:** `node_set_effects`'s `setEffects` normalises every effect, injecting `blendMode: effect.blendMode || "NORMAL"` plus shadow defaults for `color/offset/radius/spread/showShadowBehindNode` (`figma_plugin/handlers/stylingHandlers.ts:248-275`), and its schema names `blendMode` (`src/mcp_server/tools/node.ts:567`). This is exactly why `node_set_effects` succeeds where `style_manage` fails.

**v2.3.0 change (D5).**
1. **Extract a shared `normalizeEffects(effects)` helper** from the existing `setEffects` logic (`stylingHandlers.ts:248-275`) and call it from **both** `setEffects` and `createStyle`'s EFFECT branch, so the EFFECT-style path gets the same `blendMode:"NORMAL"` (and shadow) defaults and the two paths can't diverge again.
2. **Schema fix (`style.ts`):** name `blendMode` in the typed effect schema and document it, e.g.
   `z.object({ type: z.string()…, blendMode: z.string().optional().describe("Required by Figma for DROP_SHADOW/INNER_SHADOW; defaults to NORMAL if omitted") }).catchall(z.any())`,
   and update the field description to include `blendMode`.

After (1), an agent that trusts the schema and omits `blendMode` no longer hard-fails; after (2), the schema honestly documents the field.

**Notes.**
- Keep the freshly-created-style rollback (`styleHandlers.ts:128-134`) — normalisation reduces but doesn't eliminate the chance of a Figma throw (e.g. a genuinely malformed effect), and the rollback must still fire.
- `node_set_effects` already behaves correctly; the only behavioural change there is sharing the extracted helper (no functional change). Add a regression test pinning that.

**Tests.** Unit: `style_manage` EFFECT with a shadow that omits `blendMode` succeeds and the stored effect has `blendMode:"NORMAL"`; an explicit `blendMode` is preserved; `node_set_effects` parity test still passes against the shared helper.

---

## §Documentation impact

Update the single source of operational guidance (delivered as MCP resources + the `figma-edit` skill + in-repo `skills/figma-edit/references/`):

- **`tool-selection.md` / `workflows.md`** — `node_set_fill` now sets solid **or** image fills; show the image-fill workflow and the `createImageAsync` URL caveat (§1).
- **`error-playbook.md`** — recovery entries for: image-load failure (§1), the (now-rare) effect `blendMode` rejection (§4), and scope/type incompatibility on variables (§3).
- **`constraints.md` / SKILL guidance** — "Always set `variable.scopes` explicitly on create" (§3), mirroring figma-use.
- Tool descriptions in `variable.ts`, `style.ts`, `node.ts` carry the inline guidance above.

---

## §Testing & rollout

- **Build:** `figma_plugin` bundles to `code.js` (handlers are TS → bundled); rebuild and confirm the `node_set_fill`, `variable_delete`, `variable_manage`, and `style_manage` dispatch cases reflect the changes. MCP server (`src/mcp_server`) rebuilds its `dist/`.
- **Unit tests:** extend the existing suites — `tests/unit/figma_plugin/annotationsAndVariables.test.ts` (§3), a styling/effects test for the shared `normalizeEffects` (§4), a `variableHandlers` responsiveness test (§2, fake-timers), and a `setFillColor` image test (§1). Tool-schema tests under `tests/unit/tools/` (`strictInput.test.ts`, `v2Tools.test.ts`, `contractSeam.test.ts`) updated for the new `node_set_fill` refine, `variable_manage.scopes`, and `style_manage` effect `blendMode`.
- **Manual verification (live Figma):** set an image fill from a URL; delete a large collection on a multi-page doc and confirm the link stays alive with streaming progress; create a COLOR variable with `scopes:["ALL_FILLS"]` and confirm in the Figma UI; create an EFFECT style with a shadow that omits `blendMode` and confirm it succeeds.
- **Version:** bump `package.json` `2.2.0 → 2.3.0` (D1).

---

## §Provenance — issue verification

Every issue was confirmed against the current tree before this PRD was written:

| Issue | Verified at | Finding |
| :- | :- | :- |
| §1 No image fill | `node.ts:415-450`, `stylingHandlers.ts:13-61` | `node_set_fill` is solid-RGBA-only; plugin builds only a `SOLID` paint. No `createImage`/`createImageAsync` anywhere — `style_manage`'s IMAGE passthrough has no `imageHash` producer. |
| §2 WS stall | `variableHandlers.ts:125-127`, `:547-549`, `figma-client.ts:216-226` | Walk yields only every 500 nodes; `deleteVariables` scans pages sequentially with `await` in-loop; no progress emitted during the scan; server arms a 60 s inactivity timeout reset only by progress updates. |
| §3 No scopes | `variable.ts:49-94`, `variableHandlers.ts:878-982` vs `:371` | No `scopes` field in schema; `CREATE_VARIABLE`/`UPDATE_VARIABLE` never set `variable.scopes`; yet `getVariables` already **reads** `scopes` — asymmetric. |
| §4 blendMode mismatch | `style.ts:49-51`, `styleHandlers.ts:76-80` vs `stylingHandlers.ts:248-275` | Schema's effect items omit `blendMode` (catchall, description-free); `createStyle` assigns `s.effects` raw → Figma's native validation requires `blendMode`. `setEffects` already injects the `NORMAL` default — a working in-repo precedent to reuse. |
