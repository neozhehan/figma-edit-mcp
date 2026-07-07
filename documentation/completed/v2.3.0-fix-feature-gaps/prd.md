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
> **D2 — Image-fill API shape (§1) — DECIDED.** Extend the existing **`node_set_fill`** tool rather than adding a new tool: the input becomes "one of {solid color, image}". `r/g/b` become optional; a new `image` object carries the source. The plugin resolves an `Image` from **either** source — `figma.createImageAsync(url)` (URL — the plugin fetches) **or** `figma.createImage(base64ToBytes(bytesBase64))` (raw bytes) — then assigns an `IMAGE` paint with a `scaleMode`. Both sources ship in v2.3.0 (**Option B**). The bytes path requires a hand-rolled **base64 decoder** (`base64ToBytes`): the Figma plugin sandbox has no `atob`, and the repo today has only a base64 *encoder* (`figma_plugin/utils/exportUtils.ts:6-59`). Rationale for one tool: keeps "set a node's fill" one mental model, mirrors how `create_shape`/`create_frame` already centralise `fillColor`, and avoids a second tool the model has to disambiguate. *(Rejected alternative: a dedicated `node_set_image_fill` tool and/or a standalone `create_image` → imageHash tool feeding `style_manage`'s paint passthrough.)*

> [!NOTE]
> **D3 — `variable_delete` responsiveness (§2).** Three coordinated changes, all plugin-side: (a) replace the fixed every-500-nodes yield in the shared tree walk with a **time-budgeted yield** (yield when ≥~50 ms have elapsed since the last yield), keeping a node-count fallback; (b) scan pages **concurrently** via `Promise.all(figma.root.children.map(...))` instead of the sequential `for…await`; (c) emit `sendProgressUpdate` **during the walk** (on the same time-budget tick as (a), throttled so updates fire at most every ~1 s) so the MCP server's inactivity timer is reset. (a)+(b) keep the JS thread responsive; (c) is the belt-and-braces safeguard. **Why during-walk, not per-page:** the request's *first* timeout is the 30 s default (`figma-client.ts:317`), only extended to 60 s once the first `progress_update` arrives — so on a large **single-page** document, "one update per page" would emit only at the very end and time out before the first heartbeat. The heartbeat therefore lives **inside** the shared walk, not in the page loop. `deleteVariables` already receives `params.commandId` (injected by `sendCommandToFigma`), so it can emit with the correct request id and a `'variable_delete'` commandType — same wiring `getVariables`/`variable_list` already use. The fix lands in the **shared** `findVariableConsumers` walk, so `variable_list`'s document consumer scan benefits too.

> [!NOTE]
> **D4 — Variable `scopes` (§3).** Add an optional **`scopes`** field (array of `VariableScope` enum values) to `variable_manage`, honoured on both `CREATE_VARIABLE` and `UPDATE_VARIABLE`; the handler sets `variable.scopes`. Schema validates the **enum shape only**; Figma arbitrates type-compatibility (e.g. `ALL_FILLS` is COLOR-only) and any rejection degrades to a normal handler error (same advisory philosophy as v2.2.0 D10). `scopes` is **optional, not required**, so an `UPDATE` that omits it does not wipe existing scopes — but the tool description and the `figma-edit` guidance both instruct agents to **always set `scopes` explicitly on create** (matching the official figma-use guidance). *(`codeSyntax` is a related write gap but is out of scope for v2.3.0 — note as a follow-up.)*

> [!NOTE]
> **D5 — `style_manage` effect contract (§4).** Fix **both** sides: (a) **plugin** — normalise effects before assigning, injecting `blendMode: "NORMAL"` (and the other shadow defaults) for `DROP_SHADOW`/`INNER_SHADOW` that omit them, so an agent that trusts the schema never hits a hard failure; (b) **schema** — name `blendMode` in the typed effect schema and document it. The normalisation already exists and works in `setEffects` (`node_set_effects`, `stylingHandlers.ts:248-275`); **extract it into one shared helper and reuse it in `createStyle`'s EFFECT branch** so the two effect-writing paths can never diverge again. Primary lever is (a) — the schema fix makes the contract honest, but the plugin default is what removes the failure.

> [!NOTE]
> **D6 — Auto-resize oversized image bytes (§1) — DECIDED.** Figma rejects images >4096 px per side on **both** sources and does not resize (confirmed against the API). To make the bytes path forgiving, the **MCP server** auto-downscales an oversized `bytesBase64` image **before** forwarding it to the plugin: decode → if `max(w,h) > 4096`, scale so the longest side = 4096 **preserving aspect ratio** → re-encode in the source format → re-base64. Use **`jimp`** (pure-JS, no native binary) to fit the lean, npx/Bun/Smithery-friendly dependency model — `sharp` was rejected to avoid native prebuilt-binary install friction. Resize covers **PNG/JPEG only**; **GIF is passed through unmodified** (jimp resize would flatten animation) and an oversized GIF still returns Figma's rejection with guidance. A `warnings` entry reports any downscale (original → new dimensions). **Known limitation (verified):** jimp/jpeg-js cap JPEG decode at ~512MB / 100MP, so a PNG/JPEG over **~45 megapixels** cannot be auto-resized; the server returns an honest `node_set_fill: image is too large to auto-resize server-side … pre-resize it` error rather than raising the budget — decoding such an image balloons process RSS to ~2GB that neither Node nor Bun returns to the OS after GC (measured; only a disposable child process reclaims it via process-exit), which is not worth the subsystem for so rare an input in design files. **The `url` path is NOT resized** — the server never sees those bytes, and fetching agent-controlled URLs server-side would add an SSRF surface; an oversized URL image keeps returning the structured rejection. *(Follow-up, out of scope: optional server-side fetch-resize-retry for the URL path once outbound HTTP + SSRF guards are in place.)*

> [!NOTE]
> **All decisions recorded and confirmed.** D2 (image-fill API shape) is locked to extending `node_set_fill`; D6 adds `jimp` bytes-path auto-resize; D1/D3/D4/D5 carry sensible defaults. No open questions remain for this release.

---

## Scope & priority

| # | Change | Priority | Primary location |
| :- | :- | :-: | :- |
| §1 | Image fill on `node_set_fill` (feature gap) | **P1** | `src/mcp_server/tools/node.ts`, `src/mcp_server/imageResize.ts` (new), `figma_plugin/handlers/stylingHandlers.ts`, `figma_plugin/utils/exportUtils.ts` |
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

*Schema (`node.ts`):* `r/g/b` become `.optional()`; add an `image` object and a `.superRefine` enforcing: (1) **exactly one** of {solid color — meaning **all three** of `r`,`g`,`b` present (`a` optional) — or `image` present}; partial RGB (e.g. `r`+`g`, no `b`) and alpha-only are **rejected**. (2) within `image`, **exactly one** of `url`/`bytesBase64`:

```
image: z.object({
  url: z.string().url().optional().describe("HTTP(S) URL to a PNG/JPEG/GIF the plugin fetches via createImageAsync. Max 4096px per side and NOT resized — pre-resize larger images yourself, or use bytesBase64 (which is auto-resized)."),
  bytesBase64: z.string().optional().describe("Base64-encoded raw PNG/JPEG/GIF bytes. PNG/JPEG over 4096px per side are auto-downscaled server-side (aspect ratio preserved); GIF is not resized. Heavier over the socket."),
  scaleMode: z.enum(["FILL","FIT","CROP","TILE"]).optional().describe("default FILL"),
  opacity: z.number().min(0).max(1).optional(),
}).optional()
```

*MCP server auto-resize (D6, `node.ts` tool handler → `src/mcp_server/imageResize.ts`):* for the **`bytesBase64`** path only, before `sendCommandToFigma`, run a new `resizeIfOversized(base64): { base64, warning? }` helper:
- Decode the base64; detect format via `jimp`.
- **Resize iff the detected MIME ∈ {`image/png`, `image/jpeg`}; pass everything else through unchanged.** jimp also decodes **BMP and TIFF** (its full set is PNG/JPEG/BMP/TIFF/GIF), but Figma's `createImage` accepts only PNG/JPEG/GIF — so the helper must **not** re-encode a non-PNG/JPEG input (that would transcode a BMP/TIFF jimp can read into something, or flatten a GIF). Branch on the exact detected format, never "if not GIF, resize."
- **PNG/JPEG:** if `max(width,height) > 4096`, downscale so the longest side = 4096 (`scale = 4096 / max(w,h)`, round, **preserve aspect ratio**), re-encode in the **source format** (JPEG quality ~85; PNG lossless), re-base64; set `warning = "image resized {w}×{h} → {w'}×{h'} to meet Figma's 4096px limit"`. If already ≤4096, return the input untouched (no decode/re-encode cost beyond the dimension read).
- **GIF (and any other detected format — BMP/TIFF/unknown):** passed through **unmodified** (jimp resize would flatten animated GIFs; BMP/TIFF/etc. must reach Figma untouched so its format gate is the single authority) — an oversized or unsupported one falls through to Figma's rejection below (`Image is too large` / `Image type is unsupported`).
- The handler attaches any `warning` to the tool result (extend `node_set_fill`'s `outputSchema` with `warnings: z.array(z.string()).optional()`). Resize lives **server-side** (jimp is a Node lib); the `url` path is untouched.

*Plugin (`stylingHandlers.ts`):* in `setFillColor`, branch on the payload:
- **Solid** (unchanged): build the `SOLID` paint as today.
- **Image:** resolve an `Image`:
  - `url` → `await figma.createImageAsync(url)` (the plugin fetches/decodes).
  - `bytesBase64` → `figma.createImage(base64ToBytes(bytesBase64))`, where **`base64ToBytes` is a new hand-rolled decoder** (sandbox has no `atob`; mirror the existing encoder in `figma_plugin/utils/exportUtils.ts:6-59`, decode direction). Strip an optional `data:*;base64,` prefix if present.
  - Then `node.fills = [{ type:"IMAGE", imageHash: image.hash, scaleMode: scaleMode ?? "FILL", opacity }]`.
- **Both sources share the same Figma constraints (confirmed against the API):** **PNG/JPEG/GIF only**, **max 4096px per side**, and **neither resizes**. `figma.createImage` **throws synchronously**; `figma.createImageAsync` **rejects** — both with Figma's messages `Image is too large` / `Image is too small` / `Image type is unsupported`. Wrap both (try/catch for the sync throw, await-in-try for the rejection) and map to the structured errors below. Setting the fill needs only a `scaleMode`, so we do **not** resize the node and `Image.getSizeAsync()` is not required.

**Error strings.**
> `node_set_fill: provide either a solid color (r,g,b[,a]) or an image, not both/neither.`

> `node_set_fill: image requires exactly one of 'url' or 'bytesBase64'.`

> `node_set_fill: could not fetch image from URL '<url>' (network/CORS). createImageAsync needs a directly fetchable, public URL to a PNG/JPEG/GIF.`

> `node_set_fill: 'bytesBase64' is not valid base64. Provide base64-encoded raw PNG/JPEG/GIF bytes.`

> `node_set_fill: Figma rejected the image — '<figma message>'. Images must be PNG/JPEG/GIF, ≤4096px per side. PNG/JPEG bytes are auto-resized; this typically means an oversized 'url' image, an oversized GIF, or an unsupported/too-small image — pre-resize or convert it.`

**Notes.**
- **Update the tool's own `description`** — it currently reads *"Set a node's fill to a literal RGBA color."* (`node.ts:420`), which is no longer accurate. Reword to cover solid **and** image fills (and keep the `node_apply_style` / `node_bind_variable` cross-references).
- Keep the tool's existing scope/lock/name guards (it is a single-target write covered by v2.2.0 §2) — no change to those.
- `base64ToBytes` lives in `figma_plugin/utils/exportUtils.ts` next to the existing encoder (single base64 home) and is imported by `stylingHandlers.ts`.
- **`jimp` is a new runtime dependency** (`package.json` `dependencies`) — pure JS, no native binary, consistent with the existing lean install (D6). The server-side `resizeIfOversized` helper is the only consumer; if a future build needs to keep the dependency out of a particular bundle, gate it behind a dynamic import.
- Document the sources in the error-playbook + workflows: **both** share Figma's PNG/JPEG/GIF-only + 4096px-per-side limits; **PNG/JPEG bytes are auto-resized server-side**, while `url` and GIF are not — so agents pick the right source and pre-resize when needed.
- Out of scope: gradient fills via this tool (still flow through `style_manage`'s paint passthrough or a future enhancement); URL-path fetch-resize (D6 follow-up).

**Tests.**
- *Schema (unit):* solid-only validates; image+url validates; image+bytesBase64 validates; both-color-and-image rejected; neither rejected; image with **both** url and bytesBase64 rejected; image with **neither** rejected.
- *`base64ToBytes` (unit):* round-trips against the existing encoder (`encode(bytes)` → `base64ToBytes` → original `Uint8Array`); decodes with/without padding and with a `data:` prefix; throws on non-base64 / malformed input.
- *`resizeIfOversized` (unit, server, D6):* a >4096px PNG and a >4096px JPEG are each downscaled so `max(w,h) === 4096` with the **aspect ratio preserved** (assert the resulting dimensions) and a `warning` is returned; a ≤4096px image is returned **byte-identical** with no `warning`; the **source format is preserved** (PNG stays PNG, JPEG stays JPEG); a >4096px **GIF passes through unmodified** (no resize) with no warning; non-square images scale by the longest side. Use tiny fixtures generated in-test via `jimp`.
- *Tool handler (unit):* an oversized-PNG `bytesBase64` call forwards the **resized** base64 to `sendCommandToFigma` (not the original) and the tool result carries the `warnings` entry; a small image forwards unchanged with no warning.
- *Plugin `setFillColor` (unit):* solid payload still produces a `SOLID` paint (**regression**); `url` payload produces an `IMAGE` paint with the resolved hash (mock `createImageAsync`); `bytesBase64` payload decodes and produces an `IMAGE` paint (mock `createImage`, assert it receives the decoded `Uint8Array`); a `createImage` **synchronous throw** and a `createImageAsync` **rejection** (each simulating `Image is too large` / `Image type is unsupported`) both surface the structured Figma-rejection error; a URL fetch/CORS failure surfaces the fetch error; unsupported node (`!("fills" in node)`) still throws.
- *Resource-fixture integration (unit; lightweight subset — **excludes the 9.7MB `jpeg-large`**):* load the committed fixtures from `src/mcp_server/tests/fixtures/images/`, assert each decodes to the dimensions in the §1 fixtures table (fixture-integrity), and run `resizeIfOversized` over them — `*-small` (≤4096) return **byte-identical**, no warning; `png-large` (4134×5846) downscales longest-side→4096 + a `warning`; `gif-large`/`animated-large` (>4096) pass through unmodified (GIF never resized; animation preserved). Gives **real-format** (PNG/JPEG/GIF/animated) coverage the synthetic `jimp` fixtures don't. (Real oversized-JPEG resize stays in the synthetic test + Phase 6 live, since `jpeg-large` is excluded for weight.)
- *URL handling (unit, no network):* the server forwards `image.url` to `sendCommandToFigma` **unchanged** and does **not** invoke `resizeIfOversized` (assert the spy); the plugin consumes the url via mocked `createImageAsync` (above). Unit tests **never fetch** the real URLs — their reachability is a separate network-gated fixture-liveness check (see §Testing & rollout), not part of the unit suite.

**Test image fixtures (§1 live testing) — free-licensed (Creative Commons / public domain / free-use).** Eight images cover Figma's **three supported formats × two size buckets** (both dims ≤4096; and ≥1 dim >4096), **plus two animated GIFs** to verify animation handling. Stored permanently at `src/mcp_server/tests/fixtures/images/` (filenames below; use for the `bytesBase64` path); the source URLs below drive the `url` path. All from Wikimedia Commons. Per-file attribution + licensing is in `src/mcp_server/tests/fixtures/images/CREDITS.md` — **these assets keep their own licenses (CC BY/BY-SA, PD, free-use) and are NOT covered by the project's MIT license**; they are excluded from the npm package (only `dist/` ships; `src/` test fixtures aren't in `package.json` `files`).

| File (in `src/mcp_server/tests/fixtures/images/`) | Fmt | Dimensions | Bucket | License | Source URL (direct) |
| :- | :- | :- | :- | :- | :- |
| `jpeg-small.jpg` | JPEG | 3000×2000 | ≤4096 | CC BY-SA 3.0 | https://upload.wikimedia.org/wikipedia/commons/b/b6/Felis_catus-cat_on_snow.jpg |
| `jpeg-large.jpg` | JPEG | 10315×7049 | >4096 | Public domain | https://upload.wikimedia.org/wikipedia/commons/f/ff/Pizigani_1367_Chart_10MB.jpg |
| `png-small.png` | PNG | 800×600 | ≤4096 | CC BY-SA 3.0 | https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png |
| `png-large.png` | PNG | 4134×5846 | >4096 | CC BY-SA 4.0 | https://upload.wikimedia.org/wikipedia/commons/8/81/R1_Canberra_light_rail_diagram.png |
| `gif-small.gif` | GIF | 480×360 | ≤4096 | CC BY-SA 3.0 | https://upload.wikimedia.org/wikipedia/commons/d/d3/Newtons_cradle_animation_book_2.gif |
| `gif-large.gif` | GIF | 13057×517 | >4096 | CC BY 3.0 | https://upload.wikimedia.org/wikipedia/commons/b/b6/UCB_Miscellaneous_Symbols_and_Pictographs_wide.gif |
| `animated-small.gif` | GIF (animated, 54 frames) | 400×400 | ≤4096 | CC BY-SA 3.0 | https://upload.wikimedia.org/wikipedia/commons/2/2c/Rotating_earth_%28large%29.gif |
| `animated-large.gif` | GIF (animated, 8 frames) | 8211×6250 | >4096 | Copyrighted free use | https://upload.wikimedia.org/wikipedia/commons/7/70/Zellamsee.gif |

Expected §1 outcomes by fixture: **≤4096 (any format/path)** → fill set as-is, no warning. **>4096 PNG/JPEG via `bytesBase64`** → auto-downscaled longest-side-to-4096 + a `warning`. **>4096 via `url` (any format), or >4096 GIF (either path)** → Figma rejection (`Image is too large`), since `url` and GIF are never resized. (Note: every "large" fixture exceeds 4096 on at least one side; `jpeg-large`/`png-large`/`animated-large` exceed it on both.)

**Animated-GIF coverage (validates the D6 "never resize GIF" rationale).** `animated-small` (≤4096) → fill set with **animation preserved**. `animated-large` (>4096) via `bytesBase64` → **passed through unmodified, NOT flattened/resized** → Figma rejection — proving the server does not silently destroy animation to satisfy the size limit. *(Note: `animated-large` is "Copyrighted free use" — a free license but not strictly Creative Commons; it was the lightest oversized-animated option at 2 MB vs. 8–14 MB CC/PD alternatives.)*

---

## §2. `variable_delete` WebSocket-link stall on large documents (P0)

**The risk.** `variable_delete` runs a full-document consumer scan before deleting. On a large file the scan ties up Figma's single JS thread for long stretches: the plugin can't pump the socket or post progress, so the MCP server sees no activity and the request trips its inactivity timeout — the delete appears to hang and the link looks dead.

**Current behavior.**
- The shared tree walk `findVariableConsumers` yields only **every 500 nodes** (`variableHandlers.ts:125-127`), and `walkCount` is a per-call closure variable, so the cadence resets per page.
- `deleteVariables` scans pages **sequentially**: `for (const page of figma.root.children) { _nodeMaps.push(await findVariableConsumers(page, idSet)); }` (`variableHandlers.ts:547-549`). (The style and alias scans at `541-544` are already kicked off concurrently; the node walk is the hot path.)
- `deleteVariables` emits **no** `sendProgressUpdate` during the scan (the progress calls at `variableHandlers.ts:340/406/430` are in `getVariables`, not here), so nothing resets the server's timer.
- The request's **first** timeout is the **30 s default** (`figma-client.ts:317`, `:427-432`); it is extended to a rolling **60 s inactivity** window only *after* the first `progress_update` arrives, and each subsequent `progress_update` resets it (`src/mcp_server/figma-client.ts:216-226`). So the **first** heartbeat must land within 30 s of the call, then at least one every <60 s.

**v2.3.0 change (D3).**
1. **Time-budgeted yield** in `findVariableConsumers`' `walk`: track `lastYield = Date.now()` and `await new Promise(r => setTimeout(r, 0))` when `Date.now() - lastYield >= ~50ms` (keep a node-count fallback so pathological deep trees still yield). This adapts to node density instead of a fixed count.
2. **Concurrent page scan** in `deleteVariables`: replace the sequential loop with
   `const _nodeMaps = await Promise.all(figma.root.children.map(p => findVariableConsumers(p, idSet)));`
   so page walks interleave on the event loop and no single page monopolises a long uninterrupted stretch.
3. **Progress heartbeat — emitted *during the walk*, not per page.** Inside `findVariableConsumers`' `walk`, on the same time-budget tick that yields ((a)), call `sendProgressUpdate(params.commandId, 'variable_delete', 'in_progress', …)` — throttled to fire at most ~once/second to avoid flooding the socket. This guarantees the **first** heartbeat lands well within the 30 s initial window even for a single huge page, then keeps the rolling 60 s window alive. **Do not** gate the heartbeat on page completion (the `Promise.all` page loop): a single-page document completes only once, at the very end, which is too late. Thread `commandId` from `params` down into the walk (it is already present on `deleteVariables`' `params`). This mirrors the streaming `getVariables` (`variableHandlers.ts:397-430`) but moves the emit point from the page loop into the walk.

Because the fix lands in the **shared** `findVariableConsumers` walk, `variable_list`'s `includeConsumers:"document"` path inherits the improved responsiveness for free.

**Notes.**
- This is a responsiveness fix, **not** a semantics change: the consumer set computed, the in-use rejection, and the collection-mode intra-collection alias filtering (`variableHandlers.ts:559-570`) are all unchanged.
- Verify the time-budget threshold against a large synthetic document; 50 ms is a starting point, tune so the link never goes quiet for more than a fraction of the 60 s window.

**Tests.** Unit/coverage: the walk yields at least once for a tree that exceeds the time budget (fake-timers); concurrent scan returns the same merged consumer map as the previous sequential scan for a fixture document; a `sendProgressUpdate` is emitted **from within the walk on a single-page** fixture that exceeds the time budget (proving the heartbeat does not depend on page completion), carrying `params.commandId`; the per-second throttle prevents a flood on a fast scan.

---

## §3. Variable `scopes` write support (P1)

**The gap.** Agents cannot set `variable.scopes`, so every variable is created with Figma's default `["ALL_SCOPES"]`. The official figma-use guidance explicitly says "Always set `variable.scopes` explicitly," and this server makes that impossible. The omission is **asymmetric**: the read side already surfaces scopes (`getVariables` returns `scopes: variable.scopes`, `variableHandlers.ts:371`), so agents can see scopes they can never set.

**Current behavior.**
- Schema: `variable_manage` exposes `action, name, description, modeName, collectionId, type, value, variableId, currentVariableName, modeId` — **no `scopes`** (`src/mcp_server/tools/variable.ts:49-94`).
- Handler: `handleVariableRequest` `CREATE_VARIABLE` (`variableHandlers.ts:878-935`) and `UPDATE_VARIABLE` (`variableHandlers.ts:937-982`) never read or write `variable.scopes`.

**v2.3.0 change (D4).**
- *Schema (`variable.ts`):* `VariableScope` from `@figma/plugin-typings` is a **type, not a runtime value**, so it cannot be spread into `z.enum`. Declare a literal `as const` array and build the enum from it:
  ```
  const VARIABLE_SCOPES = ["ALL_SCOPES","TEXT_CONTENT","CORNER_RADIUS","WIDTH_HEIGHT","GAP","ALL_FILLS","FRAME_FILL","SHAPE_FILL","TEXT_FILL","STROKE_COLOR","STROKE_FLOAT","EFFECT_FLOAT","EFFECT_COLOR","OPACITY","FONT_FAMILY","FONT_STYLE","FONT_SIZE","LINE_HEIGHT","LETTER_SPACING","PARAGRAPH_SPACING","PARAGRAPH_INDENT","FONT_WEIGHT","FONT_VARIATIONS"] as const;
  // in the inputSchema:
  scopes: z.array(z.enum(VARIABLE_SCOPES)).optional().describe("Editor surfaces this variable may bind to. ALWAYS set explicitly on create; omit on update to leave unchanged. e.g. ['ALL_FILLS'] for a color token, ['WIDTH_HEIGHT','GAP'] for spacing.")
  ```
  (Optionally `satisfies readonly VariableScope[]` to keep the literal list in sync with the typings at compile time.)
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

- **`tool-selection.md` / `workflows.md`** — `node_set_fill` now sets solid **or** image fills; show the image-fill workflow for **both** sources (`url` vs `bytesBase64`), when to use each, and their caveats: both are PNG/JPEG/GIF-only and ≤4096px per side; **`bytesBase64` PNG/JPEG are auto-resized** (prefer it for large images), while `url` and GIF are not resized; URL adds public/CORS/fetch concerns, bytes add payload weight (§1).
- **`error-playbook.md`** — recovery entries for: URL fetch/CORS failure, invalid base64, and Figma's image-rejection (too large/small/unsupported; PNG/JPEG/GIF, ≤4096px per side — note PNG/JPEG bytes are auto-resized server-side, so this usually means an oversized `url` image, an oversized GIF, or a too-small/unsupported image) (§1); the (now-rare) effect `blendMode` rejection (§4); and scope/type incompatibility on variables (§3).
- **`constraints.md` / SKILL guidance** — "Always set `variable.scopes` explicitly on create" (§3), mirroring figma-use.
- Tool descriptions in `variable.ts`, `style.ts`, `node.ts` carry the inline guidance above.

---

## §Testing & rollout

- **Build:** `figma_plugin` bundles to `code.js` (handlers are TS → bundled); rebuild and confirm the `node_set_fill`, `variable_delete`, `variable_manage`, and `style_manage` dispatch cases reflect the changes. MCP server (`src/mcp_server`) rebuilds its `dist/`; `npm install` first to pull the new `jimp` dependency, and confirm it bundles/resolves under both Node and Bun.
- **Unit tests:** extend the existing suites — `tests/unit/figma_plugin/annotationsAndVariables.test.ts` (§3), a styling/effects test for the shared `normalizeEffects` (§4), a `variableHandlers` responsiveness test (§2, fake-timers), and a `setFillColor` image test (§1). Tool-schema tests under `tests/unit/tools/` (`strictInput.test.ts`, `v2Tools.test.ts`, `contractSeam.test.ts`) updated for the new `node_set_fill` refine, `variable_manage.scopes`, and `style_manage` effect `blendMode`.
- **Manual verification (live Figma):** **§1** — using the fixtures in `src/mcp_server/tests/fixtures/images/` (§1 table), set image fills on **both** paths: `bytesBase64` (small render; `png-large`/`jpeg-large` auto-resize + `warning`; `gif-large`/`animated-large` pass through → `Image is too large`) and `url` (small render; large of any format → rejection, url never resized); confirm animated GIFs play when ≤4096. Then: delete a large collection on a multi-page doc and confirm the link stays alive with streaming progress; create a COLOR variable with `scopes:["ALL_FILLS"]` and confirm in the Figma UI; create an EFFECT style with a shadow that omits `blendMode` and confirm it succeeds.
- **Fixture-URL liveness (network, not unit):** a check under `test:live` / `scripts/live-verify.ts` that every §1 source URL still returns HTTP 200 with the expected content-type — guards against Wikimedia link rot breaking the `url`-path live test.
- **Version:** bump `package.json` `2.2.0 → 2.3.0` (D1).
- **CHANGELOG:** add a `v2.3.0` entry to `CHANGELOG.md` covering §1–§4 (image fills + bytes auto-resize, `variable_delete` responsiveness, variable `scopes`, `style_manage` `blendMode` fix) — it shipped a v2.2.0 entry and must not lapse.

---

## §Provenance — issue verification

Every issue was confirmed against the current tree before this PRD was written:

| Issue | Verified at | Finding |
| :- | :- | :- |
| §1 No image fill | `node.ts:415-450`, `stylingHandlers.ts:13-61` | `node_set_fill` is solid-RGBA-only; plugin builds only a `SOLID` paint. No `createImage`/`createImageAsync` anywhere — `style_manage`'s IMAGE passthrough has no `imageHash` producer. |
| §2 WS stall | `variableHandlers.ts:125-127`, `:547-549`, `figma-client.ts:216-226` | Walk yields only every 500 nodes; `deleteVariables` scans pages sequentially with `await` in-loop; no progress emitted during the scan; server arms a 60 s inactivity timeout reset only by progress updates. |
| §3 No scopes | `variable.ts:49-94`, `variableHandlers.ts:878-982` vs `:371` | No `scopes` field in schema; `CREATE_VARIABLE`/`UPDATE_VARIABLE` never set `variable.scopes`; yet `getVariables` already **reads** `scopes` — asymmetric. |
| §4 blendMode mismatch | `style.ts:49-51`, `styleHandlers.ts:76-80` vs `stylingHandlers.ts:248-275` | Schema's effect items omit `blendMode` (catchall, description-free); `createStyle` assigns `s.effects` raw → Figma's native validation requires `blendMode`. `setEffects` already injects the `NORMAL` default — a working in-repo precedent to reuse. |
