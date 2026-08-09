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

The first insight explains the benefit of systematically checking every change before it is applied, instead of the rule being left to the AI to follow: 
**A rule enforced before every change becomes a property the file is guaranteed to keep, not a behavior the AI has to remember.**

There are two ways to stop any tool — or any person — from making a particular mistake. You can give an instruction ("don't delete something that other things still depend on") and hope it is followed, or you can put a check before the action, so the action cannot go through when it would break the rule. The first way depends on attention and memory; the second does not.

The check is the more dependable of the two: 
**A check that blocks a bad action is more reliable than an instruction telling the AI to avoid it.**

An instruction only makes the right action more likely. Whether it is followed still depends on the AI holding the rule in mind, reading the situation correctly, and choosing to apply it — and over a long session, its attention to any single rule fades. 

A check does not work that way. It runs before every action it covers, checks the file's actual current state, and gives the same answer every time — no matter which AI is connected, how full its context is, or whether it ever read the rules. The AI can still ask to do the forbidden thing; it cannot make the tool carry it out.

The value grows when the same check runs every time. Stopping one bad action prevents one mistake. Running the same check before every change keeps the rule true for the whole session, not just for one action. 

figma-edit-mcp works this way. Each of its checks enforces one such rule on every action — is the target inside the area you are working in, is it really the layer the AI named, does a new layer have somewhere to go, is the layer locked, does this variable still have things using it. Batch edits follow the same principle: the tool checks every item in a batch before changing anything, so a batch with a single bad item changes nothing.

Measured evidence supports checking each action rather than instructing the AI, and its effect on the errors a file admits. In the closest guarded-edit analogue, the SWE-agent research team gave a coding agent an edit command that discards any edit introducing a syntax error and asks the agent to retry — the same pattern figma-edit-mcp uses — and the agent solved 18.0% of its benchmark tasks with the check versus 15.0% without it. A randomized trial covering 901,776 clinical ordering sessions found that requiring a clinician to re-enter the patient's identity cut wrong-patient orders by 41%, against 16% for a click-through confirmation alone. And in a controlled security benchmark for tool-calling agents, moving the same model behind a runtime check at the tool-call boundary cut successful attacks from 40% to 5% while the model kept attempting them — the check stopped the consequence, not the attempt. ([Methods, limitations, and sources](EVIDENCE.md#safer-leads-to-cleaner).)

This is how Safer leads to Cleaner. Think of the errors in a file as a level that rises when new errors are added and falls when old ones are fixed. The checks do not erase the errors already there — they stop new ones from being added. If you and the AI keep fixing old errors while fewer new ones arrive, the level falls over time. So the checks do not clean the file; they hold a clean state in place and let ordinary work reduce what remains.

This has been measured at scale. In 2019, memory-handling errors caused 76% of Android's security vulnerabilities. Google then required new code to be written in languages whose compilers refuse memory-unsafe code, and left the existing code in place; the annual count of these vulnerabilities fell from 223 in 2019 to 85 in 2022, on the way to a projected 24% share by 2024. Google did not rewrite the old code — it kept fixing old vulnerabilities and hardening the rest while new ones stopped arriving. The decline came from reduced inflow together with continued removal, not from prevention alone. ([Methods, limitations, and sources](EVIDENCE.md#safer-leads-to-cleaner).)

Two caveats keep this connection honest:

- **A check only guarantees the rule it tests.** figma-edit-mcp can verify where an edit lands, which layer it targets, and what type of change it makes. It cannot verify whether the edit is the one you wanted. A wrong edit that follows all the rules will go through, and a check keeps a clean state in place but does not repair a defect already present. [SAFETY.md](SAFETY.md) records this as residual risk R2.
- **This project ships instructions too.** The `figma-edit` skill and the `figma-edit://guide/*` resources teach the AI the rules before it starts. They are a useful preventive layer — an AI that knows the rules wastes fewer calls on actions figma-edit-mcp would refuse — but the guarantees are stronger because they never depend on the AI reading or following them.

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

One further check belongs to this insight because it prevents a whole class of repair at once. Batch tools validate every item before changing anything, so a batch that fails validation changes nothing — the file is never left half-modified by a detectably invalid batch. The exact guarantee and its limits are defined in [SAFETY.md](SAFETY.md).

