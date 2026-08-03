# Contributing to figma-edit-mcp

Thanks for your interest in contributing. This document is for **people working on figma-edit-mcp itself** — fixing bugs, adding tools, or improving the plugin. If you just want to *use* the MCP server with an AI assistant, follow the install instructions in the [README](./README.md) and ignore this file.

---

## Prerequisites

- **Bun** `>=1.3.0` — the project toolchain. See [bun.sh](https://bun.sh) for install.
- **Node** `>=20` — the runtime target the server is compiled for. Used for smoke-testing the published artifact.
- **Figma desktop app** — the plugin loads from disk via "Plugins → Development → Import plugin from manifest," which the web app does not support.
- **A Figma file you can edit** — for end-to-end testing.

---

## Repository layout

```
src/
  mcp_server/        # MCP server (stdio transport) — exposes tools to AI hosts
  figma_plugin/      # Figma plugin (TypeScript + ui.html) — enforces safeguards
  socket.ts          # WebSocket bridge between server and plugin
scripts/
  setup.sh           # First-time local setup
  integrate.sh       # Generates MCP host config snippets
dist/                # Build output (gitignored)
documentation/       # Specs, plans, and release notes per version
```

---

## Local development setup

> **Note:** The `bun setup` script is strictly for contributors to initialize their local workspace. End users should never run it; they should use `npx figma-edit-mcp` instead.

```bash
git clone https://github.com/neozhehan/figma-edit-mcp.git
cd figma-edit-mcp
bun install
bun run build:all          # builds dist/server.js, dist/socket.js, dist/code.js
```

To wire the local build into your MCP host (Claude Desktop, Cursor, etc.):

```bash
bun integrate --local
```

The `--local` flag emits configs that point at `dist/server.js` in your clone, not at the published `npx figma-edit-mcp` binary. Without the flag, `integrate` defaults to the NPM install path — the right behavior for end users, the wrong one for contributors.

To load the plugin into Figma:

1. Open the Figma desktop app.
2. Menu → **Plugins → Development → Import plugin from manifest**.
3. Select `figma_plugin/manifest.json` from your clone.

---

## Day-to-day workflow

In one terminal, start the WebSocket bridge:

```bash
bun socket
```

*(You can override the bridge port with `bun socket --port <n>` (or `figma-edit-mcp-socket --port <n>` when running from the installed package). The default is `3055`, which can also be set via the `FIGMA_EDIT_MCP_SOCKET_PORT` environment variable.)*

In another, watch for source changes:

```bash
bun run build:watch
```

Your MCP host (configured via `bun integrate --local` above) launches the server on demand. The plugin connects to the bridge over `ws://localhost:3055` when you run it inside Figma.

End-to-end smoke test: open a Figma file → run the plugin → ask your AI assistant to call a tool (e.g. `page_info`) → confirm a response comes back.

---

## Tests

```bash
bun test                   # all server tests
bun test src/mcp_server/tests/<file>.test.ts   # one file
```

Tests run against in-memory mocks; no Figma connection required. Please add or update tests for any tool change. See existing tests in `src/mcp_server/tests/` for the established patterns.

### Red-proof every regression you add

**A test that passes both before and after your fix is not a guard.** Before you consider a fix done, break the production line on purpose — delete the guard, revert the key, restore the old branch — and confirm that a test fails. Then restore it. If nothing failed, the regression does not cover the line it was written to protect.

This is not a hypothetical. Three consecutive reviews of the same area shipped a **correct** fix alongside a regression that never entered the line it protected:

- A producer was pinned by a regular expression over handler source, so it checked spelling rather than behaviour.
- A seam test drove the real coordinator and the real consumer but never called the handler between them, so a handler-local edit was invisible.
- A guard was covered only on the code path where it is inert, because an earlier layer already normalized the value; deleting the guard broke nothing.

Each was found by mutating the production line and watching the suite stay green. Reading the tests would not have revealed any of them — they looked thorough. Budget a minute for the mutation; it is the cheapest check available and the only one that answers "does this test actually work?"

When a mutation red-proof is recorded in a review, state which tests failed and how many, so the claim is reproducible.

### Never use code to check non-code files

**No test and no CI script asserts over documentation.** Not `CHANGELOG.md`, not `SAFETY.md`, not the `skills/figma-edit/references/` guides, not a PRD. If you are reaching for `expect(doc).toContain(...)`, stop.

Matching a string proves a word was written, not that a statement is true. v2.3.3 shipped a suite of such guards and they stayed green through four separate factual errors in the very entry they were guarding — an invalid enum value in a migration example, a request missing three required fields, an invented error message, and a claim that required fields were optional. Every one used the right vocabulary. Worse, each review round that fixed the previous round's prose also introduced new prose-and-guard defects, so the guards cost more than they caught. They were all removed on 2026-08-02.

Two clarifications, because both have been argued before:

- **A script is not a loophole.** Rebuilding the check as `check:<something>` wired into CI is the same thing in a different file. v2.3.4's proposed `check:error-codes` playbook-parity gate was withdrawn on exactly this ground.
- **Testing that a *server* serves a file is fine.** `resources.test.ts` asserts each `figma-edit://guide/*` resource returns its repository source byte-for-byte. That is a property of the server, and it makes no claim about what the document says.

Documentation is kept in step by review. Where that leaves a guarantee unenforced — `SAFETY.md` Part B is no longer verified against the dispatcher, and error-playbook coverage is no longer checked — the affected document says so plainly rather than implying a gate that does not exist.

### Mocks cannot establish Figma's behaviour

The suite runs on stubs, which makes it fast and hermetic — and means **a mock can only prove what you told it to do.** Where a contract depends on how the Figma host actually behaves, a green test proves the stub, not the product. This repo has repeatedly shipped assertions that encoded a false assumption about Figma:

- Stubs allowed an empty layer name to persist; the live host silently normalizes it to a default. The passing matrix proved only stub behaviour.
- Whitespace-name preservation was asserted from stubs and had never been observed on a real document.
- An effect payload accepted unknown keys and discarded them; no test noticed, because the mock had no opinion.
- A response field was advertised and returned for months while being `undefined` at runtime, because the property does not exist on the real node type.

Before asserting that Figma does something — honours a parent argument, preserves a value, exposes a property — either verify it against a live document or mark the assertion as an assumption. Prefer a live check for anything whose failure would be invisible to a stub.

Image test fixtures under `src/mcp_server/tests/fixtures/images/` are third-party Creative Commons / public-domain assets (not covered by this project's MIT license); see their [`CREDITS.md`](src/mcp_server/tests/fixtures/images/CREDITS.md) for per-file attribution and licensing.

---

## Code style and conventions

- TypeScript strict mode; no `any` in new code.
- Tools live in `src/mcp_server/tools/<tool_name>.ts` and register themselves via the central registry.
- Error responses use structured codes — see existing tools and the figma-edit skill / references (`skills/figma-edit/references/error-playbook.md`) for the full taxonomy.
- Follow the **discover-before-acting** pattern for any new tool: never trust unverified names or IDs from the agent.
- Hallucination safeguards (scope locking, name verification, batch validation) are non-negotiable. New tools must integrate with them, not bypass them.

---

## Adding a new MCP tool

### Should this be a new tool at all?

**Every tool is permanent context cost.** Each registered tool ships its name, description, and full parameter schema into the system prompt of every agent that connects to figma-edit-mcp — even when the tool is never called. Some MCP hosts also cap the total number of tools (Claude Desktop, Cursor, and others have observed limits in the 40–128 range depending on host and model). The work that consolidated several overlapping read tools into a unified `node_info` was driven by exactly this concern.

Before adding a new tool, work through this checklist in order. Stop at the first "yes":

1. **Can an existing tool be extended with a new parameter or option?** Prefer this when the new behavior shares the same conceptual operation, target node type, and return shape. Example: adding a `filter` predicate to `node_info` rather than introducing a separate filter tool.
2. **Can an existing tool's parameter be generalized?** If two tools differ only by a hard-coded value (a node type, a property name, a side-effect mode), unify them and accept the value as input. The v1.4.0 collapse of `scan_*` tools is the canonical precedent.
3. **Can the agent compose existing tools to achieve the result?** If the new "tool" is really a fixed sequence of existing calls with no plugin-side atomicity requirement, document the pattern in the figma-edit skill / references (e.g., `skills/figma-edit/references/workflows.md`) instead of adding a tool. Reserve new tools for operations that genuinely require server- or plugin-side logic (atomicity, validation, batching, safeguard enforcement).
4. **Is this a batch variant of an existing single-item tool?** Batch tools are justified when they (a) reduce N round-trips on a common workflow and (b) enforce per-item validation that the agent cannot reliably reproduce by looping. If neither holds, the single-item tool plus agent-side iteration is sufficient.

Only add a new tool when none of the above apply — i.e., the operation is conceptually distinct, cannot be expressed by extending an existing tool without overloading its semantics, and benefits from being a first-class call (atomicity, safeguards, or a clearly different mental model for the agent).

### Signs you should extend instead of add

- The proposed tool's name starts with the same verb as an existing tool and operates on the same or a closely related node type.
- The proposed parameter list is mostly a superset or subset of an existing tool's.
- The return shape is the same as an existing tool, just filtered differently.
- The "difference" is a mode flag (read vs. write, single vs. batch, by-id vs. by-name) — these usually belong as parameters on one tool, not as separate tools.

### Signs a new tool is genuinely warranted

- Different node-side operation that requires its own plugin handler and safeguards (e.g., `create_component_set` vs. `create_component`).
- Different atomicity boundary — the operation must succeed or fail as a unit and cannot be expressed as a sequence of existing calls.
- Different audience — read-only discovery vs. mutating action, or designer-facing vs. agent-facing.
- Extending an existing tool would force one of its parameters to mean two unrelated things depending on context.

### When in doubt

Open a Discussion before implementing. Tool surface area is one of the load-bearing design decisions in this project — a fast "is this the right shape?" conversation costs less than a deprecation cycle later. If a new tool is the right call, also propose what (if anything) should be removed or merged in the same release to keep the total count flat.

### Implementation steps

Once the design decision is settled:

1. Implement the tool in `src/mcp_server/tools/`.
2. Register it in the tool registry.
3. If it mutates the document, add the corresponding plugin-side handler in `figma_plugin/` and the validation/safeguard checks.
4. Add a test in `src/mcp_server/tests/`.
5. Update the README tool inventory and the figma-edit skill / references (`skills/figma-edit/references/tool-selection.md`) usage guidance — including when to reach for the new tool vs. its neighbors, so agents don't pick it by accident.
6. If the new tool supersedes existing functionality, mark the displaced tool deprecated in the same PR and schedule its removal for the next minor release.

---

## Commits and pull requests

- Branch naming: `feature/<short-description>` or `fix/<short-description>`.
- Conventional-style commit subjects (`feat:`, `fix:`, `docs:`, `refactor:`) — match the style in `git log`.
- Run `bun test` and `bun run build:all` before opening a PR.
- For user-visible changes, add a CHANGELOG entry under `[Unreleased]`.
- PRs against `main`. Keep them focused; split unrelated changes.

---

## Versioning and releases

The project follows semver. Release mechanics (NPM publish, tarball verification, GitHub Release) live in the per-version specs under `documentation/`. Maintainers handle publishing; contributors do not need NPM credentials. Publishing is tag-driven, and maintainers must use a fine-grained NPM automation token scoped exclusively to the `figma-edit-mcp` package.

**Tag contract:** Git tags must exactly match the `package.json#version` (e.g., `v1.5.0` for version `1.5.0`). The CI pipeline enforces this contract and will reject any release where the tag and package version diverge.

**Build security:** The `package.json` uses the `prepublishOnly` lifecycle script to ensure a fresh, identical build runs *immediately* before an NPM publish. This prevents stale `dist/` artifacts from being published. Unlike `prepare` or `preinstall`, `prepublishOnly` never runs when a user does `bun install`, keeping the consumer install fast and secure.

---

## Reporting bugs

Open an issue at <https://github.com/neozhehan/figma-edit-mcp/issues> with:

- figma-edit-mcp version (`npx figma-edit-mcp --version` or commit SHA if running from source)
- Bun / Node version
- MCP host (Claude Desktop, Cursor, etc.) and version
- Steps to reproduce, expected vs. actual behavior
- Any relevant logs from the WebSocket bridge or Figma plugin console

---

## Questions

For design or architecture questions, open a GitHub Discussion rather than an issue. For security-sensitive reports, email the maintainer address listed in [package.json](./package.json) `author.email` rather than filing publicly.
