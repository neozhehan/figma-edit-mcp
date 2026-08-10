# Design Philosophy

The [README](../../README.md) explains what figma-edit-mcp does. This document explains the principles behind designing tools for AI agents, and why figma-edit-mcp is built the way it is. The exact enforcement guarantees and their conditions live in [SAFETY.md](../../SAFETY.md). Sources, methods, and limitations for every empirical claim here are collected in [EVIDENCE.md](../../EVIDENCE.md).

## The boundary we are designing

An AI tool joins two different kinds of capability.

The model supplies probabilistic judgment. It interprets intent, resolves ambiguity, chooses among valid alternatives, and adapts when new evidence changes what the task means. Instructions can improve that judgment, but cannot guarantee that the model will interpret or apply a rule correctly every time.

Software supplies mechanical checks and execution. It can apply an explicit rule to observed state, refuse a prohibited change, and carry out control logic whose decisions have already been made. Its advantage is repeatability: enforcement does not depend on the model remembering and voluntarily following an instruction.

Neither side should be asked to do the other's job. A model should not be the sole enforcer of a rule that software can check. Software should not pretend to resolve subjective intent that still requires judgment.

> **Designing tools for AI agents is fundamentally boundary design. Use probabilistic judgment where ambiguity must be interpreted. Use deterministic checks where a rule must hold. Keep already-decided execution in software, make the state connecting both sides explicit, and cross the boundary when new information requires a new decision.**

“Deterministic” describes the check, not the entire tool or environment. A check can apply a stated predicate consistently and still encode the wrong rule or observe incomplete state. The distinction is between a result that depends on model compliance and one controlled by a programmatic mechanism.

The philosophy therefore has four dimensions:

| Boundary dimension | Design question | Principle |
| --- | --- | --- |
| **Enforcement** | What must software refuse rather than ask the model to remember? | Put enforceable rules in the tool, not only in the prompt. |
| **Representation** | What must become explicit before either side can inspect, reuse, or protect it? | Make consequential relationships explicit. |
| **Control** | When can software continue, and when is new model judgment required? | Keep already-determined work inside one call; return control when new judgment is needed. |
| **Information** | What must cross the boundary for the current or next decision to be possible? | Make each exchange decision-complete. |

These dimensions fit together as one loop:

1. The model interprets the goal and proposes a decision.
2. The request expresses that decision using distinctions the interface exposes.
3. Software checks the proposal against explicit state and executes the work already determined.
4. The result returns the outcome and evidence needed for the next judgment.

A well-designed boundary gives each side the work it is better suited to perform. A poorly designed one leaves mechanically preventable errors to probability, asks the model to coordinate operations that require no judgment, or asks software to make choices whose meaning was never formalized.

## What a well-designed boundary produces

The quality of the boundary is judged by three outcomes:

- **Safer** — fewer erroneous actions are allowed to take effect, and there are fewer plausible ways to make an error.
- **Cleaner** — the artifact contains fewer broken, inconsistent, duplicated, or accidental states, and consequential relationships are represented explicitly and accurately.
- **Faster** — correct work takes less time, whether in the current task or in later work that reuses or changes the same artifact.

Each outcome corresponds to a different property of the boundary:

- Safer asks whether mechanically identifiable errors remain dependent on probabilistic compliance.
- Cleaner asks whether important relationships are explicit and whether accepted changes preserve covered good states.
- Faster asks whether work is assigned to the cheapest competent side and whether each necessary crossing carries what the next decision needs.

Cleaner contains two related but distinct ideas:

1. **State quality** — fewer defects and inconsistencies.
2. **Structural clarity** — shared decisions, dependencies, and legitimate alternatives are represented clearly.

A check can preserve state quality without making the artifact more explicit. Explicit structure can make a new check possible without removing any existing defect. The two also interact in other ways: canonical sources can reduce divergence structurally, while clearer choices can improve the model's selection without a check.

### The goals are connected, not additive

A single event can appear under all three goals. If a check prevents a broken reference, the action is safer, the artifact stays cleaner, and later repair time may be avoided. That is one causal chain seen from three sides, not three independent benefits.

The same discipline applies to the four boundary dimensions. An explicit relationship plus a check is one joint prevention mechanism. A refusal plus an actionable result is one joint recovery mechanism. The contribution of each part can be described without counting the final benefit twice.

### Safer and Cleaner form a maintenance cycle

