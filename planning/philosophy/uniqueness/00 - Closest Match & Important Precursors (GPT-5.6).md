# Closest Matches & Important Precursors

**Assessment date:** 10 August 2026

This document compares the [Unified Design Philosophy](../12%20-%20Unified%20Design%20Philosophy%20%283%20-%20Added%20Thesis%20by%20GPT-5.6%29.md) with the closest public writing identified in the literature search. Its purpose is not to argue that every underlying idea is new. It identifies the narrower contribution that remains after crediting each source for what it already covers.

"Not covered" below means that the named source does not expressly formulate or materially develop the point. It does not prove that no other publication contains it. Likewise, combining several sources can reconstruct much of the philosophy. The strongest originality claim is therefore about the philosophy's synthesis, distinctions, and causal structure, not historical priority over deterministic guardrails, structured interfaces, context management, or mixed-initiative control individually.

## Comparison rubric

The Unified Design Philosophy contributes eight elements against which each source is compared:

1. **One four-dimensional boundary model.** Enforcement, representation, control, and information are treated as different questions within one model-tool loop, rather than as a general collection of harness features.
2. **A narrow enforcement guarantee.** A mechanically stated rule checked on every relevant change becomes a condition of every accepted transition. For state invariants, that preserves a property that already holds, subject to correct predicates, observable state, complete mediation, and refusal without the prohibited effect. The philosophy also distinguishes state invariants from transition constraints.
3. **Representation as a coequal boundary.** Explicit dependencies, genuinely shared canonical sources, and distinguishable legitimate alternatives are three different mechanisms. A declaration is not ground-truth intent, and false canonicalization or a stale relationship can make the wrong behavior easier to enforce.
4. **A decision test for control placement.** Work stays in software when the next action, or the deterministic rule for selecting it, can be stated before seeing the result. Control returns when a new observation can change what should happen next. The useful boundary is therefore a decision boundary, not an operation boundary.
5. **Bidirectional decision-completeness.** A request must express the current decision unambiguously, and a result must return the outcome and facts needed for the next judgment. The target is the smallest decision-complete exchange, not the shortest result or the largest available context.
6. **Three outcome variables.** Safer, Cleaner, and Faster are kept distinct. Cleaner is split into state quality and structural clarity, and Faster means time to correct completion rather than token or call reduction alone.
7. **A maintenance and causal model.** Explicit structure can enable a check; enforcement can reduce defect inflow; repair removes existing defects; cleaner structure can reduce recurring inference. The philosophy states the conditions and countereffects of these paths rather than assuming that more structure, more checks, or fewer calls are always better.
8. **Non-additive accounting.** Representation plus enforcement is one prevention mechanism; refusal plus actionable information is one recovery mechanism; a prevented defect plus avoided repair is one causal chain; recorded meaning plus interface exposure is one information effect; and grouping remains distinct from validation.

These elements are not equally novel. Items 1, 3, 4, 5, 6, 7, and 8 carry most of the source-relative novelty. The broad premise behind item 2 has extensive precedent.

## Closest matches

### 1. Dex Horthy, [12-Factor Agents](https://github.com/humanlayer/12-factor-agents) (2025)

**What the source covers**

12-Factor Agents gives one of the clearest prior descriptions of the basic loop: the LLM emits a structured next step, deterministic code executes it, and the result is appended to context. Its factors separately recommend owning context, treating tools as structured outputs, unifying execution and business state, pausing and resuming work, contacting humans through tools, owning control flow, and putting compact errors back into context. It therefore covers substantial parts of the control and information boundaries and provides a concrete representation of execution state.

**What the Unified Design Philosophy adds**

- It turns a collection of production patterns into four explicit boundary questions and shows how the questions compose in one request-check-execute-result loop.
- It gives enforcement a stronger and narrower meaning than owning control flow or inserting approval. A check governs accepted transitions only when every relevant change passes through it and refusal leaves the prohibited state unchanged.
- It distinguishes an explicit execution log from explicit artifact semantics. The representation boundary concerns dependencies, shared decisions, and legitimate alternatives in the artifact, not only thread state, tool calls, or durable workflow state.
- It supplies a criterion for when to continue inside the loop: not merely whether a branch is synchronous or resumable, but whether the next action or selection rule is already determined before the result is observed.
- It generalizes useful errors and context ownership into a bidirectional decision-complete exchange. This includes exposing the valid request space before execution and returning exact identifiers, failed conditions, or accepted alternatives afterward.
- It separates grouping from validation. 12-Factor Agents discusses custom control flow and deterministic execution, but does not make call consolidation and reject-before-change behavior separate benefit claims.
- It relates the patterns to Safer, Cleaner, and Faster and supplies rules against counting the same prevention or recovery chain several times.

