# Figma Edit MCP v1.5.0 — Visibility, Cleanup, and First NPM Release

This specification outlines the steps for fixing the repository's search visibility, cleaning up the codebase, and publishing the **first NPM release** of `figma-edit-mcp` as `1.5.0`.

> **Versioning note:** Neither `1.3.0` nor `1.4.0` were published to NPM. `1.5.0` is the first version on the registry. CHANGELOG entries for `1.3.0` and `1.4.0` are preserved for traceability of breaking changes that landed before first publish.

> **Decisions ledger:** every numbered question in [questions.md](./questions.md) (Q1–Q32) has been resolved. Each section below cross-references the relevant `Q#` so implementers can trace the rationale. If a section appears to conflict with `questions.md`, the question file is authoritative — flag the spec for correction.

---

## 1. Visibility Fix Plan

The root cause of the repo not appearing in search engine results is the `noindex` robots tag automatically applied to fork pages on GitHub. The following steps will resolve this:

### Step 1a: Detach the Fork (Mandatory)
- **Action:** Open a support ticket at GitHub Support (category: "Repositories").
- **Request:** Ask GitHub to detach `neozhehan/figma-edit-mcp` from its parent network (`grab/cursor-talk-to-figma-mcp`).
- **Reasoning:** The fork has diverged substantially (hallucination safeguards, unique workflows, completely rewritten tools) and needs to be indexed by search engines.

### Step 1b: README and Repo-Wide Doc Updates (Post-Detachment)

The README requires four coordinated edits, plus a repo-wide fork-language sweep (Q20). The first two are the fork-language cleanups; the remaining two implement decisions from Q7 and Q9.

