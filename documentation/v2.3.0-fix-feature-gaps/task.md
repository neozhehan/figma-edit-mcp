# v2.3.0 Implementation Tasks

## Phase 1: §1 Image Fill on `node_set_fill` (P1)
- [ ] **MCP Tool Update** (`src/mcp_server/tools/node.ts`):
  - [ ] Make `r`, `g`, `b` properties optional.
  - [ ] Add `image` object schema (`url`, `bytesBase64`, `scaleMode`, `opacity`).
  - [ ] Add `.superRefine` to require exactly one of `(r, g, b)` or `image`.
  - [ ] **Update the tool's request-construction** (currently hard-codes `color:{r,g,b,a:a??1}` at `node.ts:443-447`) to forward `image` when present and only build `color` for the solid case.
- [ ] **Plugin Update** (`figma_plugin/handlers/stylingHandlers.ts`):
  - [ ] Guard the top-level `const { color: { r, g, b, a } } = params` destructure (`stylingHandlers.ts:15-18`) so an image-only payload does not crash; branch solid vs image.
  - [ ] Solid path unchanged; image path loads via `figma.createImageAsync(url)` (URL primary) or `figma.createImage(base64ToBytes(bytesBase64))` — add a base64→`Uint8Array` helper for the bytes path.
  - [ ] Construct and assign `{ type: "IMAGE", imageHash: image.hash, scaleMode: scaleMode ?? "FILL", opacity }` to node fills.
  - [ ] Emit the two PRD error strings: both/neither color+image; `createImageAsync` load failure (public/CORS/format guidance).
- [ ] **Unit Testing**:
  - [ ] Schema (`strictInput.test.ts` / `v2Tools.test.ts`): solid-only validates; image-only validates; **both-provided and neither-provided rejected** by `.superRefine`.
  - [ ] Plugin (`setFillColor`): solid payload still produces a `SOLID` paint (**regression**); image-via-url produces an `IMAGE` paint with the resolved hash (mock `createImageAsync`); unsupported node (`!("fills" in node)`) still throws; image-load failure surfaces the PRD error string.
- [ ] **Live Testing**: recorded in Phase 6 (image fill from a public URL renders correctly).

## Phase 2: §2 `variable_delete` WS-link stall (P0)
- [ ] **Plugin Update** (`figma_plugin/handlers/variableHandlers.ts`):
  - [ ] Implement a time-budgeted yield in `findVariableConsumers` walk (`Date.now() - lastYield >= ~50ms`). Keep a node-count fallback.
  - [ ] Refactor `deleteVariables` to scan pages concurrently using `Promise.all(figma.root.children.map(...))`.
  - [ ] Add `sendProgressUpdate` inside the walk or page processing loop to act as a heartbeat for the 60s inactivity timeout.
- [ ] **Unit Testing**:
  - [ ] Write a fake-timers test to ensure the walk yields correctly under the time budget.
  - [ ] Verify `nodeConsumerMap` merges to the same result with concurrent promises as the prior sequential scan (fixture document).
  - [ ] Verify progress heartbeat (`sendProgressUpdate`) is emitted during concurrent delete.
  - [ ] **Semantics regression:** the in-use rejection error and collection-mode intra-collection alias filtering (`variableHandlers.ts:559-570`) are unchanged after the concurrency refactor.
- [ ] **Live Testing**: recorded in Phase 6 (large multi-page document delete stays connected with streaming progress).

## Phase 3: §3 Variable `scopes` write support (P1)
- [ ] **Schema Update** (`src/mcp_server/tools/variable.ts`):
  - [ ] Add `scopes: z.array(z.enum([...VariableScope])).optional()` to `variable_manage`.
  - [ ] Add description reminding to "ALWAYS set explicitly on create; omit on update to leave unchanged".
- [ ] **Plugin Update** (`figma_plugin/handlers/variableHandlers.ts`):
  - [ ] Update `handleVariableRequest` (`CREATE_VARIABLE` branch) to set `variable.scopes = scopes;` if provided.
  - [ ] Update `handleVariableRequest` (`UPDATE_VARIABLE` branch) to conditionally update `scopes`.
