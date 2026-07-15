# Design Philosophy

The [README](README.md) states what figma-edit-mcp does. This document explains why we built it that way. The exact enforcement rules live in [SAFETY.md](SAFETY.md), and the evidence behind the claims here — direct quotes and links to sources — is collected in [EVIDENCE.md](EVIDENCE.md).

The project pursues three goals:

- **Safer** — more errors are caught and prevented, and there are fewer ways to make an error in the first place.
- **Cleaner** — fewer errors exist in the work environment: your design file.
- **Faster** — tasks execute successfully in a shorter amount of time.

The goals are not independent. Safer leads to Cleaner and to Faster, and Cleaner leads to Faster and back to Safer. Four insights carry this reasoning: three of them explain the connections between the goals, and the fourth acts on Faster directly. Each insight is presented below at the point where it does its work.

## Safer

Safer means more errors are caught and prevented, and fewer ways exist to make one. figma-edit-mcp checks every action the AI requests, inside Figma, before the action runs. An action that fails a check is refused, with an error message that tells the AI what was wrong.

### Safer leads to Cleaner

The first insight explains why the checks actually deliver safety: 
**A programmatic check is more reliable than instructing the AI, and it costs less.**

There are two ways to stop an AI from making a specific mistake. You can instruct the AI ("never delete a variable that is still in use"), or you can write a program that checks each action and blocks the mistake.

The two differ first in reliability. An instruction produces probable compliance: an AI follows instructions most of the time, not every time, and in a long session its attention to any single rule weakens. A check produces a guarantee: it returns the same result on every call, and it does not depend on the AI's attention, the AI's context length, or which AI model is connected. The checks in figma-edit-mcp run inside the Figma plugin, so the AI cannot skip them, and the guarantee holds even for an AI that never read any instructions.

The costs differ as well. An instruction consumes tokens on every request, because its text must sit in the AI's context window every time. A check runs by itself on every call. Over any sustained use, the check is the cheaper of the two.

