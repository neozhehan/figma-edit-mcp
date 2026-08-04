# v2.3.0 Implementation Tasks

## Phase 1: §1 Image Fill on `node_set_fill` (P1) — Option B (URL + base64 bytes) + D6 bytes auto-resize
- [x] **MCP Tool Update** (`src/mcp_server/tools/node.ts`):
  - [x] Make `r`, `g`, `b` properties optional.
  - [x] Add `image` object schema (`url`, `bytesBase64`, `scaleMode`, `opacity`); describe `bytesBase64` as auto-resized (PNG/JPEG) and `url`/GIF as not.
  - [x] `.superRefine`: (1) exactly one of {solid color — **all three** of `r,g,b` present, `a` optional — or `image`}; reject partial RGB (e.g. `r`+`g`, no `b`) and alpha-only; (2) within `image`, exactly one of `url`/`bytesBase64`.
  - [x] Extend `outputSchema` with `warnings: z.array(z.string()).optional()`.
  - [x] **Update the tool's request-construction** (currently hard-codes `color:{r,g,b,a:a??1}` at `node.ts:443-447`) to forward `image` when present and only build `color` for the solid case.
  - [x] For `bytesBase64`, call `resizeIfOversized` (below) **before** `sendCommandToFigma`, forward the possibly-resized base64, and attach any returned `warning` to the tool result.
- [x] **Server-side auto-resize** (D6):
  - [x] Add **`jimp`** to `package.json` `dependencies` (pure JS, no native binary).
  - [x] New `src/mcp_server/imageResize.ts` → `resizeIfOversized(base64: string): { base64: string; warning?: string }`: decode + detect format; **resize iff detected MIME ∈ {`image/png`,`image/jpeg`}** with `max(w,h) > 4096` → downscale longest side to 4096 (preserve aspect ratio), re-encode in source format (JPEG q~85), return new base64 + `warning`; ≤4096 → return input unchanged (no warning); **anything else → pass through unmodified.** Branch on the exact format — never "if not GIF, resize": jimp also decodes BMP/TIFF (full set PNG/JPEG/BMP/TIFF/GIF) but Figma accepts only PNG/JPEG/GIF, so only PNG/JPEG are re-encoded and everything else (GIF/BMP/TIFF/unknown) reaches Figma's format gate untouched.
- [x] **Base64 decoder** (`figma_plugin/utils/exportUtils.ts`):
  - [x] Add `base64ToBytes(b64: string): Uint8Array` next to the existing encoder (sandbox has no `atob`); handle missing/standard padding and strip an optional `data:*;base64,` prefix; throw on non-base64 input.
- [x] **Plugin Update** (`figma_plugin/handlers/stylingHandlers.ts`):
  - [x] Guard the top-level `const { color: { r, g, b, a } } = params` destructure (`stylingHandlers.ts:15-18`) so an image-only payload does not crash; branch solid vs image.
  - [x] Solid path unchanged.
  - [x] Image path: `url` → `await figma.createImageAsync(url)`; `bytesBase64` → `figma.createImage(base64ToBytes(bytesBase64))` (import the new decoder).
  - [x] Wrap both calls and map failures to the structured errors below. **Confirmed against the API:** both sources are PNG/JPEG/GIF-only, max 4096px per side, and **neither resizes**; `createImage` **throws synchronously**, `createImageAsync` **rejects** — both with `Image is too large` / `Image is too small` / `Image type is unsupported`.
  - [x] Construct and assign `{ type: "IMAGE", imageHash: image.hash, scaleMode: scaleMode ?? "FILL", opacity }` to node fills (no node resize; `getSizeAsync` not needed).
  - [x] Emit the PRD error strings: both/neither color+image; image both/neither url+bytes; URL fetch/CORS failure; invalid base64; Figma image-rejection (echo `<figma message>`; ≤4096px per side — now typically an oversized `url` image, oversized GIF, or unsupported/too-small image, since PNG/JPEG bytes are pre-resized).
