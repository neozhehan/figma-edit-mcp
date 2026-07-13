# Design Philosophy

The [README](README.md) states what figma-edit-mcp does. This document explains why we built it that way. The exact enforcement rules live in [SAFETY.md](SAFETY.md), and the evidence behind the claims here — direct quotes and links to sources — is collected in [EVIDENCE.md](EVIDENCE.md).

The project pursues three goals:

- **Safer** — more errors are caught and prevented, and there are fewer ways to make an error in the first place.
- **Cleaner** — fewer errors exist in the work environment: your design file.
- **Faster** — tasks execute faster.

The goals are not independent. Safer leads to Cleaner and to Faster, and Cleaner leads to Faster and back to Safer. Four insights carry this reasoning: three of them explain the connections between the goals, and the fourth acts on Faster directly. Each insight is presented below at the point where it does its work.

## Safer

Safer means more errors are caught and prevented, and fewer ways exist to make one. The plugin checks every action the AI requests, inside Figma, before the action runs. An action that fails a check is refused, with an error message that tells the AI what was wrong.

### Safer leads to Cleaner

The first insight explains why the checks actually deliver safety: **a programmatic check is more reliable than instructing the AI, and it costs less.**

There are two ways to stop an AI from making a specific mistake. You can instruct the AI ("never delete a variable that is still in use"), or you can write a program that checks each action and blocks the mistake.

The two differ first in reliability. An instruction produces probable compliance: an AI follows instructions most of the time, not every time, and in a long session its attention to any single rule weakens. A check produces a guarantee: it returns the same result on every call, and it does not depend on the AI's attention, the AI's context length, or which AI model is connected. The checks in this project run inside the Figma plugin, so the AI cannot skip them, and the guarantee holds even for an AI that never read any instructions.

The costs differ as well. Writing either one costs effort up front, and an instruction is cheaper to write than a check. The running costs reverse this. An instruction consumes tokens on every request, because its text must sit in the AI's context window every time. A check runs by itself on every call. Over any sustained use, the check is the cheaper of the two.

