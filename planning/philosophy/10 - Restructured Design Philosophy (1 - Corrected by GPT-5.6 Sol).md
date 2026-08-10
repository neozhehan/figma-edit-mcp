# Design Philosophy

The [README](../../README.md) explains what figma-edit-mcp does. This document explains the principles behind tools designed for AI agents. Project-specific guarantees belong in [SAFETY.md](../../SAFETY.md). Sources, methods, and limitations for the empirical claims are collected in [EVIDENCE.md](../../EVIDENCE.md).

## Who this is built for

An AI agent does not use a tool like a person using a graphical interface. It composes calls from the instructions, state, and results available in its context.

Four characteristics shape the design:

- **Instructions influence behavior but do not guarantee it.** The model can misunderstand, overlook, or fail to apply a rule.
- **The model can reliably use only distinctions the environment and interface expose.** A consequential relationship that exists only in a person's head cannot guide a check or a tool call.
- **Every model–tool round trip has a coordination cost.** A round trip is worthwhile when its result changes what the model should decide next.
- **The model is capable and fallible.** It can produce a plausible request that is structurally valid and still wrong.

Four principles follow:

1. **Put enforceable rules in the tool, not only in the prompt.**
2. **Make consequential relationships explicit.**
3. **Keep already-determined work inside one call; return control when new judgment is needed.**
4. **Make each exchange decision-sufficient.**

The first two principles primarily shape what states and actions the tool makes possible. The last two primarily shape how efficiently the model and tool work together.

## What we are trying to achieve

The principles serve three goals:

- **Safer** — fewer erroneous actions are allowed to take effect, and there are fewer plausible ways to make an error.
- **Cleaner** — the artifact contains fewer broken, inconsistent, duplicated, or accidental states, and more consequential relationships are represented explicitly and coherently.
- **Faster** — correct work takes less time, whether in the current task or in later work that reuses or changes the same artifact.

Cleaner contains two related but distinct ideas:

1. **State quality:** fewer defects and inconsistencies.
2. **Structural clarity:** shared decisions, dependencies, and legitimate alternatives are represented clearly.

The distinction matters. A check can preserve state quality without making the artifact more explicit. Explicit structure can make a new check possible without removing any existing defect.

### The goals are connected, not additive

A single event can appear under all three goals. If a check prevents a broken reference, the action is safer, the artifact remains cleaner, and later repair time may be avoided. That is one causal chain, not three independent benefits.

### Safer and Cleaner form a maintenance cycle

Cleaner structure can make more safeguards possible. Safeguards can then preserve the clean state against covered regressions.

The cycle is not self-starting. Explicit structure must first be created, a rule must be implemented, and existing defects must still be repaired. Enforcement preserves a covered condition; it does not create the initial clean state.

Faster is not assumed to lead back to Safer or Cleaner. Speed is an outcome of good tool design, not a substitute for correctness or artifact quality.

## Principle 1 — Put enforceable rules in the tool, not only in the prompt

**Programmatic checks are more reliable than instructions to AI agents for enforcing mechanically checkable rules.**

An instruction asks the model to remember a rule, recognize when it applies, and follow it. Instructions are valuable because they improve the requests the model proposes. But they cannot guarantee that every proposal will comply.

A programmatic check controls whether the proposal takes effect. It evaluates the relevant state at the point of change and refuses a request that violates the rule. The model may still propose the prohibited action; the tool does not have to carry it out.

This creates a stronger property:

> **A rule enforced at every relevant change turns a desired behavior from something the AI should remember into a condition every accepted change must preserve.**

For a rule to provide that guarantee:

- the check must correctly evaluate a mechanically testable rule from state the tool can observe;
- every change capable of violating it must pass through the check; and
- a refused request must not make the prohibited change.

If the condition holds initially, every accepted change preserves it. The guarantee is narrow but strong: it covers the rule being checked, not whether the model's overall plan matches the user's intent.

### How Safer leads to Cleaner

A check reduces the inflow of the defects it covers. It does not repair defects already present.

~~~text
next defect stock
= current defect stock
+ admitted new defects
- repaired defects
~~~

The checked artifact may still become dirtier in absolute terms if uncovered defects arrive faster than defects are repaired. It is nevertheless cleaner than the otherwise-equivalent artifact in which the covered bad changes were allowed through.

This is the precise Safer-to-Cleaner claim: safeguards preserve covered good states and admit fewer covered defects. Continued repair is what turns lower defect inflow into a declining defect stock.

### How Safer leads to Faster

A local refusal can replace the later work of discovering, diagnosing, untangling, and repairing a defect after other work depends on it. The speed effect is strongest for errors that are costly to discover late, spread to many dependents, or are difficult to reverse.

The claim is not that checking costs nothing. The check is faster overall when the downstream work it avoids exceeds the cost of checking and correcting refusals.

