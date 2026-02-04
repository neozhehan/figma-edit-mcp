# Plugin Enhancement Concerns Analysis

This document outlines performance, functionality, and risk concerns identified during the review of `plugin_enhancement.md`.

## 1. Performance Concerns

### `get_components` (Enhancement #5)
*   **Issue**: The proposed tool implementation calls `await figma.loadAllPagesAsync()`.
*   **Impact**: On large Figma documents with many pages and thousands of objects, this operation can be significantly slow and memory-intensive, potentially causing the plugin to timeout or lag.
*   **Context**: While this behavior existed in the previous `get_local_components`, keeping it as a core part of the new `get_components` tool reinforces a heavy operation that should potentially be paginated or scoped.

### `set_text_style` (Enhancement #2)
*   **Issue**: Potential for excessive font loading if not handled optimally.
*   **Impact**: If an implementation attempts to use `figma.loadFontAsync()` for every text update without internal caching or batching, it generally performs well, but excessive font loading on distinct font families in a short loop could cause latency.

## 2. Functionality & Logic Concerns

### `group_nodes` Parent Constraint (Enhancement #4)
*   **Issue**: The tool enforces that "All nodes must have the same parent".
*   **Impact**: Functionality gap when grouping elements scattered across different parents.
*   **Solution A: Auto-Reparenting (Recommended)**
    *   *Mechanism*: Logic detects different parents -> finds the lowest common ancestor (or uses the parent of the first node) -> reparents all nodes to that target -> creates group.
    *   *Pros*: "Just works" for the user/AI; reduces need for multi-step plans.
    *   *Cons*: Might unexpectedly change layout context or coordinate systems of moved nodes.
*   **Solution B: Strict Two-Step Process**
    *   *Mechanism*: Keep restriction, require AI to call `insert_child` first.
    *   *Pros*: Deterministic, safe.
    *   *Cons*: Friction; AI often forgets this prerequisite and fails.

### `get_document_info` Visibility (Enhancement #1)
*   **Issue**: Only provides metadata of other pages, not their children.
*   **Impact**: AI cannot "see" content on other pages to make decisions.
*   **Solution A: On-Demand Page Scanning**
    *   *Mechanism*: Add a `get_page_children(pageId)` tool.
    *   *Pros*: Efficient; only loads what is needed. Does not bloat the initial `get_document_info` payload.
    *   *Cons*: Adds one more tool to the toolkit.
*   **Solution B: Include Children (Flag-based)**
    *   *Mechanism*: Add `include_all_children: true` to `get_document_info`.
    *   *Pros*: Full visibility in one shot.
    *   *Cons*: Huge payload risk for large files; potential context window overflow.

### `create_component_set` (Enhancement #6)
*   **Issue**: Requirement for `Property=Value` naming for variants.
*   **Detailed Explanation**: Figma determines the *Variant Properties* (e.g., "Size", "State") by parsing the name of the child components.
    *   **✅ Ideal Case (Key=Value format)**:
        *   Input Names: `Size=Small, State=Primary` and `Size=Large, State=Secondary`.
        *   Result: Figma creates explicitly named properties: **`Size`** (values: Small, Large) and **`State`** (values: Primary, Secondary). This is perfect for AI manipulation.
    *   **⚠️ Passable Case (Slash-separated)**:
        *   Input Names: `Button/Small/Primary`, `Button/Large/Secondary`.
        *   Result: Figma creates generic properties based on hierarchy: **`Property 1`** (value: Button), **`Property 2`** (values: Small, Large), **`Property 3`** (values: Primary, Secondary). The AI must guess that "Property 2" essentially means "Size".
    *   **❌ Failure Case (Arbitrary Names)**:
        *   Input Names: `Blue Button`, `Red Button`.
        *   Result: Figma dumps them into a single property **`Property 1`** (values: Blue Button, Red Button). This destroys the multi-dimensional structure (e.g., separate Size vs Color) and makes the component set useless for systematic variation.
*   **Impact**: If the AI or user creates components with arbitrary names, `combineAsVariants` will result in a "Property 1" soup. The AI will then fail to use `set_node_properties` effectively to switch variants because the expected property keys (like "Size") won't exist.
*   **Solution A: Auto-Renaming Strategy**
    *   *Mechanism*: If names don't match pattern, tool auto-renames them to `Variant 1`, `Variant 2`, etc.
    *   *Pros*: Guarantees operation success.
    *   *Cons*: Semantic loss; "Variant 1" is not descriptive.
*   **Solution B: Validation Error**
    *   *Mechanism*: Throw error if names are invalid.
    *   *Pros*: Enforces best practices.
    *   *Cons*: Frustrating user experience; AI might get stuck in a "fix name" loop.

## 3. Risks of Tool Removal (Breaking Changes)

### Breaking Existing Prompt Habits
*   **Risk**: AI models accustomed to `set_padding` will fail if tool is removed.
*   **Solution: Alias / Wrapper Tools (Recommended)**
    *   *Mechanism*: Keep `set_padding` but implement it as a wrapper that calls `set_auto_layout`.
    *   *Pros*: zero breakage; backward compatible; simpler for simple tasks.
    *   *Cons*: Maintains "tool bloat" in the definition list (though implementation is shared).

### Renaming `get_local_components`
*   **Risk**: Hard break for existing workflows.
*   **Solution: Deprecation Alias**
    *   *Mechanism*: Keep `get_local_components` as a hidden alias that calls `get_components({ filter: 'local' })`.
    *   *Pros*: Seamless migration.
    *   *Cons*: Documentation might become confusing if both are listed.

### Deprecation vs. Removal Complexity
*   **Risk**: Complex tools (`set_auto_layout`) are harder to use correctly than atomic tools.
*   **Solution: Smart "Partial" Updates**
    *   *Mechanism*: Ensure the complex tool handlers (like `setAutoLayout`) strictly ignore `undefined` values.
    *   *Pros*: Allows `set_auto_layout` to function effectively as `set_padding` if only padding args are passed.
    *   *Cons*: Requires rigorous testing to ensure no side-effects.

## Recommendation

1.  **Strict Handlers**: Verify that `set_auto_layout` and `set_text_style` handlers rigorously treat missing parameters as "do not change" (noop).
2.  **Transition Period**: extensive use of aliases for the removed tools is recommended for a transition period to maintain backward compatibility with older model prompts.