1. **Fork language — Hallucination Safeguards section** (line ~343): change `"This fork adds multiple layers of protection..."` to `"Figma Edit MCP adds multiple layers of protection..."`.
2. **Fork language — Acknowledgements section** (lines ~389–390): replace `"This project is a fork of [grab/cursor-talk-to-figma-mcp]... Thank you to the original authors..."` with `"Built on prior work by [sonnylazuardi](https://github.com/sonnylazuardi) and the contributors to [grab/cursor-talk-to-figma-mcp](https://github.com/grab/cursor-talk-to-figma-mcp). Thank you for the foundation this project builds on."`
3. **MCP host config snippets — switch to `npx` form (Q7).** Replace the clone-based snippets so the documented install path matches the NPM-first reality from Q6:
   - The inline Claude Code command at [README.md:115](../../README.md#L115) (`claude mcp add FigmaEdit bun run /path/to/figma-edit-mcp/dist/server.js`) → `claude mcp add FigmaEdit npx figma-edit-mcp`.
   - The "Manual Configuration" JSON block (around [README.md:140-150](../../README.md#L140-L150)) → `{ "command": "npx", "args": ["figma-edit-mcp"] }`.
   - Any other surviving `/path/to/figma-edit-mcp/dist/server.js` reference flagged by `grep -n 'path/to/figma-edit-mcp' README.md`.
   - Append a one-line pointer beneath the configuration section: *"Running from a local clone? See [CONTRIBUTING.md](./CONTRIBUTING.md) for the `--local` workflow."* **Note the relative path is `./`, not `../` (Q16 correction).**
4. **Hallucination Safeguards section — collapse to summary + link (Q9).** Replace the existing ~50-line section (starting at [README.md:341](../../README.md#L341)) with:

   ```markdown
   ## Hallucination Safeguards
   The plugin enforces hard constraints (scope locking, name verification, batch validation) that AI agents cannot bypass. See [AGENTS.md](./AGENTS.md) for the full rules and error codes.
   ```

   The canonical rules move to `AGENTS.md` (see Section 2). This eliminates the drift risk of maintaining two copies.

**Repo-wide `fork` language sweep (Q20).** After the four README edits land, run:

```bash
grep -rni 'fork' . --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git --exclude-dir=figma_plugin/dist
```

Human-review every hit. Update or remove any phrasing that re-asserts fork status. Leave unrelated technical uses alone (`os.fork`, `fork()` syscall references, etc.). Surfaces likely to need edits beyond the README: [CHANGELOG.md](../../CHANGELOG.md), [DESIGN_PHILOSOPHY.md](../../DESIGN_PHILOSOPHY.md), [smithery.yaml](../../smithery.yaml), and the plugin README at `figma_plugin/README.md` (after Q15's move). The plugin README ships in the NPM tarball, so it renders for end users.

**LICENSE attribution (Q21).** [LICENSE](../../LICENSE) lines 3–4 already contain both required copyright lines:

```
Copyright (c) 2025 sonnylazuardi
Copyright (c) 2026 Neo Product LLC
```

The first satisfies MIT's required-attribution clause for the upstream project (`figma-edit-mcp` is a derivative work and continues to ship code from it; removing this line would breach the license under which the original code is used). The second attributes the new contributions. Both lines are retained verbatim. The cosmetic "Github User" prefix on the original line was trimmed as part of Q21's verification.

### Step 1c: Repository Settings
- Tighten topics to: `mcp`, `mcp-server`, `figma`, `figma-plugin`, `model-context-protocol`, `design-automation`.
- Enable "Issues" and "Discussions" in Settings to produce additional indexable URLs.
- Keep the current "About" description as it functions well as a meta description.

### Step 1d: Filename Case Fix (NPM Publish Blocker)
- The repository's readme was committed as lowercase `readme.md`, while [package.json](../../package.json) `files` array references `"README.md"`. On case-sensitive filesystems (Linux CI, NPM's tarball generation) this would silently publish a package with no readme.
- **Action:** rename `readme.md` → `README.md` via `git mv` (completed as part of this release).

### Step 1e: NPM Listing Metadata (SEO surface #2)
The npmjs.com package page is itself an indexable, high-authority surface — treat it as part of the visibility plan. Apply the following changes to `package.json`:

```json
"description": "Connect AI assistants to Figma via MCP — Read, Create, & Modify designs programmatically",
"keywords": ["mcp", "mcp-server", "figma", "figma-plugin", "model-context-protocol", "design-automation", "ai", "claude", "cursor"],
"repository": { "type": "git", "url": "git+https://github.com/neozhehan/figma-edit-mcp.git" },
"homepage": "https://github.com/neozhehan/figma-edit-mcp#readme",
"bugs": { "url": "https://github.com/neozhehan/figma-edit-mcp/issues" },
"author": { "name": "Neo Product LLC", "email": "neo@neo.works", "url": "https://www.linkedin.com/in/zhehanneo/" },
"license": "MIT",
"engines": { "node": ">=20", "bun": ">=1.3.0" }
```

Also **remove** the `main` and `module` fields entirely (Q18) — `figma-edit-mcp` is CLI-only; advertising a programmatic import path would have any importer accidentally boot the MCP server. The `bin` entries (Step 4a) are the sole declared entry points.

Decisions: Q1 (`author`), Q2 (`engines`), Q3 (`homepage`), Q18 (remove `main`/`module`), Q26 (`description` aligned with the GitHub About text).

### Step 1f: README Badges (NPM + CI)

Add the following badges to the top of the README — standard for a v1 NPM package, provides ongoing social proof, and surfaces the CI status added in Section 2 (Q12):

```markdown
[![npm version](https://img.shields.io/npm/v/figma-edit-mcp.svg)](https://www.npmjs.com/package/figma-edit-mcp)
[![npm downloads](https://img.shields.io/npm/dm/figma-edit-mcp.svg)](https://www.npmjs.com/package/figma-edit-mcp)
[![CI](https://github.com/neozhehan/figma-edit-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/neozhehan/figma-edit-mcp/actions/workflows/ci.yml)
```

### Step 1g: Submit to Directories & Request Indexing
**Sequencing:** directory submissions must run **after** Section 4 (NPM publish), because Smithery/MCP.so/Glama configurations call `npx figma-edit-mcp` (or `bunx`) and need the package to exist on the registry.

- Open Google Search Console, add `https://github.com/neozhehan/figma-edit-mcp`, and request indexing for the root URL and `/blob/main/README.md`. (Can run immediately after Section 1a–1c — does not depend on NPM publish.)
- After NPM publish: submit to Smithery, MCP.so, Glama, and GitHub MCP Registry.
- Build social signals via LinkedIn, X/Bluesky, and Discord to acquire stars and backlinks.

---

## 2. Codebase Clean-up, New Files, and Agent Documentation

Before publishing, the repository needs structural cleanup, the new files required by the Q-decisions, and CI scaffolding.

### 2a. Delete development artifacts and stale docs
- **`test_output.txt`** — already staged for deletion in the working tree (`git status` shows `D test_output.txt`). Verify the deletion lands in the release commit.
- **Stale documentation** — the legacy `documentation/v1.4.0 - get_nodes_info_update/` directory is staged for deletion (its files were moved under `documentation/completed/`). Verify these deletions land in the release commit.
- **General sweep** — ensure no other temporary build files or un-ignored logs (`*.log`) are present in the final commit.

### 2b. Promote `AGENTS.draft.md` → `AGENTS.md`; replace `DRAGME.md` with `AGENTS.md` + `CLAUDE.md` (Q4, Q28)

The custom-named, setup-focused `DRAGME.md` is being retired in favor of standard agent-instruction files focused on **runtime tool usage**. Per Q28, AGENTS.md is being authored pre-release as [AGENTS.draft.md](./AGENTS.draft.md) so its tone/scope is reviewed in the spec PR rather than the release PR.

- **Promote `AGENTS.draft.md`** to the repo root as `AGENTS.md`. Rewrite all relative links from `../../` to `./` (this rewrite is gated by the link checker added per Q16). Remove the draft banner.
- **Create `CLAUDE.md`** at the repo root containing a single line: `@AGENTS.md`. This uses Claude Code's import syntax so the canonical content lives in one place; any Claude-specific override can be appended below the import.
- **Create `.cursorrules`** at the repo root as the Cursor parity of `CLAUDE.md`. Cursor does not support an `@import` directive in `.cursorrules`, so use a short pointer instead of an import:

  ```
  See AGENTS.md for the canonical rules, error-code taxonomy, and tool-selection guidance. Treat that file as authoritative; do not duplicate its content here.
  ```

  This keeps `AGENTS.md` the single source of truth (mirroring the rationale behind `CLAUDE.md`'s import) while still giving Cursor a discoverable file at the path it auto-loads. If a Cursor-specific override is ever needed, append it below the pointer paragraph.
- **Create `.github/copilot-instructions.md`** at the equivalent GitHub Copilot path with the same one-paragraph pointer to `AGENTS.md`. Same rationale — Copilot auto-discovers this filename; the pointer keeps content centralized.
- **Delete `DRAGME.md`.**

The AGENTS.md scope (per Q4): hallucination safeguards as hard constraints with the full error-code taxonomy, tool selection guidance (`get_nodes_info` `filter`/`fields`/`maxDepth`, batch vs. single-item), the discover-before-acting pattern, the per-error-code response playbook, and the tripartite framing (Plugin enforces, Agent orchestrates, Designer decides). Out of scope: install/setup (lives in README.md and `bun setup`/`bun integrate`) and repo development (lives in `CONTRIBUTING.md`).

### 2c. Promote `CONTRIBUTING.draft.md` to `CONTRIBUTING.md` (Q7, Q8, Q16)

Move [documentation/v1.5.0 - visibility_cleanup/CONTRIBUTING.draft.md](./CONTRIBUTING.draft.md) to the repo root as `CONTRIBUTING.md`. This becomes the canonical home for the local-dev / clone-based workflow, referenced from the README (Step 1b item 3) and from `bun integrate`'s `--local` flag help text.

**Link rewrite sub-step (Q16):** as part of the move commit, rewrite every `../../` relative link in CONTRIBUTING.md to `./` (e.g., `../../README.md` → `./README.md`, `../../AGENTS.md` → `./AGENTS.md`, `../../package.json` → `./package.json`). The link checker added in Step 2g will fail the PR until this is done.

**Content additions:**
- A note in the "Local development setup" section confirming `bun setup` is contributor-only (Q24); end users don't need it.
- A short paragraph in the release section explaining `prepublishOnly` (Q23): runs only on `npm publish` / `bun publish`, never on `bun install`, exists as defense in depth against accidental local publishes.
- A line documenting the tag-naming contract (Q19): `v<X.Y.Z>` tag must match `package.json#version` exactly; CI verifies this before any publish step runs.
- A line documenting the `figma-edit-mcp-socket` port flag (Q29): default `3055`, configurable via `--port <n>` or `FIGMA_EDIT_MCP_SOCKET_PORT`.

### 2d. Build configuration — add socket bundle, ESM-only, shebang (Q6, Q17)

Update [tsup.config.ts](../../tsup.config.ts):

- Add `src/socket.ts` to the `entry` array so tsup emits `dist/socket.js` (Q6).
- Change `format: ['cjs', 'esm']` → `format: ['esm']` and set `dts: false` (or remove the line — `false` is the default) (Q17). After this change and Q6's socket addition, the build emits exactly two files: `dist/server.js` and `dist/socket.js`. No CJS twins, no `.d.ts` / `.d.cts` declaration files.
- Bump `target` from `'node18'` to `'node20'` to match the `engines.node` floor declared in Step 1e. Node 18 is EOL (April 2025) and shouldn't be a build target for the first published version.
- Add a `banner` block so both bin outputs begin with `#!/usr/bin/env node` (required for `npx figma-edit-mcp` / `npx figma-edit-mcp-socket` to execute under bash):

  ```ts
  banner: { js: '#!/usr/bin/env node' }
  ```

  Confirm during dry-run (Step 4c) that both `dist/server.js` and `dist/socket.js` have the shebang as the first line.

### 2e. Add `--version`, `--help`, and `--port` flag handlers (Q14, Q29)

In both [src/mcp_server/server.ts](../../src/mcp_server/server.ts) and `src/socket.ts`, add a top-of-`main` argv check:

- **`--version`** — print the version (read from `package.json`) and exit 0 **without** opening the stdio transport or WebSocket. Required by the Step 4c bin-resolution smoke test and useful to end users for bug reports.
- **`--help`** — print a one-paragraph usage hint that names every flag (including `--port`) and exit 0.
- **`--port <n>`** (Q29) — override the default WebSocket bridge port (`3055`). Environment fallback: `FIGMA_EDIT_MCP_SOCKET_PORT`. Both bins read the same source so they negotiate the same port. The plugin (in `figma_plugin/` after Q15) gains a port field in its UI defaulting to `3055`, so the user can match whatever port the bridge is listening on.

Acceptance: `npx figma-edit-mcp --version` and `npx figma-edit-mcp-socket --version` each print a single version line and exit 0; `--help` prints a usage block listing `--version`, `--help`, and `--port`; `--port 4000` causes both bins to use port `4000` instead of `3055` without errors.

### 2f. Update `scripts/integrate.sh` and `scripts/setup.sh` (Q8, Q24, Q29)

[scripts/integrate.sh](../../scripts/integrate.sh) currently hardcodes `bun run $PROJECT_DIR/dist/server.js` (line 11), which only works inside a local clone. Update so:

- **Default** emits `"command": "npx", "args": ["figma-edit-mcp"]` for all integrations (Antigravity, VS Code, Cursor, Claude Desktop).
- **`--local` flag** restores the clone-based template (the current `bun run $PROJECT_DIR/dist/server.js` form) for contributors.
- **`--port <n>` flag (Q29)** — when provided, the generated config includes the `--port` argument so the host starts the server with the matching port. Document in the script's help output.
- The Claude Code instructions block ([scripts/integrate.sh:191](../../scripts/integrate.sh#L191)) prints `claude mcp add FigmaEdit npx figma-edit-mcp` by default and the clone-based form under `--local`; adds `--port` to both forms when supplied.
- The LM Studio deeplink config ([scripts/integrate.sh:202](../../scripts/integrate.sh#L202)) is built from the same default/local/port toggles.

[scripts/setup.sh](../../scripts/setup.sh) is **declared contributor-only (Q24)**. Add a header banner at the top of the file:

```bash
# ------------------------------------------------------------
# Contributor-only setup script.
# End users should run `npx figma-edit-mcp` instead.
# See CONTRIBUTING.md for the local-development workflow.
# ------------------------------------------------------------
```

The CONTRIBUTING.md note added in Step 2c covers the audience side.

### 2g. Add the CI workflow (Q12, Q16, Q22, Q30, Q31)

Create `.github/workflows/ci.yml` triggered on `push` to `main` and on `pull_request`. Steps:

1. Checkout.
2. Setup Bun via `oven-sh/setup-bun@v2` with `bun-version: 1.3.0` (Q30 — validated to work against the floor; the `engines.bun` claim is defended by CI, not just declared).
3. `bun install --frozen-lockfile`.
4. `bun test`.
5. `bun run build:all`.
6. **`npm pack` (Q22)** — pack the freshly-built tarball.
7. **Bin-resolution smoke test (Q22, mirror of Step 4c)** — `npm install --no-save` the tarball into a scratch directory, then `npx figma-edit-mcp --version` and `npx figma-edit-mcp-socket --version`. Both must exit 0. This catches `bin`-path typos, missing shebangs, `files`-array omissions, and runtime-dependency gaps at PR time, not at tag time.
8. **Markdown link checker (Q16)** — run `lychee-action` (or `gaurav-nelson/github-action-markdown-link-check`) against all tracked `*.md` files at the repo root and under `documentation/`. Configure ignore lists for rate-limit-prone hosts. Gates the Q16 / Step 2c relative-link rewrites.

Add a separate job (or conditional step) gated on `paths:` filter for `package.json`, `tsup.config.ts`, `figma_plugin/build.js`, and `scripts/integrate.sh`:

9. **`npm publish --dry-run` (Q31)** — log the tarball-contents listing for human review. Catches `files`-array omissions and README-link-target regressions (the failure mode that nearly bit the project per Step 1d's README casing bug). Informational only; no token, no side effects.

This is a hard prerequisite for the provenance work in Step 4d (Q11). The workflow status badge is added to the README in Step 1f.

### 2g.1. Fix pre-existing test failures (Q30 follow-up) — required before tagging

Three pre-existing `bun test` failures must be fixed and merged to `main` **before** the v1.5.0 tag is pushed. They are not Bun-version-specific (they reproduce on both `1.3.0` and `1.3.10`), so the CI pin from Q30 does not mask them. Tagging with these red turns CI red on day one of v1.5.0, defeats Q12's purpose, and undermines the Q11 provenance pitch.

Failures to fix:

1. **`Contract F — v1.4.0 release notes file exists with required sections > leads with the migration-required / connect-payload break framing`** — the test looks for the file at the old `documentation/v1.4.0 - get_nodes_info_update/` path. Update the test to point at the new location under `documentation/completed/v1.4.0 - get_nodes_info_update/`.
2. **`Contract F — v1.4.0 release notes file exists with required sections > documents the scan_text_nodes / scan_nodes_by_types removals with migration guidance`** — same root cause; same fix.
3. **`Phase 4 §3a (direct invocation): getConnectPayload — page scope > loads exactly the scoped page (no loadAllPagesAsync)`** — `expect(...).toEqual(...)` failing on a key-ordering diff for `descendantCount`. Fix by switching the assertion to one that is key-order-insensitive (e.g. `expect.objectContaining` or sorted-key normalization), or by emitting `descendantCount` in the order the test expects.

Acceptance:

- `bun test` is green on `main` before the release PR is opened.
- The CI workflow added in Step 2g passes on the release PR itself, not just on subsequent commits.
- Section 5's verification checklist item ("Three pre-existing test failures … fixed before tagging") is checked.

### 2h. Add the release/publish workflow (Q11, Q19, Q30)

Create `.github/workflows/publish.yml` triggered on `v*` tag pushes. Steps:

1. Checkout.
2. **Verify tag matches package.json version (Q19)** — runs **before any other step**, so a mismatch fails the workflow before any irreversible action:

   ```yaml
   - name: Verify tag matches package.json version
     run: |
       pkg_version="$(jq -r .version package.json)"
       tag_version="${GITHUB_REF_NAME#v}"
       [ "$pkg_version" = "$tag_version" ] || { echo "Mismatch: package.json=$pkg_version tag=$tag_version"; exit 1; }
   ```

3. Setup Node 20 with `registry-url: https://registry.npmjs.org` (required for NPM provenance).
4. Setup Bun via `oven-sh/setup-bun@v2` with `bun-version: 1.3.0` (Q30 — same pin as `ci.yml`).
5. `bun install --frozen-lockfile`.
6. `bun run build:all`.
7. Run the Step 4c bin-resolution smoke test against the freshly packed tarball.
8. `npm publish --provenance --access public` using `NPM_TOKEN` from GitHub Actions secrets.

Job permissions must include `id-token: write` so OIDC provenance attestation works. Document in `CONTRIBUTING.md` that publishing is tag-driven and that maintainers must generate a **fine-grained automation token** with publish rights scoped to `figma-edit-mcp` only.

### 2i. Delete the local `pub:release` script (Q32)

[package.json](../../package.json) currently has `"pub:release": "bun run build && bun publish"`. With Step 2h moving publishing to CI, the local script is misleading (no provenance, no 2FA prompt, no smoke test). **Delete the entry entirely** — no replacement, no guard, no echo. v1.5.0 is the first NPM release, so nobody outside this repo has muscle memory for `bun pub:release` to protect. The CHANGELOG `[1.5.0]` entry's "Cleanup" section notes the removal.

### 2j. Sanity sweep on related files (Q25)

- **`smithery.yaml`** ([smithery.yaml](../../smithery.yaml)) currently uses `bunx figma-edit-mcp`. Change to `npx figma-edit-mcp` for consistency with the README and `integrate.sh` defaults. Both work post-publish; consistency reduces "why does this one use bunx?" surface area.
- **`Dockerfile`** (Q25) — **delete** [Dockerfile](../../Dockerfile) from the repo root. MCP servers run inside the host process (Claude Desktop, Cursor, Antigravity) via stdio; a containerized server is not a documented use case and the existing Dockerfile is clone-based, contradicting the NPM-first model. Audited 2026-05-12: no `.dockerignore` exists, `smithery.yaml` carries no Docker block (`dockerfile:` / `runtime: container`), and the repo has no `.github/` directory yet so there are no CI jobs that build or push an image. The only related cleanup is grepping the README for any container-deployment mentions; remove if found. The CHANGELOG `[1.5.0]` entry's "Cleanup" section notes the deletion.
- **Duplicate Bun type packages** — [package.json](../../package.json) `devDependencies` lists both `@types/bun` and `bun-types`. Remove `bun-types` (superseded by `@types/bun`).

### 2k. Move `src/figma_plugin/` → `figma_plugin/` (Q15)

Q15's decision: the plugin sources move to a top-level `figma_plugin/` directory so the NPM tarball ships the layout end users actually need (`node_modules/figma-edit-mcp/figma_plugin/manifest.json`), without any path-rename plumbing in `package.json#files`.

Steps:

- `git mv src/figma_plugin figma_plugin`.
- Update `figma_plugin/build.js` (formerly `src/figma_plugin/build.js`) to emit `figma_plugin/code.js` directly — i.e., remove the intermediate `dist/` subdirectory under the plugin folder.
- `manifest.json`'s `main` / `ui` paths stay as `code.js` / `ui.html` (already relative to the manifest, so no change needed).
- Update every reference to `src/figma_plugin/...` across the repo: [README.md:181](../../README.md#L181) ("Select `figma_plugin/manifest.json`"), `scripts/integrate.sh`, `scripts/setup.sh`, `package.json` scripts (`plugin:build`, `plugin:watch`), `tsconfig.json` / path aliases, [CONTRIBUTING.draft.md](./CONTRIBUTING.draft.md) "Repository layout" section, and any AGENTS.md draft references.
- After the move, the `files` array entry `"figma_plugin"` (Step 4a) ships the directory directly; no staging copy needed.
- Confirm during Step 4c's tarball inspection that `package/figma_plugin/manifest.json`, `package/figma_plugin/code.js`, and `package/figma_plugin/ui.html` are all present.

---

## 3. CHANGELOG Updates

[CHANGELOG.md](../../CHANGELOG.md) was originally missing v1.4.0 entirely and currently contains a partial v1.5.0 stub. The release PR must rewrite both sections so the published-NPM version's CHANGELOG accurately reflects what shipped.

### 3a. Note at the top of the file
Add a clarifying note (already drafted in the current file): 1.3.0 and 1.4.0 were never published to NPM; 1.5.0 is the first registry release.

### 3b. `[1.4.0]` entry
Must cover: connect payload `path` rewrite, `get_nodes_info` parameter rename (`properties` → `fields`), recursive children response shape, `filter` / `maxDepth` parameters, `descendantCount`, `progress_update` streaming, and removal of `scan_nodes_by_types` / `scan_text_nodes`.

### 3c. `[1.5.0]` entry — full rewrite required (Q27)

**Sequencing (Q27):** the rewritten `[1.5.0]` entry is **commit #1 of the release PR**, before any code change. This locks the scope statement reviewers gate against; every subsequent commit must map to a CHANGELOG bullet. Add a PR-template-style review checklist requiring every bullet → diff mapping before approval.

The rewritten entry must cover, at minimum:

- **Release:** first version published to NPM as `figma-edit-mcp`.
- **Repository:** fork detachment, README rewrites (fork language, MCP host config snippets switched to `npx`, Hallucination Safeguards collapsed with link to `AGENTS.md`), repo-wide `fork` language sweep (Q20), topic tightening, Issues + Discussions enabled, MCP directory submissions.
- **Packaging:** new metadata (`description` aligned with GitHub About text, `keywords`, `repository`, `homepage`, `bugs`, `author`, `license`, `engines`); removal of `main` and `module` fields (Q18); `prepublishOnly` script; expanded `files` array (`LICENSE`, `CHANGELOG.md`, `DESIGN_PHILOSOPHY.md`, `AGENTS.md`, `CLAUDE.md`, `figma_plugin/`); second bin `figma-edit-mcp-socket` for the WebSocket bridge (Q6); `--version` / `--help` / `--port` flags on both bins (Q14, Q29); tsup target bump to `node20`, ESM-only output with `dts: false` (Q17), shebang banner.
- **Plugin layout:** moved `src/figma_plugin/` → top-level `figma_plugin/` (Q15). Plugin sources now live at the same path the NPM tarball ships them.
- **Agent documentation:** `DRAGME.md` retired; replaced by `AGENTS.md` (canonical, authored as `AGENTS.draft.md` in `documentation/v1.5.0 - visibility_cleanup/`) and `CLAUDE.md` (`@AGENTS.md` import).
- **Contributor experience:** `CONTRIBUTING.md` added at repo root; `bun integrate` default switched to emit `npx figma-edit-mcp` configs, with a new `--local` flag for clone-based workflows; new `--port` flag plumbed through `bun integrate`. `scripts/setup.sh` declared contributor-only with a header banner (Q24).
- **CI & supply chain:** `.github/workflows/ci.yml` (install / test / build / `npm pack` / bin smoke test / link check on push & PR; conditional `npm publish --dry-run` on packaging-file changes); `.github/workflows/publish.yml` (tag-driven `npm publish --provenance` from CI, gated by a tag-vs-package.json version-match check); both workflows pinned to Bun `1.3.0` per Q30; NPM `auth-and-writes` 2FA enabled on the maintainer account.
- **Cleanup:** removed `test_output.txt`, removed duplicate `bun-types` devDependency, consolidated stale v1.4.0 docs under `documentation/completed/`, deleted `Dockerfile` (Q25), deleted local `pub:release` script (Q32), trimmed the cosmetic "Github User" prefix from the LICENSE attribution line (Q21).

The CHANGELOG update is a required line item in the release PR; reviewers must confirm every bullet above maps to a code or doc change in the diff before approving.

---

## 4. NPM Publishing Steps (v1.5.0 — first release)

### Step 4a: Version Bump & Package Configuration
- Update the `version` field in [package.json](../../package.json) from `1.3.0` to `"1.5.0"`. (1.4.0 is intentionally skipped on the registry; the gap is documented in the CHANGELOG note from Step 3a.)
- Apply the NPM metadata additions from Step 1e, including the `description` rewrite (Q26) and the removal of `main` and `module` (Q18).
- Add the second bin entry (Q6):
  ```json
  "bin": {
    "figma-edit-mcp": "dist/server.js",
    "figma-edit-mcp-socket": "dist/socket.js"
  }
  ```
- **Delete** the `pub:release` script entry (Q32).
- Audit the `files` array. Currently `["dist", "README.md"]`. Required final state:
  ```json
  "files": [
    "dist",
    "figma_plugin",
    "README.md",
    "LICENSE",
    "CHANGELOG.md",
    "DESIGN_PHILOSOPHY.md",
    "AGENTS.md",
    "CLAUDE.md",
    ".cursorrules"
  ]
  ```
  Rationale per entry:
  - `figma_plugin/` (Q6, Q15) — ships `manifest.json`, `code.js`, `ui.html` so users installing via `npx figma-edit-mcp` can point Figma at `node_modules/figma-edit-mcp/figma_plugin/manifest.json`. After the Q15 move, no staging or path remapping is needed; the `figma_plugin/` directory ships as-is.
  - `LICENSE` — NPM auto-includes this, but listing it explicitly is safer.
  - `CHANGELOG.md` — version history visible on npmjs.com.
  - `DESIGN_PHILOSOPHY.md` — required: the README links to it (`[Read more about our design philosophy here.](DESIGN_PHILOSOPHY.md)` on line 9), so omitting it produces a broken link on the npmjs.com package page.
  - `AGENTS.md`, `CLAUDE.md`, and `.cursorrules` — consumers installing via `npx figma-edit-mcp` can point their AI assistant at `node_modules/figma-edit-mcp/AGENTS.md` (Q4). `CLAUDE.md` and `.cursorrules` are tool-specific discovery files that resolve back to `AGENTS.md`; shipping all three preserves parity across the major coding-agent hosts. `.github/copilot-instructions.md` is intentionally **not** in `files` — it's a repo-level convention for Copilot when the project is opened directly in an editor, not relevant inside `node_modules/`.
- Add a `prepublishOnly` script: `"prepublishOnly": "bun run build:all"` — guarantees a fresh `dist/` and plugin bundle on every publish and prevents stale-build mistakes (Q23). Defense in depth even with CI-driven publishing (Step 4d), since it also fires on any developer-laptop `npm publish` attempt.

### Step 4b: Build the Project
```bash
bun run build:all
```
Verify that the generated `dist/server.js`, `dist/socket.js`, and the Figma plugin bundle under `figma_plugin/` are built without errors.

### Step 4c: Dry-Run Verification (Mandatory Pre-Publish Gate)
A published NPM version is effectively irrevocable (the unpublish window is 72 hours and discouraged). Two checks are mandatory: tarball inspection, then a bin-resolution smoke test against the packed artifact.

**Tarball inspection:**
```bash
npm pack
tar -tzf figma-edit-mcp-1.5.0.tgz
```

Manually confirm the tarball contains:
- `package/dist/server.js` (with `#!/usr/bin/env node` as the first line)
- `package/dist/socket.js` (with shebang)
- **No `*.cjs`, `*.cjs.map`, `*.d.ts`, or `*.d.cts` files anywhere under `package/dist/`** (Q17 acceptance — ESM-only, no type declarations).
- `package/figma_plugin/manifest.json`, `package/figma_plugin/code.js`, `package/figma_plugin/ui.html` (Q15 layout).
- `package/README.md` (correct case — would have caught the readme casing bug in Step 1d)
- `package/LICENSE`
- `package/CHANGELOG.md`
- `package/DESIGN_PHILOSOPHY.md`
- `package/AGENTS.md`
- `package/CLAUDE.md`
- `package/.cursorrules`
- `package/package.json` with the correct `version`, both bins, the full metadata set from Step 1e, **and no `main` or `module` fields** (Q18 acceptance), **no `pub:release` script** (Q32 acceptance).

Optionally also run `npm publish --dry-run` to see what the registry would receive without actually publishing. (CI does this automatically on packaging-file changes per Q31 / Step 2g.)

**Bin-resolution smoke test (Q14):**
```bash
# In a scratch directory outside the repo:
mkdir /tmp/figma-edit-mcp-smoketest && cd /tmp/figma-edit-mcp-smoketest
npm init -y
npm install --no-save /path/to/figma-edit-mcp-1.5.0.tgz
npx figma-edit-mcp --version          # exits 0 without opening stdio
npx figma-edit-mcp-socket --version   # exits 0 without binding the WebSocket port
npx figma-edit-mcp-socket --port 4000 --help   # confirms --port flag accepted
```

This catches `bin` path typos, missing or non-executable shebangs, `files`-array omissions, and runtime-dependency gaps that the `tar -tzf` listing cannot detect. Both bins must print a version string and exit 0; any other behavior blocks the publish.

The CI workflows (Step 2g for PRs, Step 2h for publish) run the same smoke test against their freshly built tarballs.

### Step 4d: Publish to NPM (CI-driven, with provenance)

Publishing happens in the CI workflow added in Step 2h — **not from a developer laptop**. This is required to (a) generate NPM provenance attestation (Q11) and (b) ensure every published artifact comes from a reproducible CI build.

**One-time setup before the first publish:**
- Enable **`auth-and-writes` 2FA** on the NPM publishing account (Q10). This is the industry baseline for any package installed by others. The extra prompt at publish time is trivial relative to the blast radius of a compromised publish.
- Generate a fine-grained NPM **automation token** scoped to the `figma-edit-mcp` package with publish rights.
- Add the token as `NPM_TOKEN` in GitHub Actions repository secrets.
- Confirm the publish workflow has `permissions: { id-token: write, contents: read }` (required for OIDC-based provenance).

**Publishing v1.5.0:**
1. Verify the release PR is merged to `main` and CI is green.
2. From `main`: `git tag v1.5.0 && git push origin v1.5.0`.
3. The `publish.yml` workflow triggers automatically. The tag-vs-package.json version check (Q19) runs first; if `package.json#version` is not exactly `1.5.0`, the workflow fails immediately. On success, the workflow runs Step 4c's smoke test against the freshly packed tarball, then runs:
   ```bash
   npm publish --provenance --access public
   ```
4. Verify the successful publication at `https://www.npmjs.com/package/figma-edit-mcp`:
   - The README renders correctly with all internal links resolving.
   - The green **Provenance** badge appears on the package page.
   - The `Maintainer` card shows the `author` metadata from Step 1e.
5. The local `pub:release` script (Step 2i) has been deleted — confirm via `git show v1.5.0:package.json` that no `pub:release` entry exists.

`--access public` is the default for unscoped names but is included explicitly to future-proof against scope changes.

### Step 4e: GitHub Release

The tag push from Step 4d already triggered the publish workflow. Once NPM publish succeeds, create a GitHub Release for `v1.5.0`. The Release page is itself an indexable URL — this compounds with Section 1's visibility work.

**Release body format (Q13):**

```markdown
**Install:** `npx figma-edit-mcp`  *(see [CONTRIBUTING.md](./CONTRIBUTING.md) for the local-dev workflow)*

[paste the full CHANGELOG [1.5.0] content from Step 3c]
```

The install one-liner converts traffic arriving from Smithery/MCP.so/Glama listings and search-engine snippets. The CONTRIBUTING.md pointer covers the contributor audience without bloating the lede.

---

## 5. Verification Checklist

After completing Sections 1–4, confirm each item:

### Visibility (Section 1)
- [ ] `view-source:https://github.com/neozhehan/figma-edit-mcp` no longer contains `<meta name="robots" content="noindex">`
- [ ] Page no longer shows "forked from grab/cursor-talk-to-figma-mcp" under the repo name
- [ ] `meta-octolytics-dimension-repository_is_fork` in the HTML is `false`
- [ ] All four README edits from Step 1b have landed (two fork-language, the `npx` config snippets, and the Hallucination Safeguards collapse)
- [ ] Repo-wide `fork` language sweep (Q20) completed; no remaining fork-status assertions in shipped docs (CHANGELOG, DESIGN_PHILOSOPHY.md, smithery.yaml, plugin README)
- [ ] LICENSE retains both `Copyright (c) 2025 sonnylazuardi` and `Copyright (c) 2026 Neo Product LLC` lines (Q21)
- [ ] `package.json#description` matches the GitHub About text verbatim (Q26)
- [ ] NPM + CI badges render on the GitHub README
- [ ] `site:github.com/neozhehan/figma-edit-mcp` returns results on Google within ~7 days

### Cleanup & new files (Section 2)
- [ ] `DRAGME.md` deleted; `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, and `.github/copilot-instructions.md` present at repo root; `CLAUDE.md` is exactly `@AGENTS.md`; `.cursorrules` and `.github/copilot-instructions.md` each contain a one-paragraph pointer to `AGENTS.md`; `AGENTS.md` was promoted from [AGENTS.draft.md](./AGENTS.draft.md) with `../../` → `./` link rewrites
- [ ] `CONTRIBUTING.md` present at repo root (promoted from the draft) with `../../` → `./` link rewrites; markdown link checker green (Q16)
- [ ] `src/figma_plugin/` moved to top-level `figma_plugin/`; all `src/figma_plugin/...` references updated (Q15)
- [ ] `tsup.config.ts` emits both `dist/server.js` and `dist/socket.js`, target = `node20`, shebang banner applied, `format: ['esm']`, `dts: false` (Q17)
- [ ] `--version` / `--help` / `--port` work on both bins; `--version` exits without opening transports (Q14, Q29)
- [ ] `scripts/integrate.sh` default emits `npx`-based config; `--local` flag emits the clone-based template; `--port` flag plumbed through (Q29)
- [ ] `scripts/setup.sh` carries the contributor-only header banner (Q24)
- [ ] `.github/workflows/ci.yml` runs install/test/build/`npm pack`/bin smoke test/link check on push and PR; `npm publish --dry-run` job runs on packaging-file changes; pinned to Bun `1.3.0`; badge is green (Q12, Q16, Q22, Q30, Q31)
- [ ] Three pre-existing test failures (Contract F × 2, Phase 4 §3a) fixed before tagging — CI is green on main (Q30 follow-up)
- [ ] `.github/workflows/publish.yml` triggers on `v*` tags, runs the tag-vs-package.json version check first, then the smoke test, then `npm publish --provenance`; pinned to Bun `1.3.0` (Q11, Q19, Q30)
- [ ] `smithery.yaml` uses `npx figma-edit-mcp`; `Dockerfile` and any related artifacts deleted (Q25); `bun-types` removed from devDependencies
- [ ] `pub:release` script deleted from `package.json` (Q32)

### Publish (Sections 3–4)
- [ ] CHANGELOG `[1.5.0]` rewrite is commit #1 of the release PR (Q27); every bullet maps to a diff entry
- [ ] CHANGELOG entries for `[1.4.0]` and `[1.5.0]` match the requirements in Section 3 (full Section 3c bullet list mapped to diff)
- [ ] `package.json` has the correct version, both bins, full metadata, and **no** `main` / `module` / `pub:release` entries (Q18, Q32 acceptance)
- [ ] `npm pack` tarball inspection passed (every Step 4c bullet checked, including the negative-presence checks for `*.cjs` / `*.d.ts`)
- [ ] Bin-resolution smoke test passed for both `figma-edit-mcp` and `figma-edit-mcp-socket`, including `--port 4000 --help` acceptance
- [ ] NPM `auth-and-writes` 2FA active on the publishing account; `NPM_TOKEN` configured in GitHub Actions secrets
- [ ] `v1.5.0` git tag pushed; tag-vs-version check passed (Q19); `publish.yml` workflow succeeded
- [ ] npmjs.com package page shows the README with working internal links and the green Provenance badge
- [ ] GitHub Release for `v1.5.0` published with the Step 4e body format

### Discovery (Section 1g, post-publish)
- [ ] Smithery, MCP.so, Glama, GitHub MCP Registry submissions accepted
- [ ] Google Search Console indexing requested for the repo and README URLs