Two measured results support this insight. OpenAI compared the two approaches on output formatting: with instructions alone, its earlier model produced a valid complex output format in fewer than 40% of test cases; with checks, the rate was 100%. The SWE-agent research team gave a coding agent an edit command that discards any edit that introduces a syntax error and asks the agent to retry — the same pattern figma-edit-mcp uses — and the agent solved 18.0% of its benchmark tasks with that check versus 15.0% without it. ([Quotes and sources](EVIDENCE.md#safer-leads-to-cleaner).)

Reliable checks stop errors before they enter the file, and a file that receives fewer errors stays cleaner. That is the connection: Safer leads to Cleaner. Stated precisely: the checks do not make a file clean — the cleanliness comes from you and the AI doing good work — the checks stop that clean state from decaying.

This connection has been measured at scale. In 2019, memory-handling errors caused 76% of Android's security vulnerabilities. Google then required new code to be written in languages whose compilers refuse memory-unsafe code, and left the existing code in place. By the end of 2024 the share had fallen to 24%. Preventing new errors was enough to make the whole codebase cleaner, because old errors get found and fixed over time while new ones stop arriving. ([Quotes and sources](EVIDENCE.md#safer-leads-to-cleaner).)

Two caveats keep this connection honest:

- **Checks cover only what a program can verify.** figma-edit-mcp can verify where an edit lands, which layer it targets, and what type of change it makes. figma-edit-mcp cannot verify whether the edit is the one you wanted. A wrong edit that follows all the rules will go through. [SAFETY.md](SAFETY.md) records this as residual risk R2.
- **This project ships instructions too.** The `figma-edit` skill and the `figma-edit://guide/*` resources teach the AI the rules before it starts. Their purpose is efficiency, not safety: an AI that knows the rules wastes fewer calls on actions figma-edit-mcp would refuse. Safety never depends on the AI reading them.

### Safer leads to Faster

The second insight:
**Preventing an error costs less than repairing it.**

The cost saving comes from three places:

1. **Immediate containment.** A refused action does not alter the file, so later work never begins from the invalid state.
2. **Diagnosis at the boundary.** The error identifies the violated condition while the target, parameters, and intended operation are still current. A local correction replaces later investigation.
3. **No propagation or destructive recovery.** The defect does not get the opportunity to acquire consumers, be duplicated, become entangled with later valid work, or force a rollback that discards good changes.

The variable-consumer check in figma-edit-mcp illustrates the mechanism directly. Figma lets you delete a variable that layers still use, shows no warning, and provides no complete way to list and repair the resulting broken references. 

Before deletion, the figma-edit-mcp can determine whether the variable has consumers and return that diagnosis with the refused call. Without figma-edit-mcp, after an unchecked deletion, the same information is no longer readily available in Figma, and users on Figma's own forum describe the consequences: one user found [1,548 orphaned variable references](https://forum.figma.com/suggest-a-feature-11/make-it-easier-to-fix-broken-variable-references-33999) after reorganizing their variables, and users report that the "Detach deleted variables" quick action [fixes only some of them](https://forum.figma.com/ask-the-community-7/locate-and-delete-lingering-used-variables-16794). This does not quantify the average speedup of the check, but it identifies an error class for which immediate containment is predictably cheaper than reconstructing the affected state later.

Other industries recognize this insight as well, with evidence showing that early checks can produce a net time saving after their overhead is included. IBM's original inspection study reported 23% higher coding-operation productivity after counting inspection and rework effort, together with 38% fewer errors during later equivalent testing. A field study of 30 industrial software products modeled both the direct overhead of process controls and the quality-mediated reduction in rework; at the sample average, the estimated net effect was lower cycle time and effort. An observational study of 35 industrial projects found that automated static analysis identified unique defects with comparatively low find-and-fix effort and modeled a positive operational return. ([Quotes and sources](EVIDENCE.md#safer-leads-to-faster).)

Stated precisely: Safer leads to Faster as an expected end-to-end effect for the failure modes the checks cover. The effect is zero in a task where no covered harmful action would otherwise occur and largest for latent, high-fan-out, or difficult-to-reverse errors.

## Cleaner

Cleaner means fewer errors in the work environment — the design file. Fewer broken references, fewer near-duplicate tokens, fewer layers whose names carry no information.

### Cleaner leads to Faster

The third insight: 
**Defects, and the inconsistencies they cause, can compound by making it more likely for additional defects & inconsistencies to occur.**

A cleaner file does not make every task faster. The effect appears when a task must interpret, reuse, or modify the affected part of the file. Across repeated work, a cleaner file reduces the chance that the AI must stop to locate the right object, distinguish near-duplicate tokens, diagnose a latent defect, or repair an inherited mistake before it can make the requested change.

Three mechanisms produce the saving:

1. **Less search and disambiguation.** Semantic names, clear component roles, and a single authoritative token reduce the reads and decisions the AI needs to identify the intended target. Figma's own guidance for its MCP server makes the same point from the other direction: structured files with real components, semantic layer names, and variables [produce the best model output](https://developers.figma.com/docs/figma-mcp-server/structure-figma-file/).
2. **More reuse and fewer repeated decisions.** Current components, variables, and styles let the AI reuse established work instead of recreating it or searching old files for an example.
3. **Less diagnosis and rework.** Broken references, inconsistent structures, and latent binding errors create extra work for whichever later task encounters them. Preventing those conditions removes that future work.

Measured evidence supports the direction of this relationship. In a counterbalanced Figma experiment, designers completed matched tasks 34% faster when they had a current, task-relevant design system instead of old design files to search. In a controlled experiment with 72 professional developers, meaningful word identifiers made finding semantic defects 19% faster than abbreviations or single letters. Studies of CAD models, production codebases, and structural antipatterns point the same way: structure that communicates intent lowers the cost of later modification, and combinations of structural problems raise it.  ([Quotes, methods, limitations, and sources](EVIDENCE.md#cleaner-leads-to-faster).)

Stated precisely: Cleaner leads to Faster as an expected lifecycle effect. The effect is largest in frequently reused or high-churn structures.

### Cleaner leads to Safer

Several of the plugin's protections work by comparing what the AI claims against what the file actually contains. Those comparisons identify a wrong target far more reliably when layers have distinct, meaningful names than when thirty layers are all named "Frame 427". A tidy file therefore makes the plugin's own protections more effective. Cleaner and Safer reinforce each other: the checks keep the file clean, and the clean file makes the checks more accurate.

## Faster

Faster means tasks take a shorter time to be completed correctly. This goal is where the other two pay out — Safer removes the repairs, Cleaner removes the ambiguity — and the plugin adds a direct contribution of its own, built on the fourth insight.

The fourth insight: 
**An AI Agent  spends its working time in reasoning cycles — read the last result, think, compose the next call — so a task finishes fastest when it needs the fewest cycles.**

The plugin applies this insight at two scales: batch operations reduce the number of calls a task needs, and the tool contract reduces the number of cycles each call needs.

### Batch operations: one composition instead of a hundred

The speed of a batch operation does not come from Figma executing it quickly. It comes from the cycles the batch removes. Without a batch tool, the AI updates a hundred layers with a hundred separate calls — a hundred reasoning cycles. Each cycle adds its result to the AI's context, so later calls cost more than earlier ones, and every cycle is another chance for the AI's attention to drift: to skip a layer, or repeat one. A batch replaces the hundred cycles with one: the AI composes the full list of changes once and sends it once.

A batch is also safer than the sequence it replaces. The plugin validates every item in a batch before changing anything, so a batch with one bad item changes nothing. A sequence of single calls has no equivalent property: each call validates only itself, and a sequence that fails at layer 47 of 100 leaves the file half-changed — exactly the kind of inherited defect that the third insight prices: it creates work for every later change that touches it.

### The contract is written for the AI that reads it

The primary consumer of this project's tools is an LLM composing calls. Every tool is therefore designed against two tests. The first is first-call correctness: the AI should be able to compose a correct call from the schema and the guides alone — a correct first call is the fewest possible cycles. The second is one-round-trip recovery: when the plugin refuses a call, the error states clearly what was wrong, so the AI's next attempt succeeds — the failure costs one extra cycle instead of starting a chain of guesses.

Research on AI agents supports both halves with measured results. On recovery: a model that receives informative feedback about a failure fixes it far better than a model that must guess what went wrong. One study measured accuracy gains of up to 12% from execution feedback and found that good feedback can replace more than ten blind retries; another found that self-repair is bottlenecked by the model's ability to diagnose its own failures, and that better diagnostic feedback multiplied successful repairs by 1.58×. On first-call correctness: the SWE-agent team measured that the shape of a tool changes an agent's results — a search tool that presented results the way a human editor does performed worse than no search tool at all — and Anthropic's guidance for tool authors reports that even small refinements to tool descriptions can yield dramatic improvements. ([Quotes and sources](EVIDENCE.md#faster-the-fewest-reasoning-cycles).)

This insight also completes a claim made under Safer: a refusal replaces later investigation only when the error carries the diagnosis. An opaque error turns the cheap refusal into the expensive guessing that the research above measures. Google measured the same effect on human developers with its Tricorder analysis platform: for one of its checks, 75% of the bug reports filed against the check came from developers misreading the result wording, and updating the message text fixed them. ([Quotes and sources](EVIDENCE.md#faster-the-fewest-reasoning-cycles).)

---

These three goals and four insights produce the system described in the README: you direct the design, the AI executes the operations, and the plugin checks each one. The full list of checks, and the conditions under which each one holds, is in [SAFETY.md](SAFETY.md).
