# Hard constraints (the plugin enforces)

These rules are checked inside the Figma plugin at execution time. Violating one returns a structured error code — not a soft warning — and the operation is denied. There is no way around them, so plan your calls to comply up front rather than relying on retry.

## 1. Scope is locked at connection time

The user sets an editable scope when the plugin connects. You cannot modify anything outside that scope, and you cannot change or extend it programmatically.

| Connection mode | What you can do |
|---|---|
| Connected **without** a Page/Layer link | Session is **read-only**. Every write tool fails with `READ_ONLY_MODE`. |
| Connected **with** a Page/Layer link | Writes succeed only inside that node and its descendants. Reads are always allowed. |

If a write fails with a scope error, **do not retry with the same ID** — the scope is fixed for the session. Either target a node inside the locked scope, or ask the user to reconnect with a broader scope.

## 2. Every write requires name verification

Every modification tool requires a `nodeName`. Every creation tool requires a `parentNodeName`. Batch tools require a name on each item in the array. The plugin resolves the actual name by ID and rejects the operation if it does not match.

**The only correct way to obtain a name:** read it from `node.info` or `page.info` and pass it back verbatim. Do not guess, abbreviate, normalize, translate, or "clean up" the name. Whitespace and casing must match exactly. This catches the most common failure: confidently operating on a stale or fabricated node ID.

## 3. There is no implicit selection state

No tool reads or acts on "current selection" or "last-touched node." Every tool requires explicit IDs. Never assume which node the user is looking at — discover it via `page.info` / `node.info` first.

## 4. Batch tools verify every item

`node.delete`, `text.set_content`, `annotation.set`, `instance.set_overrides`, and the other batch tools run scope and name checks on each item independently. **One invalid item fails the entire operation.** Validate every item's ID and name before calling. If a batch fails partway, re-read state before retrying — some items may already have been applied.

## 5. Node IDs from Figma URLs work as-is

Figma URLs contain node IDs with dashes (`20485-41`); the plugin API expects colons (`20485:41`). The server converts dash-format IDs automatically before forwarding. Pass URL-format IDs through unchanged — do not pre-convert them.

---

## When a constraint forbids the request

If the user asks you to do something a hard constraint forbids — e.g. "edit this node" when the session is `READ_ONLY_MODE`, or "rename it" when the parent is `OUTSIDE_SCOPE` — **do not attempt a workaround.** Explain the constraint, name the structured error code, and tell the user the concrete action they need to take (usually: reconnect with a different scope link). The constraints exist because the plugin cannot trust an agent's judgment about whether an edit is safe; respect them in your responses too.
