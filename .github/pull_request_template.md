## Release Checklist (v1.5.0)

Before approving this PR, confirm that the following changes map directly to a bullet in the CHANGELOG:

- [ ] **Repository Changes**: Fork detachment, README rewrites, fork sweep, topics, Issues+Discussions, MCP directories.
- [ ] **Packaging & Build**: `package.json` metadata, removal of `main`/`module`, `prepublishOnly`, expanded `files`, `figma-edit-mcp-socket` bin, `--version`/`--help`/`--port` flags, `tsup` configuration updates (node20, ESM-only, `dts: false`, shebang).
- [ ] **Plugin Move**: Moved `src/figma_plugin` to `figma_plugin`.
- [ ] **Documentation**: `DRAGME.md` retired; `AGENTS.md` and `CLAUDE.md` added.
- [ ] **Developer Experience**: `CONTRIBUTING.md`, `bun integrate` flags, contributor warning on `setup.sh`.
- [ ] **CI & Supply Chain**: `ci.yml`, `publish.yml`, Bun 1.3.0 pin, NPM 2FA configuration.
- [ ] **Cleanup**: `test_output.txt`, `bun-types`, stale v1.4.0 docs, `Dockerfile`, `pub:release` script, LICENSE prefix trim.