**Source-relative novelty:** chiefly unification, the representation boundary, the decision-boundary test, and causal accounting.

### 2. Anthropic, [Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents) (11 September 2025)

**What the source covers**

Anthropic explicitly describes tools as contracts between deterministic systems and nondeterministic agents. It recommends distinct tool purposes, strict data models, unambiguous parameters, semantic names, consolidated high-level tools, high-signal responses, token-efficient filtering, and actionable error messages. This is very close to the Unified Design Philosophy's practical advice for control and information, and it partially anticipates choice clarity in the representation boundary.

**What the Unified Design Philosophy adds**

- It separates making a tool understandable from making a rule enforceable. Clear descriptions improve probabilistic proposals; an execution-time predicate controls whether a prohibited proposal takes effect.
- It formalizes the conditions under which a check can preserve a state invariant, including complete mediation and effect-free refusal. The Anthropic article is evaluation-driven guidance, not an enforcement contract.
- It extends representation beyond tool schemas and semantic names to relationships inside the edited artifact. Recorded dependencies, canonical sources, and distinguishable alternatives have different effects and different failure modes.
- It warns that equal values do not prove shared intent, that explicit declarations may be stale or wrong, and that false canonicalization can erase legitimate distinctions. The tool-writing article recommends clarity but does not develop these semantic risks.
- It replaces workflow frequency or context savings as the main consolidation criterion with a decision test: consolidate only the work whose choices are already determined, and return when new evidence can change the plan.
- It defines information quality relative to a particular decision. "High signal" and "concise" become the more falsifiable target of the smallest exchange that permits the current or next decision without reconstruction.
- It connects tool ergonomics to artifact maintenance and correct-completion time, then prevents overlap among the safety, cleanliness, and speed claims.

**Source-relative novelty:** a stronger separation of instruction from enforcement, artifact-level representation, the decision test, and outcome accounting.

### 3. OpenAI, [Harness engineering: leveraging Codex in an agent-first world](https://openai.com/index/harness-engineering/) (11 February 2026)

**What the source covers**

OpenAI reports a concrete system in which repository knowledge is the system of record, progressive disclosure protects context, custom linters and structural tests mechanically enforce architecture, error messages contain remediation instructions, and agents escalate only when human judgment is required. It also connects explicit structure, enforceable invariants, feedback loops, and sustained autonomous execution. Among the sources reviewed, it demonstrates the largest portion of the philosophy in one deployed workflow.

**What the Unified Design Philosophy adds**

- It generalizes from coding-agent repository design to tools that mutate arbitrary artifacts, including Figma documents, and identifies the same boundary questions independently of files, tests, and pull requests.
- It distinguishes human steering from model judgment. In the philosophy, the model may legitimately resolve semantic ambiguity while software enforces mechanical conditions; the division is not simply humans decide and agents execute.
- It states what mechanical enforcement actually guarantees and what it cannot guarantee. A structurally valid edit may still be the wrong edit, and deterministic checks may consistently enforce the wrong predicate.
- It decomposes "legibility" into explicit dependencies, canonical sources, and choice clarity. It also gives criteria for when sharing is legitimate and warns that centralizing a wrong decision can increase its blast radius.
- It supplies a local test for each model-software crossing. OpenAI demonstrates long autonomous runs and judgment-based escalation, but does not state the pre-observation criterion that distinguishes determined execution from a new semantic decision.
- It turns progressive disclosure and actionable lint output into a bidirectional information contract covering request composition as well as recovery.
- It distinguishes preserving good state from repairing existing disorder. OpenAI's recurring cleanup resembles the maintenance cycle, but the philosophy explicitly separates lower defect inflow from removal of the existing defect stock.
- It provides non-additive accounting for structure, checks, diagnostics, and avoided rework instead of presenting them as a broad set of compounding harness benefits.

