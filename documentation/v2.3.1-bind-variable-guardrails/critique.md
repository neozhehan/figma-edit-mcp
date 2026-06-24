# Adversarial Peer Review: v2.3.1 PRD (`node_bind_variable` Guardrails)

## Overview
This is a strong, targeted patch that addresses acute usability issues for AI agents. The decision to auto-create solid fills (D2) instead of forcing a two-step process is a great DX improvement, and moving validation to the protocol boundary (D3/D4) significantly hardens the tool.

However, cross-referencing the PRD against Figma's `VariableBindableNodeField` typings and the existing plugin codebase (`variableHandlers.ts`) reveals several edge-case crashes, incomplete allowlists, and missing auto-layout state validations that will still leak opaque errors.

---

## Findings & Vulnerabilities

### 1. CRITICAL: `SyntaxError` crash on `figma.mixed` and unsupported nodes (D2)
In §1 / D2, the PRD builds on the existing `fills`/`strokes` assignment logic. The current code extracts paints using:
```typescript
const paints = JSON.parse(JSON.stringify(node[field]));
```
This fails catastrophically in two scenarios:
1. **Mixed Paints (`figma.mixed`)**: If a text node has multiple colors applied to different characters, `node[field]` returns the unique symbol `figma.mixed`. `JSON.stringify(figma.mixed)` evaluates to `undefined`, meaning `JSON.parse(undefined)` will throw a raw `SyntaxError`.
2. **Unsupported Nodes (e.g. Groups)**: If the node type does not have a `fills` property, `node[field]` is `undefined`, causing the exact same `SyntaxError`.

> [!WARNING] 
> **Recommendation**: Before executing D2's logic, explicitly check `if (!(field in node))` and `if (node[field] === figma.mixed)`. Throw clean, actionable errors for both instead of relying on the try/catch to wrap a meaningless `SyntaxError`.

### 2. GAP: Missing Valid Fields in D3 Allowlist
The PRD's proposed `BINDABLE_FIELDS` allowlist missed four valid Figma fields. Figma's `VariableBindableNodeField` supports:
* `strokeTopWeight`
* `strokeBottomWeight`
* `strokeLeftWeight`
* `strokeRightWeight`

If D3 is implemented exactly as written, agents attempting to bind tokens to individual stroke sides will have their perfectly valid requests rejected at the schema level.

> [!IMPORTANT]
> **Recommendation**: Add these four fields to `BINDABLE_FIELDS` in `node.ts`.

### 3. INCOMPLETE: D4 Auto-layout precheck misses two opaque throws
D4 correctly prevents opaque errors when binding spacing/padding to a plain frame. However, binding these variables *to an auto-layout frame* will still throw opaque Figma errors in two specific states:
1. Binding `itemSpacing` when `node.primaryAxisAlignItems === "SPACE_BETWEEN"`. Figma enforces that spacing is driven by the container in this mode, making the field unbindable.
2. Binding `counterAxisSpacing` when `node.layoutWrap === "NO_WRAP"`. Counter axis spacing does not exist unless wrapping is enabled.

> [!TIP]
> **Recommendation**: Expand the D4 precheck to catch these conflicting layout states and throw a recoverable error advising the agent to change alignment or wrapping first.

### 4. EDGE CASE: D2 Type Mismatch on Auto-Create
When `fills` is empty, D2 proposes auto-creating a `SOLID` paint and assigning the token via `figma.variables.setBoundVariableForPaint({type:'SOLID'...}, 'color', variable)`. If the agent mistakenly passes the ID of a `FLOAT` or `STRING` variable instead of a `COLOR` variable, this call will throw.

> [!NOTE]
> **Recommendation**: The PRD should assert that the variable has `resolvedType === "COLOR"` before creating the dummy paint, or ensure the resulting type mismatch error is caught and wrapped with a clean message (e.g., "Cannot bind non-color variable to fills").

### 5. DESIGN DECISION: D2 clobbers multiple solid paints
If a node has *multiple* `SOLID` paints in its fills array (e.g., a base color and a semi-transparent black overlay fill), the D2 logic iterates and binds the token to *all* of them. 

While this inherits the existing behavior, auto-creating a single fill vs overwriting multiple existing fills feels asymmetrical and potentially destructive.

> [!NOTE]
> **Recommendation**: Clarify in the PRD whether binding to a multi-solid-fill node should intentionally overwrite all solid paints, or if it should throw an ambiguity error similar to the non-solid paint branch.