Cleaner structure can move a relationship from the probabilistic side of the boundary, where the model must infer it, into explicit state that software can inspect. An implemented check can then preserve that structure against covered regressions.

The cycle is not self-starting. Explicit structure has to be created, a rule has to be implemented over it, and existing defects still have to be repaired. Enforcement preserves a covered condition; it does not create the initial clean state.

Faster does not automatically lead back to the other two. Reducing boundary crossings can save time, but returning control too late can hide evidence the model needed and amplify a mistaken plan. Safer and Cleaner also have value independent of any time saved.

### Boundary placement is a tradeoff

Leave too much on the model side and mechanically preventable failures remain probabilistic. Move too much to the software side and the tool becomes rigid or enforces distinctions that should have remained matters of judgment.

The objective is not maximum enforcement, maximum structure, or minimum model involvement. It is to place the boundary where probabilistic judgment adds value and mechanical behavior adds reliability.

## Principle 1 — The enforcement boundary

### Put enforceable rules in the tool, not only in the prompt

The enforcement boundary separates what the model proposes from what the tool allows to take effect.

- **Model side:** interpret the goal and propose an action.
- **Software side:** determine whether that action violates a mechanically stated rule.
- **Boundary:** the proposal takes effect only if the check accepts it.

**Programmatic checks are more reliable than instructions for enforcing mechanically checkable rules.**

An instruction asks the model to remember a rule, recognize when it applies, and follow it. Instructions are valuable because they improve the requests the model proposes. But they cannot guarantee that every proposal will comply.

A programmatic check controls whether a proposal takes effect. It applies the stated predicate to the state it observes at the point of change. The model can still propose the prohibited action; the tool does not have to carry it out.

This produces a stronger property than instruction alone:

> **A rule enforced at every relevant change becomes a condition of every accepted transition, not a behavior the model is merely expected to remember. When the rule describes artifact state and already holds, repeated enforcement preserves it across accepted states.**

That guarantee holds when:

- the check correctly evaluates a mechanically testable rule using state the tool can observe;
- every change capable of violating the rule passes through the check; and
- a refused request does not make the prohibited change.

State invariants and transition constraints produce different guarantees. A state invariant that holds at the start is preserved across accepted states. A transition constraint governs which changes are accepted without necessarily becoming a persistent property of the artifact. Both contribute directly to Safer; state invariants can additionally preserve Cleaner artifact state.

The guarantee remains narrow and strong: it covers the rule being checked, not whether the model's overall plan matches the user's intent.

Rules that depend on subjective meaning remain on the judgment side of the boundary. Software can verify that a requested value is valid or that a dependency would remain intact; it cannot prove that the model chose the value the user really wanted.

**In figma-edit-mcp.** Scope, identity, placement, lock, and consumer checks sit between the model's proposal and the resulting Figma change. The model remains responsible for deciding what edit serves the task. The plugin is responsible for refusing covered state transitions regardless of whether the model remembered the rule.

### How the enforcement boundary produces Safer

The direct Safety effect is simple: a covered invalid proposal is not allowed to become a change. Safety is measured at the boundary by what takes effect, not by whether the model ever attempted the action.

This is why prompts and checks are complementary rather than competing:

- Instructions operate on the probabilistic side, improving the proposals the model makes.
- Checks operate at the mechanical boundary, controlling which proposals can take effect.

Use instructions to teach the model how to succeed. Use checks when a rule must hold even when the model does not follow the instruction.

This project ships both. The figma-edit skill and figma-edit guide resources teach the model the rules before it starts. They reduce avoidable refusals, but the guarantees do not depend on the model reading or following them.

### How the enforcement boundary leads to Cleaner

For rules about artifact integrity, a check reduces the inflow of the defects it covers. It does not repair defects already present. A transition constraint that does not protect artifact state may contribute to Safer without producing this Cleaner path.

The defect stock falls only when repair removes defects faster than covered and uncovered defects are still admitted. Even when the stock rises, a checked artifact can remain cleaner than the otherwise-equivalent artifact in which the covered bad changes were allowed through.

This is the precise Safer-to-Cleaner claim: the enforcement boundary preserves covered good states and admits fewer covered defects. Ordinary cleanup and repair are what turn lower inflow into an absolutely cleaner artifact.

### How the enforcement boundary leads to Faster