**Source-relative novelty:** cross-domain generalization, formal limits, representation mechanics, per-crossing control criteria, and causal accounting.

### 4. Vivek Trivedy, [The Anatomy of an Agent Harness](https://www.langchain.com/blog/the-anatomy-of-an-agent-harness) (10 March 2026)

**What the source covers**

The article defines an agent as model plus harness and assigns state, tool execution, orchestration, feedback loops, deterministic hooks, sandboxes, durable storage, and context management to the harness. It provides a broad inventory of the machinery around model intelligence and explains why that machinery is necessary.

**What the Unified Design Philosophy adds**

- It treats the boundary as a placement problem rather than a component inventory. "Everything outside the model" does not answer which choices should remain probabilistic, which rules must be mechanical, or when control should cross back.
- It separates explicit state from executing software. Representation is not merely a harness feature; it is the semantic bridge that can make a relationship reusable and mechanically checkable.
- It gives deterministic hooks an enforcement contract. A hook or test is not automatically a pre-effect guard, and feedback after mutation does not by itself preserve an invariant across accepted states.
- It distinguishes context storage and compaction from decision-completeness. Offloading information solves volume; decision-completeness asks whether the remaining crossing contains exactly what can change the relevant judgment.
- It supplies the control-boundary test. Long-horizon continuation, subagents, and loops are execution patterns, while the philosophy asks whether unseen evidence can change the next action.
- It analyzes adverse placements: excessive enforcement can rigidify subjective choices, excessive consolidation can amplify a wrong plan, and excessive information can consume context without changing a decision.
- It maps the architecture to separate artifact and task outcomes and prevents joint harness effects from being counted repeatedly.

**Source-relative novelty:** a normative placement framework layered over the descriptive model-plus-harness architecture.

### 5. Ryan Setter, [Probabilistic Core / Deterministic Shell](https://heavythoughtcloud.com/knowledge/probabilistic-core-deterministic-shell) (7 March 2026)

**What the source covers**

This is the closest rhetorical match to the philosophy's thesis. It places generation, ranking, fuzzy extraction, and synthesis in a probabilistic core, while schemas, validators, permissions, policy, budgets, retries, traces, and evaluation gates form a deterministic shell. Its maxim that the model proposes while the system disposes closely matches the enforcement boundary.

**What the Unified Design Philosophy adds**

- It splits the broad shell into enforcement, representation, control, and information. This avoids treating every non-model concern as one undifferentiated containment layer.
- It identifies which shell decisions should not be deterministic. Subjective meaning remains on the judgment side even when software could technically encode a rigid proxy for it.
- It derives a transition guarantee from complete mediation and effect-free refusal, while distinguishing persistent state invariants from one-time transition constraints.
- It gives representation an artifact-maintenance role. Setter's interface, behavior, data, and operational contracts constrain a workflow, but do not develop explicit consumer relationships, genuine canonical sources, or the preservation of legitimate alternatives.
- It adds the decision-boundary criterion for execution granularity. Budgets and state machines constrain a loop; they do not determine when a fresh model judgment is semantically necessary.
- It adds decision-completeness as a minimal bidirectional exchange, rather than treating traces, evidence, and structured output primarily as governance or observability requirements.
- It introduces Cleaner as an independent outcome, including structural clarity and defect stock, and explains how explicit structure can first enable and then be preserved by enforcement.
- It supplies accounting rules for joint mechanisms. The shell article presents contracts, enforcement, observability, and evaluation as complementary layers but does not isolate their causal contributions or prevent duplicate benefit claims.

**Source-relative novelty:** decomposition of the shell, artifact representation and maintenance, decision-based control, and causal accounting.

### 6. Birgitta Bockeler, [Harness engineering for coding agent users](https://martinfowler.com/articles/harness-engineering.html) (2 April 2026)

**What the source covers**

Bockeler distinguishes deterministic computational controls, such as tests, linters, type checkers, and structural analysis, from inferential controls that provide semantic judgment. She also separates feedforward guidance from feedback sensors, argues for signals optimized for model consumption, and treats harnessability and explicit knowledge as properties of the agent environment.

**What the Unified Design Philosophy adds**

