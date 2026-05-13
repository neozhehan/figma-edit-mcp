# v1.5.0 — Open Questions

Decisions required before the first NPM publish. Each question lists the candidate options, a recommendation, and the pros/cons of each.

---

## ~~1. `package.json` `author` field~~

> **✅ Decision (2026-05-11): Option A — structured object with organization name, contact email, and LinkedIn URL.**
>
> ```json
> "author": {
>   "name": "Neo Product LLC",
>   "email": "neo@neo.works",
>   "url": "https://www.linkedin.com/in/zhehanneo/"
> }
> ```
>
> **Rationale:** matches the LICENSE copyright (`Neo Product LLC`) for legal consistency, exposes a working contact channel via `mailto:neo@neo.works`, and routes the homepage link to LinkedIn so the identity stays professional and stable across future projects. The trade-off — permanent association of `neo@neo.works` with the package in the NPM registry and its mirrors — was accepted knowingly.
>
> **Applied in:** [spec.md](./spec.md) Step 1e. To be applied to [package.json](../../package.json) as part of the v1.5.0 publish.

The `author` field appears on the npmjs.com package page and in NPM's search index. Three common shapes were considered:

### Option A — Organization with contact details (**decided**)
```json
"author": {
  "name": "Neo Product LLC",
  "email": "neo@neo.works",
  "url": "https://www.linkedin.com/in/zhehanneo/"
}
```
- ✅ Matches the existing LICENSE copyright (`Copyright (c) 2026 Neo Product LLC`) — consistent legal identity across surfaces.
- ✅ Signals a company-backed project (trust for an unknown new package) while still giving users a direct contact path.
- ✅ NPM CLI and the npmjs.com page render `email` as a `mailto:` link and `url` as a clickable homepage — turns the maintainer card into a working contact surface.
- ✅ Routing the `url` to LinkedIn (rather than a personal GitHub) keeps the identity professional and stable across future projects.
- ⚠️ `neo@neo.works` is now permanently associated with this package in the registry (and its third-party mirrors). Accept this trade-off knowingly; if you ever want to rotate, you can publish a future version with a different address but the historical metadata persists.

### Option B — Structured object with personal contact
```json
"author": { "name": "NEO, Zhe Han", "email": "neo@neo.works", "url": "https://github.com/neozhehan" }
```
- ✅ NPM CLI/website renders these nicely (clickable email and homepage).
- ✅ Personal authorship reads more authentically for an indie/solo project.
- ❌ Permanently associates a personal email with the package — registry data is mirrored by many third parties and is effectively un-deletable.
- ❌ Diverges from the LICENSE copyright line (LLC vs. individual).

### Option C — Organization object with non-personal email
```json
"author": { "name": "Neo Product LLC", "url": "https://github.com/neozhehan/figma-edit-mcp" }
```
- ✅ Consistent with the LICENSE; clickable URL.
- ✅ No personal email exposure.
- ❌ Slightly more verbose than Option A for marginal benefit.

**Recommendation: Option A** unless you want clickable contact metadata, in which case Option C. Reserve Option B only if you specifically want personal attribution to surface.

---

## ~~2. `engines` minimums~~

> **✅ Decision (2026-05-11): Option B — declare both Node and Bun.**
>
> ```json
> "engines": { "node": ">=20", "bun": ">=1.3.0" }
> ```
>
> **Rationale:**
> - The build is explicitly Node-first: [tsup.config.ts](../../tsup.config.ts) sets `target: 'node18'` and the built `dist/server.js` ships with a `#!/usr/bin/env node` shebang. The package is compiled for Node, not Bun.
> - Smoke test passed: `node dist/server.js` boots cleanly under Node v25.8.1, connects to the WebSocket, and processes messages without Bun-API errors.
> - Declaring `node` reflects reality and unblocks the `npx figma-edit-mcp` install path — the default for most MCP host configs (Claude Desktop, Cursor).
> - The `node >=20` floor (vs. the `node18` build target) chooses current LTS over EOL — Node 18 went EOL in April 2025 and shouldn't be a supported floor for a v1 release.
> - `bun >=1.3.0` retained for development workflow users; matches the toolchain pins in `devDependencies`.
>
> **Applied in:** [spec.md](./spec.md) Step 1e. To be applied to [package.json](../../package.json) as part of the v1.5.0 publish.
>
> **Note on enforcement:** `engines` is advisory by default — NPM warns rather than blocks unless the consumer has `engine-strict=true` in `.npmrc`. The field still surfaces on the npmjs.com page and is consulted by tooling.

---

## ~~3. `homepage` URL~~

> **✅ Decision (2026-05-11): Option A — GitHub README anchor.**
>
> ```json
> "homepage": "https://github.com/neozhehan/figma-edit-mcp#readme"
> ```
>
> **Rationale:** the README is already the canonical doc, no new infrastructure required, and this is the standard NPM convention — the npmjs.com sidebar's "Homepage" link will deep-link visitors directly to the rendered README on GitHub.>
> **Applied in:** [spec.md](./spec.md) Step 1e. To be applied to [package.json](../../package.json) as part of the v1.5.0 publish.

---

## ~~4. `DRAGME.md` at the repo root~~

> **✅ Decision (2026-05-11): Replace `DRAGME.md` with `AGENTS.md` and `CLAUDE.md`, both scoped to *using* the tool (not setting it up or developing it).**
>
> ### Rationale
>
> `DRAGME.md` was a 1,222-line custom-named setup guide that walked an AI agent through cloning the repo, installing Bun, configuring the MCP integration, starting the WebSocket, and installing the Figma plugin. Two problems:
>
> 1. **The filename is non-standard.** No other project uses `DRAGME.md`. The industry has converged on `AGENTS.md` (vendor-neutral, backed by an open spec adopted by OpenAI Codex, Aider, and others) and tool-specific files like `CLAUDE.md`, `.cursorrules`, and `.github/copilot-instructions.md`. Using a custom name forfeits automatic discovery by these agents.
> 2. **The scope was wrong.** Most of the content was install/setup automation — work that the README, `bun setup`, and `bun integrate` already handle. The high-leverage content for agents is *how to use the MCP tools without breaking things* (scope rules, name verification, batch validation, when to use `filter` vs. `fields` on `get_nodes_info`), not how to install the project.
>
> ### What to write
>
> Both `AGENTS.md` and `CLAUDE.md` should focus on **runtime tool usage by agents that already have figma-edit-mcp installed and connected**. Topics:
>
> - **Hallucination safeguards as hard constraints** — scope locking (READ_ONLY_MODE, OUTSIDE_SCOPE, PARENT_OUTSIDE_SCOPE, CLONING_SOURCE_NODE_OUTSIDE_SCOPE), name verification (NAME_MISMATCH, PARENT_NAME_MISMATCH), no implicit selection state, batch tools' per-item validation. Frame these as rules to obey, not features to admire.
> - **Tool selection guidance** — when to use `get_nodes_info` with `filter` + `fields` vs. broader scans; when to use batch tools (`set_multiple_text_contents`, `delete_multiple_nodes`, `set_instance_overrides`) vs. individual calls; how `maxDepth` interacts with `descendantCount`.
> - **The "discover before acting" pattern** — always read node IDs and names from `get_nodes_info` / `get_pages_info` before writing; never guess or fabricate names.
> - **Error response playbook** — for each structured error code, what it means and the correct retry/inform-user behavior.
> - **The tripartite framing** — Plugin enforces, Agent orchestrates, Designer decides. Use this to set tone and avoid agents over-stepping into creative decisions.
>
> Explicitly **out of scope:**
> - Install / setup instructions (those belong in README.md and `bun setup` / `bun integrate`).
> - Repo development guidance (contributing, build commands, file layout) — not relevant to a consumer agent.
>
> ### File relationship
>
> To avoid drift between the two files, treat `AGENTS.md` as canonical and have `CLAUDE.md` import it via Claude Code's `@filename` syntax:
>
> ```markdown
> # CLAUDE.md
> @AGENTS.md
> ```
>
> This way Claude Code picks up the same content automatically, and any vendor-neutral agent that looks for `AGENTS.md` also gets it. If a Claude-specific override is ever needed, it can be appended below the import.
>
> ### Action items
>
> 1. Author `AGENTS.md` with the runtime-usage content described above. Source material can be lifted from the existing README "Hallucination Safeguards" section (lines 341+), the v1.4.0 release notes' `get_nodes_info` guidance, and the relevant portions of `DRAGME.md` (lines 71–141).
> 2. Create `CLAUDE.md` containing `@AGENTS.md`.
> 3. Delete `DRAGME.md`.
> 4. Decide whether `AGENTS.md` ships in the NPM tarball — recommended **yes** (add to `files` array) so consumers installing via `npx figma-edit-mcp` can point their agent at the file from `node_modules/figma-edit-mcp/AGENTS.md`. `CLAUDE.md` can ship too at marginal cost.
>
> **Applied in:** [spec.md](./spec.md) Section 2 (cleanup) and Step 4a (`files` array additions).