- [x] **Unit Testing**:
  - [x] Schema (`strictInput.test.ts` / `v2Tools.test.ts`): solid-only validates; image+url validates; image+bytesBase64 validates; **rejected:** color+image together, neither, image with both url+bytes, image with neither url+bytes.
  - [x] `base64ToBytes` (`exportUtils`/new test): round-trips against the existing encoder (`encode(bytes)` → decode → original `Uint8Array`); decodes with/without padding and with a `data:` prefix; throws on malformed/non-base64 input.
  - [x] `resizeIfOversized` (new server test, fixtures generated via `jimp`): >4096px PNG and >4096px JPEG each downscale to `max(w,h)===4096` with **aspect ratio preserved** + a `warning`; ≤4096px image returned **byte-identical**, no warning; **source format preserved** (PNG→PNG, JPEG→JPEG); >4096px **GIF passes through unmodified**, no warning; non-square scales by the longest side; **a >4096px BMP/TIFF (jimp-decodable, Figma-unsupported) passes through byte-identical with no warning** (proves the MIME-exact guard never transcodes non-PNG/JPEG input).
  - [x] Tool handler: oversized-PNG `bytesBase64` call forwards the **resized** base64 to `sendCommandToFigma` (not the original) and the result carries `warnings`; small image forwards unchanged, no warning.
  - [x] Plugin (`setFillColor`): solid payload still produces a `SOLID` paint (**regression**); `url` payload produces an `IMAGE` paint with the resolved hash (mock `createImageAsync`); `bytesBase64` payload produces an `IMAGE` paint and `createImage` receives the **decoded `Uint8Array`** (mock `createImage`, assert the arg); a `createImage` **sync throw** and a `createImageAsync` **rejection** (simulating too-large/unsupported) both surface the structured Figma-rejection error; a URL fetch/CORS failure surfaces the fetch error; unsupported node (`!("fills" in node)`) still throws.
  - [x] **Resource-fixture integration** (real-format decode; lightweight subset, **exclude the 9.7MB `jpeg-large`**): load files from `src/mcp_server/tests/fixtures/images/`, assert each decodes to its §1-table dimensions, and run `resizeIfOversized` — `png-small`/`jpeg-small`/`gif-small`/`animated-small` (≤4096) → byte-identical, no warning; `png-large` (4134×5846) → downscaled longest-side→4096 + warning; `gif-large`/`animated-large` (>4096) → passed through unmodified (GIF never resized; animation preserved). (`jpeg-large` oversize-resize stays in the synthetic test + Phase 6 live.)
  - [x] **URL path (no network)**: server handler forwards `image.url` to `sendCommandToFigma` **unchanged** and does **not** call `resizeIfOversized` (spy asserted); plugin `setFillColor` consumes it via mocked `createImageAsync` (covered above). Unit tests **never fetch** the real URLs.
- [ ] **Live Testing**: recorded in Phase 6 (URL **and** base64 fills render; an **oversized PNG/JPEG via `bytesBase64` is auto-resized** and renders with a warning; an oversized `url` image and oversized GIF hit the rejection).

## Phase 2: §2 `variable_delete` WS-link stall (P0)
- [x] **Plugin Update** (`figma_plugin/handlers/variableHandlers.ts`):
  - [x] Implement a time-budgeted yield in `findVariableConsumers` walk (`Date.now() - lastYield >= ~50ms`). Keep a node-count fallback.
  - [x] Refactor `deleteVariables` to scan pages concurrently using `Promise.all(figma.root.children.map(...))`.
  - [x] **Heartbeat *inside the walk* (not per page):** thread `commandId` from `params` into `findVariableConsumers`; on the same time-budget tick that yields, call `sendProgressUpdate(commandId, 'variable_delete', 'in_progress', …)`, **throttled to ~once/second**. Rationale: the first request timeout is 30 s (`figma-client.ts:317`) and only extends to 60 s after the first `progress_update`, so a large single-page doc would time out if the heartbeat waited for page completion.
  - [x] Do **not** gate the heartbeat on the `Promise.all` page loop completing (single-page docs emit only once, at the end — too late).
