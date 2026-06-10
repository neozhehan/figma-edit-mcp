# Figma MCP Safety & Validation Checks Brainstorming

This document evaluates the proposed safety checks and outlines additional opportunities for input validation within the Figma Edit MCP server codebase.

---

## 1. Analysis of Proposed Checks

### 🟢 Preventing Operations on Locked Layers/Frames
* **Validity**: **Highly Valid and Recommended.**
* **Why**: In Figma, locking a layer or frame is a deliberate user action to prevent accidental selection, moving, or editing. Programmatically, the Figma Plugin API bypasses this UI-level lock and allows modification of locked nodes. If an LLM operates on locked layers, it directly violates user intent and risks breaking static structures.
* **Implementation Recommendation**:
  * Create a utility helper `isLockedOrDescendantOfLocked(node: BaseNode): boolean` that traverses up the parent tree. If any parent (or the node itself) has `.locked === true`, it returns `true`.
  * In `figma_plugin/src/main.ts`, intercept write commands (e.g., `node_transform`, `node_delete`, `node_rename`, `text_set_content`, `node_set_fill`, etc.) and throw a structured error if the target node is locked:
    > `"Operation Denied: Node '${node.name}' (or one of its parent frames) is locked. You must unlock the layer in Figma or request the user to unlock it before editing."`

---

### 🟢 Validating Component Property Types before Modification
* **Validity**: **Highly Valid and Critical for LLM robustness.**
* **Why**: Figma component properties are strictly typed: `BOOLEAN`, `TEXT`, `VARIANT`, and `INSTANCE_SWAP`. 
  * If an LLM passes `"true"` (string) or `"yes"` to a `BOOLEAN` property, or passes a boolean value to a `TEXT` property, the Figma API throws a runtime exception (`"Error: Invalid value for property..."`).
  * For `VARIANT` properties, the value must match one of the exact string options defined on the parent `ComponentSetNode`. Passing an arbitrary string results in a broken/blank state in Figma or a runtime error.
* **Implementation Recommendation**:
  * In `figma_plugin/handlers/componentHandlers.ts:setComponentInstanceProperty`, inspect the target instance's main component property definitions (`instance.componentProperties`).
  * Before calling `instance.setProperties(...)`, perform type enforcement:
    1. **`BOOLEAN`**: Check that the input value is a boolean (or strictly parse strings like `"true"` / `"false"` into booleans to be user/LLM friendly).
    2. **`TEXT`**: Ensure the input is a string.
    3. **`VARIANT`**: Cross-reference the input value against the allowed variant values. If the value is not in the list of variants, throw an error showing all available variants.
    4. **`INSTANCE_SWAP`**: Validate that the input value matches a valid Component Node ID or Component Key.

---

### 🟢 Checking Parent/Child Capability and Hierarchies before Insertion
* **Validity**: **Highly Valid and Prevents Fatal API Crashes.**
* **Why**: While the current `insertChild` helper verifies that a parent exists and supports children (`'children' in parent`), it does not prevent several illegal hierarchy actions that crash Figma:
  1. **Cyclic Parenting**: Moving an ancestor node into its own descendant (e.g., making parent node `A` a child of descendant `B`). This throws a fatal hierarchy exception.
  2. **Page/Document Constraints**:
     * `PAGE` nodes can **only** be direct children of the `DOCUMENT` root (`figma.root`).
     * Non-`PAGE` nodes (frames, shapes, text) **cannot** be direct children of `DOCUMENT` root; they must live under a page.
     * `PAGE` nodes cannot be children of `FRAME` or other container nodes.
  3. **Self-Parenting**: Attempting to insert a node into itself (`parentId === childId`).
* **Implementation Recommendation**:
  * In `figma_plugin/handlers/nodeModifiers.ts:insertChild` and `figma_plugin/src/main.ts:node_insert_child`, add the following guardrails:
    * **Cyclic Guard**: Walk up the parent tree of the target parent node. If `childId` is found in the ancestor chain, throw: `"Operation Denied: Cannot insert a parent node into its own descendant (Cyclic Dependency)."`.
    * **Self Guard**: Reject if `parentId === childId`.
    * **Type Compatibility Guard**: Ensure `PAGE` nodes are only placed under `DOCUMENT` and non-`PAGE` nodes are only placed under non-`DOCUMENT` nodes.

---