- [ ] **Unit Testing**:
  - [ ] Update tool schema tests (e.g., `strictInput.test.ts`, `v2Tools.test.ts`) for the new `scopes` parameter; **invalid enum value rejected** by Zod.
  - [ ] Extend `annotationsAndVariables.test.ts`: `CREATE_VARIABLE` with `scopes` sets them; without `scopes` leaves Figma's default; `UPDATE_VARIABLE` with `scopes` updates them; **`UPDATE_VARIABLE` without `scopes` leaves existing scopes untouched** (no clobber).
- [ ] **Live Testing**: recorded in Phase 6 (create a COLOR variable with `scopes:["ALL_FILLS"]`, confirm in the Figma UI).

## Phase 4: §4 `style_manage` effect `blendMode` mismatch (P1)
- [ ] **Refactoring** (`figma_plugin/handlers/stylingHandlers.ts`):
  - [ ] Extract `normalizeEffects(effects)` from the existing `setEffects` function.
  - [ ] Refactor `setEffects` to use this new helper.
- [ ] **Plugin Update** (`figma_plugin/handlers/styleHandlers.ts`):
  - [ ] Import and apply `normalizeEffects(effects)` in the `createStyle` `EFFECT` branch prior to assigning `s.effects`.
  - [ ] Confirm the freshly-created-style rollback (`styleHandlers.ts:128-134`) still fires if Figma throws on a genuinely malformed effect.
- [ ] **Schema Update** (`src/mcp_server/tools/style.ts`):
  - [ ] Add `blendMode` to the `effects` object schema and update its description.
- [ ] **Unit Testing**:
  - [ ] Update tool schema tests to verify `blendMode` is documented and accepted in `style_manage`.
  - [ ] Add unit test for `normalizeEffects` shared helper.
  - [ ] `style_manage` EFFECT omitting `blendMode` succeeds and the stored effect has `blendMode:"NORMAL"`; an **explicit `blendMode` is preserved**.
  - [ ] Verify `node_set_effects` parity (no behavioural change after extracting the shared helper).
- [ ] **Live Testing**: recorded in Phase 6 (create an EFFECT style with a shadow omitting `blendMode`; smoke-test `node_set_effects` still applies a shadow).

## Phase 5: Documentation & Tool Descriptions
- [ ] **Inline Tool Descriptions**:
  - [ ] Update `node.ts`, `variable.ts`, and `style.ts` schemas with new descriptions.
- [ ] **Documentation Markdown** (`skills/figma-edit/references/` and `documentation/`):
  - [ ] Update `tool-selection.md` & `workflows.md` for image fills and caveats.
  - [ ] Update `error-playbook.md` with image fetch errors, type-incompatible scopes, and blendMode fallback.
  - [ ] Update `constraints.md` and SKILL guidance (variable scope creation requirement).

## Phase 6: Rollout
- [ ] **Version Bump**:
  - [ ] Update `package.json` version from `2.2.0` to `2.3.0`.
- [ ] **Build**:
  - [ ] Rebuild the plugin (TS handlers → `figma_plugin/code.js`) and confirm the changed dispatch cases are present.
  - [ ] Rebuild the MCP server (`src/mcp_server` → `dist/`).
- [ ] **Manual Live Testing** (Figma):
  - [ ] **§1** — set an image fill from a public URL; confirm it renders. Spot-check the both/neither and bad-URL error messages.
  - [ ] **§2** — delete a large collection on a multi-page document; confirm the link stays alive with streaming progress (no inactivity timeout).
  - [ ] **§3** — create a COLOR variable with `scopes:["ALL_FILLS"]`; confirm scopes in the Figma UI.
  - [ ] **§4** — create an EFFECT style with a shadow that omits `blendMode`; confirm success. Smoke-test `node_set_effects` still applies a shadow (shared-helper regression).