- It places a hard distinction between influencing a proposal and governing whether its effect is accepted. A computational sensor that reports a defect after an edit may support recovery without being an enforcement boundary.
- It formalizes pre-effect preservation: if a state invariant holds, every relevant accepted transition preserves it, and refusals do not make the prohibited change, then the invariant remains true across the mediated history.
- It gives representation a semantic taxonomy. Harnessability and legibility are broader environmental properties; the philosophy separately analyzes dependencies, canonical reuse, and distinguishable choices.
- It assigns judgment to the model when ambiguity is intrinsic, rather than mapping all inferential work to an optional review sensor outside the main action path.
- It identifies decision boundaries between model turns. Bockeler analyzes where controls run in the delivery lifecycle; the philosophy analyzes whether a new observation requires a new semantic decision before execution continues.
- It makes feedback decision-complete in both directions, including the input distinctions needed to avoid discovery by failure.
- It separates state quality, structural clarity, and correct-completion time, and states when validation overhead or overconstraint can outweigh the benefit.
- It treats a guard plus its diagnostic as one recovery mechanism and a prevented defect plus later avoided repair as one mediated chain.

**Source-relative novelty:** accepted-transition semantics, artifact representation, model-turn placement, and explicit causal accounting.

### 7. Unmesh Joshi, [DSLs Enable Reliable Use of LLMs](https://martinfowler.com/articles/llm-and-dsls.html) (14 July 2026)

**What the source covers**

Joshi argues that semantic models and constrained domain-specific languages reduce the model's valid search space, preserve domain intent in an explicit source of truth, and supply deterministic parsers, schemas, type checkers, or compilers. Domain-level validation errors let an agent repair generated work locally. This strongly overlaps the representation and enforcement boundaries.

**What the Unified Design Philosophy adds**

- It generalizes beyond generated code and DSLs to relationships already present in an edited artifact, such as variable consumers and component-instance links.
- It distinguishes three representation mechanisms. A DSL principally supplies a vocabulary and constrained semantic model; the philosophy separately analyzes explicit dependencies, canonical shared decisions, and clearer target choices.
- It warns that explicitness preserves a declaration, not truth. A wrong semantic model, stale dependency, or falsely unified source can make the wrong rule easier to apply broadly.
- It distinguishes candidate validation from persistent transition enforcement. A compiler rejects a malformed generated program; an artifact guard must mediate every later change capable of violating the protected relationship.
- It distinguishes state invariants from transition constraints and states the conditions under which accepted-state preservation follows.
- It supplies the decision-boundary test for deciding which loops or branches belong in software and when new evidence should return to model judgment.
- It generalizes useful domain-level errors into a full request/result information contract and warns against both omission and irrelevant output.
- It connects representation and validation without double-counting them: the semantic model enables the rule, while the validator performs the refusal.

**Source-relative novelty:** generalization from DSLs to mutable artifacts, a more differentiated representation theory, persistent mediation, and integration with control and information.

## Important precursors

### 8. Anthropic, [Building effective agents](https://www.anthropic.com/research/building-effective-agents) (19 December 2024)

**What the source covers**

Anthropic distinguishes code-orchestrated workflows from model-directed agents, recommends programmatic gates in prompt chains, emphasizes environmental ground truth and human checkpoints, and calls for carefully designed agent-computer interfaces. It also advises using predictable workflows for well-defined tasks and agents when flexibility and model-driven decisions are needed.

**What the Unified Design Philosophy adds**

- It turns a whole-system workflow-versus-agent distinction into a per-decision placement rule. One system can keep determined execution in software and return individual ambiguous decisions to the model.
- It defines "determined" operationally: the next action or selection rule can be stated before the result is seen.
- It distinguishes a programmatic gate from a guaranteed invariant and names the complete-mediation and no-effect-on-refusal conditions.
- It adds artifact representation as the mechanism that can move an implicit relationship into observable, reusable, and enforceable state.
- It makes the agent-computer interface bidirectionally decision-complete rather than generally easy and well documented.
- It separates consolidation from validation and identifies the risk of keeping control too long when a valid but mistaken plan should be reconsidered.
- It supplies the Safer/Cleaner/Faster maintenance and accounting model, which the pattern catalog does not attempt.

**Source-relative novelty:** a finer-grained decision boundary, formal enforcement semantics, representation, and outcome accounting.