---

## ~~5. `bun.lock` in the published tarball~~

> **✅ Decision (2026-05-11): Option A — leave `bun.lock` excluded from the tarball.**
>
> **Rationale:** lockfiles are for repository contributors, not package consumers. Downstream users have their own lockfile (`bun.lock`, `package-lock.json`, `yarn.lock`) and don't want yours. Excluding it keeps the tarball smaller and avoids leaking dev-only transitive resolutions to end users. This is the current state — `bun.lock` is not in the `files` array — so no change is needed.
>
> **Applied in:** no spec change required; current [package.json](../../package.json) `files` array already excludes `bun.lock`.

---

---

## ~~6. Architecture vs. NPM publish — npm install only ships ⅓ of the runtime~~

> **✅ Decision (2026-05-11): Option A — make the NPM install fully functional by shipping a second bin for the WebSocket bridge and bundling the Figma plugin assets in the tarball.**
>
> **Rationale:** v1.5.0 is framed as the "first NPM release," and that promise only holds if `npx figma-edit-mcp` produces a usable tool. Shipping server-only would force every NPM user to clone the repo anyway, contradicting the visibility pitch and producing confusing errors when the server can't reach a non-existent bridge. The added build/doc work (~1–2 days) is the cost of delivering on the release's stated goals; it also compounds with the Section 1 visibility work — lower friction means more conversions from search hits and directory listings.>
> **What to ship:**
> - New script in [tsup.config.ts](../../tsup.config.ts) to compile `src/socket.ts` → `dist/socket.js`
> - New `package.json` bin: `"figma-edit-mcp-socket": "dist/socket.js"`
> - Add `figma_plugin` to the `files` array, shipping `manifest.json` + `dist/code.js` + `ui.html` (everything Figma needs to load the plugin from disk)
> - README documents pointing Figma at `node_modules/figma-edit-mcp/figma_plugin/manifest.json`
>
> **Applied in:** [spec.md](./spec.md) Sections 2 and 4 (build config, `files` array, README install instructions). Unblocks items 7, 8, and 13.

The figma-edit-mcp runtime has three components, but the current `files: ["dist", ...]` only ships the MCP server. Without this change, an npm-installed user could run `npx figma-edit-mcp` but could not start the WebSocket bridge or install the Figma plugin without cloning the repo.

| Component | Source | Shipped to NPM after this change? |
|---|---|---|
| MCP server | `dist/server.js` (via `bin: figma-edit-mcp`) | ✅ Yes (already) |
| WebSocket bridge | `src/socket.ts` → `dist/socket.js` (via `bin: figma-edit-mcp-socket`) | ✅ Yes (new) |
| Figma plugin | `figma_plugin/manifest.json` + `dist/code.js` + `ui.html` | ✅ Yes (new) |

---

## ~~7. README MCP host config snippets hardcode the local clone path~~

