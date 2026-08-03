# Faster Recommendations

Prepared against the repository versions of `DESIGN_PHILOSOPHY.md` and `EVIDENCE.md` present on 2026-07-17. This document recommends edits; it does not apply them to either source file.

## Executive recommendation

Keep the revised fourth insight:

> **Design tools around decisions, not operations: one model turn should express all work already determined, and one tool result should provide all information needed for the next decision.**

The new evidence makes this substantially more defensible than either the original “fewest reasoning cycles” claim or the later “remove unnecessary round trips” formulation. It supports a nontrivial crossover:

- Keeping execution behind one model boundary helps when the model can already express the remaining operations or the rule that determines them.
- Consolidating across a genuine model-judgment boundary has no general benefit and can add cost.

Anthropic observed both outcomes with the same programmatic-tool mechanism: large token savings on composed multi-tool work, but no score improvement and higher cost on tasks dominated by one or two genuinely sequential calls. CodeAct, WALT, CE-MCP, and the LLM-Tool Compiler point to the same division from different directions. This is evidence for *where the boundary belongs*, not merely evidence that “fewer unnecessary actions are better.”

One refinement is needed to the previous stopping test. Asking whether an intermediate result can change the next action is too broad. A result may select a different branch without requiring another model decision; ordinary code can apply a rule the model already chose. The better test is:

> **Can the model state what follows—or the rule for determining it—before seeing the result?**

- If yes, the work can remain behind the current model boundary.
- If no, the result marks a real decision boundary and should return to the model.

Here, “already determined” therefore includes both a fixed list of operations and deterministic control logic—filters, loops, comparisons, mappings, or branches—the model can state now. It does not include a future choice that depends on the model interpreting an observation it has not yet seen.

The current “two scales” explanation should still be replaced. Batching and contract design are two sides of the same model–tool boundary:

- **Action side:** let one model turn express all operations and decision rules already determined.
- **Observation side:** return the decision-relevant information needed for the next model judgment.

## Recommended changes to DESIGN_PHILOSOPHY.md

### Keep the existing definition of Faster

The existing definition already makes correctness part of the goal:

> Faster means tasks take a shorter time to be completed correctly.

There is no need to repeat “without sacrificing correctness” in every subsequent sentence.

### Replace the current Faster section

Use the following as the paste-ready replacement for the section beginning at `## Faster`.

~~~markdown
## Faster

Faster means tasks take a shorter time to be completed correctly. This goal is where the other two pay out: Safer prevents work that would otherwise have to be diagnosed and repaired, while Cleaner reduces the search and interpretation imposed by disorder in the file. The plugin also contributes directly by matching tool boundaries to decision boundaries.

The fourth insight:
**Design tools around decisions, not operations: one model turn should express all work already determined, and one tool result should provide all information needed for the next decision.**

A primitive operation does not justify another model turn. Another turn is useful when the model must see an operation’s result before it can determine what follows. If it can already state the remaining operations—or a deterministic rule that selects them—returning after every primitive operation adds model coordination without adding model judgment.

The boundary test is: **can the model state what follows—or the rule for determining it—before seeing the result?** If yes, the work can remain behind the current model boundary. If no, the result marks a real decision boundary and should return to the model.

The plugin applies the insight on both sides of the model–tool boundary. On the action side, batch tools provide the expressive unit, schemas and guides make the available action language legible to the AI, and the structured request makes the chosen action legible and validatable to the plugin. On the observation side, success and refusal results provide the information needed for the next judgment.

### Batch operations: express the whole decision

Once the AI has determined the targets and changes, a batch lets it express them in one invocation. The plugin still validates and executes every item; what disappears is the requirement to return to the model between items that require no new judgment.

figma-edit-mcp’s current batch tools implement the fixed-list case: the AI supplies the known items and arguments together. The broader design rule also identifies a future opportunity for higher-level tools: a filter, loop, comparison, or branch could remain behind one model boundary when the AI can specify the rule before execution. The fact that an intermediate value determines which branch runs would not by itself require another model turn; a turn becomes useful when the model must see the value before it can decide what the value means for the task.