### 9. OpenAI, [A practical guide to building agents](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/) (2025)

**What the source covers**

The guide reserves agents for ambiguous, contextual work where deterministic rules fall short. It describes models, tools, instructions, orchestration loops, rules-based protections, output validation, tool risk ratings, exit conditions, and human intervention for high-risk actions or repeated failure.

**What the Unified Design Philosophy adds**

- It separates probabilistic safeguards from mechanical guarantees. A classifier or model-based guardrail may improve outcomes, while only an appropriately placed deterministic predicate controls a covered transition by construction.
- It explains why prompts and checks are complementary rather than grouping instructions and guardrails under one reliability layer.
- It identifies explicit semantic relationships as a prerequisite for some checks. Standardized tool definitions do not by themselves make artifact dependencies or shared design decisions observable.
- It supplies a decision criterion for orchestration granularity instead of choosing mainly among single-agent, manager, or handoff architectures.
- It treats return to the model as distinct from escalation to a human. New evidence may require model judgment even when no human approval is needed.
- It defines the smallest sufficient request and result for the next decision, including actionable refusal data and accepted alternatives.
- It separates reject-before-change validation from batching or loop execution.
- It provides a lifecycle account of defect inflow, repair, structural clarity, and correct-completion time, including negative tradeoffs and non-additive effects.

**Source-relative novelty:** guarantee taxonomy, representation prerequisites, model-level decision crossings, decision-completeness, and lifecycle accounting.

### 10. Eric Horvitz, [Principles of Mixed-Initiative User Interfaces](https://www.microsoft.com/en-us/research/publication/principles-mixed-initiative-user-interfaces/) (CHI 1999)

**What the source covers**

Horvitz provides an important ancestor for control placement. Mixed-initiative systems should couple automated services with direct manipulation, reason about uncertainty and expected utility, decide when to act or engage in dialog, and preserve user control when automatic inference may be wrong.

**What the Unified Design Philosophy adds**

- It moves the central boundary from human versus automation to probabilistic judgment versus deterministic software. A model can occupy the judgment side even when no human is involved in the immediate loop.
- It separates subjective uncertainty from mechanically testable conditions. Expected-utility reasoning decides whether an intervention is useful; a deterministic guard decides whether a stated prohibited transition may occur.
- It introduces complete-mediation conditions and accepted-state preservation, which are outside the mixed-initiative interaction problem.
- It gives explicit representation a central role in turning inferred relationships into inspectable dependencies and possible safeguards.
- It uses a different control criterion. Horvitz asks whether autonomous action has sufficient expected value; the philosophy asks whether unseen evidence can change what should happen next.
- It extends clarification into a bidirectional tool contract containing the exact state, identifiers, constraints, and alternatives needed for the next judgment.
- It analyzes artifact cleanliness and later maintenance cost, not only immediate interaction quality and user control.
- It prevents enforcement, information, and control benefits from being counted as independent copies of one intervention.

**Source-relative novelty:** translation of mixed initiative into a model-software architecture, mechanical enforcement, explicit artifact state, and causal maintenance outcomes.

### 11. Microsoft Research, [Guidelines for Human-AI Interaction](https://www.microsoft.com/en-us/research/blog/guidelines-for-human-ai-interaction-design/) (1 February 2019)

**What the source covers**

The guidelines call for clear capability and error expectations, contextually timed services, relevant information, efficient invocation, dismissal and correction, graceful scoping under uncertainty, explanations, granular feedback, and global controls. They are a strong precursor to the information boundary and to returning control when AI behavior is uncertain or wrong.

**What the Unified Design Philosophy adds**

- It applies the ideas to the internal interface between a model and a tool, not only the product interface between an AI system and a person.
- It distinguishes guidance for behavior from software-enforced transition rules. The guidelines are design recommendations and do not claim invariant preservation.
- It adds the representation question: which consequential relationships must become machine-inspectable before either a model or a check can use them?
- It defines control crossings by decision dependency rather than user interruption timing or uncertainty alone.
- It makes information explicitly bidirectional. The request contract must expose the valid action space, while the result contract must support the next judgment.
- It narrows "contextually relevant" to decision-completeness and warns that aggressive brevity can be as harmful as exhaustive output.
- It identifies joint mechanisms: an explanation without a guard does not prevent the action, while a guard without an actionable explanation can make recovery expensive.
- It adds artifact maintenance, correct-completion time, and non-additive causal accounting.