- [x] **Unit Testing**:
  - [x] Write a fake-timers test to ensure the walk yields correctly under the time budget.
  - [x] Verify `nodeConsumerMap` merges to the same result with concurrent promises as the prior sequential scan (fixture document).
  - [x] **Heartbeat fires from within the walk on a single-page fixture** that exceeds the time budget (proves it does not depend on page completion), carrying `params.commandId`; the ~1 s throttle prevents flooding on a fast scan.
  - [x] **Semantics regression:** the in-use rejection error and collection-mode intra-collection alias filtering (`variableHandlers.ts:559-570`) are unchanged after the concurrency refactor.
- [x] **Live Testing**: recorded in Phase 6 (large multi-page document delete stays connected with streaming progress).

## Phase 3: §3 Variable `scopes` write support (P1)
- [x] **Schema Update** (`src/mcp_server/tools/variable.ts`):
  - [x] Declare a literal `const VARIABLE_SCOPES = [...23 values...] as const` (the `@figma/plugin-typings` `VariableScope` is a **type, not a runtime value** — it can't be spread into `z.enum`), then add `scopes: z.array(z.enum(VARIABLE_SCOPES)).optional()` to `variable_manage`. Optionally `satisfies readonly VariableScope[]` to stay in sync with the typings.
  - [x] Add description reminding to "ALWAYS set explicitly on create; omit on update to leave unchanged".
- [x] **Plugin Update** (`figma_plugin/handlers/variableHandlers.ts`):
  - [x] Update `handleVariableRequest` (`CREATE_VARIABLE` branch) to set `variable.scopes = scopes;` if provided.
  - [x] Update `handleVariableRequest` (`UPDATE_VARIABLE` branch) to conditionally update `scopes`.
- [x] **Unit Testing**:
  - [x] Update tool schema tests (e.g., `strictInput.test.ts`, `v2Tools.test.ts`) for the new `scopes` parameter; **invalid enum value rejected** by Zod.
  - [x] Extend `annotationsAndVariables.test.ts`: `CREATE_VARIABLE` with `scopes` sets them; without `scopes` leaves Figma's default; `UPDATE_VARIABLE` with `scopes` updates them; **`UPDATE_VARIABLE` without `scopes` leaves existing scopes untouched** (no clobber); **`CREATE_VARIABLE` rolls back (removes) the freshly-created variable if scope/value assignment throws** (no orphaned variable).
- [x] **Live Testing**: recorded in Phase 6 (create a COLOR variable with `scopes:["ALL_FILLS"]`, confirm in the Figma UI).

## Phase 4: §4 `style_manage` effect `blendMode` mismatch (P1)
- [x] **Refactoring** (`figma_plugin/handlers/stylingHandlers.ts`):
  - [x] Extract `normalizeEffects(effects)` from the existing `setEffects` function.
  - [x] Refactor `setEffects` to use this new helper.
- [x] **Plugin Update** (`figma_plugin/handlers/styleHandlers.ts`):
  - [x] Import and apply `normalizeEffects(effects)` in the `createStyle` `EFFECT` branch prior to assigning `s.effects`.
  - [x] Confirm the freshly-created-style rollback (`styleHandlers.ts:128-134`) still fires if Figma throws on a genuinely malformed effect.
- [x] **Schema Update** (`src/mcp_server/tools/style.ts`):
  - [x] Add `blendMode` to the `effects` object schema and update its description.
- [x] **Unit Testing**:
  - [x] Update tool schema tests to verify `blendMode` is documented and accepted in `style_manage`.
  - [x] Add unit test for `normalizeEffects` shared helper.
  - [x] `style_manage` EFFECT omitting `blendMode` succeeds and the stored effect has `blendMode:"NORMAL"`; an **explicit `blendMode` is preserved**.
  - [x] Verify `node_set_effects` parity (no behavioural change after extracting the shared helper).
- [x] **Live Testing**: recorded in Phase 6 (create an EFFECT style with a shadow omitting `blendMode`; smoke-test `node_set_effects` still applies a shadow).

## Phase 5: Documentation & Tool Descriptions
- [x] **Inline Tool Descriptions**:
  - [x] **`node_set_fill` title/description** — currently "Set a node's fill to a literal RGBA color." (`node.ts:420`); reword to cover solid **and** image fills (keep the `node_apply_style`/`node_bind_variable` cross-references).
  - [x] Update `node.ts`, `variable.ts`, and `style.ts` field/tool descriptions with the new guidance (image sources + resize, `scopes`, effect `blendMode`).
- [x] **Documentation Markdown** (`skills/figma-edit/references/` and `documentation/`):
  - [x] Update `tool-selection.md` & `workflows.md` for image fills — both sources (`url` vs `bytesBase64`), when to use each, and caveats (both PNG/JPEG/GIF + ≤4096px; **`bytesBase64` PNG/JPEG auto-resized — prefer for large images**; `url`/GIF not resized; URL public/CORS/fetch; bytes payload weight).
  - [x] Update `error-playbook.md` with image errors: URL fetch/CORS failure, invalid base64, Figma image-rejection (too large/small/unsupported, ≤4096px — note PNG/JPEG bytes are pre-resized, so this is usually `url`/GIF/too-small); the **`image is too large to auto-resize server-side` (>~45MP PNG/JPEG)** error — server decode budget, pre-resize the source (see PRD §D6 Known limitation); plus type-incompatible scopes and blendMode fallback.
  - [x] Update `constraints.md` and SKILL guidance (variable scope creation requirement).

## Phase 6: Rollout
- [x] **Version Bump**:
  - [x] Update `package.json` version from `2.2.0` to `2.3.0`.
- [x] **CHANGELOG**:
  - [x] Add a `v2.3.0` entry to `CHANGELOG.md` covering §1–§4 (image fills + bytes auto-resize, `variable_delete` responsiveness, variable `scopes`, `style_manage` `blendMode` fix).
- [x] **Build**:
  - [x] `npm install` (pulls in the new `jimp` dependency); rebuild the MCP server (`src/mcp_server` → `dist/`) and confirm `jimp` bundles/resolves under both Node and Bun.
  - [x] Rebuild the plugin (TS handlers → `figma_plugin/code.js`) and confirm the changed dispatch cases are present.
- [x] **Manual Live Testing** (Figma):
  - [x] **§1** — use the `src/mcp_server/tests/fixtures/images/` fixtures (see the §1 fixtures table in `prd.md`):
    - **`bytesBase64` path:** `png-small`/`jpeg-small`/`gif-small`/`animated-small` render (animated GIF plays); `png-large`/`jpeg-large` auto-resize and render **with a `warning`**; `gif-large`/`animated-large` pass through → Figma rejection (`Image is too large`), animation **not** flattened.
    - **`url` path:** the same files via their source URLs — small render; large of **any** format → rejection (url never resized).
    - **Error UX:** color+image together, image with neither/both source, bad URL, invalid base64.
  - [x] **§1 fixture-URL liveness** (network; under `test:live` / `scripts/live-verify.ts`, not the unit suite): each source URL in the §1 fixtures table returns HTTP 200 + expected content-type — guards against link rot.
  - [x] **§2** — delete a large collection on a document with a **single very large page** (the worst case for the 30 s first-timeout); confirm the link stays alive with streaming progress and no inactivity timeout. Repeat on a multi-page doc.
  - [x] **§3** — create a COLOR variable with `scopes:["ALL_FILLS"]`; confirm scopes in the Figma UI.
  - [x] **§4** — create an EFFECT style with a shadow that omits `blendMode`; confirm success. Smoke-test `node_set_effects` still applies a shadow (shared-helper regression).