## 2. Additional Missing Checks & LLM Gaps Identified

Through a deep dive of the codebase, we've identified the following validation gaps where an LLM could make unsafe calls:

### 1. Modifying Remote Library Nodes (Components / Styles / Variables)
* **The Risk**: Programmatically, plugins cannot modify remote components, styles, or variables belonging to shared team libraries. If an LLM attempts to rename or alter properties on a remote style or node, Figma throws a fatal error: `Error: Cannot modify a remote style`.
* **The Check**: 
  * Check if the node, style, or variable has `remote === true` before executing write/rename/delete commands.
  * Throw: `"Operation Denied: Node/Style/Variable is a remote library asset and is read-only. Modifying remote library components directly is not supported."`

---

### 2. Auto-Layout Constraint Violations (`FILL` Sizing)
* **The Risk**: Setting `layoutSizingHorizontal = "FILL"` or `layoutSizingVertical = "FILL"` on a node requires its parent to be an Auto-Layout frame (`layoutMode` HORIZONTAL or VERTICAL). If a node is placed directly under a Page, Group, or standard Frame, setting `FILL` sizing throws a Figma API crash. LLMs frequently try to apply `FILL` sizing to root-level layers.
* **The Check**:
  * In `figma_plugin/handlers/layoutHandlers.ts:setAutoLayout`, if horizontal or vertical sizing is set to `"FILL"`, check:
    ```typescript
    if (node.parent && !("layoutMode" in node.parent && node.parent.layoutMode !== "NONE")) {
        throw new Error("Sizing mode 'FILL' is only supported when the parent node is an Auto-Layout frame.");
    }
    ```

---

### 3. Font Loading Safety in Text Sizing & Editing
* **The Risk**: Figma requires **all** fonts used in a TextNode to be fully loaded before modifying any layout or text properties (even text alignment or font size). If a TextNode contains mixed fonts, calling `node.fontSize = X` or changing alignment will throw a font loading error unless all fonts inside that text range are loaded.
* **The Check**:
  * Improve font loading in `setTextStyle`: if `node.fontName === figma.mixed`, traverse the text ranges using `buildLinearOrder(node)` to load every font present in the node before modifying properties.

---

### 4. Color Range Bounds Checking (RGB Scale)
* **The Risk**: While the MCP server's Zod schemas validate that input RGBA values are between `0` and `1`, any direct command bypassed or sent through custom plugin integrations might pass 0-255 values (e.g. `255, 128, 0`), leading to invalid color states in Figma.
* **The Check**:
  * In `figma_plugin/handlers/stylingHandlers.ts`, add a normalizing check: if any RGB value is `> 1.0`, auto-scale them by dividing by `255.0` (with a warning/log) or throw a descriptive error.

---

### 5. Out-of-Scope Reparenting / Cross-Page Grouping
* **The Risk**: 
  * The `node_group` handler checks that nodes share the same parent, but what if they are on different pages? Or what if a node is cloned or reparented to a page that isn't the active page?
  * While `viewNavigate` handles switching pages, other commands like `node_insert_child` do not switch the active page. Reparenting across pages without switching can cause unexpected rendering side effects in Figma.
* **The Check**:
  * In `insertChild`, check if the parent and child belong to the same page. If they belong to different pages, verify that page switching or clear cross-page warnings are provided.

---

## 3. Prioritized Action Plan

To make the Figma MCP server extremely safe and robust against LLM hallucinations, we should prioritize implementations in the following order:

| Priority | Check Category | Prevented Failure | Implementation Location |
| :--- | :--- | :--- | :--- |
| **P0** | **Parent-Child & Hierarchy** | Cyclic parent crashes; invalid DOCUMENT/PAGE hierarchies. | `figma_plugin/handlers/nodeModifiers.ts` |
| **P0** | **Locked Layers Guard** | Bypassing user-configured locks; unauthorized writes. | `figma_plugin/src/main.ts` |
| **P1** | **Component Property Typings** | Invalid property types; incorrect variants causing broken shapes. | `figma_plugin/handlers/componentHandlers.ts` |
| **P1** | **Remote Assets Guard** | API failures when trying to write to read-only remote styles/components. | `figma_plugin/src/main.ts` |
| **P2** | **Auto-Layout `FILL` Sizing** | Crashes from applying `FILL` in non-auto-layout parents. | `figma_plugin/handlers/layoutHandlers.ts` |