A refusal at the point of change can replace the later work of discovering, diagnosing, untangling, and repairing a defect after other work has come to depend on it. The benefit is largest for errors that are costly to discover late, spread to many dependents, or are difficult to reverse.

When no covered bad action would otherwise take effect, the gross avoided-repair benefit is zero while the cost of checking remains. Enforcement is Faster overall only when the downstream work it avoids exceeds the cost of running the checks and correcting the refusals they produce.

This is one mediated path:

~~~text
covered change refused
→ defect does not enter the artifact
→ downstream repair is avoided
~~~

The prevented defect and the avoided repair are not separate benefits to add together.

### Evidence

**Guarded editing and recovery.** In the closest agent-edit analogue, SWE-agent discarded edits that introduced syntax errors and asked the agent to retry. The agent solved 18.0% of benchmark tasks with the guarded interface versus 15.0% without it. Because the intervention combined rejection, feedback, and retry, it supports the guarded model–tool loop rather than isolating the check alone.

**Direct blocking at the tool boundary.** In a controlled benchmark for tool-calling agents, moving the same model behind runtime enforcement cut successful attacks from 40% to 5% while the model kept attempting them. The proposal remained probabilistic; the programmatic boundary stopped the consequence.

**A stronger interruption than instruction alone.** A randomized trial covering 901,776 clinical ordering sessions found that requiring a clinician to re-enter the patient's identity cut wrong-patient orders by 41%, against 16% for a click-through confirmation alone.

**Defect inflow over time.** In 2019, memory-handling errors caused 76% of Android's security vulnerabilities. Google then required new code to use languages whose compilers refuse memory-unsafe code while continuing to repair the existing code. The annual count fell from 223 in 2019 to 85 in 2022. The decline combined lower defect inflow with continued removal; prevention did not repair the old defects.

**Prevention compared with repair.** IBM's original inspection study reported 23% higher coding-operation productivity after counting inspection and rework effort, together with 38% fewer errors during later equivalent testing. Studies of industrial process controls and automated static analysis likewise found settings where quality-mediated savings exceeded checking overhead.

