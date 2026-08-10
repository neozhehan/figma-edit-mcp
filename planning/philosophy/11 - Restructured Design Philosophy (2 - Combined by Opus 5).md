# Design Philosophy

> **Draft.** A merge of [09](./09%20-%20Restructured%20Design%20Philosophy.md) and [10](./10%20-%20Restructured%20Design%20Philosophy%20(Corrected%20by%20GPT-5.6%20Sol).md), in response to [08 - Causal Structure Review.md](./08%20-%20Causal%20Structure%20Review.md). It takes the skeleton, naming, and application guidance from 10, and the evidence specificity, worked example, and project grounding from 09. Notes on what was taken from where, and the remaining follow-ups, are at the end.

The [README](../../README.md) explains what figma-edit-mcp does. This document explains the principles behind designing tools for AI agents, and why figma-edit-mcp is built the way it is. The exact enforcement guarantees and their conditions live in [SAFETY.md](../../SAFETY.md). Sources, methods, and limitations for every empirical claim here are collected in [EVIDENCE.md](../../EVIDENCE.md).

## Who this is built for

An AI agent does not use a tool the way a person uses a graphical interface. It composes calls from the instructions, state, and results available in its context.

Four characteristics shape the design:

- **Instructions influence behavior but do not guarantee it.** The model can misunderstand a rule, overlook it, or fail to apply it in a situation it did not recognize.
- **The model can reliably use only the distinctions the environment and interface expose.** A consequential relationship that exists only in a person's head cannot guide a check or a tool call.
- **Every model–tool round trip has a coordination cost.** A round trip is worth paying for when its result changes what the model should decide next.
- **The model is capable and fallible.** It can produce a plausible request that is structurally valid and still wrong.

Four principles follow:

1. **Put enforceable rules in the tool, not only in the prompt.**
2. **Make consequential relationships explicit.**
3. **Keep already-determined work inside one call; return control when new judgment is needed.**
4. **Make each exchange decision-complete.**

The first two shape which states and actions the tool makes possible. The last two shape how efficiently the model and tool work together. None of them are specific to Figma; the sections below state each one generally and then show the form it takes in this project.

## What we are trying to achieve

The principles serve three goals:

- **Safer** — fewer erroneous actions are allowed to take effect, and there are fewer plausible ways to make an error.
- **Cleaner** — the artifact contains fewer broken, inconsistent, duplicated, or accidental states, and more consequential relationships are represented explicitly.
- **Faster** — correct work takes less time, whether in the current task or in later work that reuses or changes the same artifact.

Cleaner contains two related but distinct ideas:

1. **State quality** — fewer defects and inconsistencies.
2. **Structural clarity** — shared decisions, dependencies, and legitimate alternatives are represented clearly.

The distinction matters, and the two principles draw on different halves. A check can preserve state quality without making the artifact more explicit. Explicit structure can make a new check possible without removing any existing defect.

### The goals are connected, not additive

A single event can appear under all three goals. If a check prevents a broken reference, the action is safer, the artifact stays cleaner, and later repair time is avoided. That is one causal chain seen from three sides, not three independent benefits. Where this document traces a connection between goals, it is describing a path, not adding a column.

### Safer and Cleaner form a maintenance cycle

Cleaner structure makes more safeguards possible. Safeguards then preserve the clean state against the regressions they cover.

The cycle is not self-starting. Explicit structure has to be created first, a rule has to be implemented over it, and existing defects still have to be repaired by ordinary work. Enforcement preserves a covered condition; it does not create the initial clean state.

Faster does not lead back to the other two. Speed is where the first two goals become visible, and some ways of going faster work against them — a larger execution unit removes coordination but also removes the points at which a mistaken plan could have been noticed. Nor are Safer and Cleaner only means to Faster. A design file that was not destroyed has value independent of any time saved.

## Principle 1 — Put enforceable rules in the tool, not only in the prompt

**Programmatic checks are more reliable than instructions for enforcing mechanically checkable rules.**

