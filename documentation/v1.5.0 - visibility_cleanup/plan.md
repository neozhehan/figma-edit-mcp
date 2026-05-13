# v1.5.0 — Visibility, Cleanup, and First NPM Release: Implementation Plan

This plan executes [spec.md](./spec.md) using decisions ratified in [questions.md](./questions.md) (Q1–Q32). Phases are ordered for safe execution: external prerequisites first, then `main`-branch prep, then the release PR (CHANGELOG as commit #1 per Q27), then tag-driven publish, then post-publish discovery.

---

## Phase 0 — External prerequisites (run in parallel with Phase 1)

These do not block code changes but must be done before tagging.

- [x] **Open GitHub Support ticket** (category: "Repositories") requesting detachment of `neozhehan/figma-edit-mcp` from `grab/cursor-talk-to-figma-mcp`. Cite divergence: hallucination safeguards, unique workflows, rewritten tools. *(Verified 2026-05-12 via `gh api`: `fork: false`, `parent: null`, `source: null`.)*
- [ ] **Tighten GitHub repo topics** to: `mcp`, `mcp-server`, `figma`, `figma-plugin`, `model-context-protocol`, `design-automation`.
- [ ] **Enable Issues and Discussions** in repo Settings.
- [ ] **Keep the current "About" description** unchanged (it functions as the meta description and matches the planned `package.json#description`).
- [ ] **Enable NPM `auth-and-writes` 2FA** on the publishing account (Q10).
- [ ] **Generate a fine-grained NPM automation token** scoped to `figma-edit-mcp` with publish rights.
- [ ] **Add the token as `NPM_TOKEN`** in GitHub Actions repository secrets.

---

## Phase 1 — Fix pre-existing test failures on `main` (Q30 follow-up)

These must land on `main` before the release PR is opened so CI passes on the release PR itself.

- [ ] Update `Contract F — v1.4.0 release notes file exists with required sections > leads with the migration-required / connect-payload break framing` test to point at `documentation/completed/v1.4.0 - get_nodes_info_update/` (new path).
- [ ] Apply the same path fix to `Contract F — … > documents the scan_text_nodes / scan_nodes_by_types removals with migration guidance`.
- [ ] Fix `Phase 4 §3a (direct invocation): getConnectPayload — page scope > loads exactly the scoped page (no loadAllPagesAsync)` by replacing the `expect(...).toEqual(...)` with a key-order-insensitive assertion (e.g. `expect.objectContaining` or sorted-key normalization), or by emitting `descendantCount` in the expected key order.
- [ ] Run `bun test` locally; all three previously-red tests must pass, no regressions.
- [ ] Open a PR with only these three test fixes, merge to `main`.

**Exit criteria:** `bun test` green on `main`.

---

## Phase 2 — Open release branch; CHANGELOG rewrite as commit #1 (Q27)

All subsequent phases are commits on the release branch. Per Q27 the CHANGELOG `[1.5.0]` rewrite lands first so every later commit maps to one of its bullets.

- [ ] Create branch `feature/v1.5.0-visibility-cleanup` (already current per `git status`).
- [ ] **Commit #1 — CHANGELOG rewrite only.** Edit [CHANGELOG.md](../../CHANGELOG.md):
  - [ ] Retain/refine the top-of-file note: 1.3.0 and 1.4.0 were never published to NPM; 1.5.0 is the first registry release.
  - [ ] Rewrite `[1.4.0]` entry covering: connect payload `path` rewrite, `get_nodes_info` parameter rename (`properties` → `fields`), recursive children response shape, `filter` / `maxDepth` parameters, `descendantCount`, `progress_update` streaming, removal of `scan_nodes_by_types` / `scan_text_nodes`.
  - [ ] Rewrite `[1.5.0]` entry covering: first NPM publish; repository changes (fork detachment, README rewrites, `fork` sweep, topics, Issues+Discussions, MCP directory submissions); packaging (`description`, `keywords`, `repository`, `homepage`, `bugs`, `author`, `license`, `engines`; removal of `main`/`module` per Q18; `prepublishOnly`; expanded `files` array; second bin `figma-edit-mcp-socket` per Q6; `--version`/`--help`/`--port` flags per Q14, Q29; tsup `node20` target, ESM-only, `dts: false` per Q17; shebang banner); plugin layout move (Q15); agent docs (`DRAGME.md` retired, `AGENTS.md`+`CLAUDE.md` added); contributor experience (`CONTRIBUTING.md`, `bun integrate` `--local` and `--port` flags, contributor-only banner on `setup.sh` per Q24); CI/supply chain (`ci.yml`, `publish.yml`, Bun 1.3.0 pin per Q30, NPM 2FA per Q10); cleanup (`test_output.txt`, `bun-types`, stale v1.4.0 docs, `Dockerfile` per Q25, `pub:release` per Q32, LICENSE prefix trim per Q21).
- [ ] **Add a release-PR review checklist** (PR template comment or PR body) requiring each `[1.5.0]` bullet → diff mapping be confirmed before approval.

---

## Phase 3 — Codebase cleanup (deletions + plugin move)

- [ ] Confirm `test_output.txt` deletion is staged (already `D` in `git status`); keep staged.
- [ ] Confirm deletion of `documentation/v1.4.0 - get_nodes_info_update/` is staged (already `D` in `git status`) — the files were moved to `documentation/completed/v1.4.0 - get_nodes_info_update/`.
- [ ] Sweep for any other temporary build files or un-ignored logs (`*.log`); remove if present.
- [ ] **`git mv src/figma_plugin figma_plugin`** (Q15).
- [ ] Edit `figma_plugin/build.js` to emit `figma_plugin/code.js` directly (remove the intermediate `dist/` subdirectory under the plugin folder). `manifest.json` `main`/`ui` paths remain `code.js`/`ui.html`.
- [ ] Grep for and update every `src/figma_plugin/...` reference across the repo, including:
  - [ ] [README.md:181](../../README.md#L181) — change to "Select `figma_plugin/manifest.json`".
  - [ ] `scripts/integrate.sh` and `scripts/setup.sh`.
  - [ ] `package.json` scripts (`plugin:build`, `plugin:watch`).
  - [ ] `tsconfig.json` paths / aliases.
  - [ ] [CONTRIBUTING.draft.md](./CONTRIBUTING.draft.md) "Repository layout" section.
  - [ ] Any `AGENTS.draft.md` references.
- [ ] **Delete `Dockerfile`** at repo root (Q25). Verify no `.dockerignore` exists, no Docker block in `smithery.yaml`, no Docker-image CI jobs. Grep the README for container/Docker deployment mentions; remove if found.
- [ ] **Delete `DRAGME.md`** (replaced in Phase 6).
- [ ] Run `bun run build:all` locally; confirm plugin builds at new path.

---

## Phase 4 — Build configuration (Q6, Q17)

Edit [tsup.config.ts](../../tsup.config.ts):

- [ ] Add `src/socket.ts` to the `entry` array so tsup emits `dist/socket.js`.
- [ ] Change `format: ['cjs', 'esm']` → `format: ['esm']`.
- [ ] Set `dts: false` (or remove the `dts` line entirely).
- [ ] Bump `target` from `'node18'` → `'node20'` to match `engines.node`.
- [ ] Add a `banner` block:

  ```ts
  banner: { js: '#!/usr/bin/env node' }
  ```

- [ ] Run `bun run build:all`; confirm `dist/server.js` and `dist/socket.js` both exist, both begin with `#!/usr/bin/env node` on line 1, and no `*.cjs`, `*.d.ts`, or `*.d.cts` files are emitted under `dist/`.

---

## Phase 5 — CLI flags on both bins (Q14, Q29)

Edit [src/mcp_server/server.ts](../../src/mcp_server/server.ts) and `src/socket.ts`. Add a top-of-`main` argv check shared by both bins:

- [ ] **`--version`** — read `version` from `package.json`, print one line, exit 0 **before** opening the stdio transport or binding the WebSocket.
- [ ] **`--help`** — print a one-paragraph usage block naming `--version`, `--help`, and `--port`; exit 0.
- [ ] **`--port <n>`** — override the default WebSocket bridge port (`3055`). Env fallback: `FIGMA_EDIT_MCP_SOCKET_PORT`. Both bins must read the same source so they negotiate the same port.
- [ ] Add a port field in the Figma plugin UI (under `figma_plugin/`) defaulting to `3055` so the user can match whatever port the bridge listens on.
- [ ] Acceptance (local):
  - [ ] `bun run dist/server.js --version` → one version line, exit 0.
  - [ ] `bun run dist/socket.js --version` → one version line, exit 0, no port bind.
  - [ ] `--help` on each lists all three flags.
  - [ ] `--port 4000` causes both bins to use port 4000 without errors.

---

## Phase 6 — Agent / contributor documentation (Q4, Q16, Q28)

- [ ] **Promote `AGENTS.draft.md` → `AGENTS.md` at repo root.**
  - [ ] Remove the draft banner.
  - [ ] Rewrite every `../../` relative link to `./` (e.g., `../../README.md` → `./README.md`, `../../package.json` → `./package.json`).
  - [ ] Scope (per Q4): hallucination safeguards as hard constraints with full error-code taxonomy; tool-selection guidance (`get_nodes_info` `filter`/`fields`/`maxDepth`, batch vs. single-item); discover-before-acting pattern; per-error-code response playbook; tripartite framing (Plugin enforces, Agent orchestrates, Designer decides). Out of scope: install/setup, repo development.
- [ ] **Create `CLAUDE.md`** at repo root containing exactly one line: `@AGENTS.md`.
- [ ] **Create `.cursorrules`** at repo root with the pointer paragraph:

  ```
  See AGENTS.md for the canonical rules, error-code taxonomy, and tool-selection guidance. Treat that file as authoritative; do not duplicate its content here.
  ```

- [ ] **Create `.github/copilot-instructions.md`** with the same one-paragraph pointer to `AGENTS.md`.
- [ ] **Promote `CONTRIBUTING.draft.md` → `CONTRIBUTING.md` at repo root** (Q7, Q8).
  - [ ] Rewrite every `../../` relative link to `./`.
  - [ ] Add a "Local development setup" note confirming `bun setup` is contributor-only (Q24).
  - [ ] Add a release-section paragraph explaining `prepublishOnly` (Q23): runs only on `npm publish` / `bun publish`, never on `bun install`, defense in depth.
  - [ ] Add a line documenting the tag-naming contract (Q19): `v<X.Y.Z>` must match `package.json#version` exactly; CI verifies this before any publish step.
  - [ ] Add a line documenting `figma-edit-mcp-socket --port <n>` (Q29): default `3055`, env fallback `FIGMA_EDIT_MCP_SOCKET_PORT`.
  - [ ] Document that publishing is tag-driven and that maintainers must use a fine-grained automation token scoped to `figma-edit-mcp` only.

---

## Phase 7 — Scripts (Q8, Q24, Q29)

- [ ] Edit [scripts/integrate.sh](../../scripts/integrate.sh):
  - [ ] Replace hardcoded `bun run $PROJECT_DIR/dist/server.js` with default `"command": "npx", "args": ["figma-edit-mcp"]` for all integrations (Antigravity, VS Code, Cursor, Claude Desktop).
  - [ ] Add `--local` flag that restores the clone-based template (`bun run $PROJECT_DIR/dist/server.js`).
  - [ ] Add `--port <n>` flag that appends `--port <n>` to the generated config's `args`.
  - [ ] At [scripts/integrate.sh:191](../../scripts/integrate.sh#L191), print `claude mcp add FigmaEdit npx figma-edit-mcp` by default; clone-based form under `--local`; append `--port` to both forms when supplied.
  - [ ] At [scripts/integrate.sh:202](../../scripts/integrate.sh#L202), rebuild the LM Studio deeplink config from the same default/local/port toggles.
  - [ ] Document `--local` and `--port` in the script's help/usage output.
- [ ] Edit [scripts/setup.sh](../../scripts/setup.sh): add the contributor-only banner at the very top:

  ```bash
  # ------------------------------------------------------------
  # Contributor-only setup script.
  # End users should run `npx figma-edit-mcp` instead.
  # See CONTRIBUTING.md for the local-development workflow.
  # ------------------------------------------------------------
  ```

---

## Phase 8 — `package.json` (Q1, Q2, Q3, Q6, Q17, Q18, Q23, Q26, Q32)

Edit [package.json](../../package.json):

- [ ] Bump `"version"`: `1.3.0` → `"1.5.0"`.
- [ ] Set `"description"`: `"Connect AI assistants to Figma via MCP — Read, Create, & Modify designs programmatically"` (must match the GitHub About text verbatim per Q26).
- [ ] Set `"keywords"`: `["mcp", "mcp-server", "figma", "figma-plugin", "model-context-protocol", "design-automation", "ai", "claude", "cursor"]`.
- [ ] Set `"repository"`: `{ "type": "git", "url": "git+https://github.com/neozhehan/figma-edit-mcp.git" }`.
- [ ] Set `"homepage"`: `"https://github.com/neozhehan/figma-edit-mcp#readme"`.
- [ ] Set `"bugs"`: `{ "url": "https://github.com/neozhehan/figma-edit-mcp/issues" }`.
- [ ] Set `"author"`: `{ "name": "Neo Product LLC", "email": "neo@neo.works", "url": "https://www.linkedin.com/in/zhehanneo/" }`.
- [ ] Set `"license"`: `"MIT"`.
- [ ] Set `"engines"`: `{ "node": ">=20", "bun": ">=1.3.0" }`.
- [ ] **Remove `"main"` and `"module"`** entirely (Q18).
- [ ] Set `"bin"`:

  ```json
  "bin": {
    "figma-edit-mcp": "dist/server.js",
    "figma-edit-mcp-socket": "dist/socket.js"
  }
  ```

- [ ] Set `"files"`:

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

- [ ] Add `"prepublishOnly": "bun run build:all"`.
- [ ] **Delete the `"pub:release"` script entry** entirely (Q32).
- [ ] Remove `"bun-types"` from `devDependencies` (duplicated by `@types/bun`).

---

## Phase 9 — README + repo-wide doc updates (Q7, Q9, Q20, Q21)

- [ ] Confirm `git mv readme.md README.md` is staged (already `R` in `git status`); keep staged.
- [ ] Edit [README.md](../../README.md):
  - [ ] Add badges block at the very top:

    ```markdown
    [![npm version](https://img.shields.io/npm/v/figma-edit-mcp.svg)](https://www.npmjs.com/package/figma-edit-mcp)
    [![npm downloads](https://img.shields.io/npm/dm/figma-edit-mcp.svg)](https://www.npmjs.com/package/figma-edit-mcp)
    [![CI](https://github.com/neozhehan/figma-edit-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/neozhehan/figma-edit-mcp/actions/workflows/ci.yml)
    ```

  - [ ] At ~line 343, change `"This fork adds multiple layers of protection..."` → `"Figma Edit MCP adds multiple layers of protection..."`.
  - [ ] At ~lines 389–390, replace `"This project is a fork of [grab/cursor-talk-to-figma-mcp]... Thank you to the original authors..."` with: `"Built on prior work by [sonnylazuardi](https://github.com/sonnylazuardi) and the contributors to [grab/cursor-talk-to-figma-mcp](https://github.com/grab/cursor-talk-to-figma-mcp). Thank you for the foundation this project builds on."`
  - [ ] At [README.md:115](../../README.md#L115): replace `claude mcp add FigmaEdit bun run /path/to/figma-edit-mcp/dist/server.js` with `claude mcp add FigmaEdit npx figma-edit-mcp`.
  - [ ] At ~lines 140–150 ("Manual Configuration" JSON block): replace clone-based command with `{ "command": "npx", "args": ["figma-edit-mcp"] }`.
  - [ ] Replace all other surviving hits from `grep -n 'path/to/figma-edit-mcp' README.md` with the `npx` form.
  - [ ] Append below the configuration section: `Running from a local clone? See [CONTRIBUTING.md](./CONTRIBUTING.md) for the --local workflow.` (Use `./`, not `../` — Q16.)
  - [ ] At [README.md:341](../../README.md#L341), replace the ~50-line Hallucination Safeguards section with:

    ```markdown
    ## Hallucination Safeguards
    The plugin enforces hard constraints (scope locking, name verification, batch validation) that AI agents cannot bypass. See [AGENTS.md](./AGENTS.md) for the full rules and error codes.
    ```

- [ ] **Repo-wide `fork` language sweep** (Q20). Run:

  ```bash
  grep -rni 'fork' . --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git --exclude-dir=figma_plugin/dist
  ```

  Human-review every hit; update or remove phrasing that re-asserts fork status. Leave technical references (`os.fork`, `fork()` syscall) alone. Expect edits in [CHANGELOG.md](../../CHANGELOG.md), [DESIGN_PHILOSOPHY.md](../../DESIGN_PHILOSOPHY.md), [smithery.yaml](../../smithery.yaml), and `figma_plugin/README.md`.
- [ ] **`smithery.yaml`**: change `bunx figma-edit-mcp` → `npx figma-edit-mcp`.
- [ ] **LICENSE check** (Q21): confirm lines 3–4 are exactly:

  ```
  Copyright (c) 2025 sonnylazuardi
  Copyright (c) 2026 Neo Product LLC
  ```

  Trim the cosmetic "Github User" prefix on the original line if still present.

---

## Phase 10 — CI workflow (Q12, Q16, Q22, Q30, Q31)

Create `.github/workflows/ci.yml`, triggered on `push` to `main` and on `pull_request`:

- [ ] Checkout.
- [ ] Setup Bun via `oven-sh/setup-bun@v2` with `bun-version: 1.3.0`.
- [ ] `bun install --frozen-lockfile`.
- [ ] `bun test`.
- [ ] `bun run build:all`.
- [ ] `npm pack`.
- [ ] **Bin-resolution smoke test**: in a scratch directory, `npm install --no-save` the packed tarball, then run `npx figma-edit-mcp --version` and `npx figma-edit-mcp-socket --version`. Both must exit 0.
- [ ] **Markdown link checker** (`lychee-action` or `gaurav-nelson/github-action-markdown-link-check`) against tracked `*.md` files at the repo root and under `documentation/`, with an ignore list for rate-limit-prone hosts.

Add a **second job** gated on `paths:` filter for `package.json`, `tsup.config.ts`, `figma_plugin/build.js`, and `scripts/integrate.sh`:

- [ ] `npm publish --dry-run` — log tarball-contents listing for human review. Informational, no token, no side effects.

---

## Phase 11 — Publish workflow (Q11, Q19, Q30)

Create `.github/workflows/publish.yml`, triggered on `v*` tag pushes. Job permissions: `id-token: write`, `contents: read`.

- [ ] Checkout.
- [ ] **Tag-vs-version check (runs first, before any other step):**

  ```yaml
  - name: Verify tag matches package.json version
    run: |
      pkg_version="$(jq -r .version package.json)"
      tag_version="${GITHUB_REF_NAME#v}"
      [ "$pkg_version" = "$tag_version" ] || { echo "Mismatch: package.json=$pkg_version tag=$tag_version"; exit 1; }
  ```

- [ ] Setup Node 20 with `registry-url: https://registry.npmjs.org`.
- [ ] Setup Bun via `oven-sh/setup-bun@v2` with `bun-version: 1.3.0`.
- [ ] `bun install --frozen-lockfile`.
- [ ] `bun run build:all`.
- [ ] Run the bin-resolution smoke test (same as Phase 10) against the freshly packed tarball.
- [ ] `npm publish --provenance --access public` using `NPM_TOKEN` from secrets.

---

## Phase 12 — Pre-publish verification (Phase 4c gate)

After Phases 2–11 are committed to the release branch and CI is green:

- [ ] Locally: `bun run build:all`.
- [ ] `npm pack`.
- [ ] `tar -tzf figma-edit-mcp-1.5.0.tgz`. Confirm presence of:
  - [ ] `package/dist/server.js` and `package/dist/socket.js`, both with `#!/usr/bin/env node` on line 1.
  - [ ] `package/figma_plugin/manifest.json`, `package/figma_plugin/code.js`, `package/figma_plugin/ui.html`.
  - [ ] `package/README.md` (correct case), `package/LICENSE`, `package/CHANGELOG.md`, `package/DESIGN_PHILOSOPHY.md`, `package/AGENTS.md`, `package/CLAUDE.md`, `package/.cursorrules`.
  - [ ] `package/package.json` with `version: 1.5.0`, both bins, full metadata; **no `main`, no `module`, no `pub:release`**.
  - [ ] **No `*.cjs`, `*.cjs.map`, `*.d.ts`, or `*.d.cts` files anywhere under `package/dist/`**.
- [ ] Bin-resolution smoke test:

  ```bash
  mkdir /tmp/figma-edit-mcp-smoketest && cd /tmp/figma-edit-mcp-smoketest
  npm init -y
  npm install --no-save /path/to/figma-edit-mcp-1.5.0.tgz
  npx figma-edit-mcp --version
  npx figma-edit-mcp-socket --version
  npx figma-edit-mcp-socket --port 4000 --help
  ```

  All three commands must exit 0.

---

## Phase 13 — Merge release PR; tag and publish (Q11, Q13, Q19)

- [ ] Confirm every `[1.5.0]` CHANGELOG bullet maps to a diff entry in the release PR; reviewer signs the mapping checklist.
- [ ] Merge release PR to `main`.
- [ ] From `main`:

  ```bash
  git tag v1.5.0
  git push origin v1.5.0
  ```

- [ ] The `publish.yml` workflow runs. On success, verify at `https://www.npmjs.com/package/figma-edit-mcp`:
  - [ ] README renders with all internal links resolving (`AGENTS.md`, `CONTRIBUTING.md`, `DESIGN_PHILOSOPHY.md`).
  - [ ] Green **Provenance** badge present.
  - [ ] Maintainer card shows the `author` metadata.
- [ ] `git show v1.5.0:package.json` — confirm no `pub:release` script.
- [ ] **Create GitHub Release for `v1.5.0`** with body (Q13):

  ```markdown
  **Install:** `npx figma-edit-mcp`  *(see [CONTRIBUTING.md](./CONTRIBUTING.md) for the local-dev workflow)*

  [paste full CHANGELOG [1.5.0] content]
  ```

---

## Phase 14 — Post-publish discovery

Run only after Phase 13's publish succeeds (Smithery/MCP.so/Glama configs depend on `npx figma-edit-mcp` resolving against the registry).

- [ ] **Google Search Console**: add `https://github.com/neozhehan/figma-edit-mcp`; request indexing for the root URL and `/blob/main/README.md`.
- [ ] Submit listings to **Smithery**, **MCP.so**, **Glama**, and the **GitHub MCP Registry**.
- [ ] Post launch announcements to **LinkedIn**, **X/Bluesky**, and relevant **Discord** servers to acquire stars and backlinks.

---

## Phase 15 — Final verification against spec.md §5 checklist

Walk the full Section 5 checklist in [spec.md](./spec.md#5-verification-checklist). Every box must be checked:

- [ ] **Visibility:** `view-source:` shows no `noindex`; no "forked from" banner; `meta-octolytics-dimension-repository_is_fork` is `false`; all four README edits landed; repo-wide `fork` sweep done; LICENSE retains both copyright lines; `package.json#description` matches GitHub About verbatim; NPM+CI badges render; Google `site:` query returns results within ~7 days.
- [ ] **Cleanup & new files:** `DRAGME.md` deleted; `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.github/copilot-instructions.md` present with the specified content; `CONTRIBUTING.md` promoted with rewritten relative links; `src/figma_plugin/` moved; `tsup.config.ts` matches Phase 4 spec; `--version`/`--help`/`--port` work on both bins; `integrate.sh` and `setup.sh` updated; `ci.yml` and `publish.yml` present, green, pinned to Bun `1.3.0`; three pre-existing test failures fixed; `smithery.yaml` uses `npx`; `Dockerfile` deleted; `bun-types` removed; `pub:release` deleted.
- [ ] **Publish:** CHANGELOG rewrite was commit #1; `package.json` correct (no `main`/`module`/`pub:release`); tarball inspection passed; smoke test passed; 2FA active; `NPM_TOKEN` configured; tag pushed; provenance badge visible; GitHub Release published.
- [ ] **Discovery:** Smithery/MCP.so/Glama/GitHub MCP Registry submissions accepted; Search Console indexing requested.
