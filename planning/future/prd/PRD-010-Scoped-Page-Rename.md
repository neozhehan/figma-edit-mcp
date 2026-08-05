# PRD — Scoped Page Rename

- **Status:** Proposed
- **Release:** Version-unassigned standalone minor release
- **PRD date:** 2026-08-04
- **Source:** [Figma Design Editing Capability Expansion, Section 17](../Figma%20Design%20Editing%20Capability%20Expansion/prd.md#17-rename-the-scoped-page-through-node_rename-p0)
- **Compatibility posture:** Additive PAGE branch in `node_rename`; no new or renamed MCP tool

> [!IMPORTANT]
> This release adds exactly one authority: `node_rename` may rename the exact page that is already the active page-scope root. It does not add general page management, does not let node scope authorize an ancestor page, and does not widen scope programmatically.

## 1. Executive summary

Allow an agent connected with page edit scope to rename that exact linked page through the existing `node_rename` tool. The page's stable ID remains the scope anchor, so a successful rename does not require reconnecting. Every other page, node-scoped connection, read-only connection, and page divider remains refused before mutation.

This is intentionally separate from transform, layout, appearance, and structural-combine work. It shares implementation files with some of those releases, but its user decision and authority invariant are self-contained.

## 2. Release identity and source mapping

| Source requirement | Disposition in this release |
| :- | :- |
| Source checklist item 17 | Complete |
| Product decision D17 | Preserved exactly |
| Section 17 contract and acceptance criteria | Complete |
| Section 20 `node_rename` PAGE safety row | Owned here |
| Schema requirement 11 | Owned here |
| Phase 3 PAGE-rename bullet | Expanded below |
| Rename schema, handler, safety, and live tests | Owned here |

Public-surface arithmetic:

- tools added: 0;
- tools removed: 0;
- tools renamed: 0;
- tools expanded: `node_rename`;
- net tool-count change: 0.

The concrete version is assigned only when the release is scheduled. All enforced version surfaces move together at that time.

## 3. Problem

The generic rename route can assign `node.name`, but its public contract and safety tests do not define a PAGE branch. Treating a page as an ordinary ancestor node would be unsafe: node scope grants authority over an editable subtree, not over the page containing it. Conversely, a page-scoped connection already has an exact stable scope-root ID and can safely authorize renaming that one page.

The missing contract leaves callers without a supported page-rename path and risks an implementation accidentally broadening ordinary ancestor-based scope rules.

## 4. Goals

1. Reuse `node_rename`; do not add a page-specific tool.
2. Permit rename only when the target PAGE ID equals the active page-scope root ID.
3. Require exact current-name verification.
4. Preserve the page ID and active scope root after success.
5. Return exact old/new names and scope-continuity evidence.
6. Provide a dedicated refusal that instructs the caller to reconnect with the target page link.
7. Preserve ordinary in-scope node rename behavior unchanged.

## 5. Explicit non-goals

- No page creation, deletion, duplication, reordering, or moving.
- No dedicated `page_rename` tool.
- No document-wide page-management permission.
- No page-divider naming or lifecycle support.
- No ability for node scope to rename its containing page.
- No ability for one page scope to rename another page.
- No automatic widening of scope or reconnect.
- No change to ordinary node rename semantics.
- No transform, layout, appearance, paint, text, creation, instance, variable, or structural-combine work.

## 6. Exact public contract

`node_rename` retains its input shape:

```ts
type NodeRenameInput = {
  nodeId: string;
  nodeName: string; // exact current name
  name: string;     // exact requested new name
};
```

The schema description must state:

- `nodeId` may identify a PAGE only when that PAGE is the exact active page-scope root;
- `nodeName` comes from `page_info` or the connection payload for a PAGE target;
- node scope does not authorize the containing page;
- a non-page target continues through the existing ordinary rename path.

### 6.1 PAGE branch authorization

Resolve the target before entering the generic node-write mutation. If the target is `PAGE`, require all of the following:

1. `state.allowEditNode === "page"`;
2. `state.scopeRootId === target.id`;
3. `nodeName` exactly equals the target's current name;
4. `name` satisfies the existing non-empty rename policy;
5. the target is not a page-divider node;
6. the command is not read-only.

These checks are conjunctive. An ancestor relationship, same-document relationship, page visibility, current page, or current selection cannot substitute for exact page-scope identity.

### 6.2 Scope continuity

Renaming changes only the page name. The target ID remains unchanged and therefore remains the active scope-root ID. No reconnect is required after success.

### 6.3 Success output

```ts
type NodeRenameResult = {
  id: string;
  type: string;
  oldName: string;
  name: string;
  scopeRootPreserved: boolean;
  partialMutation?: boolean;
};
```

For a successful PAGE rename:

- `type` is `"PAGE"`;
- `oldName` is the verified pre-write name;
- `name` is the exact post-write readback;
- `scopeRootPreserved` is `true` only after confirming the active scope-root ID still equals the page ID.

For every successful ordinary non-PAGE rename, `scopeRootPreserved` is also `true` only after confirming that the active scope-root ID is unchanged from its preflight snapshot. `type` is the exact non-PAGE target type, and `oldName`/`name` are the verified before/readback values. If scope continuity cannot be confirmed after either branch, the handler returns a reconciled failure rather than a success with `scopeRootPreserved: false`. Thus every successful result has deterministic `scopeRootPreserved: true`; the field is not deferred to implementation-specific semantics.

`node_rename` remains an absolute setter and retains `idempotentHint: true` and `openWorldHint: true`. Annotations are advisory; plugin gates are authoritative.

## 7. Mutation, readback, and failure semantics

### 7.1 Complete preflight

Before assigning `name`:

- resolve the exact target;
- branch on exact target type;
- apply the PAGE-specific permission and scope-root tests;
- verify the current exact name;
- validate the requested name;
- snapshot target ID, type, old name, permission mode, and scope-root ID.

A predictable refusal performs no assignment.

### 7.2 Mutation and readback

After preflight, assign the requested name once, then read back:

- page ID;
- page type;
- resulting name;
- active scope-root ID.

The next `page_info` and connection payload must expose the new name.

### 7.3 Unexpected failure and reconciliation

If Figma throws during or immediately after assignment:

1. stop further mutation;
2. read the page by its stable ID;
3. compare its current name with `oldName` and the requested name;
4. report exact observed state;
5. set `partialMutation: true` when the name changed despite the exception;
6. do not silently retry or claim rollback.

If the requested name is observed and scope continuity is confirmed, use the repository's authoritative outcome-classification contract rather than reporting a false zero-mutation failure.

## 8. Safety and structured errors

### 8.1 Required plugin-side safety row

`SAFETY.md` must add an explicit `node_rename` PAGE branch:

- existing node-write and exact-name controls;
- exact target type `PAGE`;
- `allowEditNode === "page"`;
- `scopeRootId === target.id`;
- read-only refusal;
- page-divider refusal;
- no ancestor-based scope widening.

The registered-write-tool/safety-row consistency test must cover this branch.

### 8.2 Dedicated error

Use `PAGE_RENAME_REQUIRES_PAGE_SCOPE` when a PAGE target is not the exact active page-scope root.

Required details:

```ts
{
  target: { id: string; name: string; type: "PAGE" };
  allowEditNode: string;
  scopeRootId: string | null;
  requiredScopeRootId: string;
  recovery: {
    action: "RECONNECT_WITH_PAGE_LINK";
    pageId: string;
    pageName: string;
  };
}
```

The recovery must say to reconnect using that page's link. It must not suggest calling another tool to widen scope.

### 8.3 Other refusal classes

Existing central errors remain authoritative for:

- exact-name mismatch;
- read-only mode;
- empty/invalid new name;
- unavailable target;
- unsupported page-divider target;
- unexpected Figma API failure.

Every error includes machine-usable observed and accepted operands and a corrected next action where one exists.

## 9. Dependencies and exclusions

### Required baseline

- Existing connection state with `allowEditNode` and stable `scopeRootId`.
- Existing exact-name verification and central structured-error registry.
- Existing explicit page read through `page_info` and/or the connection payload.
- Existing ordinary `node_rename` behavior.

This release has no dependency on transform, layout, `MATCHES` filtering, appearance, paint, component, instance, variable, or structural-combine work.

### Independence rule

The release must be implementable and verifiable against the scheduled baseline without referencing a future tool or field. Sharing `src/mcp_server/tools/node.ts`, `figma_plugin/src/main.ts`, or `nodeModifiers.ts` with adjacent PRDs does not merge their contracts.

## 10. Implementation areas and phases

### Primary files

- `src/mcp_server/tools/node.ts`
- `figma_plugin/src/main.ts`
- `figma_plugin/handlers/nodeModifiers.ts`
- central error definitions and error playbook
- `src/mcp_server/tests/unit/tools/`
- `src/mcp_server/tests/unit/figma_plugin/`
- `SAFETY.md`
- `skills/figma-edit/references/` and corresponding resource sources
- generated `figma_plugin/code.js`

### Phase 0 — Scheduled-baseline audit

- Record current `node_rename` schema, annotations, dispatcher route, handler, safety row, and tests.
- Verify how PAGE and page-divider nodes are represented in the pinned typings/runtime.
- Verify connection payload and `page_info` expose the exact current page name.

### Phase 1 — Public contract and errors

- Update `node_rename` descriptions for the PAGE branch.
- Add the result fields and dedicated central error.
- Add emitted-schema, annotation, and error-shape tests before enabling mutation.

### Phase 2 — Plugin authority branch

- Resolve target before generic mutation.
- Add exact PAGE permission/scope-root/name/divider checks.
- Snapshot, assign once, and read back name/scope continuity.
- Add unexpected-failure reconciliation.

### Phase 3 — Safety and regression closure

- Add the PAGE branch to `SAFETY.md` and bidirectional consistency tests.
- Prove ordinary node rename behavior remains unchanged.
- Red-proof node-scope, other-page, read-only, and divider refusals.

### Phase 4 — Documentation, generated output, and release

- Update all user guides/resource mirrors, changelog, and migration examples.
- Regenerate plugin output.
- Assign/synchronize the release version.
- Run repository and live gates.

## 11. Verification requirements

### 11.1 Schema and MCP-boundary tests

- The existing exact input shape remains valid.
- Descriptions state the exact PAGE-scope restriction and discovery source.
- Empty/invalid names fail at the boundary according to existing policy.
- Tool count remains unchanged.
- Annotations remain correct.
- Result schema contains target type and scope-continuity evidence.

### 11.2 Handler tests

- Exact linked page rename succeeds.
- Exact-name mismatch fails before assignment.
- Read-only mode fails before assignment.
- Node scope cannot rename its containing page.
- A page-scoped connection cannot rename another page.
- Page-divider rename is refused.
- Ordinary node rename success and refusal fixtures remain green.
- Page ID and active scope-root ID remain unchanged.
- The next `page_info`/connect payload exposes the new name.
- An injected assignment/readback failure reports exact observed state and never claims an unverified rollback.

### 11.3 Safety tests

- PAGE authorization requires both page permission and exact scope-root ID.
- No generic ancestor/in-scope predicate can bypass the PAGE branch.
- The branch never reads current selection or uses implicit current page.
- Registered write routes and `SAFETY.md` remain synchronized.
- Refusals perform zero mutation.

### 11.4 Live Figma matrix

In a dedicated Figma Design file:

1. connect with page scope and rename the exact linked page;
2. verify ID and scope-root continuity;
3. verify `page_info` and a fresh connection payload show the new name;
4. reconnect with node scope and prove containing-page refusal;
5. connect to another page and prove cross-page refusal;
6. prove read-only refusal;
7. probe page-divider behavior where the host exposes one;
8. prove ordinary node rename still works.

Repository mocks do not establish live page-scope behavior.

## 12. Documentation, generated output, and version gates

Before release:

- Update `README.md`, `SAFETY.md`, `CHANGELOG.md`, tool-selection, workflows, constraints, and error playbook.
- Update matching `figma-edit://guide/*` resource mirrors.
- Document discovery through `page_info`/connect and recovery by reconnecting with the exact page link.
- State every non-goal, especially no page create/delete/reorder and no node-scope ancestor authority.
- Regenerate `figma_plugin/code.js`; do not hand-edit it.
- Update emitted-schema snapshots, tool counts, permission matrices, and safety consistency tests.
- Assign and synchronize the scheduled version in every surface enforced by current version/plugin checks.
- Run server/plugin type checks, generated-file checks, suppression checks, plugin build verification, version checks, focused tests, and the full unit suite.

## 13. Acceptance gate

- [ ] `node_rename` accepts a PAGE only when it is the exact active page-scope root.
- [ ] The current exact page name is required.
- [ ] Node scope, another page's scope, read-only mode, and page dividers refuse before mutation.
- [ ] Every successful PAGE or ordinary-node rename confirms the active scope-root ID is unchanged and returns deterministic `scopeRootPreserved: true`; PAGE success also preserves the page ID and returns exact old/new names.
- [ ] `PAGE_RENAME_REQUIRES_PAGE_SCOPE` gives only safe reconnect guidance.
- [ ] Ordinary node rename behavior remains unchanged.
- [ ] Unexpected failure is reconciled against stable page identity.
- [ ] Schema, handler, safety, injected-fault, and live tests pass.
- [ ] Docs, resources, generated output, changelog, and version surfaces are synchronized.
- [ ] No adjacent scope entered the release.

## 14. Risks and mitigations

| Risk | Mitigation |
| :- | :- |
| Ancestor logic grants node scope page authority | Branch on `PAGE` before generic mutation and require both page permission and exact scope-root ID |
| Page rename invalidates the connection | Anchor scope to stable page ID and verify it after mutation |
| Stale page name renames an unintended target state | Exact-name verification before assignment |
| Error advice encourages privilege widening | Dedicated error instructs only reconnection with the exact page link |
| Host throws after assignment | Re-read stable ID and report observed outcome/partial mutation |
| Shared files pull in unrelated work | Enforce the explicit exclusions and release-local test inventory |

## 15. Source fidelity and contradictions

This PRD preserves Section 17, D17, the PAGE safety row, schema requirement 11, and their test/risk obligations. The source contains no unresolved product decision for this scope.

The only evidence caveat is implementation-time drift: PAGE/page-divider representation and current connection-state fields must be revalidated against the scheduled baseline. If they differ, revise this PRD before implementation rather than broadening authority by inference.