**Source-relative novelty:** internal model-tool application, enforceable semantics, representation, decision-relative information, and joint-effect accounting.

### 12. Alexis King, [Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/) (5 November 2019)

**What the source covers**

King argues that checks should produce a more precise representation that preserves what was learned, that illegal states should be made unrepresentable where practical, that parsing should happen before action at the system boundary, and that denormalized copies should give way to a single source of truth. This is a strong software-design precursor to the representation boundary.

**What the Unified Design Philosophy adds**

- It places representation between probabilistic semantic judgment and mechanical execution. A declared relationship may require model or human judgment before software can preserve it.
- It distinguishes structural facts proven by parsing from semantic declarations that may be wrong, incomplete, or stale even when perfectly well typed.
- It separates explicit dependencies, canonical sharing, and target discriminability. A precise type does not by itself say whether two equal values represent one enduring decision.
- It warns against false canonicalization. "Single source of truth" is beneficial only when the uses are genuinely intended to remain linked.
- It extends initial boundary parsing to ongoing mutable transitions and states the complete-mediation conditions required to preserve an invariant over time.
- It distinguishes transition constraints from persistent state invariants.
- It adds model-software control placement and decision-complete exchanges, neither of which is part of type-driven design.
- It situates representation in a maintenance cycle with enforcement and repair, and separates direct cleanliness benefits from safety-mediated avoided defects.

**Source-relative novelty:** semantic declarations and their risks, mutable artifact maintenance, model-tool control, and causal integration.

### 13. Steve Krenzel, [AI Is Forcing Us To Write Good Code](https://bits.logic.inc/p/ai-is-forcing-us-to-write-good-code) (29 December 2025)

**What the source covers**

Krenzel argues that coding agents benefit from mechanically enforced guardrails, exhaustive executable examples, semantic names and namespaces, small modules, fast feedback, typed APIs, database constraints, and development environments designed for repeated agent checks. It connects explicit structure to both agent legibility and reliability.

**What the Unified Design Philosophy adds**

- It generalizes beyond source code and coding-agent environments to any tool-mediated artifact.
- It distinguishes fast feedback after a change from refusal before a prohibited effect. Tests and coverage can support correction without guaranteeing that an invalid transition never entered the artifact.
- It states the assumptions behind an enforcement guarantee and limits that guarantee to the mechanically expressed rule.
- It differentiates names, types, dependencies, and canonical sources by mechanism. Semantic naming improves selection; an explicit dependency enables checking; a canonical source reduces divergence.
- It warns that stricter structure is not universally better. Wrong types, stale declarations, and collapsed distinctions can reliably steer the agent in the wrong direction.
- It derives execution granularity from whether a new judgment is needed, rather than from keeping the edit-test loop merely short and fast.
- It defines decision-complete diagnostics and request contracts, not just legible code and clear test failures.
- It separates validation overhead, structural search savings, prevented defect inflow, and later avoided repair in the Safer/Cleaner/Faster account.

**Source-relative novelty:** mechanism separation, pre-effect guarantees, placement tradeoffs, decision boundaries, and causal accounting.

### 14. Cloudflare, [Code Mode: the better way to use MCP](https://blog.cloudflare.com/code-mode/) (26 September 2025)

**What the source covers**

Cloudflare converts MCP tools into a TypeScript API and lets the model write sandboxed code that composes them. Loops and intermediate data transfer can remain in code, only final logged results need return to the model, and sandbox bindings constrain which outside capabilities the generated program can access. This is a concrete precursor to moving mechanical coordination out of repeated model turns.

**What the Unified Design Philosophy adds**

- It distinguishes deterministic execution from a deterministic rule. Model-generated code can execute repeatably while still encoding a mistaken plan; code mode alone is not an enforcement guarantee.
- It supplies the criterion for when code should continue and when the model must see an intermediate result because that evidence could change the semantic choice.
- It warns against treating "only final results" as an unconditional virtue. A result must retain any evidence, identifiers, or alternatives needed for the next judgment.
- It separates capability confinement in the sandbox from artifact-integrity checks on each state-changing operation.
- It adds explicit semantic representation. A TypeScript API describes callable operations but does not necessarily record dependencies or genuinely shared decisions in the edited artifact.
- It distinguishes call fusion from whole-request validation and atomic rejection.
- It evaluates Faster as correct completion, not only fewer tokens, less copying, or fewer inference passes.
- It connects control and information improvements to enforcement and cleanliness without adding their overlapping benefits twice.

