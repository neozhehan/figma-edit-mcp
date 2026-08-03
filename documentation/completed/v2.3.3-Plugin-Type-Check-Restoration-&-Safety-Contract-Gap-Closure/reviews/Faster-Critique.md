# Critique of the Faster Section

## Overall assessment

The two-scale structure is sound—and probably the strongest part of the Faster argument. The problem is the absolute formulation of the fourth insight:

> A task finishes fastest when it needs the fewest cycles.

The defensible version is:

> A task tends to finish faster when the interface eliminates unnecessary model–tool round trips, without eliminating necessary discovery, feedback, or verification.

That qualification matters because this repository deliberately requires discovery before mutation. Those additional cycles make correct completion faster in expectation by preventing mistakes.

## The two scales

| Scale | Actual mechanism | What it reduces | Important boundary |
|---|---|---|---|
| Task scale | Batch independent operations | Required model–tool round trips | Operations must already be specified and not depend on intermediate results |
| Attempt scale | Clear schemas and diagnostic errors | Invalid attempts and blind recovery turns | Discovery, ambiguity, and runtime failures can still require multiple turns |

A sharper summary would therefore be:

> Batching reduces necessary cycles. The tool contract reduces avoidable cycles.

The current sentence that “the tool contract reduces the number of cycles each call needs” is conceptually awkward: a call does not itself need multiple interaction cycles. Instead, an intended operation may require multiple calls because the first attempt is malformed or the recovery guidance is insufficient.

## Objections to the fourth insight

### 1. Cycle count is a proxy, not the actual objective

The real objective is elapsed time—or perhaps latency and token cost—to correct completion.

One enormous cycle can take longer than several small cycles because it may require:

- More model output
- A larger request
- More validation
- More plugin execution
- More result processing
- A more expensive retry if something is wrong

Fewer cycles are beneficial when they amortize fixed per-cycle costs, but “fewest cycles” is not a universal optimization law.

### 2. Some cycles are valuable

The repository's own operating rule is “discover before acting”: `page_info` → `node_info` → mutation. That intentionally adds cycles.

Consequently, “first-call correctness” should not mean that the first tool call is the mutation. It should mean:

> The first mutation attempt succeeds after the discovery necessary to identify the correct target and parameters.

Otherwise, the Faster principle contradicts the Safer principle by treating necessary discovery as wasted time.

### 3. Feedback can be worth more than compression

Some operations are genuinely sequential:

- A later operation depends on the identifier returned by an earlier operation.
- The next parameters depend on the resulting geometry.
- The agent needs to inspect an intermediate result.
- Per-item failure isolation is important.

The existing tool-selection guidance already recognizes this. The philosophy should incorporate that boundary rather than implying batching is inherently optimal.

## First scale: batching

The central argument is good: batching many independent, already-specified operations avoids repeated model–tool coordination.

But “one composition instead of a hundred” overstates what disappears. The agent still has to compose 100 item specifications, and the plugin still has to validate and execute them. What batching eliminates is approximately:

- 99 additional request/response boundaries
- Repeated reading and continuation planning
- Repeated schema and contextual overhead
- Repeated opportunities for cross-turn omission or duplication

A more exact heading would be:

> One round trip for many independent operations

There are also two qualifications worth adding.

First, batching trades cross-turn drift for within-request complexity. A hundred sequential calls provide a hundred opportunities to lose track, but a hundred-item payload creates a long-output transcription and semantic-error surface. A structurally valid batch can still contain the wrong valid target or omit a desired item.

Second, prevalidation is not the same as transactional execution. The current argument says a bad batch item changes nothing. That is valid for failures detected during whole-batch prevalidation. It does not follow that every possible runtime failure at item 47 must roll back items 1–46. The distinction exists at the level of the principle, independent of implementation quality. The documented safety contract also distinguishes these cases.

The philosophically precise claim is:

> Whole-batch prevalidation prevents validation-detectable partial application. It does not, by itself, promise rollback for failures that arise only after execution begins.

## Second scale: the tool contract

This is also a strong mechanism, but its two labels are currently too close to guarantees.

### “First-call correctness”

Schemas and guidance increase the probability of a valid first attempt. They cannot guarantee correctness because:

- The agent may not yet know the correct target.
- User intent may be ambiguous.
- A valid call can still be semantically wrong.
- State can change between discovery and execution.

A better name is:

> First-attempt success after required discovery

### “One-round-trip recovery”

A good error can identify the violated rule and prescribe the next action. But it cannot guarantee that the next mutation succeeds. Recovery may legitimately require:

1. Reading current state
2. Selecting a different target
3. Changing the plan
4. Asking for user input
5. Retrying the mutation

The stronger, defensible principle is:

> Errors should eliminate diagnostic guesswork and identify the shortest viable recovery path.

“One-round-trip recovery” can remain as an aspirational design test for simple, locally correctable errors—not as a general guarantee.

## How well does the evidence support it?

The evidence in `EVIDENCE.md` supports the narrower argument that informative feedback can increase repair success and reduce blind retries.

It does not establish that:

- Fewer cycles always mean lower completion time.
- The next attempt will always succeed.
- MCP schema quality guarantees first-attempt correctness.
- Batch calls are universally faster than staged calls.

The Self-Debugging and Self-Repair research is relevant to diagnostic feedback, but largely measures success or accuracy on code-generation tasks—not MCP wall-clock completion time. SWE-agent supports the broader proposition that interface design affects agent performance, but is weaker evidence for either exact label. Tricorder supports the importance of clarity, low noise, and timely feedback, not specifically one-round-trip agent recovery.

## Recommended replacement

> **The fourth insight: every model–tool round trip has coordination costs. Tasks finish faster when the interface eliminates unnecessary round trips while preserving the discovery, feedback, and verification needed for correct completion.**
>
> The plugin applies this insight through two complementary mechanisms. At the task scale, batch tools place many independent, already-specified operations into one round trip, amortizing repeated coordination costs. At the attempt scale, clear schemas increase first-attempt success after required discovery, while diagnostic errors reduce avoidable recovery turns by identifying the shortest viable next step.
>
> Batching reduces necessary cycles. The tool contract reduces avoidable cycles. Neither replaces cycles that carry information required to act correctly.

This preserves the force of the Faster section while removing the avoidable absolutes.
