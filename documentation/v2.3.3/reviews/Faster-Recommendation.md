# Faster Recommendations

Prepared against the repository versions of DESIGN_PHILOSOPHY.md and EVIDENCE.md present on 2026-07-16. This document recommends edits; it does not apply them to either source file.

## Executive recommendation

Keep the fourth insight and the two-scale structure. They are useful and defensible. The central claim should, however, be narrowed from “fewest reasoning cycles” to “fewest unnecessary sequential model–tool round trips consistent with correct completion.”

That change matters for three reasons:

1. A cycle is not a uniform unit of time. A large planning call can cost more than several small calls.
2. Discovery, dependency resolution, feedback, and verification are sometimes necessary. Removing them can make the first mutation arrive sooner while making correct completion slower.
3. The current two-scale sentence is imprecise. A contract does not reduce “the number of cycles each call needs”; it reduces the number of invalid attempts and recovery rounds an intended operation needs.

The stronger formulation is:

> **Every sequential model–tool round trip has a coordination cost, so tasks generally finish faster when the interface removes unnecessary round trips without removing the discovery, dependency resolution, feedback, or verification required for correct completion.**

This preserves the original idea while making it compatible with the repository’s “discover before acting” rule and with the counterevidence.

## Recommended changes to DESIGN_PHILOSOPHY.md

### 1. Tighten the top-level definition of Faster

Replace:

> **Faster** — tasks execute successfully in a shorter amount of time.

With:

> **Faster** — lower expected end-to-end time to correct task completion.

“Expected” accounts for failed attempts and rework. “End-to-end” prevents a fast but incorrect first mutation from being counted as success.

### 2. Replace the current Faster section

The following is the recommended paste-ready replacement for the section beginning at “## Faster”.

~~~markdown
## Faster

Faster means lower expected end-to-end time to correct completion. The unit being optimized includes discovery, validation, execution, retries, verification, and rework — not merely the time until a mutation is sent. Safer contributes by reducing expected diagnosis and rework for the error classes the checks cover. Cleaner contributes by reducing expected search, disambiguation, and inherited repair when affected structures are reused. The plugin also reduces the coordination cost of tool use directly.

The fourth insight:
**Every sequential model–tool round trip has a coordination cost, so tasks generally finish faster when the interface removes unnecessary round trips without removing the discovery, dependency resolution, feedback, or verification required for correct completion.**

A model–tool round trip is the observable sequence in which the AI reads the preceding result, composes a request, waits for the tool, and interprets the response. “Unnecessary” is essential. A read that establishes the correct target, a staged operation whose arguments depend on an earlier result, or a verification call may add a round trip while reducing total time to correct completion.

The plugin applies this insight at two scales. At the task scale, batch tools reduce necessary mutation round trips when the full set of operations can be specified in advance. At the operation scale, the tool contract reduces avoidable attempts: schemas and guides make valid requests easier to compose, and diagnostic errors shorten recovery when a request is refused. Put simply, batching removes repeated coordination around known work; the contract removes invalid attempts and diagnostic guesswork.

### Batch operations: one round trip for many specified operations

A batch does not eliminate the work of identifying, specifying, validating, or executing each item. It amortizes the fixed coordination around that work. When a hundred changes and all of their arguments are already known, the AI can send one request and process one response instead of repeatedly composing a request, waiting for execution, interpreting the result, and tracking progress across a hundred interactions.

The advantage is conditional. Operations should remain staged when a later operation depends on an earlier result, when an intermediate result must be inspected, or when per-item failure isolation is more valuable than grouping. A larger request also carries greater planning, payload, validation, and retry costs. The right batch is therefore a coherent, recoverable group whose contents can be specified without intermediate model feedback — not simply the largest batch the interface permits.

Whole-batch prevalidation provides a separate, scoped safety benefit. Every member is checked before mutation begins, so an item that fails prevalidation prevents validation-detectable partial application. A sequence of separate mutation calls cannot provide that property unless the sequence is separately prevalidated first. This is a prevalidation guarantee, not a general promise that every failure arising after execution begins rolls back work already completed.

### The contract reduces invalid attempts and diagnostic guesswork

The primary consumer of these tools is an LLM composing calls. The contract is therefore designed against two tests.

The first is **first-attempt validity after required discovery**. Once the AI has read enough state to know the intended target and operation, the schema and guides should make a valid request straightforward to compose. This does not mean that the first tool call should be a mutation, or that a schema can determine the user’s intent by itself.