> **✅ Decision (2026-05-12): Option C — single primary `npx figma-edit-mcp` form in the README, with a one-line pointer to `CONTRIBUTING.md` for local-dev workflows.**
>
> **Rationale:** with Question 6 = Option A, `npx figma-edit-mcp` becomes the dominant install path for v1.5.0 onward, and the README's job is to optimize for that audience. Dual presentation (Option B) doubles the config-table length and creates real copy-paste risk on a page that already has multiple host-specific blocks. The original objection to Option C — "no CONTRIBUTING.md exists" — is resolved by the [CONTRIBUTING.draft.md](./CONTRIBUTING.draft.md) being authored alongside this release; it becomes the canonical home for the clone-based workflow, where it logically belongs.
>
> **What to ship:**
> - Replace the clone-based `args: ["run", "/path/to/figma-edit-mcp/dist/server.js"]` snippets at [README.md:115](../../README.md#L115), [README.md:143](../../README.md#L143), and similar lines with the `npx figma-edit-mcp` form.
> - Add a one-line pointer beneath the configuration section: *"Running from a local clone? See [CONTRIBUTING.md](../CONTRIBUTING.md) for the `--local` workflow."*
> - Move `CONTRIBUTING.draft.md` from this folder to the repo root as `CONTRIBUTING.md` as part of the v1.5.0 release commit.
>
> **Applied in:** [spec.md](./spec.md) Section 1b (README updates) and Section 2 (CONTRIBUTING.md addition to the repo root).

---

## ~~8. `scripts/integrate.sh` hardcodes the clone path~~

> **✅ Decision (2026-05-12): Option C — default `bun integrate` to emit `npx figma-edit-mcp`-based configs; add a `--local` flag for contributors who want clone-based configs pointing at `$PROJECT_DIR/dist/server.js`.**
>
> **Rationale:** consistent with Question 6 (Option A) and Question 7 (Option C). Once v1.5.0 ships, the NPM install path is the dominant use case and the integrate script should optimize for it. Contributors are a smaller, more technical audience that can read and remember a flag — and [CONTRIBUTING.md](../CONTRIBUTING.md) already documents the `--local` workflow as the canonical contributor path (see [CONTRIBUTING.draft.md](./CONTRIBUTING.draft.md) "Local development setup"). Existing contributors who muscle-memory `bun integrate` will get an `npx`-based config on first run after upgrading — covered by a one-line CHANGELOG entry under the v1.5.0 release notes.
>
> **What to ship:**
> - Update [scripts/integrate.sh:11](../../scripts/integrate.sh#L11) (and any related templates) so the default emits `"command": "npx", "args": ["figma-edit-mcp"]` rather than `"args": ["run", "$PROJECT_DIR/dist/server.js"]`.
> - Add a `--local` flag that restores the clone-based template, resolving `$PROJECT_DIR` from the script's own location.
> - Mention the behavior change and the `--local` flag in the v1.5.0 CHANGELOG entry.
>
> **Applied in:** [spec.md](./spec.md) Section 2 (cleanup / script changes) and Section 3 (CHANGELOG v1.5.0 entry).

---

## ~~9. Hallucination Safeguards — README vs. AGENTS.md content split~~

> **✅ Decision (2026-05-12): Option A — shorten the README's Hallucination Safeguards section to a 2-line summary plus a link to `AGENTS.md`.**
>
> ```markdown
> ## Hallucination Safeguards
> The plugin enforces hard constraints (scope locking, name verification, batch validation) that AI agents cannot bypass. See [AGENTS.md](./AGENTS.md) for the full rules and error codes.
> ```
>
> **Rationale:** the safeguards are a key differentiator and shouldn't disappear from the README entirely, but the line-by-line rules don't need to live in two places. Keeping a single source of truth in `AGENTS.md` (per Question 4) eliminates drift risk, slims the README's current 50+ line section to two lines, and surfaces `AGENTS.md` to human readers via the cross-link. Human evaluators who want to dig into the safeguards follow one click — an acceptable trade for never having to keep two copies in sync.
>
> **Applied in:** [spec.md](./spec.md) Section 1b (README updates) and Section 2 (`AGENTS.md` authoring — content moves there as canonical home).

---

## ~~10. NPM 2FA on the publishing account~~

> **✅ Decision (2026-05-12): Option A — enable `auth-and-writes` 2FA on the NPM publishing account before the first publish.**
>
> **Rationale:** `auth-and-writes` is the industry baseline for any package that will be installed by others, hardens against both credential theft and session/token leaks, and is free to set up. The extra prompt at every publish is a trivial cost relative to the blast radius of a compromised publish (the package becomes part of users' MCP toolchains). `auth-only` is a half-measure that leaves session theft on the table; "no 2FA" is wrong for any maintained package.
>
> **Applied in:** [spec.md](./spec.md) Step 4d — set up `auth-and-writes` 2FA during the `npm login` step before publishing v1.5.0.

---

## ~~11. NPM provenance attestation~~

> **✅ Decision (2026-05-12): Option B — add a CI workflow and publish v1.5.0 with `npm publish --provenance` from GitHub Actions.**
>
> **Rationale:** v1.5.0 is the first version the world will discover via Smithery, MCP.so, Glama, and Google indexing — first-impression credibility on npmjs.com matters disproportionately for an unknown new package. The green "Provenance" badge is a verifiable supply-chain claim that this tarball was built by a real CI workflow, not a developer's laptop, and it compounds with the Section 1 visibility work. The 0.5–1 day of setup is acceptable because Question 12 = Option A is being done in this release anyway (the CI workflow is a hard prerequisite). NPM_TOKEN is stored as a GitHub Actions secret with the publish job scoped narrowly.
>
> **What to ship:**
> - Build on the workflow added per Question 12 (Option A) — extend or add a sibling workflow that triggers on `v*` tag pushes and runs `npm publish --provenance --access public`.
> - Generate a fine-grained NPM automation token, add as `NPM_TOKEN` in GitHub Actions repository secrets.
> - Grant `id-token: write` permission to the publish job (required for OIDC-based provenance).
> - Confirm the green Provenance badge appears on the npmjs.com package page after publish.
>
> **Applied in:** [spec.md](./spec.md) Step 4d (publish path moves to CI-driven `npm publish --provenance` for v1.5.0).

---

## ~~12. CI workflow (`.github/workflows/`)~~

> **✅ Decision (2026-05-12): Option A — add a minimal GitHub Actions workflow that runs `bun install`, `bun test`, and `bun run build:all` on every push and PR.**
>
> **Rationale:** the repo currently has no `.github/` directory and no automated checks on PRs or pushes — a gap that every release after v1.5.0 would otherwise inherit. The workflow is cheap (~1 hour of setup, free CI minutes for public repos), durable (catches regressions before they reach `main`), and is a hard prerequisite for Question 11 (provenance). It also adds a green ✅ badge to the README as an ongoing credibility signal that compounds with the Section 1 visibility work.
>
> **What to ship:**
> - Create `.github/workflows/ci.yml` triggered on `push` to `main` and on `pull_request`.
> - Steps: checkout → setup Bun (`oven-sh/setup-bun@v2`) → `bun install` → `bun test` → `bun run build:all`.
> - Pin a single Bun version (matching the `engines.bun` floor) initially; expand to a matrix later if needed.
> - Add the workflow status badge to the README near the NPM badges from Step 1f.
>
> **Applied in:** [spec.md](./spec.md) Section 1f (badge addition) and a new Section 2 item for the workflow file. Hard prerequisite for the Question 11 provenance work.

---

## ~~13. GitHub Release body content~~

> **✅ Decision (2026-05-12): Option A — prepend an install one-liner to the CHANGELOG entry in the v1.5.0 GitHub Release body.**
>
> ```markdown
> **Install:** `npx figma-edit-mcp`  *(see [CONTRIBUTING.md](./CONTRIBUTING.md) for the local-dev workflow)*
>
> [full CHANGELOG [1.5.0] content]
> ```
>
> **Rationale:** the Release page is a high-traffic landing surface for visitors arriving from search results, Smithery/MCP.so listings, and social shares — leading with an actionable one-liner converts that traffic. Question 6 = Option A makes `npx figma-edit-mcp` a real, working command, so the one-liner is meaningful (not the weaker "see README for installation" fallback). The CONTRIBUTING.md pointer matches Question 7's decision (single primary `npx` form in README, clone-based workflow lives in CONTRIBUTING.md).
>
> **Applied in:** [spec.md](./spec.md) Step 4e — Release body assembled from the install one-liner above plus the CHANGELOG `[1.5.0]` entry.

---

## ~~14. Bin-resolution sanity check in the dry-run~~

> **✅ Decision (2026-05-12): Option A — add a mandatory pre-publish bin-resolution smoke test that installs the packed tarball into a scratch directory and runs the published bin.**
>
> ```bash
> # After npm pack, in a scratch directory:
> npm install --no-save ./figma-edit-mcp-1.5.0.tgz
> npx figma-edit-mcp --version   # exits 0 without opening stdio transport
> npx figma-edit-mcp-socket --version   # same for the bridge bin (per Question 6)
> ```
>
> **Rationale:** Step 4c's `tar -tzf` only inspects tarball contents — it cannot catch `bin` path typos, broken shebangs, missing runtime dependencies, or `files`-array omissions that surface only when the package is actually installed. A published NPM version is effectively irrevocable (72-hour unpublish window, discouraged), so the 30-second cost of this check is trivial relative to the cost of being publicly broken on the first release that anyone discovers via Smithery/MCP.so. The server doesn't currently accept `--version`; adding a minimal non-blocking flag handler is part of this work and is useful to end users regardless.
>
> **What to ship:**
> - Add a `--version` (and `--help`) flag handler in [src/mcp_server/server.ts](../../src/mcp_server/server.ts) (and the equivalent in `src/socket.ts` per Question 6) that prints the version from `package.json` and exits 0 without opening the stdio/WebSocket transport.
> - Document the smoke-test command sequence as a mandatory step in Step 4c, between `tar -tzf` inspection and the `npm publish` call.
> - In the CI publish workflow (per Question 11), run the same smoke test against the freshly-built tarball before the `npm publish --provenance` step.
>
> **Applied in:** [spec.md](./spec.md) Step 4c (mandatory smoke test) and a new server-side task for the `--version`/`--help` flag handler.

---

## ~~15. `figma_plugin/` tarball layout — how to actually ship the plugin~~

> **✅ Decision (2026-05-12): Option A — move plugin sources to a top-level `figma_plugin/`.**
>
> **What to ship:**
> - Move `src/figma_plugin/` → `figma_plugin/` at the repo root.
> - Update [src/figma_plugin/build.js](../../src/figma_plugin/build.js) (now `figma_plugin/build.js`) to emit `figma_plugin/code.js` — i.e., remove the intermediate `dist/` subdirectory under the plugin folder.
> - `manifest.json`'s `main` / `ui` paths stay as `code.js` / `ui.html` (already relative to the manifest, so no change needed).
> - Update every reference to `src/figma_plugin/...` across the repo: [README.md:181](../../README.md#L181) ("Select `figma_plugin/manifest.json`"), `scripts/integrate.sh`, `scripts/setup.sh`, `package.json` scripts (`plugin:build`, `plugin:watch`), `tsconfig.json`/path aliases, CONTRIBUTING.draft.md "Repository layout" section, and any AGENTS.md draft references.
> - Confirm the v1.5.0 tarball contains `package/figma_plugin/manifest.json`, `package/figma_plugin/code.js`, and `package/figma_plugin/ui.html` after `npm pack` (already covered by Spec Step 4c's tarball inspection).
>
> **Rationale:** single source of truth with no copying, tarball is its own smallest possible size, and the NPM install path (`node_modules/figma-edit-mcp/figma_plugin/manifest.json`) becomes structurally identical to the clone path (`figma_plugin/manifest.json`). That symmetry simplifies AGENTS.md and CONTRIBUTING.md — one set of instructions covers both audiences. The cost — a one-time grep-and-replace across the repo — is paid in a release that is already touching every doc surface, so the marginal disruption is minimal. The departure from the `src/` convention is acceptable because the plugin is a separately-shipped artifact, not server source code; co-locating it with the published-tarball layout is more important than convention symmetry.
>
> **Applied in:** [spec.md](./spec.md) Section 2 (a new "Move `src/figma_plugin/` → `figma_plugin/`" step under cleanup), Step 4a (`files` array entry now matches the actual top-level directory; `figma_plugin/build.js` note about output path is satisfied by the move), and Step 4c (tarball inspection paths confirmed). README, integrate.sh, setup.sh, and the CONTRIBUTING/AGENTS drafts all need their `src/figma_plugin/` references updated as part of the move.

---

## ~~16. Relative-link rewrites when promoting `CONTRIBUTING.draft.md` → repo-root `CONTRIBUTING.md`~~

> **✅ Decision (2026-05-12): Option B — add a markdown link checker to CI and let it gate the move.**
>
> **What to ship:**
> - Add a markdown link checker (`lychee-action` or `gaurav-nelson/github-action-markdown-link-check`) as a job in `.github/workflows/ci.yml` (introduced per Q12). Run on every push and PR.
> - Configure the checker to scan all tracked `*.md` files at the repo root and under `documentation/`. Exclude rate-limit-prone external hosts (e.g., `linkedin.com`, `npmjs.com/package/<self>`) via the checker's ignore list to keep false positives manageable.
> - Manually fix the known link breakage as part of the move commit (the checker will fail the PR until this is done): `../../` → `./` for every link in `CONTRIBUTING.md` after promotion to the repo root; `../CONTRIBUTING.md` → `./CONTRIBUTING.md` in the README snippet from Spec Step 1b.
> - Amend Spec Step 1b's snippet wording to use `./CONTRIBUTING.md`. Add a sub-step under Spec Section 2c documenting the `../../` → `./` rewrite as part of the promotion commit.
>
> **Rationale:** the manual fix has to happen either way — the CI link checker doesn't rewrite paths, it only flags broken ones. Adding the checker to v1.5.0 turns a one-time "fix the known breakage" task into a durable guardrail that catches every future link-rot incident (a real risk on a project that's about to grow doc surface area: AGENTS.md, CONTRIBUTING.md, expanded README, MCP directory listings). The ~30 minute CI setup cost is paid once; the upside is permanent. Broken links on the rendered npmjs.com page are a first-impression credibility hit for an unknown new package, which compounds with the Section 1 visibility work — exactly the audience the link checker most protects.
>
> **Applied in:** [spec.md](./spec.md) Section 1b (snippet wording correction to `./CONTRIBUTING.md`), Section 2c (add `../../` → `./` rewrite sub-step), and Section 2g (extend the CI workflow with the link-checker job).

---

## ~~17. tsup output formats — drop CJS and `dts` for the bin entries~~

> **✅ Decision (2026-05-12): Option A — narrow tsup to `format: ['esm']` and set `dts: false`.**
>
> **What to ship:**
> - Edit [tsup.config.ts](../../tsup.config.ts): change `format: ['cjs', 'esm']` → `format: ['esm']`; change `dts: true` → `dts: false` (or remove the line — `false` is the default).
> - After the change and Q6's socket entry addition, the build emits exactly two files: `dist/server.js` and `dist/socket.js`. Both get the shebang banner from Spec Step 2d; both are the targets of the `bin` entries from Spec Step 4a. No CJS twins, no `.d.ts` / `.d.cts` declaration files.
> - Confirm during Spec Step 4c's tarball inspection that no `*.cjs` or `*.d.ts` / `*.d.cts` files appear under `package/dist/`.
>
> **Rationale:** `figma-edit-mcp` is invoked as a CLI binary (`npx figma-edit-mcp`, `npx figma-edit-mcp-socket`), not imported by other code. The CJS outputs are dead weight — the `bin` entries only point at the ESM `.js` files, and the package has no documented programmatic API for `require()` consumers. The `.d.ts` / `.d.cts` files are dead weight for the same reason: there's no exported surface to type-check against. Dropping both shrinks the tarball, removes ambiguity about which file is the entry, and aligns with Q18's removal of `main`/`module` — together they make `figma-edit-mcp` unambiguously CLI-only at the package-metadata level. Closing the door on programmatic import is acceptable because nothing documents or guarantees it today; if a future release ever needs a library API, it can be added deliberately rather than as an accident of build configuration.
>
> **Applied in:** [spec.md](./spec.md) Section 2d (extend the `tsup.config.ts` change list to include `format: ['esm']` and `dts: false`) and Step 4c (tarball inspection acceptance criteria — no `*.cjs` / `*.d.ts` / `*.d.cts` under `package/dist/`).

---

## ~~18. `main` / `module` fields for a CLI-only package~~

> **✅ Decision (2026-05-12): Option A — remove both `main` and `module` from `package.json`.**
>
> **What to ship:**
> - Edit [package.json](../../package.json): delete the `"main": "dist/server.js"` and `"module": "dist/server.js"` lines.
> - The `bin` entries (Spec Step 4a) remain the sole declared entry points.
> - Confirm during Spec Step 4c's tarball inspection that `package.json` in the packed tarball lacks both fields.
>
> **Rationale:** `main` and `module` advertise a programmatic import API. `figma-edit-mcp` has none — importing the package today would boot the MCP server (open stdio, register tools, etc.), which is almost certainly not what any importer expects. Removing both fields makes `package.json` honest about the CLI-only nature of the package, prevents accidental `import 'figma-edit-mcp'` calls from silently starting a server process, and pairs cleanly with Q17's ESM-only / no-`dts` decision: together they declare unambiguously at the package-metadata level that this is a CLI binary, not a library. Nothing is documented or guaranteed about programmatic import today, so the breakage risk is effectively zero (and acceptable for a pre-first-publish package). If a future release ever wants a library API, it can be added deliberately with a fresh `exports` map rather than inherited as a build-config accident.
>
> **Applied in:** [spec.md](./spec.md) Step 4a (extend the `package.json` edit list to include removal of `main` and `module`) and Step 4c (tarball inspection acceptance criteria — `package.json` must not contain `main` or `module`).

---

## ~~19. Tag/version drift guard in `publish.yml`~~

> **✅ Decision (2026-05-12): Option A — add an early `version-matches-tag` step that fails the workflow on mismatch.**
>
> **What to ship:**
> - Add the following step to `.github/workflows/publish.yml` (Spec Step 2h) immediately after `Checkout` and before any build, smoke-test, or publish step:
>
>   ```yaml
>   - name: Verify tag matches package.json version
>     run: |
>       pkg_version="$(jq -r .version package.json)"
>       tag_version="${GITHUB_REF_NAME#v}"
>       [ "$pkg_version" = "$tag_version" ] || { echo "Mismatch: package.json=$pkg_version tag=$tag_version"; exit 1; }
>   ```
> - Document the check in `CONTRIBUTING.md`'s release section so contributors understand the tag-naming and version-bump contract (`v<X.Y.Z>` tag must match `package.json#version` exactly).
>
> **Rationale:** `npm publish` is irreversible (72-hour unpublish window, discouraged), and version/tag drift is the single most common publish footgun in any project that uses tag-driven CI publishing. Today's repo state is the live example: `package.json` still says `1.3.0` while the release plan calls for tagging `v1.5.0` — without this guard, a mis-sequenced merge would publish `1.3.0` again (or some other wrong version) before anyone noticed. The guard is five lines of bash, runs before any irreversible step, and has zero downside. Deriving the version from the tag instead (Option B) was rejected because it makes the published `package.json` diverge from the committed one, which is confusing for anyone inspecting `git show v1.5.0:package.json` later.
>
> **Applied in:** [spec.md](./spec.md) Step 2h (insert the `Verify tag matches package.json version` step as the first step after checkout in `publish.yml`) and the CONTRIBUTING.md release-process section (document the `v<X.Y.Z>` tag-naming contract).

---

## ~~20. Repo-wide "fork" language sweep~~

> **✅ Decision (2026-05-12): Option A — repo-wide `grep -rni 'fork' .` (excluding `node_modules`/`dist`/`.git`); human-review every hit.**
>
> **What to ship:**
> - Run `grep -rni 'fork' . --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git --exclude-dir=figma_plugin/dist` from the repo root as part of preparing the release PR.
> - Review every hit by hand. Update or remove any phrasing that re-asserts fork status (e.g., "this fork", "forked from", "the original repo"). Leave unrelated technical uses alone (e.g., "forking a child process", code referencing `fork()` syscalls, `os.fork`).
> - Surfaces likely to need edits beyond the two in [README.md](../../README.md) already covered by Spec Step 1b: [CHANGELOG.md](../../CHANGELOG.md), [DESIGN_PHILOSOPHY.md](../../DESIGN_PHILOSOPHY.md), [smithery.yaml](../../smithery.yaml) descriptions, the plugin README at `figma_plugin/README.md` after Q15's move, and any source-code comments. The plugin README is shipped to NPM (it's inside the `figma_plugin/` directory in the `files` array per Spec Step 4a), so it renders for end users.
> - Add the sweep as an explicit checklist item in Spec Section 5's verification list.
>
> **Rationale:** Spec 1b's narrow `grep README.md` only covers the most prominent surface. Other docs that ship to NPM — CHANGELOG (rendered on npmjs.com), DESIGN_PHILOSOPHY.md (linked from the README), and the plugin README — would carry stale fork phrasing into the first published release if not swept now. The cost is ~10 minutes of human review for a one-time pass; the upside is consistent messaging across every surface a new visitor might land on. A CI lint rule (Option B) was rejected as overkill for a project this size — fork-language drift is a one-time problem, not an ongoing one, and a rule that flags every `os.fork` would generate more noise than signal.
>
> **Applied in:** [spec.md](./spec.md) Section 1b (extend the README sweep instruction to a repo-wide `grep -rni 'fork' .` pass with the noted exclusions) and Section 5 (add a verification checkbox: "Repo-wide `fork` sweep completed; no remaining fork-status assertions in shipped docs").

---

## ~~21. LICENSE attribution — confirm dual-attribution and update spec assertion~~

> **✅ Decision (2026-05-12): Option A — verified. [LICENSE](../../LICENSE) already contains both copyright lines; spec wording corrected and a cosmetic cleanup applied to the original-author line.**
>
> **Verification:**
> - [LICENSE](../../LICENSE) lines 3–4 contain:
>   ```
>   Copyright (c) 2025 sonnylazuardi
>   Copyright (c) 2026 Neo Product LLC
>   ```
> - The original `sonnylazuardi` line is **legally required**: MIT's only binding condition is *"The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software."* `figma-edit-mcp` is a derivative work of [grab/cursor-talk-to-figma-mcp](https://github.com/grab/cursor-talk-to-figma-mcp) and continues to ship code from it, so removing that line would breach the license under which you're using the original code.
> - The `Neo Product LLC` line is the standard way to attribute new contributions under the same license — stacking two `Copyright (c)` lines is the conventional pattern for "original author + new contributor."
>
> **What was changed:**
> - Cosmetic cleanup: the original line previously read `Copyright (c) 2025 Github User sonnylazuardi`. The literal "Github User" prefix is unusual and reads like a placeholder; trimmed to `Copyright (c) 2025 sonnylazuardi`. Both forms satisfy the MIT obligation; this is purely stylistic.
> - Spec Step 1b's wording must be corrected: it currently says "The `Copyright (c) 2025 Github User sonnylazuardi` line is retained for MIT attribution," which (a) implied only one copyright line existed and (b) referenced the now-trimmed phrasing. Update to: "Both `Copyright (c) 2025 sonnylazuardi` and `Copyright (c) 2026 Neo Product LLC` lines in `LICENSE` are retained — the first satisfies MIT's required-attribution clause for the upstream project; the second attributes the new contributions."
>
> **Applied in:** [LICENSE](../../LICENSE) (line trimmed) and [spec.md](./spec.md) Section 1b (wording correction per above).

---

## ~~22. PR-time `npm pack` + bin-resolution smoke test (CI parity with publish)~~

> **✅ Decision (2026-05-12): Option A — run `npm pack` + the Q14 bin-resolution smoke test on every push and PR in `ci.yml`.**
>
> **What to ship:**
> - Extend `.github/workflows/ci.yml` (Spec Step 2g) with two additional steps after `bun run build:all`:
>
>   ```yaml
>   - name: Pack tarball
>     run: npm pack
>
>   - name: Bin-resolution smoke test
>     run: |
>       mkdir -p /tmp/figma-edit-mcp-smoketest
>       cd /tmp/figma-edit-mcp-smoketest
>       npm init -y
>       npm install --no-save "$GITHUB_WORKSPACE"/figma-edit-mcp-*.tgz
>       npx figma-edit-mcp --version
>       npx figma-edit-mcp-socket --version
>   ```
> - Reuses the exact smoke-test sequence from Spec Step 4c (Q14), so PR-time and publish-time checks are byte-for-byte identical.
> - Confirm the steps pass against the Q15 `figma_plugin/` layout move and the Q17 ESM-only build before merging the v1.5.0 release PR.
>
> **Rationale:** the Q14 smoke test was designed to catch `bin`-path typos, missing-or-non-executable shebangs, `files`-array omissions (after Q15's `figma_plugin/` move this is especially load-bearing), and runtime-dependency gaps. Running it only at publish time means the failure surfaces after a contributor's PR has merged and the maintainer is mid-tag-push — the worst possible moment to discover a regression. Running the same sequence on every PR catches the bug at the same place every other CI signal lands: in the PR conversation, where the author still has full context. Cost is ~30 seconds of CI per run on free GitHub Actions minutes, which is negligible. Pairs naturally with Q12's CI workflow and Q19's tag-version guard to give the publish path defense in depth.
>
> **Applied in:** [spec.md](./spec.md) Section 2g (extend `ci.yml` step list with `npm pack` + bin-resolution smoke test) and Section 5's verification checklist (a checkbox confirming the smoke test runs on PRs, not just publish).

---

## ~~23. `prepublishOnly` side effect on contributor `bun install`~~

> **✅ Decision (2026-05-12): Option A — add `prepublishOnly` and document the intended behavior in CONTRIBUTING.md.**
>
> **What to ship:**
> - Add `"prepublishOnly": "bun run build:all"` to [package.json](../../package.json) `scripts` (already covered by Spec Step 4a; this decision confirms it).
> - Add a short note to CONTRIBUTING.md's release section explaining: (a) `prepublishOnly` runs only on `npm publish` / `bun publish`, **not** on `bun install` from a clone, so contributors won't see surprise builds; (b) it exists as defense in depth — even though publishing is CI-driven (Spec 2h) and `pub:release` is neutered (Spec 2i), an accidental `npm publish` from a developer laptop would still get a fresh `dist/` and plugin bundle rather than whatever stale state happened to be on disk.
> - No CI change required — `prepublishOnly` is independent of CI build steps.
>
> **Rationale:** the cost is one line in `package.json` plus a paragraph in CONTRIBUTING.md; the upside is a guaranteed fresh build on any publish path that wasn't anticipated. Publishing is irreversible (72-hour unpublish window, discouraged) and v1.5.0 is the first registry release — first-impression credibility is worth the trivial belt-and-braces protection. The "Bun lifecycle script behavior" concern that prompted the question turns out not to apply: Bun, like npm, only runs `prepublishOnly` on the publish path, not on `bun install`. Option B (skip the script) was rejected because it removes the only safety net against an accidental developer-laptop publish; Option C (`prepack` instead) was rejected because it overlaps with CI's explicit `bun run build:all` step and would re-run on every `npm pack` smoke test (Q22), wasting time without adding signal.
>
> **Applied in:** [spec.md](./spec.md) Step 4a (already lists the `prepublishOnly` script — this decision confirms the choice and locks the rationale) and CONTRIBUTING.md's release section (add a one-paragraph note explaining when the script fires and why it exists).

---

## ~~24. `scripts/setup.sh` — contributor-only or end-user?~~

> **✅ Decision (2026-05-12): Option A — declare `scripts/setup.sh` contributor-only; update its header banner and document in CONTRIBUTING.md.**
>
> **What to ship:**
> - Add a header comment banner to [scripts/setup.sh](../../scripts/setup.sh) at the top of the file:
>   ```bash
>   # ------------------------------------------------------------
>   # Contributor-only setup script.
>   # End users should run `npx figma-edit-mcp` instead.
>   # See CONTRIBUTING.md for the local-development workflow.
>   # ------------------------------------------------------------
>   ```
> - Add a one-line note to CONTRIBUTING.md's "Local development setup" section confirming `bun setup` is for contributors only and is not part of the end-user install path.
> - No behavior change required — the script keeps doing what it does today; only the framing changes.
> - Resolves Spec Step 2f's deferred "audit and reconcile" ask: the audit happens here, the answer is "contributor-only," no further reconciliation needed.
>
> **Rationale:** the v1.5.0 NPM-first decisions (Q6 ships a usable NPM install, Q7 makes README's primary path `npx figma-edit-mcp`, Q8 makes `bun integrate` default to `npx` configs) collectively mean end users never clone the repo and therefore never need `setup.sh`. Generalizing the script to handle NPM installs (Option B) is wasted work — `npx figma-edit-mcp` *is* the install path, with no shell script needed. Deleting it (Option C) loses the contributor convenience without meaningful upside. Declaring contributor-only is the one option that matches the rest of the release's direction with minimal churn: existing contributors keep their muscle memory, the script's audience is documented, and ambiguity for any reader inspecting the repo is gone.
>
> **Applied in:** [scripts/setup.sh](../../scripts/setup.sh) (header banner) and CONTRIBUTING.md "Local development setup" section (one-line audience note). Spec Step 2f's deferral is closed by this decision; no further audit needed.

---

## ~~25. `Dockerfile` — keep, update, or delete~~

> **✅ Decision (2026-05-12): Option A — delete the Dockerfile.**
>
> **What to ship:**
> - Delete [Dockerfile](../../Dockerfile) from the repo root as part of the v1.5.0 release commit.
> - Audit and delete any related artifacts: `.dockerignore`, references in [smithery.yaml](../../smithery.yaml), README mentions of containerized deployment, and any CI jobs that build or push the image.
> - Add a one-line entry to the v1.5.0 CHANGELOG under "Cleanup": "Removed unused Dockerfile (the package is consumed via `npx figma-edit-mcp`; containerized deployment is not a documented use case)."
> - Resolves Spec Step 2j's deferred "update or delete" ask.
>
> **Rationale:** MCP servers run inside the host process (Claude Desktop, Cursor, Antigravity), launched via stdio transport. A containerized MCP server is an unusual deployment that would require additional plumbing (port forwarding, transport switching) the project doesn't currently support. The existing Dockerfile is also clone-path-based, which contradicts every NPM-first decision in this release (Q6, Q7, Q8, Q24). Rewriting it to use the published package (Option B) adds a maintained surface — and a CI job to test it, if it's to be trusted — for a use case nobody has asked for. Keeping it as-is (Option C) ships a stale, broken artifact under the project's name. Deleting now is reversible: if a real Docker use case surfaces post-publish, a clean NPM-based Dockerfile can be reintroduced in a future release with proper testing, rather than carrying forward today's clone-based file as a burden.
>
> **Applied in:** [Dockerfile](../../Dockerfile) (delete), [spec.md](./spec.md) Step 2j (close the deferral — decision is "delete"), and Spec Section 3c CHANGELOG entry (add cleanup line).

---

## ~~26. `package.json#description` — align with GitHub About text~~

> **✅ Decision (2026-05-12): Option A — replace `package.json#description` with the GitHub About text verbatim.**
>
> ```json
> "description": "Connect AI assistants to Figma via MCP — Read, Create, & Modify designs programmatically"
> ```
>
> **What to ship:**
> - Edit [package.json](../../package.json) `description` field to the string above (replacing the current `"Figma Edit MCP - Connect AI coding assistants to Figma via Model Context Protocol"`).
> - Add this change to Spec Step 1e's `package.json` metadata edit list so reviewers don't miss it.
> - Confirm during Spec Step 4c's tarball inspection that the packed `package.json` carries the new description.
>
> **Rationale:** the `description` field is rendered on the npmjs.com package card, in `npm search` results, and in tooling that surfaces package metadata (Smithery, MCP.so, Glama). The GitHub About text is already SEO-tuned per Spec Section 1c — it leads with the verb (`Connect`), names the value proposition (`AI assistants to Figma`), and enumerates the capability set (`Read, Create, & Modify`). Carrying two different descriptions across two of the highest-traffic surfaces forces a content-design choice every time the project's positioning shifts; carrying one keeps brand and SEO messaging coherent for free. Maintaining a third NPM-specific description (Option B) was rejected because the keyword overlap with the Google-targeted About text is essentially complete (`figma`, `mcp`, `ai`) — there's no meaningful optimization gap to exploit, just maintenance burden. Status quo (Option C) was rejected because it directly contradicts the deliberate wording in Spec 1c.
>
> **Applied in:** [spec.md](./spec.md) Step 1e (extend the `package.json` metadata block to include the updated `description` field) and Step 4c (tarball inspection confirms the packed `package.json` reflects the new value).

---

## ~~27. CHANGELOG `[1.5.0]` rewrite — confirmation, not a question~~

> **✅ Decision (2026-05-12): Option A — treat the CHANGELOG `[1.5.0]` rewrite as the first commit of the release PR; reviewers gate on it.**
>
> **What to ship:**
> - Open the v1.5.0 release PR with the CHANGELOG rewrite as commit #1, before any code change.
> - The rewritten `[1.5.0]` entry must cover everything enumerated in Spec Section 3c (release / repository / packaging / agent docs / contributor experience / CI & supply chain / cleanup), updated to reflect the additional decisions locked in via Q15–Q26 (e.g., the `figma_plugin/` move from Q15, the ESM-only build from Q17, the `main`/`module` removal from Q18, the link checker from Q16, the version-tag drift guard from Q19, the description alignment from Q26, the Dockerfile deletion from Q25).
> - Add a PR-template-style review checklist at the top of the release PR description: every bullet in the rewritten CHANGELOG must map to at least one diff in the PR before approval.
>
> **Rationale:** rewriting first means every subsequent commit in the release PR can be evaluated against a locked-in scope statement — reviewers spot drift between "what we said we'd ship" and "what we actually shipped" immediately. Leading with the CHANGELOG also makes it impossible to forget (Option B's failure mode), since the PR is unmergeable until the entry exists. The sequencing has zero downside: if a late code change makes a CHANGELOG bullet stale, an amendment commit costs minutes.
>
> **Applied in:** [spec.md](./spec.md) Section 3c (note that the rewrite is commit #1 of the release PR; bullet list maps 1:1 to diff entries) and the release PR description (review checklist requiring every bullet → diff mapping before approval).

---

## ~~28. AGENTS.md draft — author alongside the spec or during the release PR?~~

> **✅ Decision (2026-05-12): Option A — author `AGENTS.draft.md` in this folder now; promote to the repo root in the release PR.**
>
> **What to ship:**
> - Create `documentation/v1.5.0 - visibility_cleanup/AGENTS.draft.md` covering the topics enumerated in Q4 / Spec 2b: hallucination safeguards as hard constraints (full error-code taxonomy: READ_ONLY_MODE, OUTSIDE_SCOPE, PARENT_OUTSIDE_SCOPE, CLONING_SOURCE_NODE_OUTSIDE_SCOPE, NAME_MISMATCH, PARENT_NAME_MISMATCH, etc.); tool selection guidance (`get_nodes_info` `filter`/`fields`/`maxDepth`, batch vs. single-item tools); the discover-before-acting pattern; per-error-code response playbook; and the tripartite framing (Plugin enforces, Agent orchestrates, Designer decides).
> - Source content can be lifted from the existing README "Hallucination Safeguards" section (lines 341+, being collapsed per Q9), the v1.4.0 release notes' `get_nodes_info` guidance, and `DRAGME.md` lines 71–141.
> - Add a draft banner at the top of the file: `> **Draft — pre-release content for the canonical AGENTS.md. Promote to the repo root as `AGENTS.md` in the v1.5.0 release PR.**` (mirrors the pattern in [CONTRIBUTING.draft.md](./CONTRIBUTING.draft.md)).
> - In the release PR, promote the draft to repo-root `AGENTS.md` and rewrite all `../../` relative links to `./` (subject to the same link-checker gate from Q16).
> - Spec Section 2b's "Author `AGENTS.md`" step then collapses to a mechanical move + link rewrite, exactly like Section 2c does for CONTRIBUTING.md.
>
> **Rationale:** the CONTRIBUTING.draft.md pattern has already proven the value of pre-release authoring — tone, scope, and structure get reviewed in the spec PR (where reviewers can focus on doc quality without competing code-change concerns), and the release PR becomes mostly mechanical. AGENTS.md is the highest-leverage doc in this release: it's the canonical home for the safeguard rules being moved out of the README (Q9), it ships in the NPM tarball (Q4), and `CLAUDE.md` will import it via `@AGENTS.md`. Getting its tone and scope right matters more than for any other doc — and that's exactly the kind of work that suffers when batched with code review. Net work is identical between the two options; Option A just sequences it where attention is available.
>
> **Applied in:** new file `AGENTS.draft.md` in this folder (to be authored as a follow-up to this decision); [spec.md](./spec.md) Section 2b (rewrite the AGENTS.md authoring instruction to "promote `AGENTS.draft.md` to the repo root and apply the `../../` → `./` link rewrite," matching the Section 2c pattern for CONTRIBUTING.md).

---

## ~~29. `figma-edit-mcp-socket` — `--port` flag~~

> **✅ Decision (2026-05-12): Option A — add `--port <n>` (with env fallback `FIGMA_EDIT_MCP_SOCKET_PORT`) to the bridge bin and plumb the port through the MCP server and plugin.**
>
> **What to ship:**
> - Add `--port <n>` argv parsing to `src/socket.ts` (the new `figma-edit-mcp-socket` bin from Q6). Environment fallback: `FIGMA_EDIT_MCP_SOCKET_PORT`. Default: `3055` (current value, for backward compatibility with any existing local-clone setups).
> - Document the flag and env var in the bin's `--help` output (added per Q14 / Spec Step 2e).
> - Plumb the port through to the MCP server side so it knows where to connect: same `--port` flag and `FIGMA_EDIT_MCP_SOCKET_PORT` env var on `figma-edit-mcp`. The server's connect logic reads from the same source as the bridge.
> - Update the Figma plugin (in `figma_plugin/` after Q15's move) so its WebSocket connection target reads from a configurable source rather than a hardcoded `ws://localhost:3055`. The plugin UI gains a port field (defaulting to `3055`) so the user can match whatever port the bridge is listening on.
> - Update `scripts/integrate.sh` (Q8) so the generated MCP host configs accept and forward an optional `--port` value, and the `--local` flag's templates use the same plumbing.
> - Document the port in [AGENTS.draft.md](./AGENTS.draft.md) (default `3055`, configurable via `--port` or `FIGMA_EDIT_MCP_SOCKET_PORT`) and in CONTRIBUTING.md's Day-to-day workflow section.
>
> **Rationale:** once `figma-edit-mcp-socket` is a published bin used by arbitrary downstream installs, port collisions become a real bug class — port `3055` is not a registered IANA port and is realistically going to clash with other dev tooling on at least some users' machines. Adding the flag at v1.5.0 is the right time: there are no published consumers yet, so the contract starts permissive. Deferring to v1.5.1 (Option B) is cheaper in scope but more disruptive once any downstream config (Smithery, MCP.so, Glama listings, user MCP host configs) has captured the hardcoded port — you've effectively versioned a port. Picking a less-collision-prone default (Option C) reduces frequency without fixing the underlying issue and still requires the flag eventually. The plumbing cost (~half day for socket + server + plugin + integrate.sh) is acceptable for a "first publish" release because the alternative is locking in the wrong contract on day one.
>
> **Applied in:** `src/socket.ts` (`--port` + env handling), [src/mcp_server/server.ts](../../src/mcp_server/server.ts) (matching `--port` + env, used when connecting to the bridge), [figma_plugin/](../../src/figma_plugin/) (configurable WebSocket port; UI field), [scripts/integrate.sh](../../scripts/integrate.sh) (Q8 templates accept `--port`), and the `--help` output added per Q14. [spec.md](./spec.md) Sections 2d, 2e, 2f, and 4a need to mention the new flag/env contract.

---

## ~~30. Bun version pin in CI vs. `engines.bun` floor~~

> **✅ Decision (2026-05-12): Option A — validated. The `engines.bun` >= `1.3.0` floor holds; pin CI's `setup-bun@v2` to `1.3.0`.**
>
> **Verification performed (2026-05-12):**
> - Downloaded the standalone Bun `1.3.0` binary from `github.com/oven-sh/bun/releases/download/bun-v1.3.0/bun-darwin-aarch64.zip` to a scratch directory; confirmed `bun --version` → `1.3.0`.
> - Copied the working tree to `/tmp/figma-edit-mcp-bun130-test`; cleared `node_modules`, `dist`, and `figma_plugin/dist`.
> - Ran each script under Bun `1.3.0`:
>
>   | Step | Result |
>   |---|---|
>   | `bun install --frozen-lockfile` | ✅ 184 packages installed in ~1.2s |
>   | `bun test src/mcp_server/tests` | 291 pass / 3 fail (`294 tests across 24 files`) |
>   | `bun run build` (tsup) | ✅ ESM + CJS + DTS emitted to `dist/` |
>   | `bun run plugin:build` (esbuild via Node) | ✅ `code.js` emitted |
>
> - The 3 test failures are **not Bun-version-specific** — re-running the identical scratch tree under the host's Bun `1.3.10` produces the same 3 failures. They are pre-existing tree-state issues caused by the v1.4.0 release notes having been moved under `documentation/completed/` while `Contract F` tests still look for the old path, and an unrelated key-ordering assertion in `Phase 4 §3a getConnectPayload`. Track and fix these separately; they do not block the Bun version decision.
>
> **Conclusion:**
> - `engines.bun: ">=1.3.0"` is accurate. No floor bump needed.
> - Pin `oven-sh/setup-bun@v2` to `bun-version: 1.3.0` in `.github/workflows/ci.yml` (Spec Step 2g) and `.github/workflows/publish.yml` (Spec Step 2h). Per Q22, the PR-time `npm pack` + bin smoke test runs under the same pinned version, so the entire publish-validation path is exercised against the floor.
> - The 3 pre-existing test failures should be tracked as separate fix-up items before tagging v1.5.0 (otherwise CI will be red from day one, defeating Q12's purpose).
>
> **Rationale:** Q2 set the `engines.bun` floor at `1.3.0` based on `devDependencies` versioning, but until this check there was no evidence the project actually ran on `1.3.0`. Pinning CI to a higher version (Option B) would have hidden any incompatibility while still advertising the lower floor in `engines` — exactly the kind of drift between claim and reality that the smoke-test culture in this release is trying to eliminate. The matrix approach (Option C) doubles CI time to defend against regressions in a single Bun minor; for a small project with one supported runtime, defending the floor is sufficient. The validation took ~10 minutes and confirmed the floor is real.
>
> **Applied in:** [spec.md](./spec.md) Sections 2g and 2h (pin `setup-bun@v2` to `bun-version: 1.3.0`); a new follow-up item to fix the 3 pre-existing test failures before the v1.5.0 release PR is opened (tracked outside questions.md).

---

## ~~31. `npm publish --dry-run` on PRs that touch packaging files~~

> **✅ Decision (2026-05-12): Option A — validated. Add a targeted `npm publish --dry-run` job in `ci.yml`, gated on changes to packaging files.**
>
> **Verification performed (2026-05-12):**
> - Ran `npm publish --dry-run` against the repo in its current pre-1.5.0 state. The command completed without errors and produced a tarball-contents listing.
>
> **Output baseline (current state, pre-1.5.0):**
>
> ```
> 📦  figma-edit-mcp@1.3.0
> Tarball Contents:
>   1.1 kB    LICENSE
>   13.7 kB   README.md
>   119.9 kB  dist/server.cjs
>   224.1 kB  dist/server.cjs.map
>   20 B      dist/server.d.cts
>   20 B      dist/server.d.ts
>   114.2 kB  dist/server.js
>   224.3 kB  dist/server.js.map
>   1.2 kB    package.json
> Total:      9 files, 122.1 kB packed / 698.6 kB unpacked
> ```
>
> **What this baseline already proves the check catches:**
> - **Wrong version** — the `1.3.0` shown is exactly the kind of staleness Q19's tag-version drift guard exists for; the dry-run surfaces it visually as a sanity check.
> - **`files` array honoured** — only files matching `package.json#files` (currently `["dist", "README.md"]`) plus npm's auto-includes (`LICENSE`, `package.json`) are listed.
> - **`LICENSE` auto-include working** — Spec Step 1e notes "NPM auto-includes this, but listing it explicitly is safer." The dry-run confirms it would ship even without the explicit listing.
>
> **What's currently missing (would be fixed by Spec Step 4a post-v1.5.0):**
> - `dist/socket.js` (Q6 — second bin)
> - `figma_plugin/manifest.json`, `figma_plugin/code.js`, `figma_plugin/ui.html` (Q15 — plugin assets)
> - `CHANGELOG.md`, `DESIGN_PHILOSOPHY.md`, `AGENTS.md`, `CLAUDE.md` (Spec Step 4a — README-linked docs)
> - The `dist/server.cjs`, `*.map`, and `*.d.ts` artifacts will disappear once Q17's `format: ['esm']` + `dts: false` lands.
>
> A post-v1.5.0 dry-run baseline (after Q6, Q15, Q17, Step 4a all land) would show exactly the file set Spec Step 4c's tarball inspection enumerates. Any drift between the two is a bug the dry-run surfaces immediately on the affected PR.
>
> **What to ship:**
> - Add a job to `.github/workflows/ci.yml` (Spec Step 2g) that runs `npm publish --dry-run` whenever a PR touches any of: `package.json`, `tsup.config.ts`, `figma_plugin/build.js` (path post-Q15 move), or `scripts/integrate.sh`. Use `paths:` filter on the `pull_request` trigger.
> - The job logs the tarball-contents listing for human review on the PR.
> - The job is informational (no `--access`, no token, no side effects). Free CI minutes; ~5 seconds of runtime.
>
> **Rationale:** Q22's bin-resolution smoke test catches `bin`-path typos and missing-or-non-executable shebangs by actually executing the published artifact. `npm publish --dry-run` is orthogonal: it catches `files`-array omissions, README-link-target gaps (the failure mode that nearly bit this project per Spec Step 1d's README casing bug), and `prepublishOnly` regressions that the smoke test passes through silently. Targeting only packaging-file changes keeps noise minimal while covering the PRs that can actually break shipping. Running on every PR (Option B) was rejected as noise on PRs that have no packaging implications. Skipping (Option C) was rejected because the README-link-target failure mode is genuinely orthogonal to Q22's check and has already bitten the project once.
>
> **Applied in:** [spec.md](./spec.md) Section 2g (extend `ci.yml` with a packaging-paths-gated `npm publish --dry-run` job) and a follow-up note in Section 5's verification checklist (a checkbox confirming the dry-run job ran on the release PR).

---

## ~~32. `pub:release` script — guard or delete~~

> **✅ Decision (2026-05-12): Option B — delete the `pub:release` script entirely from `package.json`.**
>
> **What to ship:**
> - Remove the `"pub:release": "bun run build && bun publish"` entry from [package.json](../../package.json) `scripts`.
> - No replacement, no guard, no echo.
> - Update Spec Step 2i to reflect the chosen path (delete, not guarded echo). The CHANGELOG `[1.5.0]` entry's "Cleanup" section (per Spec Step 3c) should note: "Removed local `pub:release` script (publishing is CI-driven via tag push)."
>
> **Rationale:** v1.5.0 is the first NPM release, so nobody outside this repo has any history with `bun pub:release` — the only person who could conceivably type it is the maintainer, who already knows the new tag-driven CI flow. With no muscle-memory audience to protect, Option A's guarded-echo upside disappears entirely; what remains is a one-line script that does nothing useful at runtime, plus a "wait, why is this here?" moment for any future reader scanning `package.json`. Deleting is strictly cleaner: smaller `scripts` block, no dead entry, no signaling that the local-publish path is *almost* legitimate. If someone ever does type `bun pub:release`, they'll get a "script not found" error from Bun, which is a clear-enough signal to consult the docs.
>
> **Applied in:** [spec.md](./spec.md) Step 2i (rewrite from "guard or delete" to "delete; CHANGELOG cleanup entry") and Step 3c (CHANGELOG cleanup line confirming deletion). [package.json](../../package.json) edit removes the `pub:release` script as part of the v1.5.0 release commit.

---

## Decision summary table

| # | Question | Status |
|---|---|---|
| 1 | `author` field | **Decided** — Option A: `{ name: "Neo Product LLC", email: "neo@neo.works", url: "https://www.linkedin.com/in/zhehanneo/" }` |
| 2 | `engines` | **Decided** — Option B: `{ node: ">=20", bun: ">=1.3.0" }` (Node smoke test passed on v25.8.1) |
| 3 | `homepage` | **Decided** — Option A: `https://github.com/neozhehan/figma-edit-mcp#readme` |
| 4 | `DRAGME.md` | **Decided** — replace with `AGENTS.md` (canonical) + `CLAUDE.md` (`@AGENTS.md` import); both scoped to runtime tool usage |
| 5 | `bun.lock` in tarball | **Decided** — Option A: keep excluded (no change required; current state already matches) |
| 6 | NPM publish architecture (3-component runtime) | **Decided** — Option A: ship socket bin + plugin assets for a fully functional NPM install; unblocks 7, 8, 13 |
| 7 | README MCP host config snippets | **Decided** — Option C: single `npx` form in README + pointer to CONTRIBUTING.md for local-dev workflow |
| 8 | `scripts/integrate.sh` clone-path hardcoding | **Decided** — Option C: default to `npx`-based config; add `--local` flag for contributors |
| 9 | Hallucination Safeguards content split | **Decided** — Option A: README has a 2-line summary linking to AGENTS.md (canonical home) |
| 10 | NPM 2FA | **Decided** — Option A: enable `auth-and-writes` 2FA before first publish |
| 11 | NPM provenance | **Decided** — Option B: publish v1.5.0 with `--provenance` from GitHub Actions (depends on 12) |
| 12 | CI workflow | **Decided** — Option A: add minimal `.github/workflows/ci.yml` (install/test/build) in v1.5.0 |
| 13 | GitHub Release body | **Decided** — Option A: install one-liner (`npx figma-edit-mcp`) prepended to the CHANGELOG entry |
| 14 | Bin-resolution dry-run check | **Decided** — Option A: mandatory pre-publish smoke test (`npm install` packed tarball + `--version` on both bins) |
| 15 | `figma_plugin/` tarball layout | **Decided** — Option A: move `src/figma_plugin/` → top-level `figma_plugin/`; update all references |
| 16 | CONTRIBUTING.md relative-link rewrites on promotion | **Decided** — Option B: add markdown link checker to CI; manual fix gated by it |
| 17 | tsup output formats — drop CJS / `dts` | **Decided** — Option A: `format: ['esm']`, `dts: false`; ESM-only bins |
| 18 | `main` / `module` fields for CLI-only package | **Decided** — Option A: remove both fields; `bin` entries are the sole entry points |
| 19 | Tag/version drift guard in `publish.yml` | **Decided** — Option A: early `version-matches-tag` check fails workflow on mismatch |
| 20 | Repo-wide "fork" language sweep | **Decided** — Option A: one-time `grep -rni fork` repo-wide; human-review every hit |
| 21 | LICENSE attribution dual-line verification | **Decided** — Option A: verified both lines present; "Github User" prefix trimmed; spec 1b wording corrected |
| 22 | PR-time `npm pack` + smoke test | **Decided** — Option A: run `npm pack` + Q14 bin smoke test on every push and PR |
| 23 | `prepublishOnly` lifecycle behavior | **Decided** — Option A: add `prepublishOnly: bun run build:all`; document fire-conditions in CONTRIBUTING.md |
| 24 | `scripts/setup.sh` audience | **Decided** — Option A: contributor-only; header banner + CONTRIBUTING.md note |
| 25 | `Dockerfile` keep / update / delete | **Decided** — Option A: delete; audit and remove related artifacts; CHANGELOG cleanup entry |
| 26 | `package.json#description` alignment | **Decided** — Option A: replace with GitHub About text verbatim |
| 27 | CHANGELOG `[1.5.0]` rewrite sequencing | **Decided** — Option A: rewrite is commit #1 of the release PR; reviewers gate bullet→diff mapping |
| 28 | AGENTS.md drafting timing | **Decided** — Option A: author `AGENTS.draft.md` in this folder now; promote in release PR |
| 29 | `figma-edit-mcp-socket --port` flag | **Decided** — Option A: ship `--port` + env fallback in v1.5.0; plumb through server, plugin, and integrate.sh |
| 30 | Bun version pin in CI vs. engines floor | **Decided** — Option A: validated; floor `1.3.0` holds; pin CI to `1.3.0`. 3 pre-existing test failures need fixing before tag. |
| 31 | `npm publish --dry-run` on packaging PRs | **Decided** — Option A: validated; targeted CI job gated on packaging-file paths; informational, no side effects |
| 32 | `pub:release` script — guard or delete | **Decided** — Option B: delete entirely; no replacement; CHANGELOG cleanup entry |

---

## Documentation files that need updating before the v1.5.0 release PR

Decisions Q1–Q32 are settled, but several doc surfaces were authored before later decisions landed and now lag behind. Reconcile each file below before opening the release PR; none of these are open decisions — they are mechanical follow-throughs on prior Q-decisions.

### [CONTRIBUTING.draft.md](./CONTRIBUTING.draft.md)

Largest delta. Authored against Q7 only; needs Q15, Q19, Q23, Q24, and Q29 applied before promotion to repo root.

- **Repository layout block ([L18-30](./CONTRIBUTING.draft.md#L18-L30))** still shows `src/figma_plugin/`. Update to top-level `figma_plugin/` (Q15).
- **[L40](./CONTRIBUTING.draft.md#L40)** — `build:all` comment lists `dist/code.js`; post-Q15 this is `figma_plugin/code.js` (no intermediate `dist/` under the plugin folder).
- **[L55](./CONTRIBUTING.draft.md#L55)** — "Select `src/figma_plugin/manifest.json`" → `figma_plugin/manifest.json` (Q15).
- **[L73](./CONTRIBUTING.draft.md#L73)** — hardcodes `ws://localhost:3055`; document `--port` flag and `FIGMA_EDIT_MCP_SOCKET_PORT` env var (Q29).
- **Draft banner ([L3](./CONTRIBUTING.draft.md#L3))** still says "Move to the repo root … *if* that option is adopted." Q7 is decided — rewrite to mirror AGENTS.draft.md's banner ("Promote to repo root in the v1.5.0 release PR; apply `../../` → `./` link rewrite per Q16").
- **Missing content blocks the spec promises this file contains (Spec §2c):**
  - `prepublishOnly` paragraph — fires on `npm publish` / `bun publish`, not on `bun install`; defense in depth even with CI-driven publishing (Q23).
  - Tag-naming contract — `v<X.Y.Z>` tag must match `package.json#version` exactly; CI enforces (Q19).
  - `bun setup` is contributor-only; end users run `npx figma-edit-mcp` (Q24).
  - `--port` flag/env documentation in the Day-to-day workflow section (Q29).

### [AGENTS.draft.md](./AGENTS.draft.md)

One Q29 gap. Otherwise content-complete.

- Add a short note (default `3055`, configurable via `--port <n>` or `FIGMA_EDIT_MCP_SOCKET_PORT`) per Q29's "What to ship" list. Likely place: under "Hard constraints" as an aside, or in the "Quick-reference: workflow recipes" preamble.

### [spec.md](./spec.md)

Two small follow-throughs.

- **Pre-existing test failures (Q30 follow-up).** Promoted to a formal requirement in Spec §2g.1 with named failures, fix guidance, and acceptance criteria. Resolved — verify on the release PR that all three pass.
- **Plugin README reference ([spec.md:46](./spec.md#L46)).** Audited 2026-05-12: [src/figma_plugin/README.md](../../src/figma_plugin/README.md) exists and will move to `figma_plugin/README.md` after the Q15 path move. Spec reference is valid. Resolved — sweep this file for fork language per Q20 like any other shipped doc.

### README.md

Covered by Spec §1b's four edits, but flag the following for the release PR reviewer:

- **Install block above the configuration snippets.** Spec §1b items 1–4 rewrite *existing* snippets to `npx` form but don't explicitly add a top-of-README **Install** one-liner mirroring the GitHub Release body from Step 4e. The npm-first pitch lands better with an at-a-glance install line; add one above the host-config table.
- **Badges placement (Spec §1f).** Confirm the three badges (`npm version`, `npm downloads`, `CI`) sit above the H1's tagline, not below — standard NPM-package README convention.

### Other repo files (not drafts, but flagged by the spec)

The spec already lists these; calling them out here so they aren't forgotten when the release PR is assembled:

- **[scripts/setup.sh](../../scripts/setup.sh)** — contributor-only banner not yet applied (Q24 / Spec §2f).
- **[scripts/integrate.sh](../../scripts/integrate.sh)** — `--local` and `--port` flags + default `npx` config emission not yet applied (Q8, Q29 / Spec §2f).
- **[smithery.yaml](../../smithery.yaml)** — `bunx` → `npx` swap and Docker-reference audit (Q25 / Spec §2j).
- **[Dockerfile](../../Dockerfile)** — delete (Q25 / Spec §2j). Audited 2026-05-12: no `.dockerignore`, no Docker block in `smithery.yaml`, no `.github/` CI jobs exist yet. Only the `Dockerfile` itself needs removal.
- **[CHANGELOG.md](../../CHANGELOG.md)** — full `[1.5.0]` rewrite as commit #1 of the release PR (Q27 / Spec §3c).
- **`.cursorrules` parity** — Promoted to a formal requirement in Spec §2b: create `.cursorrules` at the repo root (shipped in the NPM tarball via `files`) and `.github/copilot-instructions.md` (repo-only), each with a one-paragraph pointer to `AGENTS.md`. Extends the AGENTS.md-as-canonical model to Cursor and Copilot at parity with `CLAUDE.md`. Resolved.