An instruction asks the model to remember a rule, recognize when it applies, and follow it. Instructions are valuable, because they improve the requests the model proposes. But they cannot guarantee that every proposal will comply.

A programmatic check controls whether a proposal takes effect. It evaluates the relevant state at the point of change and refuses a request that violates the rule. It gives the same answer every time — no matter which model is connected, how full its context is, or whether it ever read the rules. The model can still propose the prohibited action; the tool does not have to carry it out.

This produces a stronger property than an instruction can:

> **A rule enforced at every relevant change turns a desired behavior from something the model should remember into a condition every accepted change must preserve.**

That guarantee holds when three things are true:

- the check evaluates a mechanically testable rule using state the tool can observe;
- every change capable of violating the rule passes through the check; and
- a refused request leaves the artifact unchanged.

If the condition holds at the start, every accepted change preserves it. The guarantee is narrow and strong: it covers the rule being checked, not whether the model's plan matches the user's intent.

**In figma-edit-mcp.** Every action the model requests is checked inside Figma before it runs, and a failing action is refused with an error naming what was wrong. Each check enforces one rule on every action: is the target inside the area you are working in, is it really the layer the model named, does a new layer have somewhere to go, is the layer locked, does this variable still have things using it. Batch tools validate every item before changing anything, so a batch with a single bad item changes nothing.

### How Safer leads to Cleaner

A check reduces the inflow of the defects it covers. It does not repair defects already present.

Think of the errors in an artifact as a level that rises when new errors are admitted and falls when old ones are repaired. Checks do not lower the level; they slow what raises it. If ordinary work keeps repairing old errors while fewer new ones arrive, the level falls over time.

Two consequences follow, and both matter for stating the claim honestly. The artifact can still get worse in absolute terms, if uncovered defects arrive faster than repair removes them. And it is nevertheless cleaner than the otherwise-equivalent artifact in which the covered bad changes were allowed through. Safeguards preserve covered good states and admit fewer covered defects; continued repair is what turns lower inflow into a declining defect stock.

### How Safer leads to Faster

A refusal at the point of change can replace the later work of discovering, diagnosing, untangling, and repairing a defect after other work has come to depend on it. The effect is largest for errors that are costly to discover late, spread to many dependents, or are difficult to reverse. It is zero in a task where no covered harmful action would have occurred.

The claim is not that checking is free. Enforcement is faster overall when the downstream work it avoids exceeds the cost of running the checks and correcting the refusals they produce.

### Instructions and checks are complementary

Instructions teach rules and workflows, which reduces invalid proposals, wasted calls, and avoidable refusals. Checks stop the invalid proposals that remain from taking effect. Use instructions to teach the model how to succeed; use checks for rules that must hold even when the model does not follow the instruction.

This project ships both. The `figma-edit` skill and the `figma-edit://guide/*` resources teach the model the rules before it starts. They are a genuine preventive layer, but the guarantees are stronger than they are, because the guarantees never depend on the model reading or following anything.

### Evidence

**Enforcement compared against instruction.** In the closest guarded-edit analogue, the SWE-agent research team gave a coding agent an edit command that discards any edit introducing a syntax error and asks the agent to retry — the same pattern figma-edit-mcp uses — and the agent solved 18.0% of its benchmark tasks with the check versus 15.0% without it. A randomized trial covering 901,776 clinical ordering sessions found that requiring a clinician to re-enter the patient's identity cut wrong-patient orders by 41%, against 16% for a click-through confirmation alone. In a controlled security benchmark for tool-calling agents, moving the same model behind a runtime check at the tool-call boundary cut successful attacks from 40% to 5% while the model kept attempting them — the check stopped the consequence, not the attempt.