This is why the speed of a batch does not depend on Figma executing each primitive mutation faster. Its direct contribution is that already-determined work is not serialized through repeated model re-entry.

### The contract makes each exchange decision-complete

The primary consumer of these tools is an LLM composing calls. The contract therefore has two jobs.

Before execution, it must expose the parameters, distinctions, and constraints needed to translate the AI’s current decision into a valid request. A required read discovers facts about the design; trial and error caused by an ambiguous interface merely discovers facts the tool already knew.

After execution, the result must supply what the AI needs to decide what happens next. A success response should make the outcome legible. A refusal should identify the failed condition, the relevant observed value, and—when it can do so safely—the admissible alternatives or next actions. An opaque result forces another turn to reconstruct information the tool already possessed.

Decision-complete does not mean exhaustive or merely short. Irrelevant output consumes context, but removing an exact identifier, edit anchor, admissible value, or other action-critical fact can create more work than the shorter result saves. The goal is the smallest result that makes the next decision possible.

Measured evidence supports this boundary rather than a blanket preference for fewer calls. Anthropic’s programmatic tool calling reduced billed input tokens by roughly 38% without changing accuracy on a multi-tool benchmark; on tasks dominated by one or two sequential calls, it left scores unchanged and cost roughly 8% more. CodeAct and WALT likewise found that interfaces able to express composed, task-level work used fewer agent interactions while maintaining or improving task success. Most of these measurements concern tokens, steps, and success rather than elapsed time; a separate fused-only study measured lower task time even while primitive operations remained sequential, although some lower-model configurations also lost success. On the observation side, dynamic filtering improved average benchmark performance by 11% while reducing input tokens by 24%, and a paired recovery experiment found that admissible alternatives—not error location or JSON formatting alone—produced the large repair gains. ([Sources, methods, and limitations](EVIDENCE.md#faster-designing-tools-around-decisions).)

That is the plugin’s direct Faster contribution: **keep execution inside the tool until the model has something new to decide; when control returns, return the facts that decision requires.**
~~~

### Structural edits accompanying the replacement

| Current element | Recommended change | Reason |
|---|---|---|
| “fewest reasoning cycles” | Replace with the decision-boundary insight. | Cycle count is a proxy. The new claim predicts where consolidation helps and where it does not. |
| “two scales” | Replace with the action and observation sides of the model–tool boundary. | Batching and the contract are complementary directions of one exchange, not levels of a hierarchy. |
| “Could the intermediate result change the next action?” | Replace with “Can the model state what follows—or the rule for determining it—before seeing the result?” | Deterministic code can select an action from an intermediate result without model re-entry. |
| “one composition instead of a hundred” | Replace with “one invocation carrying all already-determined item specifications or a deterministic rule.” | The model still specifies the work; batching removes intermediate model mediation. |
| “later calls cost more” and “every cycle risks drift” | Remove from the philosophy. | They are host- and workload-dependent and are unnecessary to the core mechanism. |
| “first-call correctness” | Replace with request legibility after required discovery. | The first call may correctly be a read, and no schema can make an incorrect intent correct. |
| “one-round-trip recovery” | Replace with decision-complete results. | The meaningful standard is whether the response enables the next judgment, not a universal retry count. |
| “concise result” | Use “smallest decision-complete result.” | New counterevidence shows that deleting action-critical text can lower token count while increasing total cost and failures. |

### Move the batch-safety paragraph out of Faster

Whole-batch prevalidation is a safety property, not the direct Faster mechanism. Remove the current paragraph from Faster and leave the exact guarantee in `SAFETY.md` rather than duplicating it elsewhere in the philosophy.

If the philosophy needs a cross-goal reminder, add this single sentence at the end of Safer → Faster:

> Whole-batch prevalidation also prevents validation-detectable partial application; the exact guarantee and its limits are defined in [SAFETY.md](SAFETY.md).

Do not describe prevalidation as a general transaction or rollback guarantee.

## Recommended changes to EVIDENCE.md

### Replace the Faster section wholesale

Replace the section from:

> `## Faster: the fewest reasoning cycles`

through the end of its Anthropic tool-author-guidance entry with the section below.

The new hierarchy should lead with evidence that tests the decision boundary itself. Profiling studies and generic tool-writing guidance should be secondary because they establish that orchestration can be expensive, not when another model boundary has value.

~~~markdown
## Faster: designing tools around decisions

The fourth insight is an interface-design claim:

> **Design tools around decisions, not operations: one model turn should express all work already determined, and one tool result should provide all information needed for the next decision.**

The claim predicts a crossover. When the model can already specify the remaining operations or the rule that determines them, keeping that execution behind one model-visible boundary should reduce coordination cost. When a new observation requires fresh model judgment, removing the boundary should provide no such benefit and may add planning or execution overhead.

“Decision” here means model judgment, not every conditional branch. A program can filter data, repeat a call, compare a value, and choose a branch under a rule the model already supplied. The boundary belongs where the model must interpret a new observation and decide something it could not encode beforehand.

Model turns, MCP invocations, and primitive operations are different units. A host may emit several tool calls from one model turn, and one tool invocation may execute many primitive operations. The evidence below is organized around the substantive distinction: whether another model judgment is needed, and whether the result contains the information that judgment requires.

### Direct crossover evidence: programmatic tool calling helped composed work but not short sequential work

**Supports:** the placement rule on both its positive and negative sides.

Anthropic’s programmatic tool calling lets a model write code that invokes tools repeatedly, processes intermediate results, and returns only the final output to the model. The tools still execute, but the model is not sampled between calls inside the program.

Anthropic reports three results from a production Claude model:

- On a 75-tool project-management-agent benchmark, programmatic calling reduced billed input tokens by roughly **38% with no change in task accuracy**.
- Across production API traffic, requests whose tool arrays contained 10–49 definitions saw typical token savings of **20–40%**.
- On τ²-bench, where turns generally make one or two sequential tool calls, scores were unchanged and cost was roughly **8% higher**.

Anthropic consequently identifies fan-out operations and large-result filtering as strong fits, while identifying workflows in which each call depends on Claude reasoning over the preceding result as a weak fit.

**Source:** [Anthropic, “Programmatic tool calling”](https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling)

**Limits:** these are vendor-reported internal evaluations and production aggregates. The page does not publish the project-management benchmark or a confidence interval, and the reported production result measures token savings rather than elapsed task time. Programmatic calling also combines call composition, code execution, and result filtering.

**Relevance:** this is the strongest available evidence for the decision-boundary claim because the same mechanism helps workloads with composable work and adds cost to workloads that have little model mediation to remove.

### Executable composition improved multi-tool success while reducing turns (CodeAct)

**Supports:** the action side—giving one model turn a language capable of expressing composed work.

CodeAct replaces one-operation-at-a-time JSON or text actions with executable Python. On 82 human-curated multi-tool tasks, GPT-4-1106-preview achieved:

| Action interface | Success rate | Average turns |
|---|---:|---:|
| CodeAct | 74.4% | 5.5 |
| JSON | 52.4% | 7.6 |
| Text | 53.7% | 7.7 |

The same paper supplies a scope check on a separate benchmark. On API-Bank’s atomic calls, GPT-4-1106-preview scored **82.7%** with JSON and **76.7%** with CodeAct. Code syntax was not inherently superior; the stronger CodeAct result occurred on the benchmark where multi-tool composition was useful.

**Source:** [Wang et al., “Executable Code Actions Elicit Better LLM Agents” (ICML 2024)](https://proceedings.mlr.press/v235/wang24h.html)

**Limits:** the multi-tool benchmark contains 82 tasks, the models predate current frontier systems, and turn count is not wall-clock time. CodeAct also changes the action language, not only the number of model boundaries.

**Relevance:** it supports the claim that an action space capable of expressing composed work can improve both interaction count and correct completion. The atomic-task comparison prevents attributing the result to executable syntax alone; it is not a same-task ablation of boundary placement.

### Higher-level web tools reduced agent steps while improving success (WALT)

**Supports:** designing tools around task-level decisions instead of low-level interface operations.

WALT exposes deterministic, higher-level website capabilities—such as search, filter, create, edit, and delete—as tools instead of requiring the agent to perform the corresponding click-and-type sequence. In a controlled VisualWebArena-Classifieds ablation using the same surrounding agent architecture:

| Model | Primitive interface | Discovered tools |
|---|---:|---:|
| GPT-4.1 | 7.6 steps, 34.9% success | 6.6 steps, 36.4% success |
| Gemini 2.5 Flash | 10.5 steps, 52.6% success | 8.3 steps, 55.3% success |
| GPT-5-mini | 8.9 steps, 57.5% success | 6.5 steps, 61.5% success |

**Sources:** [Prabhu et al., “WALT: Web Agents that Learn Tools” (ICLR 2026)](https://iclr.cc/virtual/2026/poster/10008481); [full paper](https://arxiv.org/abs/2510.01524)

**Limits:** agent steps are not wall-clock latency. Tool discovery and construction happen offline and are not charged to the runtime task. Browser workflows differ from Figma mutation.

**Relevance:** it shows that moving already-engineered, low-level work behind a task-level tool can reduce model-visible steps without trading away task success.

### Direct MCP evidence found the same workload boundary (CE-MCP)

**Supports:** MCP-specific corroboration of the crossover.

The CE-MCP study compared conventional model-mediated MCP orchestration with an architecture in which the model writes code that invokes MCP tools. Across 10 representative MCP servers and 34 tasks, CE-MCP generally reduced tokens, time, and turns while maintaining comparable task quality.

Its trace analysis is more important than its aggregate result:

- Structured, linear, and data-parallel tasks favored code execution because the logic could run without repeated model reasoning.
- Context-sensitive, heavily textual, or iterative tasks favored traditional MCP because intermediate observations benefited from model interpretation.

**Source:** [“From Tool Orchestration to Code Execution: A Study of MCP Design Choices” (arXiv:2602.15945)](https://arxiv.org/html/2602.15945)

**Limits:** this is a recent preprint with a small task set, programmatically generated tasks, and model-judged quality. The same paper finds that executable orchestration materially expands the attack surface and is not a drop-in replacement for conventional MCP. Its numeric results should not be generalized to figma-edit-mcp.

**Relevance:** it is direct evidence that the useful MCP boundary depends on the semantic structure of the task rather than on call count alone. It supports the boundary mechanism, not adopting arbitrary model-generated code execution in this project.

### Fusing sequential operations reduced measured task time (LLM-Tool Compiler)

**Supports:** the batch mechanism when primitive operations still execute sequentially.

The LLM-Tool Compiler was evaluated on a geospatial Copilot platform. Its fused-only ablation presented several operations as one model-visible action while leaving the underlying tool execution sequential. Average task time fell by:

- **14.35–22.50%** across GPT-3.5 configurations.
- **7.33–9.01%** across GPT-4 configurations.

Concurrent execution produced additional savings, but the fused-only condition shows that savings persisted without making the primitive operations simultaneous. It does not isolate fusion from the added fuser or the altered model-visible tool surface.

**Source:** [Singh et al., “An LLM-Tool Compiler for Fused Parallel Function Calling” (arXiv:2405.17438)](https://arxiv.org/abs/2405.17438)

**Limits:** this is a domain-specific preprint. The fuser adds its own model call, and several GPT-3.5 configurations lost roughly 5.5–8.3 percentage points of task success. The measured percentages cannot be transferred to Figma tasks.

**Relevance:** it is the closest external wall-time test of placing several sequential primitive operations behind one model-visible action.

### Filtering results before model re-entry improved both performance and token use

**Supports:** the observation side—returning decision-relevant information rather than unfiltered payloads.

Anthropic evaluated Sonnet 4.6 and Opus 4.6 with and without dynamic filtering, with no other tools enabled. Across BrowseComp and DeepSearchQA, filtering:

- Improved average performance by **11%**.
- Reduced input tokens by **24%**.

On BrowseComp, Sonnet rose from **33.3% to 46.6%** and Opus from **45.3% to 61.6%**.

**Source:** [Anthropic, “Improved Web Search with Dynamic Filtering”](https://claude.com/blog/improved-web-search-with-dynamic-filtering)

**Limits:** this is a vendor evaluation of search, not mutation tools, and it does not report wall-clock latency. The filtering mechanism can itself execute multiple queries and transformations.

**Relevance:** it directly supports selecting the information that should cross a model boundary. Less context and better decisions occurred together, consistent with filtering enough irrelevant material while retaining what the tasks required.

### Admissible alternatives—not formatting alone—produced the large recovery gain

**Supports:** what a refusal must return for the next decision.

“Structured Feedback Improves Repair” compared four feedback policies on the same 50 TextWorld games under the same four-call budget:

| Feedback | Qwen solved | Llama solved |
|---|---:|---:|
| Raw diagnostic | 14/50 (28%) | 8/50 (16%) |
| Failure location + observed value | 18/50 (36%) | 9/50 (18%) |
| Location + observation + alternatives in prose | 35/50 (70%) | 29/50 (58%) |
| The same repair information in typed fields | 36/50 (72%) | 29/50 (58%) |

The failure location and observed value alone stayed near the raw baseline. Adding admissible alternatives produced gains of **36 percentage points for Qwen** and **40 points for Llama** relative to the location-and-observation condition. Prose and keyed fields carrying approximately the same information performed similarly.

**Source:** [“Structured Feedback Improves Repair in an LLM Agent Loop” (arXiv:2607.14167)](https://arxiv.org/html/2607.14167)

**Limits:** this is a July 2026 preprint using 50 synthetic games and two relatively small models. The keyed and prose conditions are closely matched but not punctuation-identical. The mechanism applies only when the validator can detect the failure and expose useful alternatives.

**Relevance:** the matched ablation points to an informational mechanism within this study: supplying choices required for the next decision mattered far more than JSON syntax alone.

### Counterevidence: smaller tool results can increase total cost and failures

**Supports:** “decision-complete,” and rejects “shortest possible result.”

“Token Reduction Is Not Cost Reduction” analyzed 2,848 provider-billed coding-agent runs across 103 tasks, seven repositories, and three Claude models. One compression treatment removed an estimated **38.4%** of raw tool-output tokens but increased pooled billed cost by **6.8%** with a 95% interval of **+2.8% to +11.3%**.

In a separate 40-task patch experiment, aggressive compression reduced successful patch application from **27/40 to 15/40** because it rewrote or removed the exact text anchors required by the subsequent edit operation.

**Source:** [“Token Reduction Is Not Cost Reduction: An Empirical Study of End-to-End Efficiency in API-Based Coding Agents” (arXiv:2607.12161)](https://arxiv.org/abs/2607.12161)

**Limits:** this is a recent preprint. The cost result and patch-application result come from different experimental components, and the latter is a small single-shot study.

**Relevance:** it supplies the necessary negative case for result design. A result should omit irrelevant material, not information the next action depends on.

### Production deployment: Cloudflare returns decision-oriented error contracts

**Supports:** real deployment of compact, actionable refusal information.

Cloudflare deployed RFC 9457 base error representations with Cloudflare extension fields such as `error_code`, `retryable`, `retry_after`, `owner_action_required`, and a prescribed next action. For its live error 1015 example, the representations contained:

| Representation | Tokens |
|---|---:|
| Browser-oriented HTML | 14,252 |
| Markdown | 221 |
| JSON | 256 |

**Source:** [Cloudflare, “Slashing agent token costs by 98% with RFC 9457-compliant error responses”](https://blog.cloudflare.com/rfc-9457-agent-error-pages/)

**Limits:** Cloudflare measured representation size, not agent retries, wall-clock recovery, or task completion. The deployment demonstrates an architecture, not its end-to-end speed effect.

**Relevance:** it is a production example of returning the facts needed to decide whether to retry, wait, change the request, or involve the resource owner.

### Mature systems batch known work and synchronize for dependencies

**Supports:** the same boundary rule outside LLM agents.

PostgreSQL pipeline mode lets a client send multiple known statements without waiting for each preceding result. Its documentation gives the stopping rule explicitly: pipelining is not useful when information from one operation is required by the client to produce the next; the client must then synchronize and pay the round trip. PostgreSQL estimates that 100 statements over a 300 ms round-trip connection can spend 30 seconds waiting without pipelining and as little as 0.3 seconds waiting when pipelined.

Amazon Simple Workflow Service uses a corresponding decision architecture. A decider receives workflow history, interprets the accumulated state, and returns a list of decisions. Workflow state changes schedule decision tasks; when a task is already outstanding, multiple state changes can be represented in the history the decider receives.

**Sources:** [PostgreSQL, “Pipeline Mode”](https://www.postgresql.org/docs/current/libpq-pipeline-mode.html); [Amazon SWF, “Developing deciders”](https://docs.aws.amazon.com/amazonswf/latest/developerguide/swf-dg-dev-deciders.html)

**Limits:** PostgreSQL’s 30-second comparison is round-trip arithmetic rather than an end-to-end application benchmark. Pipeline mode also adds client complexity, memory use, and more complicated error recovery. It synchronizes whenever the client needs a value to construct the next statement, even when deterministic client code—not semantic judgment—would process that value. Amazon SWF documents an operating architecture but publishes no before-and-after speed measurement here. Neither system contains an LLM.

**Relevance:** these are mature precedents for batching known work and returning at information dependencies. They are partial analogues, not proof of the finer model-judgment boundary.

### Secondary corroboration

The following existing evidence remains useful but should no longer lead the section:

- **Self-Debugging:** execution and unit-test feedback improved code repair; useful corroboration that environment feedback can improve the next judgment. It does not show one-round-trip recovery, and independent candidate generation is not equivalent to sequential retries. ([Chen et al., ICLR 2024](https://proceedings.iclr.cc/paper_files/paper/2024/hash/2460396f2d0d421885997dd1612ac56b-Abstract-Conference.html))
- **SWE-agent search ablation:** summarized search results achieved 18.0% success, human-style iterative search 12.0%, and no search tool 15.7%; useful evidence that observation shape affects later decisions, but not a latency or sufficiency experiment. ([Yang et al., NeurIPS 2024](https://arxiv.org/abs/2405.15793))
- **Wu et al. and EASYTOOL:** refining and standardizing instructions reduced redundant or malformed calls; useful request-legibility evidence, but both interventions change several aspects of the contract and do not isolate decision boundaries. ([Wu et al., ACL 2025](https://aclanthology.org/2025.findings-acl.1149/); [Yuan et al., NAACL 2025](https://aclanthology.org/2025.naacl-long.44/))
- **ProMCP:** shows that planning, schema injection, and final synthesis can dominate latency in some MCP topologies; useful cost-profile background, but not an intervention that tests where a boundary should be placed. ([Anjum et al., ACL 2026](https://aclanthology.org/2026.findings-acl.1967/))
- **LLMCompiler:** dependency-graph execution implements a compatible principle and reports large gains on parallel tasks, but planner changes and concurrent execution confound the causal mechanism. Its WebShop slowdown remains useful counterevidence against assuming consolidation is free. ([Kim et al., ICML 2024](https://proceedings.mlr.press/v235/kim24y.html))
- **Microsoft Agent Framework CodeAct demonstration:** with the same model, prompt, output schema, and five tools, one reported run fell from 27.81 to 13.23 seconds and from 6,890 to 2,489 tokens when only the orchestration wiring changed. Microsoft explicitly labels it one data point from an alpha package, so it is an implementation example rather than general evidence. Its guidance also keeps side-effecting operations direct when they require individual approval. ([Microsoft Agent Framework](https://devblogs.microsoft.com/agent-framework/codeact-with-hyperlight/))

### What the evidence supports

The evidence supports the following mechanism:

- An action interface can reduce model-visible coordination when it lets the model express composed operations or deterministic decision logic in one turn.
- The benefit has a boundary: when an intermediate observation requires fresh semantic judgment, hiding that observation from the model may not help and can add cost.
- At a necessary model boundary, selecting decision-relevant information can improve both efficiency and correct completion.
- “Decision-relevant” is not synonymous with “short.” Removing action-critical facts can increase total cost and failure.

The evidence does **not** establish:

- That the fewest tool calls, model turns, or output tokens is always optimal.
- That every figma-edit-mcp batch makes a task faster.
- A percentage speedup for Figma editing.
- That every decision-complete error produces a successful next attempt.
- That arbitrary model-generated code execution—or collapsing per-operation safety and approval boundaries—is appropriate for figma-edit-mcp.
- That results from search, read/compute, browser, or synthetic tasks transfer unchanged to safety-constrained, side-effecting Figma mutations.

The strongest defensible external conclusion is:

> **Tool-mediated tasks can benefit when already-determined work stays behind one model boundary and when the next boundary returns the information required for the judgment that follows. The gain can disappear or reverse when consolidation hides a genuine semantic dependency or when result reduction removes action-critical information.**
~~~

### Disposition of current and previously proposed evidence

| Source | Required action |
|---|---|
| Self-Debugging | Retain as secondary result-side corroboration. Do not equate candidate sampling with ten sequential retries. |
| Self-Repair | Remove from the core Faster section. Its strongest result uses human-written feedback and is superseded by the paired structured-feedback ablation. |
| SWE-agent | Retain as secondary evidence that observation shape changes downstream success. |
| Google Tricorder | Move the existing entry to Safer → Faster, after the Nichols automated-check study, and label it a human-facing operational analogue. |
| Qualitative Anthropic tool-author guidance | Remove as a standalone Faster entry; the measured Anthropic programmatic-calling and dynamic-filtering results replace it. |
| ProMCP from the previous recommendation | Retain as background, not causal evidence. |
| LLMCompiler from the previous recommendation | Retain as architectural corroboration and counterevidence, not as the primary proof. |
| LLM-Tool Compiler from the previous recommendation | Retain because its fused-only ablation measures elapsed time while primitive calls remain sequential. |
| Wu et al. and EASYTOOL from the previous recommendation | Retain as secondary request-legibility evidence. |
| Self-Reflective APIs from the previous recommendation | Do not add it. Use `Structured Feedback Improves Repair`, whose matched conditions more directly isolate the information associated with the gain. |

## Recommended project measurement

External evidence now supports the mechanism well, but it does not establish the magnitude for this project. The decisive next step is a figma-edit-mcp benchmark that separates model decisions from tool and primitive-operation counts.

Record:

- End-to-end elapsed time to correct completion.
- Task success and final-file correctness.
- Model inference turns.
- MCP tool invocations.
- Primitive Figma operations.
- Tool-result tokens and total billed tokens.
- Refused calls, diagnostic follow-ups, and recovery depth.
- A predeclared boundary class for each model re-entry: executable rule, new model judgment, or interface gap.

Define those classes before examining timing or success results. An **executable rule** means the next request can be generated from the allowed result schema by a deterministic rule already expressed through the available interface. **New model judgment** means the model must interpret the result before it can determine a valid next request. An **interface gap** means such a rule exists but the current tool language cannot express it. Have two reviewers label trace skeletons without performance outcomes, report their agreement, and adjudicate disagreements; otherwise the benchmark can classify boundaries after the fact to fit its conclusion.

Compare:

1. Equivalent separate mutations and batch mutations when every item is known in advance.
2. Fixed batches and higher-level operations whose filters or branches can be expressed deterministically.
3. The same tasks with an intentionally inserted model boundary between operations whose next step is already determined.
4. Minimal acknowledgements, exhaustive raw results, and smallest decision-complete results.
5. Opaque refusals, location-only refusals, and refusals containing observed values plus safe admissible alternatives.

Use the same model, host, prompt, discovered Figma state, and target outcome within each comparison. Evaluate both successful runs and expected cost across failures; otherwise a faster incorrect attempt will masquerade as a Faster design.

The strongest project-specific claim, if supported, would be:

> **On representative Figma editing tasks, figma-edit-mcp reduces time to correct completion by keeping already-determined operations behind one model boundary and returning decision-complete results at the boundaries that remain.**

Until that comparison exists, retain “can reduce” or describe the mechanism directly. Do not publish a Figma-specific speedup inferred from external agent, browser, database, or coding benchmarks.
