# Package Update Implementation Plan

This document outlines a phased approach to updating the dependencies in the `figma-edit-mcp` project. By isolating major version updates from minor patches, we can easily identify and resolve any breaking changes.

## General Verification Steps
After every phase, the following verification steps MUST be run to ensure the project remains stable:
1. **Type Checking / Build**: `npm run build:all` (Ensures the MCP server and Figma Plugin compile successfully).
2. **Unit Tests**: `npm test` (Runs the Bun test suite to verify logical correctness).

---

## Phase 1: Housekeeping & Minor Updates
This phase removes unused dependencies and safely updates packages that only have minor or patch version bumps.

**Tasks:**
- [ ] **Uninstall `ts-morph`**: 
  - Run: `npm uninstall ts-morph`
- [ ] **Update Minor Dependencies**:
  - Run: `npm install ws@8.20.0`
- [ ] **Update Minor Dev Dependencies**:
  - Run: `npm install -D @figma/plugin-typings@1.125.0 esbuild@0.28.0 tsup@8.5.1 @types/bun@1.3.13 bun-types@1.3.13`
- [ ] **Verify**: Run the general verification steps.

---

## Phase 2: TypeScript Major Update
TypeScript 6.0 introduces some stricter type-checking rules and removes certain deprecated features.

**Tasks:**
- [ ] **Update TypeScript**:
  - Run: `npm install -D typescript@6.0.3`
- [ ] **Verify & Fix**: Run `npm run build:all`. 
  - Fix any type errors that arise from the stricter compiler rules in TypeScript 6.0.
- [ ] **Verify Tests**: Run `npm test`.

---

## Phase 3: UUID Major Update
`uuid` from v11 to v14 contains major updates, which might include changes to module resolution (ESM vs CommonJS) or internal API changes.

**Tasks:**
- [ ] **Update UUID**:
  - Run: `npm install uuid@14.0.0`
- [ ] **Verify Imports**: Check `src/mcp_server/figma-client.ts` to ensure imports like `import { v4 as uuidv4 } from 'uuid';` are still resolving correctly.
- [ ] **Verify**: Run the general verification steps. Fix any module resolution issues if they occur.

---

## Phase 4: Zod Major Update
Zod v4 includes major structural changes and potentially tighter parsing rules. Since this project heavily relies on Zod for MCP tool input schemas, this is the most critical update.

**Tasks:**
- [ ] **Update Zod**:
  - Run: `npm install zod@4.4.3`
- [ ] **Audit Schemas**: Check `src/mcp_server/tools/*.ts` for any deprecated Zod methods or type inference issues.
- [ ] **Verify**: Run the general verification steps. 
- [ ] **Run MCP Tool Tests**: Pay special attention to test output for schema validation edge cases to ensure the tools still accept the correct inputs.

---

## Completion Checklist
- [ ] All 4 phases completed successfully.
- [ ] `npm run build:all` completes with zero errors.
- [ ] `npm test` passes 100%.
- [ ] Commit all `package.json` and `package-lock.json` changes.