**Inflow and repair, over years.** In 2019, memory-handling errors caused 76% of Android's security vulnerabilities. Google then required new code to be written in languages whose compilers refuse memory-unsafe code, and left the existing code in place. The annual count of these vulnerabilities fell from 223 in 2019 to 85 in 2022, on the way to a projected 24% share by 2024. Google did not rewrite the old code; it kept repairing old vulnerabilities while new ones stopped arriving. The decline came from reduced inflow together with continued removal, not from prevention alone.

**Prevention measured against repair, including the overhead of checking.** IBM's original inspection study reported 23% higher coding-operation productivity after counting inspection and rework effort, together with 38% fewer errors during later equivalent testing. A field study of 30 industrial software products modeled both the direct overhead of process controls and the quality-mediated reduction in rework; at the sample average, the estimated net effect was lower cycle time and effort. An observational study of 35 industrial projects found that automated static analysis identified unique defects with comparatively low find-and-fix effort and modeled a positive operational return.

See [Safer leads to Cleaner](../../EVIDENCE.md#safer-leads-to-cleaner) and [Safer leads to Faster](../../EVIDENCE.md#safer-leads-to-faster).

## Principle 2 — Make consequential relationships explicit

A tool can check only a rule it can express over information it can observe. This sets the enforcement surface of any tool by the state of the artifact it operates on, which makes preserving structure part of building the safeguard rather than a separate concern.

Any design or engineering artifact can hold a decision in one of two forms. It can be recorded as structure the software stores and can read back — a stated link from one thing to another. Or it can exist only as a convention: the author knows two things are meant to match, but nothing records that they do. The two forms can produce the same visible result. They are not the same to a checker. If two elements are intended to share a decision but the artifact records only equal values, a tool can see the equality; it cannot infer the intended relationship.

Explicit structure turns convention into usable information, through three mechanisms that should not be collapsed into one claim:

1. **Explicit relationships enable checks.** A recorded dependency lets the tool identify which changes would break it.
2. **A canonical source reduces divergence.** When several uses genuinely express one decision, storing it once stops independent copies from drifting apart.
3. **Clear choices reduce valid-but-wrong selections.** Removing accidental duplicates and distinguishing legitimate alternatives makes the correct target easier to pick even when every option would pass a structural check. This mechanism works without any checker being involved.

**In figma-edit-mcp.** The choice appears in concrete pairs. A layer can be explicitly bound to a variable, or it can just happen to contain the same value. A reusable element can stay an instance of a component, or it can be a detached copy that people still expect to behave like the component. A colour or spacing value in current use can be the only one of its kind, or it can sit next to leftover near-duplicates from earlier work. In each pair the design can look identical, but only the first form records what was intended, so only the first can be checked. The plugin can list everything that uses a variable and refuse to delete it while it is in use; it cannot do the same for a layer that merely holds an equal value.

### How Cleaner leads to Safer

Cleaner structure does not automatically make an artifact safer. It changes what safeguards and models can reliably distinguish, and each mechanism carries its own countereffect.

- A recorded dependency plus an implemented check can prevent a broken relationship. Recording the dependency alone changes nothing until someone writes the check.
- A canonical source prevents inconsistent copies, but a wrong change to that source reaches every consumer.
- Clearer alternatives reduce wrong selections, but collapsing genuinely different choices creates a new class of error.

The principle is therefore not "deduplicate everything." It is:

> **Represent real relationships explicitly, share decisions that are genuinely shared, and preserve distinctions that matter.**

### How Cleaner leads to Faster

Disorder is paid for again by every later task that has to read, reuse, or change it. The effect appears only when a task touches the affected part of the artifact — and then it appears every time.

- Explicit relationships reduce the search needed to understand what depends on what.
- Canonical sources avoid recreating the same decision and updating multiple copies.
- Clear alternatives reduce disambiguation directly. Where they also prevent a wrong selection, the avoided correction belongs to the Safer-mediated path, not to this one.
- Fewer inherited defects reduce diagnosis and repair.

Structure costs time to create and maintain, so the payoff is largest where the artifact will be reused, changed, or handed off. The claim is not that cleanup is free. It is that recurring work should not repeatedly pay for the same avoidable ambiguity.

### Evidence

**Enforceability.** Engineering CAD software, which engineers use to model physical parts, can record how the pieces of a model depend on one another. In a study comparing modelling styles, the models that recorded those dependencies showed an error pointing straight at the piece that broke when a designer changed something it relied on; a style that left the dependencies out produced broken geometry that still looked finished, so the mistake could pass unnoticed. Databases show the same pattern: once a dependency between records is declared, the database refuses a deletion that would break it, and without the declaration the same deletion leaves broken references behind.

**Divergence.** When programmers duplicate a block of code instead of sharing one copy, a bug in the original is carried into every duplicate, and a later fix often reaches only some of them.

**Choice clarity.** Units caring for newborns that gave babies near-identical temporary names, such as "Babyboy Smith," had staff place orders on the wrong baby; giving each newborn a more distinctive name reduced those wrong-patient orders. In a controlled experiment with 72 professional developers, meaningful word identifiers made finding semantic defects 19% faster than abbreviations or single letters.

**Recurring work.** In a counterbalanced Figma experiment, designers completed matched tasks 34% faster when they had a current, task-relevant design system instead of old design files to search. Studies of CAD models, production codebases, and structural antipatterns point the same way: structure that communicates intent lowers the cost of later modification, and combinations of structural problems raise it. Figma's own guidance for its MCP server makes the point from the other direction — structured files with real components, semantic layer names, and variables [produce the best model output](https://developers.figma.com/docs/figma-mcp-server/structure-figma-file/).

These sources test different links in the chain and should not be read as repeated proof of one effect. See [Cleaner leads to Safer](../../EVIDENCE.md#cleaner-leads-to-safer) and [Cleaner leads to Faster](../../EVIDENCE.md#cleaner-leads-to-faster).

## Principle 3 — Keep already-determined work inside one call; return control when new judgment is needed

The useful boundary between tool calls is a decision boundary, not an operation boundary. A model turn is one reasoning cycle: the model reads the last result, thinks, and composes its next call. A single operation does not justify another turn.

The test is:

> **Can the model state what should happen next, or the deterministic rule for choosing it, before seeing the result?**

If yes, the work can stay inside the current call; returning after every operation adds coordination without adding judgment. If the model must interpret a new result before deciding what follows, the result marks a real decision boundary and control should return.

"Already determined" covers more than a fixed list:

- a group of changes the model has already selected;
- a filter, loop, comparison, or branch whose rule the model can state in advance; and
- higher-level tools that express one meaningful task rather than exposing every low-level operation as a separate turn.

It does not follow that the largest possible batch is best. A large execution unit amplifies a valid-but-wrong plan and enlarges the work that must be retried when one member fails. The right unit contains work that is already determined, not work the model is guessing will be correct.

### Grouping is not validation

Grouping predetermined work reduces model–tool round trips. Checking every item before starting prevents detectably invalid input from producing partial changes. A tool can provide either or both, but they solve different problems, and any repair avoided by validation belongs to Principle 1 rather than to this one.

**In figma-edit-mcp.** Batch tools implement the simplest case: the model supplies the full list of items and arguments together, and the plugin validates and executes each one. What disappears is the requirement to return to the model between items that need no new judgment — which is why the speed of a batch does not depend on Figma executing each operation faster. The principle also identifies a future opportunity for higher-level tools, where a filter or branch stays inside one call because the model can state the rule before execution. That an intermediate value selects which branch runs does not by itself require another turn; a turn becomes useful when the model must see the value before it can decide what the value means for the task.

### Evidence

Anthropic's programmatic tool calling — letting a model run many tool calls inside one turn — cut billed input tokens by roughly 38% with no change in accuracy on a multi-tool benchmark, yet on tasks whose every call depends on fresh model judgment it left scores unchanged and cost roughly 8% more. Work on higher-level agent actions, tool compilation, and call fusion finds the same boundary: keeping composed, predetermined work inside one turn reduces calls, tokens, and sometimes measured time while preserving task success, and the benefit disappears or reverses when each step requires new judgment. See [Faster: designing tools around decisions](../../EVIDENCE.md#faster-designing-tools-around-decisions).

## Principle 4 — Make each exchange decision-complete

An efficient tool contract supplies the information a decision needs at the moment that decision is made.

Before execution, the interface should expose the parameters, distinctions, and constraints needed to compose a valid request. A required read discovers facts about the artifact; trial and error caused by an ambiguous interface merely discovers facts the tool already knew.

After execution, the result should make the outcome and the next meaningful options clear:

- what changed, or why nothing changed;
- which condition failed;
- the exact identifiers or values needed to continue; and
- when it can be done safely, the alternatives the tool would have accepted.

We call such a result decision-complete: it contains what the next decision needs, and as little else as possible. Decision-complete does not mean short. Irrelevant output consumes context, but removing an exact identifier, an edit anchor, or an accepted value can create more work than the shorter result saves. The target is the smallest response that lets the model make the next decision without reconstructing information the tool already had.

### Why this is Faster

Good request contracts reduce schema discovery by failure. Good results reduce re-querying, interpretation, and correction turns. An actionable refusal turns a blocked request into a local correction — made while the target, parameters, and intended operation are all still current — instead of a later investigation.

That refusal benefit is produced jointly. Principle 1 creates the refusal instead of admitting the invalid change; Principle 4 makes recovery from it cheap. Neither produces the saving alone, which is why it is described here once rather than credited to enforcement and to the interface separately.

### Evidence

Filtering results down to what the next decision needs improved benchmark performance by 11% while using 24% fewer input tokens. Refusals that named the accepted alternatives raised repair success by roughly 40 percentage points over raw diagnostics. A study that trimmed tool results too aggressively cut tokens but raised total cost and failures, which is why compactness alone is not the goal. Most of these results measure tokens, steps, and success rather than elapsed time. See [Faster: designing tools around decisions](../../EVIDENCE.md#faster-designing-tools-around-decisions).

## One example, end to end

Figma lets you delete a variable that layers still use. It shows no warning, and provides no complete way to list and repair the resulting broken references. Users on Figma's own forum describe the consequences: one user found [1,548 orphaned variable references](https://forum.figma.com/suggest-a-feature-11/make-it-easier-to-fix-broken-variable-references-33999) after reorganizing their variables, and the "Detach deleted variables" quick action [fixes only some of them](https://forum.figma.com/ask-the-community-7/locate-and-delete-lingering-used-variables-16794).

All four principles meet in this one case:

- Because Figma records which layers are bound to the variable, the dependency can be read back at all (Principle 2). Layers that merely hold an equal value are invisible to the same check.
- Because that relationship is observable, the plugin can evaluate it before every deletion and refuse the ones that would break it (Principle 1).
- The refusal names the variable's remaining consumers, so the model can act on the answer instead of asking again (Principle 4).
- The check runs inside the call that requested the deletion, so no extra turn is spent discovering the problem (Principle 3).

The result is an artifact that never acquires 1,548 broken references. That is one avoided repair, not four.

## How the principles produce Safer, Cleaner, and Faster

| Principle | Immediate effect | Contribution to the goals |
| --- | --- | --- |
| Put enforceable rules in the tool | Covered invalid changes are refused | Safer directly; Cleaner and Faster through defects that never enter the artifact |
| Make consequential relationships explicit | Dependencies, shared decisions, and choices become clearer | Cleaner directly; Safer through enabled checks and clearer choices; Faster through less repeated work |
| Keep determined work inside one call | Unnecessary model–tool handoffs fall | Faster when elapsed time falls without reducing correct completion |
| Make exchanges decision-complete | Interface-driven discovery and reconstruction fall | Faster when saved reconstruction exceeds the cost of the additional information |

This table traces causality; it is not a scorecard. Two things follow from reading it that way. A prevented defect and the repair it avoids are one chain, not two separate wins — enforcement's own direct saving is the correction made at the boundary, and the downstream saving belongs to the defect never having entered the artifact. And every claim has a time horizon: explicit structure usually costs time now and returns it only in later reuse or maintenance.

## Choosing where to apply the principles

Four questions locate the work:

1. **What costly error can the tool identify mechanically before allowing it?** Put that rule in a check.
2. **What consequential relationship, shared decision, or legitimate distinction is currently implicit?** Represent it explicitly.
3. **Which operations are already determined, and where is new model judgment actually required?** Draw the call boundary there.
4. **What information would change the model's next decision?** Put it in the request or result contract.

Apply the principles selectively, because each has a countereffect:

- Checks add execution cost and refuse valid work when the predicate is wrong.
- Explicit structure costs effort to create and can become stale, and a check will faithfully enforce a relationship that no longer reflects intent.
- Canonical sources reduce divergence but increase the reach of a wrong shared change.
- Removing duplicates is harmful when the alternatives represent real distinctions.
- Larger execution units reduce coordination but amplify wrong decisions and enlarge retries.
- More result detail can reduce follow-up work but consumes context.

The goal is not to maximize checks, structure, batching, or output. It is the smallest intervention that materially improves Safer, Cleaner, or Faster without causing a larger countereffect.

## Limits

These principles do not make a tool for AI agents infallible.

- Checks guarantee only the mechanically stated rules they cover.
- A structurally valid request can still be the wrong request. The model can bind the wrong variable, pick the wrong but valid component, or make a wrong edit to the right target. [SAFETY.md](../../SAFETY.md) records this as residual risk R2.
- Explicit relationships can be incomplete or incorrect.
- Cleaner structure does not remove existing defects by itself.
- Fewer calls or faster successful runs do not count as Faster if they reduce correct completion. Failed and abandoned work has to stay in the comparison.
- Tokens, turns, success rate, error rate, and elapsed time are related measurements, not interchangeable ones. Each claim above should be read against the one it was measured on.

Those limits define the claims made here. The full list of checks, and the conditions under which each one holds, is in [SAFETY.md](../../SAFETY.md).

---

## Notes on this draft

**From 10:** the skeleton and section order; "principles" rather than "rules"; "not only in the prompt" and "enforceable" in Principle 1; Principle 2 stated as an imperative; the three conditions for the enforcement guarantee; the "Grouping is not validation" split; the summary table; the four application questions; the Limits section, including the measurement limits that 09 omitted entirely.

**From 09:** the specific evidence — every figure retained rather than summarized — the end-to-end worked example, the level description of inflow and repair, the concrete Figma pairs under Principle 2, the note that this project also ships instructions, and the fuller explanation of why Faster does not lead back to the other two.

**Deliberate departures from 10:**

- "decision-complete" is kept rather than renamed to "decision-sufficient." The term is already load-bearing in [EVIDENCE.md](../../EVIDENCE.md) and [05 - Faster-Recommendation.md](./05%20-%20Faster-Recommendation.md), and the explicit definition already does the work the rename was meant to do.
- The standalone "Rules for avoiding double-counting" section is not carried over. It addresses a reviewer rather than a tool builder. Its two design-relevant items are kept: consolidation and validation are separated under Principle 3, and the single-chain and time-horizon points sit under the table.
- The stock-and-flow formula is stated in sentences rather than as an equation, consistent with the rest of the document.
- Fences and dashes follow the convention used in 08 and 09.

**Open follow-up:** [EVIDENCE.md](../../EVIDENCE.md) is still organized by the four goal-to-goal arrows. Because this draft keeps arrow-named subsections inside each principle, the existing anchors still map cleanly and no re-sectioning is required. If EVIDENCE.md is ever reorganized to match the principles, the links here need updating. Nothing in this draft changes [SAFETY.md](../../SAFETY.md) or the README.