See [Safer leads to Cleaner](../../EVIDENCE.md#safer-leads-to-cleaner) and [Safer leads to Faster](../../EVIDENCE.md#safer-leads-to-faster).

The enforcement boundary can apply only rules expressed over observable state. Principle 2 determines which consequential relationships are declared explicitly enough for software to inspect.

## Principle 2 — The representation boundary

### Make consequential relationships explicit

The representation boundary translates semantic judgment into state that both the model and software can use.

- **Judgment side:** decide that a relationship, shared decision, or distinction is real and consequential.
- **Representation side:** record that declaration in inspectable form.
- **Software side:** reuse it and, where a formal rule exists, check changes against it.

> **Explicit representation moves a relationship from something the model must infer each time into something software can inspect, reuse, and potentially enforce.**

The representation records a declared relationship, not ground-truth intent. A wrong or stale declaration can make the wrong rule easier to enforce. Making something explicit therefore does not eliminate judgment; judgment decides what the structure means before software preserves it.

Explicit structure improves Cleaner through three different mechanisms:

1. **Explicit relationships expand the enforceable side of the boundary.** A recorded dependency lets software identify which changes would break it.
2. **A canonical source moves repeated consistency work into shared structure.** When several uses genuinely express one decision, linking them to one source reduces opportunities for independent drift.
3. **Clear choices improve probabilistic selection.** Removing accidental duplicates and distinguishing legitimate alternatives makes the right target easier for the model to choose, even when every option would pass a structural check.

These mechanisms should not be collapsed into one claim. Explicit relationships create checkability. Canonical sources create consistency and reuse. Choice clarity improves judgment without necessarily creating a new check.

**In figma-edit-mcp.** Variable bindings and component-instance relationships are examples of explicit dependencies software can inspect. Variables, styles, and components can serve as canonical sources for decisions that are genuinely shared. Distinct names and the removal of accidental near-duplicates reduce ambiguity on the model side. An equal raw value does not by itself declare that two uses are intended to remain linked.

### How the representation boundary leads to Safer

Cleaner structure does not automatically make an artifact safer. It changes what software and the model can reliably distinguish.

- A recorded dependency plus an implemented check can prevent a broken relationship. Recording the dependency alone creates safeguard potential, not prevention.
- A canonical source can prevent inconsistent copies, but a wrong change to that source reaches every consumer.
- Clear alternatives can reduce wrong selections, but collapsing genuinely different choices creates a new class of error.

The principle is therefore not “deduplicate everything.” It is:

> **Represent real relationships explicitly, share decisions that are genuinely shared, and preserve distinctions that matter.**

This places each kind of certainty on the appropriate side of the boundary. Software preserves declared relationships. The model still judges which relationships and distinctions are semantically correct.

### How the representation boundary leads to Faster

Disorder is paid for again by every later task that has to infer, reuse, or change what the artifact failed to express.

- Explicit relationships reduce repeated inference about what depends on what.
- Canonical sources avoid recreating the same decision and updating multiple copies.
- Clear alternatives reduce disambiguation directly. If they prevent a wrong selection, the avoided correction belongs to the Safer-mediated path rather than being counted again here.
- Fewer inherited defects reduce diagnosis and repair.

Recorded structure helps the model only when the interface exposes the relevant distinction. The resulting saved search is a joint effect:

~~~text
recorded semantic distinction
× interface exposure
→ usable information
→ less repeated inference
~~~

Principle 2 supplies the recorded distinction; Principle 4 carries it across the boundary. The saved work should be counted once.

Structure costs time to create and maintain, so the payoff is largest where the artifact will be reused, changed, or handed off. The claim is not that cleanup is free. It is that recurring work should not repeatedly pay for the same avoidable ambiguity.

### Evidence

**Enforceability.** Engineering CAD software can record how pieces of a model depend on one another. In a study comparing modelling styles, recorded dependencies produced an error pointing to the piece that broke; a style that omitted them produced broken geometry that still looked finished. Databases show the same mechanism: a declared relationship makes referential integrity mechanically enforceable.

**Divergence.** When programmers duplicate a block of code instead of sharing one copy, a bug can be carried into every duplicate and a later fix can reach only some of them.

**Choice clarity.** Units caring for newborns that used near-identical temporary names had staff place orders on the wrong baby; distinctive names reduced those wrong-patient orders. In a controlled experiment with 72 professional developers, meaningful identifiers made finding semantic defects 19% faster than abbreviations or single letters.

**Recurring work.** In a counterbalanced Figma experiment, designers completed matched tasks 34% faster when they had a current, task-relevant design system instead of old design files to search. Studies of CAD models, production codebases, and structural antipatterns likewise find that structure communicating intent lowers the cost of later modification. Figma's own guidance for its MCP server says structured files with real components, semantic layer names, and variables [produce the best model output](https://developers.figma.com/docs/figma-mcp-server/structure-figma-file/).

These sources test different boundary mechanisms and should not be read as repeated proof of one effect. See [Cleaner leads to Safer](../../EVIDENCE.md#cleaner-leads-to-safer) and [Cleaner leads to Faster](../../EVIDENCE.md#cleaner-leads-to-faster).

Explicit structure can also turn a semantic decision into control logic that ordinary software can execute. Principle 3 determines how long execution should remain on that side of the boundary.

## Principle 3 — The control boundary

### Keep already-determined work inside one call; return control when new judgment is needed

The control boundary separates semantic decision-making from mechanical execution.

- **Model side:** interpret observations and decide what they mean for the task.
- **Software side:** execute operations and control logic whose choices have already been made.
- **Boundary:** control returns when a new observation can change what should happen next.

The useful boundary between tool calls is a decision boundary, not an operation boundary. The number of low-level operations does not determine whether another model turn is useful.

The test is:

> **Can the model state what should happen next, or the deterministic rule for choosing it, before seeing the result?**

If yes, software can continue inside the current call. Returning after every operation adds a model boundary crossing without adding judgment.

If the model must interpret a new result before deciding what follows, the result marks a real decision boundary and control should return.

“Already determined” covers more than a fixed list:

- a group of changes the model has already selected;
- a filter, loop, comparison, or branch whose rule the model can state in advance; and
- a higher-level tool that expresses one meaningful task instead of exposing every low-level operation as a separate turn.

It does not follow that the largest possible execution unit is best. Returning too early wastes coordination. Returning too late hides useful evidence and amplifies a valid-but-wrong plan. The right unit contains work whose choices are already determined, not work the model is guessing will be correct.

### Grouping is not validation

The enforcement and control boundaries solve different problems:

- Grouping predetermined work reduces model–tool crossings. That is Principle 3.
- Checking every item before starting can prevent detectably invalid input from producing partial changes. That is Principle 1.

A tool can provide either capability or both. Fewer calls and reject-before-change behavior are distinct benefits and should not be credited to batching as one undifferentiated feature.

**In figma-edit-mcp.** Batch tools implement the simplest case: the model supplies a list of changes it has already chosen, and the plugin handles the repeated execution. What disappears is the requirement to return to the probabilistic side between operations that require no new judgment. Higher-level tools can apply the same principle to filters and branches whose decision rule is already known.

### Evidence

Anthropic's programmatic tool calling—letting a model run many tool calls inside one turn—cut billed input tokens by roughly 38% with no change in accuracy on a multi-tool benchmark. On tasks whose every call depended on fresh model judgment, it left scores unchanged and cost roughly 8% more. Work on higher-level agent actions, tool compilation, and call fusion finds the same boundary: composed work benefits when judgment is not required between operations; adaptive work does not.

Fewer calls and tokens are evidence about coordination, not proof of lower elapsed time. Faster is established only when correct completion takes less time after the consequences of the larger execution unit are included.

See [Faster: designing tools around decisions](../../EVIDENCE.md#faster-designing-tools-around-decisions).

Principle 3 determines when control crosses the boundary. Principle 4 determines what information must cross with it.

## Principle 4 — The information boundary

### Make each exchange decision-complete

The information boundary closes the loop between mechanical execution and probabilistic judgment.

- **Model to software:** the request must express the model's current decision unambiguously.
- **Software to model:** the result must expose the outcome and facts needed for the next judgment.
- **Boundary:** each crossing should carry enough information for its decision, and no irrelevant detail.

Before execution, the interface should expose the parameters, distinctions, and constraints needed to compose a valid request. A required read discovers facts about the artifact; trial and error caused by an ambiguous interface merely discovers facts the tool already knew.

After execution, the result should make the outcome and next meaningful options clear:

- what changed, or why nothing changed;
- which condition failed;
- the exact identifiers or values needed to continue; and
- when useful, the alternatives the tool would have accepted.

We call such an exchange decision-complete: it contains what the relevant decision needs, and as little else as possible. Decision-complete is relative to a decision; it does not mean exhaustive.

Decision-complete also does not mean short. Irrelevant output consumes context, but removing an exact identifier, edit anchor, or accepted value can create more work than the shorter result saves. The target is the smallest exchange that lets the model make the decision without reconstructing information the tool already had.

### How the information boundary connects the other principles

- **Principle 1 × Principle 4:** enforcement creates a refusal; the result makes correction local and actionable. Recovery is a guarded-path cost, and better information reduces it.
- **Principle 2 × Principle 4:** explicit structure becomes useful to the model when the interface exposes the relevant relationships and distinctions.
- **Principle 3 × Principle 4:** Principle 3 prevents crossings that carry no new judgment; Principle 4 prevents necessary crossings from being informationally incomplete.

These are joint mechanisms. A refusal without a useful diagnostic is safe but expensive to recover from. A diagnostic without a check cannot prevent the invalid change. A recorded relationship the interface never exposes cannot guide the model. Count the resulting saving once.

### Why the information boundary produces Faster

Good request contracts reduce discovery by failure. Good results reduce re-querying, interpretation, and correction turns. An actionable refusal turns a blocked request into a local correction instead of a later investigation.

More information is not automatically better. The interface should carry information because it changes a decision, not because it exists. This keeps the boundary legible without filling the model's context with irrelevant state.

### Evidence

Filtering results down to what the next decision needed improved benchmark performance by 11% while using 24% fewer input tokens. Refusals that named accepted alternatives raised repair success by roughly 40 percentage points over raw diagnostics. A study that trimmed tool results too aggressively cut tokens but raised total cost and failures. These findings support decision-completeness rather than maximum brevity.

Most of this evidence measures tokens, steps, repair success, and benchmark performance rather than elapsed time. See [Faster: designing tools around decisions](../../EVIDENCE.md#faster-designing-tools-around-decisions).

## The four dimensions as one boundary

| Boundary dimension | Model contributes | Software or explicit state contributes | Primary effect |
| --- | --- | --- | --- |
| **Enforcement** | Interprets intent and proposes actions | Applies mechanically stated rules before effects are accepted | Safer directly; for state-integrity rules, Cleaner and Faster through defects that never enter the artifact |
| **Representation** | Judges the semantic meaning of relationships and distinctions | Records declared relationships, canonical sources, and clear choices | Cleaner directly; expands possible checks and reduces repeated inference |
| **Control** | Interprets new evidence and decides what follows | Executes operations and control logic already determined | Less coordination; Faster when correct completion takes less time |
| **Information** | Expresses the current decision and interprets the result | Exposes the valid request space and facts needed for the next decision | Less reconstruction; Faster through lower interface work and, jointly with enforcement, cheaper guarded recovery |

This table describes one model–tool loop, not four independent benefit accounts.

Keep five accounting rules:

1. **Explicit structure plus an implemented check is one prevention mechanism.** Representation enables the rule; enforcement performs the refusal.
2. **A refusal plus an actionable result is one recovery mechanism.** Enforcement blocks the change; information makes the next judgment cheaper.
3. **A prevented defect plus its avoided downstream repair is one causal chain.** Do not count direct Safety, preserved Cleanliness, and avoided repair as three independent wins.
4. **Recorded meaning plus interface exposure is one information effect.** Both are required before the model can use the distinction.
5. **Grouping and validation remain separate.** One reduces crossings; the other rejects detectable invalid input.

## One example, end to end

Figma can delete a variable that layers still use, leaving broken references that are difficult to find and repair. Users on Figma's forum have described finding [1,548 orphaned variable references](https://forum.figma.com/suggest-a-feature-11/make-it-easier-to-fix-broken-variable-references-33999) after reorganizing variables, while the available cleanup action [fixes only some of them](https://forum.figma.com/ask-the-community-7/locate-and-delete-lingering-used-variables-16794).

The example crosses the boundary in a deliberate sequence:

- Figma records which layers are bound to a variable. That moves the dependency from implicit convention into explicit state: Principle 2.
- The plugin applies a consumer check before accepting deletion. That moves the rule from model compliance into mechanical enforcement: Principle 1.
- If consumers remain, the result identifies them. That carries the information needed for the next judgment back to the model: Principle 4.
- Principle 3 applies when several deletions or cleanup steps have already been decided and can remain inside one call. A refusal, by contrast, creates a new decision and should return control.

The example does not produce four copies of the same benefit. The explicit relationship enables the guard; the guard prevents the broken reference; the result makes correction cheaper. Consolidating already-decided work is a separate coordination effect.

The project-specific sources and limitations are collected under [Deleting an in-use variable in Figma](../../EVIDENCE.md#deleting-an-in-use-variable-in-figma).

## How to draw the boundary

Use the questions in order:

1. **Does this choice require interpreting intent, ambiguity, or meaning?** Keep the choice on the judgment side.
2. **Can a required condition be stated precisely over observable state?** Put its enforcement on the software side.
3. **Is a consequential relationship still implicit?** Represent it explicitly when it is real, stable, and worth preserving.
4. **Has the remaining work already been decided?** Keep execution in software until new evidence requires new judgment.
5. **What information can change the current or next decision?** Put that information in the request or result.

Common placement errors follow directly:

- Too little enforcement leaves preventable errors dependent on model compliance.
- Too much enforcement turns subjective judgment into rigid false refusals.
- Too little explicit structure forces repeated inference and leaves relationships uncheckable.
- False canonicalization erases legitimate distinctions and concentrates the impact of wrong changes.
- Returning control too early spends turns without gaining judgment.
- Returning control too late amplifies wrong plans and hides useful evidence.
- Too little information forces reconstruction.
- Too much information consumes context without improving a decision.

The goal is not to maximize the amount of work on either side. It is the smallest boundary intervention that materially improves Safer, Cleaner, or Faster without causing a larger countereffect.

## Limits

A good boundary does not make either side infallible.

- Deterministic checks can apply the wrong predicate correctly.
- Checks guarantee only the mechanically stated rules they cover.
- A structurally valid request can still be the wrong request.
- Explicit relationships can be incomplete, incorrect, or stale.
- Cleaner structure does not remove existing defects by itself.
- Larger execution units can accelerate the wrong plan.
- Fewer calls or faster successful runs do not count as Faster if correct completion falls; failed and abandoned work remain part of the comparison.
- Tokens, turns, success rate, error rate, and elapsed time are related measurements, not interchangeable ones.

These limits do not weaken the thesis. They define the boundary precisely: put judgment where ambiguity must be resolved, put guarantees where rules can be stated, keep determined execution in software, and make every necessary crossing carry what the next decision needs.
