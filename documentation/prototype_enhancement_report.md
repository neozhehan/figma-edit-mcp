# Prototype Enhancement Report

## Overview

This report analyzes the gap between the Figma Plugin API's prototype capabilities and what is currently exposed through the MCP tooling in this project. It provides recommendations for enabling a full create-and-modify prototype workflow with minimal new tooling.

**Current state:** The plugin covers ~10-15% of the available Figma prototype API surface, focused entirely on a read-and-visualize workflow (reading reactions and drawing FigJam connector lines). There is no ability to create or modify prototype interactions.

---

## 1. Current Prototype Tooling

### Tools

| Tool | Purpose | File |
|---|---|---|
| `get_reactions` | Recursively scans nodes for prototype reactions, filters out `CHANGE_TO`, returns results with hierarchy metadata | `src/figma_plugin/handlers/connectorHandlers.ts` → `getReactions()` |
| `create_connections` | Creates visual FigJam connector lines between nodes by cloning a template connector. Also manages default connector storage | `src/figma_plugin/handlers/connectorHandlers.ts` → `createConnections()` |

### Prompts

| Prompt | Purpose |
|---|---|
| `reaction_to_connector_strategy` | Guides the AI through a multi-step workflow to extract reactions and visualize them as connector lines |

### What These Tools Do NOT Do

- They do **not** create or modify actual prototype interactions
- They do **not** expose transition/animation configuration
- They do **not** manage prototype flows or starting points
- They do **not** control scroll/overflow behavior
- `create_connections` creates **visual documentation artifacts** (connector lines), not prototype interactions

---

## 2. Figma Plugin API — Full Prototype Surface

### 2.1 Core API Methods

| Method | Description | Current Coverage |
|---|---|---|
| `node.reactions` (read) | Array of Reaction objects on a node | Partial — `get_reactions` reads but filters and restructures |
| `node.setReactionsAsync(reactions)` | Replace the full reactions array on a node | **Not implemented** |

### 2.2 Reaction Object Structure

```typescript
interface Reaction {
  trigger: Trigger;       // How the interaction is initiated
  actions: Action[];      // What happens (replaces deprecated singular `action`)
}
```

> **Note:** The `action` (singular) field is **deprecated** by Figma in favor of `actions` (array). The current `get_reactions` handler references both `r.action` and `r.actions` for backward compatibility.

### 2.3 Trigger Types (10 types)

| Trigger Type | Properties | Notes |
|---|---|---|
| `ON_CLICK` | — | Standard click |
| `ON_HOVER` | — | Reverts when hover ends |
| `ON_PRESS` | — | Reverts when press ends |
| `ON_DRAG` | — | Drag interaction |
| `MOUSE_ENTER` | `delay` (ms) | Permanent, one-way |
| `MOUSE_LEAVE` | `delay` (ms) | Permanent, one-way |
| `MOUSE_UP` | `delay` (ms) | Permanent, one-way |
| `MOUSE_DOWN` | `delay` (ms) | Permanent, one-way |
| `AFTER_TIMEOUT` | `timeout` (ms) | Time-based auto-trigger |
| `ON_KEY_DOWN` | `device`, `keyCodes[]` | Devices: `KEYBOARD`, `XBOX_ONE`, `PS4`, `SWITCH_PRO`, `UNKNOWN_CONTROLLER` |
| `ON_MEDIA_HIT` | `mediaHitTime` (seconds) | Video-specific |
| `ON_MEDIA_END` | — | Video-specific |

### 2.4 Action Types (8 types)

| Action Type | Key Properties | Description |
|---|---|---|
| `NODE` | `destinationId`, `navigation`, `transition`, `preserveScrollPosition`, `overlayRelativePosition`, `resetVideoPosition`, `resetScrollPosition`, `resetInteractiveComponents` | Navigate to a node |
| `BACK` | — | Pop navigation history |
| `CLOSE` | — | Close topmost overlay |
| `URL` | `url`, `openInNewTab` | Open external URL |
| `SET_VARIABLE` | `variableId`, `variableValue` | Modify variable value in prototype |
| `SET_VARIABLE_MODE` | `variableCollectionId`, `variableModeId` | Switch variable mode at page level |
| `CONDITIONAL` | `conditionalBlocks[]` | If/else logic with nested actions |
| `UPDATE_MEDIA_RUNTIME` | `destinationId`, `mediaAction` | Control video playback (PLAY, PAUSE, MUTE, SKIP_TO, etc.) |

### 2.5 Navigation Types (for `NODE` actions)

| Navigation | Behavior |
|---|---|
| `NAVIGATE` | Replace current screen, close all overlays |
| `OVERLAY` | Open destination as overlay on current screen |
| `SWAP` | Replace topmost overlay (or act like NAVIGATE on top-level) |
| `SCROLL_TO` | Scroll to destination within current screen |
| `CHANGE_TO` | Change closest ancestor instance to specified variant |

### 2.6 Transitions

**Simple transitions:** `DISSOLVE`, `SMART_ANIMATE`, `SCROLL_ANIMATE`