### Instructions and checks are complementary

Instructions teach rules and workflows, reducing invalid proposals, wasted calls, and avoidable refusals. The formal request contract exposes required parameters and valid distinctions. Checks prevent covered invalid proposals from becoming changes. Use instructions to teach the model how to succeed; use programmatic checks when a rule must hold even when the model does not follow the instruction.

### Evidence

Guarded agent-edit interfaces, runtime enforcement studies, and error-prevention systems in other domains show the same mechanism: instructions can reduce bad attempts, while a check at the action boundary can stop covered attempts from taking effect. Long-running reductions in memory-safety defects also illustrate the stock-and-flow result: lowering new defect inflow contributes to a cleaner system when repair of existing defects continues. Inspection, automated-analysis, and mistake-proofing studies show settings in which avoided downstream work exceeded prevention overhead. See [Safer leads to Cleaner](../../EVIDENCE.md#safer-leads-to-cleaner) and [Safer leads to Faster](../../EVIDENCE.md#safer-leads-to-faster).

## Principle 2 — Make consequential relationships explicit

A tool can check only a rule that can be expressed over information it can observe. If two elements are intended to share a decision but the artifact records only equal values, a tool can see the equality; it cannot infer the intended relationship with certainty.

Explicit structure turns hidden convention into usable information. It improves Cleaner in three different ways:

1. **Explicit relationships enable checks.** A recorded dependency lets the tool identify which changes would break it.
2. **A canonical source reduces divergence.** When several uses genuinely express one decision, storing that decision once avoids independent copies drifting apart.
3. **Clear choices reduce valid-but-wrong selections.** Removing accidental duplicates and distinguishing legitimate alternatives makes the correct target easier to choose even when every option would pass a structural check.

These mechanisms should not be collapsed into one claim. Explicit relationships create enforceability. Canonical sources create consistency and reuse. Choice clarity reduces ambiguity.

### How Cleaner leads to Safer

Cleaner structure does not automatically make an artifact safer. It changes what safeguards and agents can reliably distinguish.

- A recorded dependency plus an implemented check can prevent a broken relationship.
- A canonical source can prevent inconsistent copies, but a wrong change to that source can affect every consumer.
- Clearer alternatives can reduce wrong selections, but combining genuinely different choices would create a new error.

The design principle is therefore not “deduplicate everything.” It is:

> **Represent real relationships explicitly, share decisions that are genuinely shared, and preserve distinctions that matter.**

### How Cleaner leads to Faster

Disorder is paid for repeatedly by later work that encounters it.

- Explicit relationships reduce the search needed to understand what depends on what.
- Canonical sources avoid recreating the same decision and updating multiple copies.
- Clear alternatives reduce disambiguation directly. When they prevent a wrong selection, the avoided correction belongs to that Safer-mediated path.
- Fewer inherited defects reduce diagnosis and repair.

Cleaner structure costs time to create and maintain, so its payoff is greatest where the artifact will be reused, changed, or handed off. The strategic insight is not that cleanup is free. It is that recurring work should not repeatedly pay for the same avoidable ambiguity and disorder.

### Evidence

Evidence from CAD dependencies and database integrity supports the enforceability mechanism. Research on duplicated code supports the divergence mechanism. Studies of identifier clarity and distinctive patient names support the choice-clarity mechanism. Design-system, maintainability, and technical-debt studies support the recurring-work mechanism. These sources test different links and should not be treated as repeated proof of one effect. See [Cleaner leads to Safer](../../EVIDENCE.md#cleaner-leads-to-safer) and [Cleaner leads to Faster](../../EVIDENCE.md#cleaner-leads-to-faster).

## Principle 3 — Keep already-determined work inside one call; return control when new judgment is needed

The useful boundary between tool calls is a decision boundary, not an operation boundary.

Ask:

> **Can the model state what should happen next, or the deterministic rule for choosing it, before seeing the result?**

If yes, the work can remain inside the current call. Returning after every operation adds coordination without adding judgment.

If the model must interpret a new result before deciding what follows, the result marks a real decision boundary and control should return.

This principle covers:

- a fixed group of changes the model has already selected;
- a filter, loop, comparison, or branch whose rule the model can state in advance; and
- higher-level tools that express one meaningful task instead of exposing every low-level operation as a separate conversation turn.

It does not mean that the largest possible batch is best. A large execution unit amplifies a valid-but-wrong plan and can enlarge the work that must be retried. The right unit contains work that is already determined—not work the model is merely guessing will be correct.

### Grouping is not validation

Grouping predetermined work reduces model–tool round trips. Checking every item before starting prevents detectable invalid input from producing partial changes. A tool may provide either capability or both, but they solve different problems and their benefits should be counted separately.

### Evidence

Research on programmatic tool calling, higher-level agent actions, tool compilation, and MCP call fusion shows the same boundary: keeping composed, predetermined work inside one model turn can reduce calls, tokens, and sometimes measured time while preserving or improving task success. The benefit disappears or reverses when each step requires fresh model judgment. See [Faster: designing tools around decisions](../../EVIDENCE.md#faster-designing-tools-around-decisions).

## Principle 4 — Make each exchange decision-sufficient

An efficient tool contract supplies the information needed to make a decision at the moment that decision is made.

Before execution, the interface should expose the distinctions and constraints needed to compose a valid request. Trial and error should not be required to discover facts the interface already knows.

After execution, the result should make the outcome and the next meaningful options clear:

- what changed, or why nothing changed;
- which condition failed;
- the exact identifiers or values needed to continue; and
- when useful, the alternatives the tool would accept.

The target is not the shortest possible response. It is the smallest response that lets the model make the next decision without reconstructing information the tool already had.

### Why this is Faster

Good request contracts reduce schema discovery by failure. Good results reduce re-querying, interpretation, and correction turns. An actionable refusal turns a blocked request into a local correction instead of a later investigation.

That refusal benefit is produced jointly:

- Principle 1 creates the refusal instead of admitting the invalid change.
- Principle 4 makes recovery from the refusal efficient.

The saved recovery work should be counted once, not credited independently to both principles.

### Evidence

Studies of filtered tool results show that relevant information can improve task performance while reducing token use. Studies of actionable diagnostics show that accepted alternatives can materially improve repair success. Counterevidence from overly aggressive result trimming shows why compactness alone is not the goal. See [Faster: designing tools around decisions](../../EVIDENCE.md#faster-designing-tools-around-decisions).

## How the principles produce Safer, Cleaner, and Faster

| Principle | Immediate effect | Contribution to the goals |
| --- | --- | --- |
| Put enforceable rules in the tool | Covered invalid changes are refused | Safer directly; Cleaner and Faster through defects that never enter the artifact |
| Make consequential relationships explicit | Dependencies, shared decisions, and choices become clearer | Cleaner directly; Safer through enabled checks and clearer choices; Faster through less repeated work |
| Keep determined work inside one call | Unnecessary model–tool handoffs fall | Faster when elapsed time falls without reducing correct completion |
| Make exchanges decision-sufficient | Interface-driven discovery and reconstruction fall | Faster when saved reconstruction exceeds the cost of the additional information |

This table traces causality; it is not a scorecard.

### Rules for avoiding double-counting

1. **Count a prevented defect and its avoided repair as one chain.** Do not add Safer-to-Faster and Safer-to-Cleaner-to-Faster as if they were independent savings.
2. **Count explicit structure and its guard as a joint mechanism when both are required.** The representation makes the rule checkable; the guard performs the prevention.
3. **Count refusal recovery once.** The guard causes the refusal; the diagnostic lowers the cost of responding to it.
4. **Separate consolidation from validation.** Fewer calls and reject-before-change behavior are different capabilities.
5. **Count usable information once.** When the artifact records a distinction and the interface exposes it, any saved search is a joint effect.
6. **State the time horizon.** A cleaner artifact may cost more now and save time only in later reuse or maintenance.

## Choosing where to apply the principles

Use four questions:

1. **What costly error can the tool identify mechanically before allowing it?** Put that rule in a check.
2. **What consequential relationship, shared decision, or legitimate distinction is currently implicit?** Represent it clearly.
3. **Which operations are already determined, and where is new model judgment actually required?** Draw the call boundary there.
4. **What information would change the model's next decision?** Put that information in the request or result contract.

Apply the principles selectively:

- Checks add execution cost and can refuse valid work when the predicate is wrong.
- Explicit structure costs effort to create and can become stale.
- Canonical sources reduce divergence but increase the impact of a wrong shared change.
- Removing duplicates is harmful when the alternatives represent real distinctions.
- Larger execution units reduce coordination but amplify wrong decisions.
- More result detail can reduce follow-up work but consume attention and context.

The goal is not to maximize checks, structure, batching, or output. It is to choose the smallest intervention that materially improves Safer, Cleaner, or Faster without causing a larger countereffect.

## Limits

These principles do not make an AI tool infallible.

- Checks guarantee only the mechanically stated rules they cover.
- A structurally valid request can still be the wrong request.
- Explicit relationships can be incomplete or incorrect.
- Cleaner structure does not remove existing defects by itself.
- Fewer calls or faster successful runs do not count as Faster if they reduce correct completion; failed and abandoned work must remain in the comparison.
- Tokens, turns, success rate, error rate, and elapsed time are related measurements, not interchangeable ones.

Those limits define the claims made here; they do not turn this philosophy into an implementation specification.
