# Design Philosophy

The [README](README.md) states what figma-edit-mcp does. This document explains why we built it that way. The exact enforcement rules live in [SAFETY.md](SAFETY.md).

The reasoning rests on two hypotheses about cost (sections 1 and 2), one observation about how errors behave in design files (section 3), and an honest account of how the three goals — Safer, Cleaner, Faster — relate to each other (section 4). We call the first two "hypotheses" deliberately: they are working assumptions with supporting evidence, not proven laws, and each one states the conditions under which it holds.

## 1. Preventing an error costs less than repairing it

Preventing an error costs one refused call: the plugin rejects the action, the AI reads the error message, and the AI adjusts its plan. Repairing an error costs much more, because repair has several stages. Someone must notice the error, find every place it reached, and fix each place separately.

In Figma, the finding stage is often the most expensive stage, because Figma provides few repair tools. One concrete example: Figma lets you delete a variable that layers still use. Figma shows no warning, and the deletion leaves a broken reference on every layer that used the variable. Figma has no feature that lists those broken references. Users on Figma's own forum describe the consequences: one user found [1,548 orphaned variable references](https://forum.figma.com/suggest-a-feature-11/make-it-easier-to-fix-broken-variable-references-33999) after reorganizing their variables, and users report that the "Detach deleted variables" quick action [fixes only some of them](https://forum.figma.com/ask-the-community-7/locate-and-delete-lingering-used-variables-16794). figma-edit-mcp refuses this deletion instead: `variable_delete` scans the document for layers, styles, and variables that still use the target, and rejects the call while any of them exists.

Prevention is not free, and we do not pretend it is. The consumer scan reads every page of the document before it allows a deletion. The plugin sometimes refuses an action you genuinely wanted, and the refusal costs the AI a retry. We accept these costs because two conditions hold in this setting:

1. AI assistants make mistakes at a meaningful rate. That is the premise of this project.
2. Figma's repair tooling is weak, so the cost of repair is high, and sometimes there is no complete repair at all.

If either condition changes — if AI assistants stop making mistakes, or if Figma ships a complete broken-reference finder — this trade-off should be re-examined.

## 2. A programmatic check costs less than instructing the AI, and it is more reliable

There are two ways to stop an AI from making a specific mistake. You can instruct the AI ("never delete a variable that is still in use"), or you can write a program that checks each action and blocks the mistake.

Instructions cost tokens on every request, because the instruction text must sit in the AI's context window every time. Instructions also fail sometimes: an AI follows instructions most of the time, not every time, and in a long session the AI's attention to any single rule weakens.

A programmatic check has the opposite cost profile. Writing the check correctly costs engineering effort once. After that, the check costs almost nothing per call, and it returns the same result every time. The check does not depend on the AI's attention, the AI's context length, or which AI model is connected.

The reliability difference matters more than the cost difference. An instruction produces probable compliance. A check produces a guarantee. The checks in this project run inside the Figma plugin, so the AI cannot skip them, and the guarantee holds even for an AI that never read any instructions.

Two caveats keep this claim honest:

- **Checks cover only what a program can verify.** The plugin can verify where an edit lands, which layer it targets, and what type of change it makes. The plugin cannot verify whether the edit is the one you wanted. A wrong edit that follows all the rules will go through. [SAFETY.md](SAFETY.md) records this as residual risk R2.
- **This project ships instructions too.** The `figma-edit` skill and the `figma-edit://guide/*` resources teach the AI the rules before it starts. Their purpose is efficiency, not safety: an AI that knows the rules wastes fewer calls on actions the plugin would refuse. Safety never depends on the AI reading them.

## 3. Errors in a design file compound

An error in a Figma file rarely stays where it landed. Three properties of design work spread it:

1. **Designers duplicate things.** When a designer duplicates a frame or component that contains an error, the file now contains two copies of the error, and each copy can be duplicated again.
2. **Variables and styles fan out.** One variable can be bound to hundreds of layers. One wrong edit to that variable produces hundreds of wrong layers at once.
3. **Many errors are invisible at first.** A layer bound to the wrong variable can still display the correct color in the current mode. The error becomes visible only when someone switches modes or resizes the frame, and that may happen weeks later.

Together, these properties create a repeating cycle:

1. An error lands in the file.
2. The error spreads through duplication and variable bindings before anyone notices it.
3. The file becomes less consistent: some layers use design tokens and some use hard-coded values, and some components exist in several near-duplicate versions.
4. The inconsistent file misleads the AI. When the AI reads the file, it must choose between ambiguous layer names and near-duplicate tokens, and it chooses wrongly more often.
5. The AI's new errors join the old ones, and the cycle repeats from step 1.

Steps 3 and 4 also make the AI slower, not only more error-prone. The AI spends part of its context window resolving the inconsistencies — deciding which of two similar variables is the real one, or reading deeper into the layer tree because the layer names carry no information. Figma's own guidance for its MCP server makes the same point from the other direction: structured files with real components, semantic layer names, and variables [produce the best AI results](https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server) ([details](https://developers.figma.com/docs/figma-mcp-server/structure-figma-file/)).

The plugin cannot stop every error, but it places its strictest checks where errors spread fastest. Variables, shared-library assets, and component instances have the highest fan-out in a Figma file, and each one has a dedicated guard: the in-use scan for variable deletion, the remote-asset block for shared-library assets, and the structural block for the inside of component instances.

## 4. How the three goals relate

The three goals are connected, but the connections run in specific directions, and we claim only the connections that are real.

**Safer preserves Cleaner.** The safety checks do not make a file clean. They stop a clean file from becoming messy. The cleanliness itself comes from you and the AI doing good work; the checks prevent a bad edit from destroying that work.

**Cleaner enables Faster.** A consistent file lets the AI find the right layer and the right token without extra reasoning, for the reasons in section 3. A messy file forces the AI to spend context resolving ambiguity before it can start your task.

**Cleaner also strengthens Safer.** Every edit must name its target layer, and the plugin refuses the edit when the name does not match ([SAFETY.md](SAFETY.md), guarantee G2). This check identifies a wrong target far more reliably when layers have distinct, meaningful names than when thirty layers are all named "Frame 427". A tidy file therefore makes the plugin's own protections more effective.

**Two connections we do not claim.** Faster does not cause Safer: the speed comes from batch operations, and batch operations run equally fast on safe and unsafe systems. Safer does not cause Faster directly: every check adds a small delay to every call, and a refused call costs the AI a retry. Safety pays off over a whole session, because every prevented error removes a repair that would have cost far more — but any single checked call is slightly slower than an unchecked one would be.

---

These four arguments produce the system described in the README: you direct the design, the AI executes the operations, and the plugin checks each one. The full list of checks, and the conditions under which each one holds, is in [SAFETY.md](SAFETY.md).