**Directional transitions:** `MOVE_IN`, `MOVE_OUT`, `PUSH`, `SLIDE_IN`, `SLIDE_OUT` — each with direction: `LEFT`, `RIGHT`, `TOP`, `BOTTOM`

**Common properties:**
- `duration` (ms)
- `easing` — one of 13 types: `LINEAR`, `EASE_IN`, `EASE_OUT`, `EASE_IN_AND_OUT`, `EASE_IN_BACK`, `EASE_OUT_BACK`, `EASE_IN_AND_OUT_BACK`, `GENTLE`, `QUICK`, `BOUNCY`, `SLOW`, `CUSTOM_CUBIC_BEZIER`, `CUSTOM_SPRING`
- `matchLayers` (boolean, for directional transitions — enables smart animate layer matching)

**Custom easing:**
- Cubic bezier: `{ x1, y1, x2, y2 }`
- Spring: `{ mass, stiffness, damping, initialVelocity }`

### 2.7 Page-Level Prototype Properties

| Property | API Method | Writable | Current Coverage |
|---|---|---|---|
| `flowStartingPoints` | `PageNode.flowStartingPoints` | Read-only (`ReadonlyArray<{ nodeId, name }>`) | Not implemented |
| `overflowDirection` | `FrameNode.overflowDirection` | Yes | Not implemented |

---

## 3. Gap Analysis

### 3.1 Critical Gaps

| Gap | Impact | Figma API Available |
|---|---|---|
| **Cannot create prototype interactions** | Blocks the entire create-and-modify workflow | `setReactionsAsync()` |
| **Cannot modify existing interactions** | Cannot adjust triggers, actions, transitions, or destinations | `setReactionsAsync()` |
| **Cannot delete specific interactions** | Cannot remove individual reactions from a node | `setReactionsAsync()` (write filtered array) |

### 3.2 Secondary Gaps

| Gap | Impact | Figma API Available |
|---|---|---|
| No transition/animation control | Cannot set animation type, duration, easing | Part of `setReactionsAsync()` via Transition objects |
| No advanced action support | Cannot create SET_VARIABLE, CONDITIONAL, URL, or MEDIA actions | Part of `setReactionsAsync()` via Action objects |
| No overflow direction control | Cannot enable scrollable frames for prototypes | `overflowDirection` property on FrameNode |

### 3.3 Read-Side Gaps

| Gap | Impact |
|---|---|
| `get_reactions` filters out `CHANGE_TO` | Data loss on read-modify-write round-trips |
| `get_reactions` restructures data | Adds `depth`, `path`, `nodesWithReactions` metadata that is irrelevant for modification |
| `get_reactions` always does deep recursive scan | Inefficient when modifying reactions on a single known node |
| No raw single-node reaction read | No way to get the exact reaction array needed for `setReactionsAsync()` |

---

## 4. Recommendation

### Minimum: 1 New MCP Tool

A single `set_reactions` tool wrapping `node.setReactionsAsync()` enables the full create-and-modify workflow.

**Tool definition:**

```
Tool: set_reactions
Parameters:
  - nodeId: string (required) — target node
  - nodeName: string (required) — name verification (follows existing safety pattern)
  - reactions: Reaction[] (required) — full reactions array to set on the node
```

This single tool covers:
- Creating new interactions (write new array)
- Modifying existing interactions (read via `get_reactions`, alter, write back)
- Deleting interactions (write filtered array or `[]`)
- All 10 trigger types
- All 8 action types
- All 5 navigation types
- All transition/animation configurations
- All overlay, scroll, and reset properties

### Recommended Existing Tool Modifications

These changes to existing tools complement the new tool without adding to the tool count:

1. **`get_reactions` — add a `raw` mode parameter**
   - When `raw: true`, return the unfiltered `node.reactions` array for a single node without restructuring
   - Preserves backward compatibility for the visualization workflow
   - Enables clean read-modify-write cycles

2. **`set_auto_layout` — add `overflowDirection` parameter**
   - `overflowDirection` is conceptually tied to frame scrolling behavior
   - Values: `NONE`, `HORIZONTAL`, `VERTICAL`, `BOTH`
   - Natural fit alongside existing layout properties

---

## 5. Caveats and Gotchas

### 5.1 `setReactionsAsync()` Replaces the Entire Array

The Figma API does not support adding or removing individual reactions. `setReactionsAsync()` **replaces the entire reactions array** on the node. This means:

- To add a reaction: read current reactions, append the new one, write the full array back
- To remove a reaction: read current reactions, filter out the unwanted one, write back
- To modify a reaction: read, find and alter the target, write back
- **Risk:** If `get_reactions` filters out `CHANGE_TO` reactions (as it currently does), those will be silently lost when writing back. The raw mode mentioned above is essential to prevent this.

### 5.2 Deprecated `action` vs. `actions` Field

Figma deprecated the singular `action` field on Reaction in favor of `actions` (array) to support multiple actions per trigger. The current `get_reactions` handler checks both:

```typescript
if (r.action && r.action.navigation === 'CHANGE_TO') return false;
if (Array.isArray(r.actions)) { ... }
```

The new `set_reactions` tool should:
- Always write using the `actions` array format
- Accept both formats as input for flexibility, but normalize to `actions` before calling `setReactionsAsync()`

### 5.3 `destinationId` Can Be Null or Invalid

When a destination node is deleted in Figma, the reaction's `destinationId` becomes `null` but the reaction object persists. The tool should:
- Allow `null` destinationId (for actions like `BACK`, `CLOSE`)
- Not validate destinationId existence on write (Figma handles this gracefully)

### 5.4 Interactive Components and `CHANGE_TO`

`CHANGE_TO` navigation is used for interactive component variant swapping. The current `get_reactions` tool explicitly filters these out because they're not meaningful as connector lines. However, for a create-and-modify workflow, `CHANGE_TO` is a valid and important interaction type (e.g., toggle buttons, tab switches). The `set_reactions` tool must not filter these.

### 5.5 Font Loading for Connector Text

The existing `createConnections` handler has a three-level font fallback chain (default connector font → Inter Regular → Inter Medium → System). This is a known fragility point. The `set_reactions` tool does not have this issue since it deals with data, not visual elements.

### 5.6 Nested Node IDs (Semicolons)

Figma uses semicolons in node IDs for nested instances (e.g., `I123:456;789:012`). The existing MCP server normalizes IDs (colons ↔ dashes) in `figma-client.ts`. The `destinationId` inside reaction objects would need the same normalization treatment when passing through the MCP server, since these IDs appear deep inside nested JSON structures rather than as top-level parameters.

### 5.7 Node Name Verification Scope

All write tools in the plugin require `nodeName` for verification to prevent AI hallucination of stale IDs. For `set_reactions`, this is straightforward for the target node. However, `destinationId` values inside the reactions array reference other nodes — these are **not** verified. This is consistent with how Figma itself handles it (reactions can point to any node), but it means the AI could write reactions pointing to incorrect destinations without the plugin catching it.

### 5.8 `flowStartingPoints` Is Read-Only

Despite being a useful prototype feature, `PageNode.flowStartingPoints` is a `ReadonlyArray` in the Plugin API. It cannot be modified programmatically. No tool is needed for this — it's controlled entirely through the Figma UI.

### 5.9 Reaction Object Complexity

The full reaction schema is deeply nested. Example of a moderately complex reaction:

```json
{
  "trigger": { "type": "ON_CLICK" },
  "actions": [{
    "type": "NODE",
    "destinationId": "123:456",
    "navigation": "OVERLAY",
    "transition": {
      "type": "MOVE_IN",
      "direction": "BOTTOM",
      "matchLayers": false,
      "duration": 300,
      "easing": { "type": "EASE_OUT" }
    },
    "preserveScrollPosition": false,
    "overlayRelativePosition": { "x": 0, "y": 0 },
    "resetScrollPosition": true,
    "resetInteractiveComponents": false,
    "resetVideoPosition": false
  }]
}
```

The AI model needs to construct these correctly. Providing a well-documented tool schema with Zod validation that includes clear descriptions for each nested field will be critical for reliable usage.

### 5.10 Scope Lock and Read-Only Mode

The plugin enforces a scope lock (`scopeRootId`) and read-only mode based on whether the plugin was opened with a link to a specific node. `set_reactions` must respect this:
- In read-only mode: deny the write
- With a scope lock: only allow setting reactions on nodes within the scoped subtree
- The destination nodes referenced in reactions do **not** need to be within scope (they are IDs, not mutations on those nodes)

---

## 6. Implementation Priority

| Priority | Item | Effort | Impact |
|---|---|---|---|
| **P0** | New `set_reactions` tool | Medium | Unlocks entire create-and-modify workflow |
| **P0** | Add `raw` mode to `get_reactions` | Low | Required for safe read-modify-write cycles |
| **P1** | Add `overflowDirection` to `set_auto_layout` | Low | Enables scrollable prototype frames |
| **P2** | Add a `set_reactions_strategy` prompt | Low | Guides AI through common prototyping patterns |
| **P2** | Zod schema with detailed field descriptions | Medium | Critical for AI reliability with complex nested objects |

---

## References

- [reactions property](https://developers.figma.com/docs/plugins/api/properties/nodes-reactions/)
- [Reaction type](https://developers.figma.com/docs/plugins/api/Reaction/)
- [Action type](https://developers.figma.com/docs/plugins/api/Action/)
- [Trigger type](https://developers.figma.com/docs/plugins/api/Trigger/)
- [Transition type](https://developers.figma.com/docs/plugins/api/Transition/)
- [flowStartingPoints](https://developers.figma.com/docs/plugins/api/properties/PageNode-flowstartingpoints/)
- [overflowDirection](https://developers.figma.com/docs/plugins/api/properties/nodes-overflowdirection/)
- [Prototype write plugin example](https://github.com/adispezio/figma-plugin-example-prototype-write)