Two measured results support this insight. OpenAI compared the two approaches on output formatting: with instructions alone, its earlier model produced a valid complex output format in fewer than 40% of test cases; with enforcement, the rate was 100%. The SWE-agent research team gave a coding agent an edit command that discards any edit that introduces a syntax error and asks the agent to retry — the same pattern this plugin uses — and the agent solved 18.0% of its benchmark tasks with that check versus 15.0% without it. ([Quotes and sources](EVIDENCE.md#section-2-a-programmatic-check-is-more-reliable-than-instructing-the-ai).)

Reliable checks stop errors before they enter the file, and a file that receives fewer errors stays cleaner. That is the connection: Safer leads to Cleaner. Stated precisely: the checks do not make a file clean — the cleanliness comes from you and the AI doing good work — the checks stop that clean state from decaying.

This connection has been measured at scale. In 2019, memory-handling errors caused 76% of Android's security vulnerabilities. Google then required new code to be written in languages whose compilers refuse memory-unsafe code, and left the existing code in place. By the end of 2024 the share had fallen to 24%. Preventing new errors was enough to make the whole codebase cleaner, because old errors get found and fixed over time while new ones stop arriving. ([Quotes and sources](EVIDENCE.md#section-4-how-the-three-goals-relate).)

Two caveats keep this connection honest:

- **Checks cover only what a program can verify.** The plugin can verify where an edit lands, which layer it targets, and what type of change it makes. The plugin cannot verify whether the edit is the one you wanted. A wrong edit that follows all the rules will go through. [SAFETY.md](SAFETY.md) records this as residual risk R2.
- **This project ships instructions too.** The `figma-edit` skill and the `figma-edit://guide/*` resources teach the AI the rules before it starts. Their purpose is efficiency, not safety: an AI that knows the rules wastes fewer calls on actions the plugin would refuse. Safety never depends on the AI reading them.

### Safer leads to Faster

The second insight: **preventing an error costs less than repairing it.**

Preventing an error costs one refused call: the plugin rejects the action, the AI reads the error message, and the AI adjusts its plan. Repairing an error costs much more, because repair has several stages. Someone must notice the error, find every place it reached, and fix each place separately.

In Figma, the finding stage is often the most expensive stage, because Figma provides few repair tools. One concrete example: Figma lets you delete a variable that layers still use. Figma shows no warning, and the deletion leaves a broken reference on every layer that used the variable. Figma has no feature that lists those broken references. Users on Figma's own forum describe the consequences: one user found [1,548 orphaned variable references](https://forum.figma.com/suggest-a-feature-11/make-it-easier-to-fix-broken-variable-references-33999) after reorganizing their variables, and users report that the "Detach deleted variables" quick action [fixes only some of them](https://forum.figma.com/ask-the-community-7/locate-and-delete-lingering-used-variables-16794). figma-edit-mcp refuses this deletion while the variable is still in use.

Other fields learned the same rule long ago. A relational database with foreign-key constraints refuses to delete a record while other records still reference it; this project applies the same rule to design tokens. The cost of skipping validation can be very large: in 2022, Unity Technologies ingested bad data from a large customer into its ad-targeting models, and Unity's management estimated the damage at about $110 million, roughly 8% of the company's expected annual revenue. A study of 400 real JavaScript bugs found that a static type checker — a mechanical check that runs before code ships — could have prevented 15% of them. ([Quotes and sources](EVIDENCE.md#section-1-preventing-an-error-costs-less-than-repairing-it).)

This claim is about net cost: the overhead of prevention is included in the comparison, and prevention is still an order of magnitude cheaper. Broken variable references are only the clearest example. A bulk edit that hits the wrong layers, a delete that lands on the wrong node, an edit that damages a shared component — each of these takes a moment to refuse, and hours to notice, locate, and undo once it reaches the file. Version history does not change this: restoring an old version repairs the error by discarding every good change made after it.

This cost difference is what turns safety into speed. Every error the plugin refuses is a repair that never lands on anyone's schedule: fewer errors to fix leaves more time to execute the task. One honest qualification: each check adds a small delay to each call, and a refused call costs the AI a retry, so any single checked call is slightly slower than an unchecked one. The saving appears over the whole session, where each prevented error removes a repair that would have cost far more. The largest ongoing study of software delivery supports this: DORA's yearly research finds that speed and stability are not opposites — the teams that ship the fastest also run the most stable systems, because their changes are small, validated, and easy to recover from. ([Quotes and sources](EVIDENCE.md#section-4-how-the-three-goals-relate).)

## Cleaner

Cleaner means fewer errors in the work environment — the design file. Fewer broken references, fewer near-duplicate tokens, fewer layers whose names carry no information.

### Cleaner leads to Faster

The third insight: **errors in a design file compound.**

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

The compounding effect has been measured on AI agents directly. The SWE-agent team found that its coding agent made at least one invalid edit in 51.7% of its runs, and that the chance of recovering from a failed edit fell as failed edits accumulated — each uncorrected error made recovery from the next one less likely. Manufacturing reached the same conclusion decades earlier: Toyota's production system stops the line the moment a defect is detected, because a defect that travels downstream costs more at every later station. ([Quotes and sources](EVIDENCE.md#section-3-errors-in-a-design-file-compound).)

This is why Cleaner leads to Faster. In a clean file, fewer errors exist to spread, so the cycle never gathers speed, and the AI starts on your task at once instead of reasoning around old mistakes. The plugin cannot stop every error, but it places its strictest protections where errors spread fastest: variables, shared-library assets, and component instances have the highest fan-out in a Figma file, and they are guarded accordingly.

### Cleaner leads to Safer

Several of the plugin's protections work by comparing what the AI claims against what the file actually contains. Those comparisons identify a wrong target far more reliably when layers have distinct, meaningful names than when thirty layers are all named "Frame 427". A tidy file therefore makes the plugin's own protections more effective. Cleaner and Safer reinforce each other: the checks keep the file clean, and the clean file makes the checks more accurate.

## Faster

Faster means tasks take a shorter time to be completed correctly. This goal is where the other two pay out — Safer removes the repairs, Cleaner removes the ambiguity — and the plugin adds a direct contribution of its own, built on the fourth insight.

The fourth insight: **an AI spends its working time in reasoning cycles — read the last result, think, compose the next call — so a task finishes fastest when it needs the fewest cycles.**

The plugin applies this insight at two scales: batch operations reduce the number of calls a task needs, and the tool contract reduces the number of cycles each call needs.

### Batch operations: one composition instead of a hundred

The speed of a batch operation does not come from Figma executing it quickly. It comes from the cycles the batch removes. Without a batch tool, the AI updates a hundred layers with a hundred separate calls — a hundred reasoning cycles. Each cycle adds its result to the AI's context, so later calls cost more than earlier ones, and every cycle is another chance for the AI's attention to drift: to skip a layer, or repeat one. A batch replaces the hundred cycles with one: the AI composes the full list of changes once and sends it once.

A batch is also safer than the sequence it replaces. The plugin validates every item in a batch before changing anything, so a batch with one bad item changes nothing. A sequence of single calls has no equivalent property: each call validates only itself, and a sequence that fails at layer 47 of 100 leaves the file half-changed — exactly the kind of inconsistency that the third insight says will spread.

### The contract is written for the AI that reads it

The primary consumer of this project's tools is not a person reading documentation; it is an LLM composing calls. Every tool is therefore designed against two tests. The first is first-call correctness: the AI should be able to compose a correct call from the schema and the guides alone — a correct first call is the fewest possible cycles. The second is one-round-trip recovery: when the plugin refuses a call, the error states what was wrong, so the AI's next attempt succeeds — the failure costs one extra cycle instead of starting a chain of guesses.

Research on AI agents supports both halves with measured results. On recovery: a model that receives informative feedback about a failure fixes it far better than a model that must guess what went wrong. One study measured accuracy gains of up to 12% from execution feedback and found that good feedback can replace more than ten blind retries; another found that self-repair is bottlenecked by the model's ability to diagnose its own failures, and that better diagnostic feedback multiplied successful repairs by 1.58×. On first-call correctness: the SWE-agent team measured that the shape of a tool changes an agent's results — a search tool that presented results the way a human editor does performed worse than no search tool at all — and Anthropic's guidance for tool authors reports that even small refinements to tool descriptions can yield dramatic improvements. ([Quotes and sources](EVIDENCE.md#section-5-first-call-correctness-and-one-round-trip-recovery).)

This insight also completes a claim made under Safer: a refused call costs the AI one retry only when the error carries the diagnosis. An opaque error turns the cheap refusal into the expensive guessing that the research above measures.

---

These three goals and four insights produce the system described in the README: you direct the design, the AI executes the operations, and the plugin checks each one. The full list of checks, and the conditions under which each one holds, is in [SAFETY.md](SAFETY.md).