**Source-relative novelty:** the decision criterion and safety limits around code-mode consolidation, plus representation and outcome accounting.

### 15. Anthropic, [Code execution with MCP: Building more efficient agents](https://www.anthropic.com/engineering/code-execution-with-mcp) (4 November 2025)

**What the source covers**

Anthropic recommends loading tool definitions on demand, filtering and transforming large results before they reach the model, expressing loops and conditionals in code, keeping sensitive intermediate values outside model context, persisting state in files, and saving reusable higher-level skills. It also acknowledges sandboxing and operational tradeoffs. This strongly anticipates the control and information boundaries.

**What the Unified Design Philosophy adds**

- It provides a semantic stopping rule for code execution: continue only while choices are already determined; return when a new observation can change the next action.
- It distinguishes ordinary code execution from enforcement. A generated loop, filter, or branch is not a trusted guard unless a separately controlled predicate mediates every relevant effect.
- It separates operational state persistence from explicit artifact relationships and canonical decisions.
- It defines the minimum retained output relative to the next decision. Context reduction is beneficial only if it does not remove evidence the model needs to revise the plan.
- It covers the request side of the boundary as well as result filtering: parameters, constraints, names, and valid alternatives must make the current decision expressible without trial-and-error discovery.
- It distinguishes grouping from reject-before-change validation and partial-effect prevention.
- It states the countercase more generally: fewer crossings can amplify a valid but wrong plan when control returns too late.
- It integrates token and latency observations into a stricter Faster claim and a non-additive Safer/Cleaner/Faster model.

**Source-relative novelty:** a general decision-boundary rule, enforcement separation, artifact semantics, bidirectional decision-completeness, and outcome discipline.

## What is actually distinctive

Across these sources, the following ideas have strong precedent and should not be presented as inventions of the Unified Design Philosophy:

- probabilistic models should be surrounded by deterministic software;
- mechanically enforced constraints are stronger than prompt reminders;
- tools benefit from structured schemas, clear names, and actionable errors;
- explicit state, types, semantic models, and canonical sources improve reliability;
- code can execute loops, filters, and tool composition more efficiently than repeated model turns;
- context should be relevant, progressively disclosed, and compact enough for the model to use;
- agents should pause or escalate when uncertainty, risk, or failure warrants new judgment.

The most defensible distinctive contributions are instead:

1. **The exact four-boundary decomposition.** None of the reviewed sources jointly organizes enforcement, representation, control, and information as four separate placement questions in one loop.
2. **Representation as the hinge between judgment and enforcement.** The philosophy explains how a semantic declaration can expand the checkable surface while remaining fallible, and distinguishes dependencies, genuine canonicalization, and choice clarity.
3. **The pre-observation decision test.** The question "Can the next action, or the rule for choosing it, be stated before seeing the result?" gives a general criterion for model-tool granularity that is sharper than advice to batch, use code, pause for risk, or own control flow.
4. **Decision-completeness in both directions.** The philosophy unifies request expressiveness, result sufficiency, actionable refusal, and context economy around the decision each crossing serves.
5. **The Safer/Cleaner/Faster maintenance model.** It distinguishes structural clarity from defect stock, prevention from repair, present coordination from future maintenance, and speed proxies from correct-completion time.
6. **The accounting rules.** It explicitly prevents structure plus checks, guards plus diagnostics, and prevented defects plus avoided repair from being reported as independent benefits.
7. **The placement limits.** It treats overenforcement, false canonicalization, overlong execution, and overtrimmed information as symmetric boundary errors rather than assuming that maximizing any one mechanism is desirable.

The resulting originality claim should therefore be modest but meaningful:

> The Unified Design Philosophy does not originate deterministic guardrails, explicit structure, agent control flow, or context-efficient interfaces. It contributes a unified boundary-placement framework that separates those mechanisms, states their conditions and failure modes, and relates them to artifact maintenance and time to correct completion without double-counting their effects.