The second is **actionable recovery**. When the plugin refuses a request, the response should identify the violated condition, expose the relevant values, and state the shortest viable next step. That step may be a corrected request, another read, or a changed plan. The goal is not to promise that every failure is repaired in exactly one additional round trip; it is to eliminate avoidable chains of diagnostic guesses.

Measured evidence supports these mechanisms and their limits. MCP profiling shows that planning and schema processing can dominate latency in studied configurations. Agent systems that group model–tool work report lower latency and cost when operations can be specified together, including measured savings when the underlying tool operations still execute sequentially. Studies that refine agent instructions and tool descriptions report fewer tool calls and fewer malformed invocations, while preliminary recovery experiments report fewer retries from actionable error payloads. The same literature also contains cases where planner overhead erased the latency benefit or larger fused calls reduced success. ([Evidence, methods, and limitations](EVIDENCE.md#faster-removing-unnecessary-round-trips).)

Stated precisely: the direct Faster contribution is an expected net benefit when the repeated interaction cost eliminated exceeds the additional planning, payload, validation, and retry cost introduced. The principle is not “always use the fewest calls.” It is “remove avoidable serialization and avoidable retries while preserving the rounds that correct completion requires.”
~~~

### 3. Why these wording changes are important

| Current formulation | Problem | Recommended formulation |
|---|---|---|
| “fewest reasoning cycles” | Hidden reasoning is not observable, cycles have unequal cost, and some cycles protect correctness. | “fewest unnecessary sequential model–tool round trips consistent with correct completion” |
| “batch operations reduce the number of calls a task needs” | Too broad; discovery and dependency-driven calls remain. | Batches reduce mutation round trips for operations fully specifiable in advance. |
| “the contract reduces the number of cycles each call needs” | A call is part of a cycle; the unit is incoherent. | The contract reduces invalid attempts and recovery rounds per intended operation. |
| “one composition instead of a hundred” | The AI must still specify a hundred items. | One interaction boundary for many already-specified operations. |
| “later calls cost more than earlier ones” | Context caching, compaction, payload size, and host behavior make this non-universal. | Repeated calls add coordination and context-management cost; measure the magnitude by host and workload. |
| “every cycle is another chance for attention to drift” | Directionally plausible but unmeasured here; a large batch can also contain omissions. | Batching reduces cross-turn progress tracking, while larger requests introduce their own composition risk. |
| “one bad item changes nothing” | True for failures found during whole-batch prevalidation, not every runtime failure after mutation begins. | State the prevalidation guarantee and explicitly exclude general rollback. |
| “first-call correctness” | Conflicts with mandatory discovery and implies that schema can guarantee semantic correctness. | “first-attempt validity after required discovery” |
| “one-round-trip recovery” | The next safe step may be a read, and available studies average more than one retry. | “actionable recovery” or “shortest viable recovery path” |

## Recommended changes to EVIDENCE.md

### 1. Rename and reframe the section

Rename:

> ## Faster: the fewest reasoning cycles

To:

> ## Faster: removing unnecessary round trips

The section should establish three narrower propositions:

1. Model-side orchestration can be a substantial component of MCP latency and token cost.
2. Grouping work that does not require intermediate model feedback can reduce elapsed time and tokens.
3. A concise, tested contract and actionable errors can reduce invalid attempts and recovery rounds.

It should also state the boundary condition up front: the evidence does not show that the smallest possible call count is always optimal.

### 2. Replace the Faster evidence section with a stronger evidence hierarchy

The following is the recommended paste-ready replacement. It puts direct MCP evidence first, task-scale interventions second, contract-scale interventions third, and recovery evidence last.

~~~markdown
## Faster: removing unnecessary round trips

The fourth insight concerns expected time to correct completion, not call count in isolation. The evidence below supports three narrower propositions:

1. In MCP and other tool-using systems, model-side orchestration can account for a large share of latency and token cost.
2. When a set of operations can be specified without intermediate model feedback, replacing sequential model–tool rounds with grouped execution can reduce elapsed time and tokens.
3. Clear, relevant tool contracts and actionable error responses can reduce invalid calls and shorten recovery chains.

The studies do not establish that the fewest possible calls are always optimal. Calls have unequal costs; planning a larger operation has overhead; some tasks require intermediate results; and a faster attempt is not faster correct completion if grouping lowers success. The evidence therefore supports removing unnecessary rounds, not removing all rounds.

### MCP orchestration can dominate lightweight tool execution (ProMCP)

**Supports:** the cost mechanism behind the fourth insight.

ProMCP instrumented the end-to-end MCP pipeline across multiple deployment topologies, 20 MCP servers, and 169 tools. In its two customized-client configurations, planning and schema injection accounted for **56–72% of total tokens** and **60–67% of total latency**. In its off-the-shelf client configuration, final-answer synthesis accounted for more than **85% of latency**. Actual tool execution was a small share of the measured workloads.

**Source:** [Anjum et al., “ProMCP: Profiling Token Flows and Latency Costs in Model Context Protocol–Based LLM Agents” (Findings of ACL 2026)](https://aclanthology.org/2026.findings-acl.1967/)

**Caveats:** this is cost attribution, not an experiment that removes round trips. The dominant phase changed by topology. The measured tools were lightweight to moderate; database-heavy, network-heavy, or long-running tools may shift the bottleneck back to execution.

**Relevance:** it directly supports optimizing the interaction around an MCP tool call. It does not show that every additional call has the same cost or that call count alone determines latency.

### Grouping independent function calls reduced latency and cost (LLMCompiler)

**Supports:** the task-scale mechanism and its boundary conditions.

LLMCompiler, published at ICML 2024, replaced sequential ReAct-style orchestration with a dependency plan that could dispatch independent function calls together. Across its benchmarks it reported latency improvements of up to **3.7×** and estimated cost reductions of up to **6.7×**. On the embarrassingly parallel HotpotQA and Movie Recommendation tasks, measured speedups over the strengthened ReAct baseline were **1.80×** and **3.74×**.

The same paper supplies important counterevidence. On WebShop, planner overhead made LLMCompiler slower than ReAct: **10.48 versus 5.98 seconds** with GPT-3.5, and **26.73 versus 19.90 seconds** with GPT-4. LLMCompiler was much more successful on that benchmark, illustrating why latency and correct completion must be evaluated together.

**Source:** [Kim et al., “An LLM Compiler for Parallel Function Calling” (ICML 2024)](https://proceedings.mlr.press/v235/kim24y.html)

**Caveats:** LLMCompiler changes the planning architecture and also executes independent tools concurrently, so its headline speedups cannot be assigned solely to fewer model invocations. Its domains differ from design mutation.

**Relevance:** it supports removing unnecessary sequential dependencies. Its WebShop result directly rejects the stronger claim that fewer or more consolidated rounds are always faster.

### Fusion saved time even without concurrent tool execution (LLM-Tool Compiler)

**Supports:** the batch mechanism more directly — grouping operations can save time through fewer model/API steps even when the constituent tools still execute sequentially.

The LLM-Tool Compiler was evaluated on a large geospatial Copilot platform. Its ablation disabled concurrent tool execution while retaining fused presentation of several tool operations as one model-visible task. In that fused-only condition, average time per task fell by:

- **14.35–22.50%** across GPT-3.5 configurations.
- **7.33–9.01%** across GPT-4 configurations.

The authors report that fusion alone produced most of the total speedup in most configurations, attributing the gain to fewer model/API round trips; concurrent execution added further savings.

**Source:** [Singh et al., “An LLM-Tool Compiler for Fused Parallel Function Calling” (arXiv:2405.17438)](https://arxiv.org/abs/2405.17438)

**Caveats:** this is a preprint and a single application domain. The compiler itself adds an LLM-driven fuser step. GPT-4 success changed modestly, but GPT-3.5 configurations lost roughly 5.5–8.3 percentage points of task success relative to their corresponding in-context baselines. The percentages should not be transferred to figma-edit-mcp.

**Relevance:** this is the closest external evidence for the plugin’s batch argument because it isolates grouping from simultaneous execution. It also shows why batch size and model capability are boundary conditions.

### Jointly refining instructions and tool descriptions reduced tool calls (Wu et al.)

**Supports:** the operation-scale claim that the contract can reduce avoidable call sequences.

Wu, Meij, and Yilmaz jointly optimized agent instructions and tool descriptions from feedback on task outcomes and tool-call trajectories. On StableToolBench, the optimized context required up to **70% fewer tool calls** at particular target pass rates. On RestBench, it reduced redundant calls by **47%** while maintaining comparable or better measured effectiveness.

**Source:** [Wu et al., “A Joint Optimization Framework for Enhancing Efficiency of Tool Utilization in LLM Agents” (Findings of ACL 2025)](https://aclanthology.org/2025.findings-acl.1149/)

**Caveats:** the 70% figure is a best observed point at a selected success threshold, not an average reduction. Efficiency is measured as tool-call count rather than wall-clock time. The intervention jointly changes global instructions and tool descriptions, and the incomplete-context condition was simulated by truncating documentation to its first sentence. Results varied by benchmark and inference method.

**Relevance:** unlike evidence that measures only final accuracy, this study directly measures how contract refinement changes the number of calls needed at comparable success.

### Concise, model-oriented tool instructions reduced malformed calls (EASYTOOL)

**Supports:** first-attempt validity after discovery and the need for a concise rather than merely lengthy contract.

EASYTOOL, published at NAACL 2025, transformed heterogeneous documentation into concise, standardized tool descriptions plus usage examples. Average documentation length fell by **70.43%** on ToolBench and **97.35%** on RestBench. In a manually reviewed sample of 100 ToolBench cases:

- ChatGPT’s nonexistent-tool calls fell from **8% to 0%**, and invalid-parameter calls from **25% to 6%**.
- GPT-4’s nonexistent-tool calls fell from **5% to 0%**, and invalid-parameter calls from **17% to 1%**.

**Source:** [Yuan et al., “EASYTOOL: Enhancing LLM-based Agents with Concise Tool Instruction” (NAACL 2025)](https://aclanthology.org/2025.naacl-long.44/)

**Caveats:** the error analysis used 100 sampled cases, and the method changes structure, content, concision, and examples together. It does not report wall-clock latency or prove that the first mutation attempt succeeds. Its multi-step Correct Path metric elsewhere in the paper allows extra calls, and the method does not model inter-tool dependencies.

**Relevance:** it supports the narrower claim that concise, model-oriented descriptions and argument examples raise the probability of a valid invocation while reducing context tokens.

### Tool and argument descriptions improved exact call-level correctness (JTPRO)

**Supports:** the probability of a correct initial invocation after the necessary state is known.

JTPRO, published in Findings of ACL 2026, jointly refined global instructions and per-tool schema and argument descriptions. Its Overall Success Rate requires the correct tool, correct slots, and correct values. Across the evaluated tool benchmarks, JTPRO improved that metric by **5–20% relative** over strong baselines. In the 1,000-tool ToolACE setting, for example:

- GPT-4o-mini improved from **58.18% to 63.64%**.
- o3-mini improved from **51.27% to 64.46%**.
- GPT-5 improved from **62.37% to 73.55%**.

**Source:** [Ghoshal et al., “JTPRO: A Joint Tool–Prompt Reflective Optimization Framework for Language Agents” (Findings of ACL 2026)](https://aclanthology.org/2026.findings-acl.2017/)

**Caveats:** JTPRO jointly changes global instructions and per-tool descriptions, requires labeled traces, and evaluates generated calls without executing the real backends. It measures call correctness, not elapsed time, retries, or long-horizon dependent workflows.

**Relevance:** it supports an increased probability of a correct call, not a guarantee of first-call correctness.

### Actionable repair payloads shortened recovery chains (Self-Reflective APIs)

**Supports:** actionable recovery.

A 2026 preprint compared generic failures, plain-English diagnoses, and the same diagnoses plus machine-readable repair suggestions. Within a five-retry budget, mean retries were **4.0–4.6** for generic errors, **2.6–2.8** for prose diagnoses, and **1.3–2.0** for structured repair suggestions. Compared with prose, structured suggestions increased completion by **36.7** and **40.0 percentage points** on two Anthropic models and improved tokens per successful task by **1.76×** and **2.15×**.

The structure-over-prose gain was not statistically significant for GPT-4o-mini, whose token efficiency was effectively unchanged.

**Source:** [Canedo and Chethan, “Self-Reflective APIs: Structure Beats Verbosity for AI Agent Recovery” (arXiv:2606.05037)](https://arxiv.org/abs/2606.05037)

**Caveats:** this is an unreviewed pilot with 30 trials per model and condition, ten adversarial tasks, one primary domain, and author-constructed validators. The structured condition supplied literal repair values that the prose condition did not. It tests actionable repair information, not formatting alone, and the effect was model-dependent.

**Relevance:** this is the closest measured evidence for shorter agent recovery chains. Its average of 1.3–2.0 retries also shows why “one-round-trip recovery” should be an aspiration for locally repairable errors, not a general empirical claim.

### What the evidence establishes

Together, these studies support an expected, conditional relationship:

> For work whose arguments can be known in advance, reducing sequential model–tool coordination can reduce elapsed time and tokens. Clear, concise contracts and actionable errors can further reduce invalid attempts and recovery rounds.

They do not establish that the smallest possible call count is always optimal, that all batches are faster, that a schema can guarantee semantic correctness, or that every rejected call can be repaired in one additional round trip.
~~~

### 3. Reclassify the current Faster sources

The current evidence is not worthless, but most of it is indirect relative to the stronger sources above.

| Current source | Recommendation | Reason |
|---|---|---|
| Self-Debugging | Keep as corroborating code-repair evidence; narrow the claim. | It compares execution feedback with independent candidate generation. It does not show that one error literally replaces ten sequential retries. |
| Self-Repair | Keep as corroboration for environment-supplied diagnosis. | The 1.58× result concerns successful repairs under human feedback, not recovery latency or one-round-trip repair. |
| SWE-agent search ablation | Remove from the primary Faster chain or move to a general interface-design precedent. | It measures eventual solve rate, not first-call validity, retries, or elapsed time. |
| Google Tricorder | Retain only as a human analogue for diagnostic wording and operational constraints. | It shows that wording affects usability, but not AI recovery time. |
| Anthropic practitioner guidance | Demote to a short practitioner note. | It is directionally consistent but publishes no usable before-and-after numbers; EASYTOOL, JTPRO, and Wu et al. provide measured evidence. |

For Self-Debugging, replace:

> One informative error replaces many blind retries.

With:

> Execution and test feedback improved accuracy and, in some settings, matched or exceeded a baseline that generated more than ten times as many independent candidate programs.

For Self-Repair, change the support label to:

> **Supports:** recovery is limited when the model must generate its own diagnosis; higher-quality external feedback improves repair success.

Do not label either study as evidence of universal one-round-trip recovery.

## Claims the revised files should not make

- Do not claim that tasks always finish fastest with the fewest calls.
- Do not call hidden model reasoning a measured “cycle” unless the project instruments and defines it.
- Do not say that a batch converts a hundred item specifications into one item’s worth of composition.
- Do not transfer parallel-execution speedups to a batch handler that executes items sequentially.
- Do not imply that whole-batch prevalidation is a transaction or rollback guarantee.
- Do not equate schema validity with semantic correctness or correct interpretation of user intent.
- Do not promise that the next attempt after every refusal will succeed.
- Do not treat longer documentation as better documentation; relevance, concision, and tested disambiguation matter.
- Do not report a latency improvement without reporting task success or time to correct completion alongside it.

## Remaining evidence gap and recommended measurement

Even the stronger sources establish mechanisms in other tool-use domains, not the net Faster effect of figma-edit-mcp itself. The most persuasive future addition to EVIDENCE.md would be a small, preregistered project benchmark comparing:

1. Single mutations versus the equivalent batch, with tool execution kept sequential in both conditions.
2. Current schemas and guides versus deliberately degraded or previous versions.
3. Current diagnostic errors versus opaque errors carrying the same refusal decision.

For each condition, measure:

- End-to-end time to correct completion.
- Sequential model–tool round trips.
- Mutation attempts and refused attempts.
- Recovery depth after a refusal.
- Input and output tokens.
- Correct task completion.
- Partial application and rework.

This would let the project state the magnitude and operating conditions of its own Faster effect. Until then, the philosophy should present the evidence as strong support for the mechanism and boundaries, not as a measured speedup for this plugin.

## Recommended final structure

The revised argument becomes:

1. **Definition:** Faster is expected end-to-end time to correct completion.
2. **Fourth insight:** unnecessary sequential interaction has a coordination cost.
3. **Task scale:** batches group operations whose arguments do not require intermediate feedback.
4. **Operation scale:** the contract reduces invalid attempts and diagnostic recovery.
5. **Boundary:** discovery, dependencies, verification, planning cost, payload size, and correctness determine the optimal number of rounds.
6. **Evidence:** MCP cost attribution → batch/fusion interventions → contract interventions → recovery experiments → analogies.

That is a stronger claim than the current wording because it is precise enough to survive the counterexamples.
