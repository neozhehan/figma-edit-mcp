# Figma Edit MCP v2.2.0 Safety Enhancement Spec Critique

This document presents a deep dive critique of the [v2.2.0 PRD](file:///Users/neozhehan/Git/figma-edit-mcp/documentation/v2.2.0-safety-enhancement/prd.md) requirements against the local codebase. It highlights critical gaps, functional bugs, contradictions, consistency concerns, and technical implementation details.

---

## 1. Critical Gaps & Functional Bugs (New Findings)

### 🔴 Mismatch in `text_set_content` (Undetected in PRD & Check docs)
* **The Gap:** The MCP tool schema [text.ts](file:///Users/neozhehan/Git/figma-edit-mcp/src/mcp_server/tools/text.ts#L19) defines the text replacement object with `characters: z.string()`. However, the plugin handler `setMultipleTextContents` in [textHandlers.ts](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/handlers/textHandlers.ts#L101) specifically checks for `replacement.text`:
  ```typescript
  if (!replacement.nodeId || replacement.text === undefined) { ... }
  ```
* **Impact:** In production, when an LLM calls `text_set_content` through the MCP server, Zod validates and passes the `characters` field. The plugin dispatcher receives it but the handler rejects the batch with `"Missing nodeId or text in replacement entry"` because `text` is `undefined`.
* **Fix:** Reconcile schema and handler to use a single field name. Since Figma uses `characters` natively, we should align the handler and the tests to check `characters` (or map `characters` to `text` in the dispatcher).

### 🟡 `create_component` Destroys the Scope Root
* **The Gap:** §1 in the PRD blocks `node_delete`, `node_flatten`, and `node_ungroup` when the target matches `state.scopeRootId`. However, `create_component` in [componentHandlers.ts](file:///Users/neozhehan/Git/figma-edit-mcp/figma_plugin/handlers/componentHandlers.ts#L687) converts a Frame into a Component by creating a new `ComponentNode` and calling `node.remove()` on the original Frame.
* **Impact:** If an agent runs `create_component` on the scope root node, it deletes the scope root, invalidates the ID, and bricks the session with `SCOPE_DELETED` errors for the rest of the session.
* **Fix:** Add `create_component` to the list of self-destruction blocks in the dispatcher:
  ```typescript
  if (params.nodeId === state.scopeRootId) {
      throw new Error(ERRORS.SELF_DESTRUCT_DENIED);
  }
  ```

---

## 2. Contradictions & Ambiguities

### 🟡 Remote Component override contradiction in `instance_set_property`
* **The Gap:** §7 of the PRD states:
  > *"component_manage_property, component_delete_property, and instance-set-property when it targets a remote main component: if the resolved component `.remote` → throw."*
  
  However, §7 also notes:
  > *"an instance of a remote component is fully editable (move/resize/override)."*
* **Ambiguity:** `instance_set_property` changes the component property value *on the local instance* as a local override; it does *not* mutate the remote main component itself.
* **Impact:** If `instance_set_property` throws when the instance's main component is remote, agents won't be able to edit properties on instances of shared library components.
* **Resolution Required:** We should confirm that `instance_set_property` is allowed on instances of remote components (which is the standard Figma behavior for overrides). Only writes targeting the remote main component *definition* directly (via `component_manage_property` or `component_delete_property`) should be blocked.

---

## 3. Consistency Concerns

### 🟢 `reaction_update` Schema Update
* **The Gap:** §6A of the PRD adds `verifyNodeName(params.nodeId, params.nodeName)` to `reaction_update`.
* **Impact:** The tool schema [reaction.ts](file:///Users/neozhehan/Git/figma-edit-mcp/src/mcp_server/tools/reaction.ts#L78) currently only has `nodeId` and `reactions`. We must update the Zod schema to include `nodeName` to prevent Zod validation errors when the client supplies it:
  ```typescript
  nodeName: z.string().describe("Name of the node to verify against")
  ```

### 🟢 `variable_delete` Schema and Handlers Alignment
* **The Gap:** §6B of the PRD introduces name verification for variable and collection deletion.
* **Impact:** The schema [variable.ts](file:///Users/neozhehan/Git/figma-edit-mcp/src/mcp_server/tools/variable.ts#L115) must be updated to accept `variableNames` and `collectionName`.
* **Fix:** Update the input Zod schema in `variable.ts`:
  ```typescript
  variableNames: z.array(z.string()).optional().describe("Names of variables to verify against"),
  collectionName: z.string().optional().describe("Name of collection to verify against")
  ```
  Then enforce in `deleteVariables` that these names are provided and match the retrieved entities.

---

## 4. Technical Hurdles & Edge Cases

### 🔵 Mixed-Font Loading performance in `text_set_style`
* **Analysis:** Enumerating all fonts in a mixed-font node via `getStyledTextSegments` and loading them in parallel is clean. However, if a text node has dozens of segments using different font families, calling `figma.loadFontAsync` in parallel might hit Figma resource bottlenecks or take a long time.
* **Mitigation:** Deduplicating the font list (using the proposed `uniqBy` utility) is crucial. We should also add a try/catch around the parallel loading loop so that if any individual optional font fails to load (e.g., deleted font family), it doesn't fail the entire styling operation unless it is the primary target font.

### 🔵 Test Execution Directory Context
* **Technical Hurdle:** Running `bun test` in the `/src/mcp_server` directory fails 17 tests with `ENOENT` errors because the test suite attempts to resolve relative paths (like `figma_plugin/src/main.ts` and `package.json`) from the project root.
* **Fix:** Always execute tests from the repository root using `bun test --cwd .` (all 213 tests pass successfully under this context). We should document this in the README or package.json scripts to prevent developer confusion.

---

## 5. Summary of Recommended spec Adjustments

To ensure a smooth, error-free implementation of v2.2.0, the following items should be added to the execution task list:

| Item | Focus | Suggested Action |
|---|---|---|
| **`text_set_content` Fix** | Functional Bug | Align schema and handler to use `characters` (preferred) or `text` consistently. |
| **`create_component` Guard** | Safety / Consistency | Block converting the current `state.scopeRootId` to a component. |
| **`instance_set_property` Rule** | Ambiguity | Clarify that overrides on instances of remote components are permitted. |
| **Schema Upgrades** | Schema Integrity | Add `nodeName` to `reaction_update` and `variableNames`/`collectionName` to `variable_delete` schemas. |
| **Test Working Dir** | Documentation | Update package scripts to run tests with `--cwd .` to resolve path issues. |