## Cleaner

Cleaner means fewer errors and less ambiguous, duplicated, or implicit state in the work environment — the design file. Broken relationships and accidental near-duplicates are removed; shared decisions are represented through authoritative variables, styles, or components when appropriate; consumers keep explicit links to those sources; and names distinguish legitimate alternatives.

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

The first insight turns on a check enforcing a rule more reliably than an instruction can, once the rule is something software can test. Cleaner leads back to Safer by determining which rules can be checked at all:
**A safeguard can reliably enforce only the relationships the file makes observable.**

Any design or engineering document can hold a decision in one of two forms. The decision can be recorded as structure that the software stores and can read back — a stated link from one thing to another. Or it can exist only as a convention: the author knows two things are meant to match, but nothing in the file says so. The two forms can produce the same visible result, but they are not the same to a checker. A check can read a recorded relationship and act on it, but it cannot read an intention that was never written down. 

So the more of the author's intent a file records as structure, the more of it a check can protect. A file that has been cleaned up in this sense — decisions written down rather than left implied — is a file in which more can be verified.

In Figma this same choice shows up in concrete pairs. A layer can be explicitly bound to a variable, or it can just happen to contain the same value. A reusable element can stay an instance of a component, or it can be a detached copy that people still expect to behave like the component. A colour or spacing value in current use can be the only one of its kind, or it can sit next to leftover near-duplicates from earlier work. In each pair the design can look identical. Only the first form of each records what was intended, so only the first can be checked.

A cleaner file records more of that intent, through three mechanisms. Each is a general idea with a direct Figma form:

1. **One authoritative copy.** A shared decision is stored once and referred to, rather than pasted into many places that can each be changed on their own. In Figma that single store is a variable, style, or component. Keeping one copy removes the situation where some uses get updated and others are silently left behind.
2. **Explicit links.** Whatever uses a shared decision stays connected to it, so the software can list every user. In Figma the plugin can find everything that uses a variable and refuse to delete it while it is still in use. It cannot do the same for a layer that merely holds an equal value, because nothing in the file records that the value was meant to follow the variable.
3. **Fewer valid-but-wrong choices.** Leftover and accidental near-duplicates are removed, so they are no longer sitting there to be picked by mistake. Distinct names help the plugin's name check tell targets apart, but the larger gain is removing alternatives that would pass every structural check and still be the wrong one.

The same pattern appears well outside design tools, which is the reason to trust it rather than treat it as a quirk of Figma:

- **Engineering CAD software** (programs that engineers use to model physical parts) — can record how the pieces of a model depend on one another. In a study that compared modelling styles, the models that recorded those dependencies showed an error pointing straight at the piece that broke when a designer changed something it relied on. A style that left the dependencies out instead produced broken geometry that still looked finished, so the mistake could pass unnoticed.
- **Databases** can be told that one record depends on another. Once that link is declared, the database refuses to delete a record that other records still point to. Without the declared link, the same deletion goes through and leaves broken references behind.
- **Copied code.** When programmers duplicate a block of code instead of sharing a single copy, a bug in the original is carried into every duplicate, and a later fix often reaches only some of them — the cost of not having one authoritative version.
- **Hospital patient names.** Units caring for newborns that gave babies near-identical temporary names, such as "Babyboy Smith," had staff place orders on the wrong baby. Giving each newborn a more distinctive name reduced those wrong-patient orders.

These are different fields, but each shows the same thing: a safeguard helps when the relationship it depends on is recorded, and cannot help when that relationship exists only by convention. ([Quotes, methods, limitations, and sources](EVIDENCE.md#cleaner-leads-to-safer).)

Stated precisely: Cleaner leads to Safer when cleanup replaces duplicated or unstated decisions with recorded objects and explicit links, or removes obsolete choices that could still be selected.

Two caveats keep the claim bounded:

- **A shared source concentrates impact.** A wrong edit to a shared variable or component reaches more places than a wrong edit to a single local copy. A shared source is safer when its links are visible and the point of change is guarded — not on its own.
- **Structure does not prove intent.** The AI can bind the wrong variable, pick the wrong but valid component, or make a wrong edit to the right target. [SAFETY.md](SAFETY.md) records this as residual risk R2.

## Faster

Faster means tasks take a shorter time to be completed correctly. This goal is where the other two pay out: Safer prevents work that would otherwise have to be diagnosed and repaired, while Cleaner reduces the search and interpretation imposed by disorder in the file. The plugin also contributes directly, by matching its tool boundaries to decision boundaries.

The fourth insight: 
**Design tools around decisions, not operations: one model turn should express all work already determined, and one tool result should provide all information needed for the next decision.**

A model turn is one reasoning cycle: the AI reads the last result, thinks, and composes its next call. A single operation does not justify another turn. Another turn is useful when the AI must see an operation's result before it can determine what follows. If the AI can already state the remaining operations — or a rule that selects them — returning after every operation adds coordination without adding judgment.

The boundary test is: **can the AI state what follows, or the rule for determining it, before seeing the result?** If yes, the work can stay inside the current call. If no, the result marks a real decision, and control should return to the AI.

"Already determined" covers more than a fixed list. It includes deterministic control logic — a filter, loop, comparison, or branch — that the AI can state now and ordinary code can apply. It does not include a choice that depends on the AI interpreting an observation it has not yet seen.

The plugin applies the insight on both sides of each exchange. On the action side, batch tools let one call express many operations, and the schemas and guides make the available actions legible enough to compose that call correctly. On the observation side, success and refusal results carry the information the next decision needs.

### Batch operations: express the whole decision

Once the AI has determined the targets and changes, a batch lets it express them in one invocation. The plugin still validates and executes every item; what disappears is the requirement to return to the AI between items that require no new judgment.

The current batch tools implement the simplest case: the AI supplies the full list of items and arguments together. The design rule also identifies a future opportunity for higher-level tools: a filter, loop, comparison, or branch could stay inside one call when the AI can state the rule before execution. That an intermediate value selects which branch runs does not by itself require another turn; a turn becomes useful when the AI must see the value before it can decide what the value means for the task.

This is why the speed of a batch does not depend on Figma executing each operation faster. Its direct contribution is that already-determined work no longer waits for repeated model re-entry.

### The contract makes each exchange decision-complete

The primary consumer of these tools is an LLM composing calls. The contract therefore has two jobs.

Before execution, it must expose the parameters, distinctions, and constraints the AI needs to translate its current decision into a valid request. A required read discovers facts about the design; trial and error caused by an ambiguous interface merely discovers facts the tool already knew.

After execution, the result must supply what the AI needs to decide what happens next. A success response should make the outcome legible. A refusal should identify the failed condition, the observed value that failed it, and — when it can do so safely — the alternatives the plugin would have accepted. An opaque result forces another turn to reconstruct information the tool already possessed.

We call such a result decision-complete: it contains what the next decision needs, and as little else as possible. Decision-complete does not mean short. Irrelevant output consumes context, but removing an exact identifier, an edit anchor, or an accepted value can create more work than the shorter result saves. The goal is the smallest result that makes the next decision possible.

Measured evidence supports this boundary rather than a blanket preference for fewer calls. Anthropic's programmatic tool calling — letting a model run many tool calls inside one turn — cut billed input tokens by roughly 38% with no change in accuracy on a multi-tool benchmark, yet on tasks whose every call depends on fresh model judgment it left scores unchanged and cost roughly 8% more. On the observation side, filtering results down to what the next decision needs improved benchmark performance by 11% while using 24% fewer input tokens; refusals that named the accepted alternatives raised repair success by roughly 40 percentage points over raw diagnostics; and a study that trimmed tool results too aggressively cut tokens but raised total cost and failures. Most of these results measure tokens, steps, and success rather than elapsed time. ([Sources, methods, and limitations](EVIDENCE.md#faster-designing-tools-around-decisions).)

That is the plugin's direct Faster contribution: **keep execution inside the tool until the AI has something new to decide; when control returns, return the facts that decision requires.**

---

These three goals and four insights produce the system described in the README: you direct the design, the AI executes the operations, and the plugin checks each one. The full list of checks, and the conditions under which each one holds, is in [SAFETY.md](SAFETY.md).
