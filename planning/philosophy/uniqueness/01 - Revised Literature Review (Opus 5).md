# Revised Literature Review: Overlap, Precedent, and Residual Contribution

**Assessment date:** 10 August 2026
**Subject:** [Unified Design Philosophy](../12%20-%20Unified%20Design%20Philosophy%20%283%20-%20Added%20Thesis%20by%20GPT-5.6%29.md)
**Status:** Revision of [00 - Closest Match & Important Precursors (GPT-5.6).md](00%20-%20Closest%20Match%20%26%20Important%20Precursors%20%28GPT-5.6%29.md). That file is left unchanged. Where the two disagree, this document supersedes it and says why.

## Why this revision exists

The original question was: *as of August 2026, are there articles, blog posts, or presentations whose content broadly overlaps with the Unified Design Philosophy?*

The prior document answered a narrower question - *is the philosophy still novel?* - and structured itself accordingly: a short concession of what each source covers, followed by six to ten bullets of what the philosophy adds. That framing produced four defects:

1. It never screened the philosophy's own bibliography in [EVIDENCE.md](../../../EVIDENCE.md) for prior art, although several sources cited there are stronger precursors than the blog posts reviewed.
2. It omitted the pre-LLM canon that supplies the formal content of its three headline claims.
3. It asserted "not covered" without quotation or anchor, and several of those assertions are false when checked against the sources.
4. It repeated roughly seven novelty claims across fifteen sections, producing an appearance of robustness by repetition - the exact error the philosophy's own accounting rule 3 forbids.

This revision answers the question that was asked, states each claim once, and marks what could not be verified.

## Summary answer

**Yes. The overlap is extensive, and the thesis is a convergent 2025-2026 consensus rather than a distinctive position.**

At least seven independent practitioner sources published between December 2024 and July 2026 state the core claim - probabilistic judgment inside deterministic containment - and four of them decompose it in ways that map closely onto the philosophy's four boundaries. Below that layer, the formal content of the philosophy's strongest claims is supplied by established literature in computer security, program verification, quality engineering, cognitive design, decision analysis, robotics, and pragmatics, none of which the prior document cited.

What survives is narrower than the prior document claimed, and different in kind. It is not the thesis, the four mechanisms, or the per-crossing tests. It is the packaging discipline: one placement checklist over one loop, the split of "cleaner" into state quality and structural clarity, explicit rules against double-counting benefits, a published limits section, and an evidence base that records counterevidence and rejected evidence. The prior document did not claim the last two, which are the most defensible.

## Method, and what it does not cover

**What was done.** Fifteen sources from the prior document were carried forward. Five of them (OpenAI, LangChain, Bockeler, Joshi, Setter) were fetched and read in full on 10 August 2026; quotations from those five are verbatim, with punctuation normalised to ASCII. Their outbound citations were followed one hop, which surfaced six additional agent-era sources the prior pass missed. The philosophy's own evidence base was then screened for sources that function as prior art rather than as supporting measurement. Finally, the philosophy's eight rubric elements were traced back to their nearest antecedents in the pre-LLM literature.

**What was not done, and matters.**

- **Ten of the fifteen carried-forward sources were not re-fetched in this pass.** Their characterisations are inherited from the prior document or from prior knowledge and are marked accordingly. Any "not covered" claim against them is weaker than one against the five verified sources.
- **No systematic search of academic venues.** No arXiv, ACL, ICML, NeurIPS, CHI, or ICSE sweep was performed. Named academic sources below were recalled, not discovered by search. This is a material gap: the corpus is skewed to English-language practitioner blogging from the last eighteen months, which is exactly the population most likely to converge and least likely to contain the deepest precedent.
- **No priority dates.** It is not recorded when the philosophy or its predecessors in this folder were drafted relative to the February to July 2026 sources. Without that, every "the philosophy adds" statement is ambiguous between *was first* and *says more*. This document uses *says more* throughout and makes no priority claim.
- **No source-quality weighting was applied by the prior document, and this one states it instead of correcting it.** One source it ranked as the "closest rhetorical match" is a knowledge-base page on a solo consultancy site; several peer-reviewed sources with closer content were absent.
- **The reviewed sources are not independent observations.** OpenAI cites King and Krenzel. Bockeler cites OpenAI and LangChain. Joshi builds on Evans and Fowler. Sources 1 to 7 and 12 to 13 of the prior document form one citation cluster. Fifteen entries overstate the breadth of the search.

## The rubric

These are the eight elements the philosophy contributes. This is the instrument used to reach the conclusion in this document; unlike the prior version, the closing section maps back to it one-to-one.

| Key | Element |
| --- | --- |
| **E1** | One four-dimensional boundary model: enforcement, representation, control, and information as distinct placement questions in a single model-tool loop. |
| **E2** | A narrow enforcement guarantee: a mechanically stated rule checked on every relevant change becomes a condition of every accepted transition, subject to correct predicates, observable state, complete mediation, and effect-free refusal. Includes the state-invariant versus transition-constraint distinction. |
| **E3** | Representation as a coequal boundary, with explicit dependencies, genuine canonical sources, and distinguishable alternatives treated as three mechanisms with different failure modes. A declaration is not ground-truth intent. |
| **E4** | A decision test for control placement: work stays in software when the next action, or the deterministic rule for selecting it, can be stated before the result is seen. |
| **E5** | Bidirectional decision-completeness: the request must express the current decision unambiguously; the result must return what the next judgment needs, and as little else as possible. |
| **E6** | Three outcome variables kept distinct, with Cleaner split into state quality and structural clarity, and Faster defined as time to correct completion. |
| **E7** | A maintenance and causal model: structure enables checks, enforcement reduces defect inflow, repair removes defect stock, cleaner structure reduces recurring inference - with conditions and countereffects stated. |
| **E8** | Non-additive accounting: structure plus check is one prevention mechanism; refusal plus diagnostic is one recovery mechanism; prevented defect plus avoided repair is one causal chain; recorded meaning plus interface exposure is one information effect; grouping remains distinct from validation. |

## Coverage matrix

Legend: **F** = expressly formulated. **P** = present in substance, not formulated as such. **-** = absent or immaterial. **v** after a source name = fetched and read in this pass; otherwise inherited or recalled and not re-verified.

### Contemporary sources (2024-2026)

| Source | E1 | E2 | E3 | E4 | E5 | E6 | E7 | E8 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Horthy, 12-Factor Agents (2025) | P | P | P | P | F | - | - | - |
| Anthropic, Writing effective tools for agents (2025) | P | P | P | P | F | - | - | - |
| Anthropic, Building effective agents (2024) | P | P | - | P | P | - | - | - |
| Anthropic, Code execution with MCP (2025) | - | - | P | F | F | - | - | - |
| Anthropic, Effective context engineering (2025) | - | - | - | P | F | - | - | - |
| OpenAI, Harness engineering (2026) **v** | P | F | F | P | F | P | F | - |
| OpenAI, Practical guide to building agents (2025) | P | P | - | P | P | - | - | - |
| LangChain, Anatomy of an Agent Harness (2026) **v** | P | P | P | P | F | - | - | - |
| Bockeler, Harness engineering for coding agent users (2026) **v** | F | P | F | P | F | P | P | - |
| Joshi, DSLs Enable Reliable Use of LLMs (2026) **v** | P | F | F | P | F | - | P | - |
| Setter, Probabilistic Core / Deterministic Shell (2026) **v** | P | F | P | P | P | - | - | - |
| Krenzel, AI Is Forcing Us To Write Good Code (2025) | P | F | F | P | P | P | P | - |
| Cloudflare, Code Mode (2025) | - | - | P | F | P | - | - | - |
| Yang et al., SWE-agent ACI (NeurIPS 2024) | P | F | - | P | F | - | - | - |
| Kambhampati et al., LLM-Modulo (ICML 2024) | P | F | P | P | P | - | - | - |
| Debenedetti et al., CaMeL (2025) | F | F | F | F | P | - | - | - |
| Cognition, Don't Build Multi-Agents (2025) | - | - | P | F | F | - | - | - |

### Pre-LLM canon

| Source | E1 | E2 | E3 | E4 | E5 | E6 | E7 | E8 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Anderson (1972); Saltzer and Schroeder (1975) | - | F | - | - | - | - | - | - |
| Floyd (1967); Hoare (1969); Meyer (1986, 1997) | - | F | P | - | - | - | - | - |
| Shingo, poka-yoke (1985); Toyota jidoka | - | F | - | - | - | P | F | - |
| Norman, forcing functions and knowledge in the world (1988) | P | F | F | - | P | - | - | - |
| Evans, DDD (2003); Naur (1985) | - | - | F | - | - | P | F | - |
| Hunt and Thomas, DRY (1999); Metz (2016) | - | - | F | - | - | P | P | - |
| King, Parse don't validate (2019) | - | P | F | - | - | - | - | - |
| Howard, Information Value Theory (1966) | - | - | - | F | F | - | - | - |
| Gat (1998); Sutton, Precup and Singh (1999) | P | - | - | F | - | - | - | - |
| Fowler, Remote Facade (2002); GraphQL (2015) | - | - | - | P | F | - | - | - |
| Grice, Logic and Conversation (1975) | - | - | - | - | F | - | - | - |
| Horvitz, Mixed-Initiative (CHI 1999) | P | - | - | F | P | - | - | - |
| Amershi et al., Guidelines for Human-AI Interaction (CHI 2019) | P | - | - | P | F | - | - | - |

**What the matrix shows.** Every element except E8 is expressly formulated by at least one source, and most by several. E6 and E7 are formulated only in adjacent literatures (quality engineering, technical debt) rather than in the agent-tool literature. E8 is the only element no reviewed source states. E1 is covered as a taxonomy by Bockeler and as an architecture by CaMeL, but not with the philosophy's specific carving.

## Part A: the pre-LLM canon the prior document omitted

This is the largest correction. The philosophy's most confident claims are its formal ones, and their formal content is not new.

### Enforcement (E2)

The three conditions - a correct predicate over observable state, every relevant change passing through the check, and a refusal that leaves the prohibited state unchanged - are the **reference monitor** requirements from Anderson's 1972 study (tamper-proof, always invoked, small enough to verify) combined with **complete mediation** and **fail-safe defaults** from Saltzer and Schroeder (1975). The prior document uses the term "complete mediation" repeatedly, in its own voice, without attribution.

The induction the philosophy states - if the property holds initially and every accepted transition preserves it, it holds across all accepted states - is a **Floyd-Hoare inductive invariant**. The distinction between a **state invariant** and a **transition constraint** is Meyer's class invariant versus precondition (Design by Contract, 1986), and in Lamport's vocabulary a safety property versus a step relation. In databases it is the difference between a declarative constraint and a trigger.

The distinction the philosophy treats as its sharpest - *influencing a proposal* versus *governing whether its effect is accepted* - is Shingo's **control poka-yoke versus warning poka-yoke**: a control device makes the defect impossible, a warning device alerts a fallible operator. It is also Norman's **forcing function**. The philosophy's own [EVIDENCE.md](../../../EVIDENCE.md) cites a poka-yoke study and Toyota jidoka as analogues, so the concept was in hand; it was simply not credited as the origin of the distinction.

*Consequence:* every per-source bullet in the prior document that claims the enforcement formalisation as an addition should be withdrawn. Practitioner posts do not state the guarantee because stating guarantees is not their genre, not because they would dispute it.

### Representation (E3)

"Make consequential relationships explicit" is close to verbatim Evans, **Domain-Driven Design** (2003), whose Chapter 9 is titled *Making Implicit Concepts Explicit*. Joshi's article - reviewed by the prior document - links directly to Domain-Driven Design, Ubiquitous Language, and Fowler's Semantic Model pattern, so the antecedent was one click away.

"Disorder is paid for again by every later task that has to infer what the artifact failed to express" is Naur's **Programming as Theory Building** (1985): the theory is re-derived by every worker who lacks it. "Explicit relationships move inference from the head into the world" is Norman's **knowledge in the world versus knowledge in the head** (1988).

The canonical-source mechanism is **DRY** (Hunt and Thomas, 1999), stated originally about *knowledge*, not text. Critically, the philosophy's caution against **false canonicalization** - which the prior document claims as an addition against five sources - is also long-established: DRY's own formulation excludes coincidental duplication, and Metz's **"duplication is far cheaper than the wrong abstraction"** (2016), the Rule of Three, and AHA programming are the standard counterweights. This should be cited, not claimed.

King (2019) remains correctly placed, with one addition the prior document missed: parsing proves *structure*, never *intent*, which is the same gap the philosophy names when it says a declaration is not ground truth.

*What genuinely refines the canon:* separating the three mechanisms - dependency, canonical source, choice clarity - and assigning each a distinct failure mode (uncheckable relationship, concentrated blast radius, collapsed distinction). The canon contains all three ideas but tends to bundle them under "good structure."

### Control (E4)

"Can the next action, or the rule for choosing it, be stated before seeing the result?" is a restatement of **value of information** (Howard, *Information Value Theory*, 1966): an observation has value only if it can change the decision taken. The philosophy's test is the same test with the expectation operator removed.

The architectural form is **Gat's three-layer architecture** (1998), where the sequencer executes precomputed plans and returns to the deliberator only when a contingency arises, and the **options framework** (Sutton, Precup and Singh, 1999), where a temporally extended action runs until its termination condition fires. Industrially it is the **decider/worker split** in workflow engines, cited in the philosophy's own evidence base via Amazon SWF.

Two things the prior document should have said and did not:

- The criterion is **not falsifiable in practice.** Any result can in principle change the plan, so "could the rule have been stated in advance?" is settled only after the fact. This is a real limitation of the philosophy's most-promoted contribution and belongs in its Limits section.
- Horvitz (1999) is not only about humans. The mixed-initiative literature already asks whether an autonomous step has sufficient expected value or whether to seek input, which is the same shape of question.

### Information (E5)

"Carries what the decision needs, and as little else as possible" is **Grice's maxim of quantity** (1975) - make your contribution as informative as required, and not more informative than is required - plus his maxim of relation. In statistical terms it is a sufficient statistic for the decision.

On the interface side it is **GraphQL's** founding argument (exactly the fields the client needs, avoiding both over-fetching and under-fetching), **Fowler's Remote Facade** and the chatty-versus-chunky interface tradeoff (PoEAA, 2002), and **progressive disclosure** in usability practice. The warning that over-trimming costs more than it saves is the under-fetching side of the same tradeoff.

For the agent case specifically, the peer-reviewed precursor is **Yang et al., SWE-agent** (NeurIPS 2024), which introduces Agent-Computer Interface design principles: guardrails that reject invalid edits *together with* concise feedback shaped for model consumption. That is E2 and E5 stated jointly, two years earlier, with an ablation. The philosophy cites this paper as evidence and the prior document did not consider it as prior art.

## Part B: the contemporary cluster, corrected

### Sources verified in this pass

**OpenAI, *Harness engineering* (11 February 2026).** The prior document's characterisation is materially wrong in three places.

- It claims the philosophy adds the canonical-source mechanism. OpenAI states it as a golden principle: *"we prefer shared utility packages over hand-rolled helpers to keep invariants centralized."*
- It claims the philosophy adds the inflow-versus-stock distinction. OpenAI operationalises it: *"Technical debt is like a high-interest loan: it's almost always better to pay it down continuously in small increments than to let it compound and tackle it in painful bursts,"* implemented as recurring "garbage collection" agents that scan for drift.
- It claims the philosophy adds the limit that enforcement should not be maximised. OpenAI states it directly: *"we're explicit about where constraints matter and where they do not... enforce boundaries centrally, allow autonomy locally."*

Also present and uncredited: representation enabling enforcement (*"we don't probe data YOLO-style - we validate boundaries or rely on typed SDKs so the agent can't accidentally build on guessed shapes"*); decision-complete refusal (*"we write the error messages to inject remediation instructions into agent context"*); the enforcement/instruction split (*"By enforcing invariants, not micromanaging implementations"*); the control boundary (*"Escalate to a human only when judgment is required"*); and progressive disclosure of repository knowledge.

The post is the closest single match in the corpus. Its honest residual difference from the philosophy is domain (a repository the authors own, not a third-party mutable artifact) and genre (a field report, with the explicit caveat that its results *"should not be assumed to generalize without similar investment"*), not content.

**Bockeler, *Harness engineering for coding agent users* (2 April 2026).** The prior document ranked her sixth of seven and said she analyses where controls run in the delivery lifecycle rather than placement. That is inaccurate. Her framework is a two-by-two: **feedforward guides versus feedback sensors**, crossed with **computational versus inferential** execution. The computational/inferential axis *is* the deterministic-versus-probabilistic placement decision that the philosophy calls its thesis; the feedforward/feedback axis is the philosophy's instruct-versus-enforce distinction. On the philosophy's own rubric she belongs at or near the top of the list.

She also states the philosophy's central limit almost verbatim: *"Correctness is outside any sensor's remit if the human didn't clearly specify what they wanted in the first place."* And she states the placement tradeoff as a goal: *"A good harness should not necessarily aim to fully eliminate human input, but to direct it to where our input is most important."*

What the philosophy adds against her is narrow and real: she does not state an enforcement guarantee (her computational controls include post-hoc sensors, which are not pre-effect guards), she does not separate the three representation mechanisms, and she does not do benefit accounting. What she has and the philosophy lacks is listed in Part D.

**LangChain, *The Anatomy of an Agent Harness* (10 March 2026).** The prior characterisation is fair: it is a component inventory (*"If you're not the model, you're the harness"*) rather than a placement framework. One thing the prior document should have extracted is the closing argument, which is the strongest published counter-position to the philosophy: *"As models get more capable, some of what lives in the harness today will get absorbed into the model... That suggests harnesses should matter less over time."* See Part E.

**Setter, *Probabilistic Core / Deterministic Shell* (7 March 2026).** The closest rhetorical match remains accurate - *"The model can propose; the system must dispose"* - and the prior document's substantive analysis holds. Two corrections. First, it does contain placement criteria, including when the pattern is overkill: *"if the output is disposable, exploratory, or purely creative, you may not need a heavy shell."* Second, the prior document elevated it to a top-tier match without noting that it is a knowledge-base page on a single-author consultancy site whose evidentiary weight is lower than the peer-reviewed sources the search omitted entirely.

**Joshi, *DSLs Enable Reliable Use of LLMs* (14 July 2026).** The prior characterisation holds and understates two things. Joshi explicitly grounds the argument in Domain-Driven Design and Ubiquitous Language, which is where the philosophy's Principle 2 heading comes from. And he states the representation-cost tradeoff the prior document claims as an addition: *"There is also a real upfront cost in designing and maintaining the language and its semantic model. The payoff is therefore concentrated in well-factored, genuinely constrained DSLs backed by a validator."* His domain-level error messages - *"you cannot select an action before choosing a client"* rather than a stack trace - are decision-complete refusals.

### Sources carried forward without re-verification

Horthy's 12-Factor Agents, Anthropic's tool-writing and agent-building articles, Anthropic's code-execution article, OpenAI's practical guide, Krenzel, Cloudflare's Code Mode, King, Horvitz, and Amershi et al. retain the prior document's characterisations, with one global correction: every bullet in those sections that claims the E2 formalisation, the E4 decision test, or the E5 completeness criterion as an addition is superseded by Part A. The remaining differences are matters of scope and vocabulary.

### Agent-era sources the prior pass missed

Six were one hop from sources already reviewed; three are peer-reviewed or security-critical work that a search of the field should have surfaced.

- **Yang et al., SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering (NeurIPS 2024).** Cited in the philosophy's evidence base. Introduces guardrails plus model-shaped feedback as joint interface design principles. Prior art for E2 and E5.
- **Kambhampati et al., LLM-Modulo Frameworks (ICML 2024).** The model generates candidates; sound external verifiers critique or reject; the loop iterates. The strongest academic statement of the enforcement boundary, with an explicit argument about where soundness can and cannot come from.
- **Debenedetti et al., CaMeL: Defeating Prompt Injections by Design (2025).** A privileged planner model emits a program, a quarantined model handles untrusted data, and a deterministic interpreter enforces capability policies over an explicit data-flow graph. This is enforcement, representation, and control in one architecture, with a threat model the philosophy does not have. The nearest thing in the literature to the philosophy's four boundaries realised as a system.
- **Anthropic, Effective harnesses for long-running agents (2026).** Linked from Bockeler.
- **Stripe, minions (2026).** Linked from Bockeler. Pre-push hooks selected by heuristic, "shift feedback left," blueprints wiring sensors into agent workflows.
- **Chroma, Context Rot (2025).** Referenced by LangChain. Empirical support for, and a precursor to, the philosophy's claim that too much information degrades the decision rather than merely costing tokens.
- **Anthropic, Effective context engineering for AI agents (2025).** "Smallest set of high-signal tokens" is E5 under another name.
- **Cognition, Don't Build Multi-Agents (2025).** Actions carry implicit decisions; conflicts arise when parallel actors cannot see the decisions others made. A control-and-information boundary argument.
- **matklad, ARCHITECTURE.md (2021); agents.md; llms.txt.** Legibility and progressive-disclosure precursors, all linked from OpenAI's post.

## Part C: prior art inside the project's own evidence base

The philosophy's [EVIDENCE.md](../../../EVIDENCE.md) cites sources that establish its mechanisms, not merely measure their effects. Any source good enough to carry a causal claim is good enough to be screened for priority.

| Cited as evidence | Also prior art for |
| --- | --- |
| Yang et al., SWE-agent ACI (NeurIPS 2024) | E2 and E5 stated jointly, with an ablation |
| Erlandson et al., poka-yoke device study; Toyota jidoka | E2's control-versus-warning distinction; E7's stop-at-source model |
| PostgreSQL constraints, foreign keys, dependency tracking | E3 to E2: a declared relationship makes integrity mechanically enforceable |
| Amazon SWF deciders; PostgreSQL pipeline mode | E4 as shipped industrial practice |
| Wang et al., CodeAct (ICML 2024); LLM-Tool Compiler; LLMCompiler; WALT | E4, including the counterevidence that consolidation can slow adaptive work |
| Cloudflare RFC 9457 error contracts | E5 in production |
| Fagan inspections (1976); Harter et al. (2000); Nichols (2020) | E7's prevention-versus-repair economics |

## Part D: what the philosophy lacks

The prior document contained no such section. An overlap survey that only lists what the subject adds is not a survey.

- **Requisite variety.** Bockeler applies Ashby's law: a regulator must have at least as much variety as the system it governs, and can only regulate what it has a model of. This is a stronger and more general statement of the philosophy's placement tradeoff, and it yields a prediction the philosophy cannot make - that narrowing the space of permitted outputs is itself a boundary intervention.
- **Harnessability.** Bockeler and Letcher name the precondition: not every artifact admits the same controls. The philosophy assumes checks are constructible and never theorises when they are not.
- **A threat model.** The information boundary assumes benign inputs. CaMeL and the prompt-injection literature treat model-visible content as attacker-controlled. A tool that returns "the exact identifiers needed to continue" is also a tool that returns attacker-influenced text into the model's context.
- **Operating the boundary over time.** Setter's evaluation gates, rollback triggers, and online signals answer a question the philosophy never asks: how do you know the boundary is still doing its job after deployment?
- **Context degradation as a distinct failure mode.** Context rot, compaction, and progressive disclosure are information-boundary failures that accumulate across a session. The philosophy's information boundary is stated per-crossing only.
- **Economics.** OpenAI's framing - human attention as the scarce resource, and throughput high enough to change the merge philosophy - supplies the decision rule for how much boundary investment is worth making.
- **Knowledge staleness as an operational problem.** The philosophy notes that declarations can be stale. OpenAI runs doc-gardening agents and mechanical freshness lints against it.
- **Multi-actor coordination.** Nothing in the philosophy addresses several agents editing one artifact.

## Part E: counter-positions

An adversarial review should record the arguments against the thesis, not only the arguments for its originality.

- **Absorption.** LangChain, in a source the prior document reviewed: harness features are being folded into models, so harness engineering should matter less over time. If true, the philosophy describes a transitional architecture. The counter-counter is in the same post - prompt engineering also survived that prediction.
- **Overconstraint under a wrong predicate.** The philosophy's own evidence base carries this: Strom et al. found a hard-stop alert produced unintended harm. A guarantee is only as good as the rule it enforces, and enforcement makes a wrong rule *more* reliably applied.
- **Cost horizon.** Nagappan et al. found industrial TDD lowered defects while increasing initial development time. Structure and checks are not free, and the philosophy's Faster claim is conditional in a way that is easy to lose in summary.
- **Unfalsifiable control test.** As noted in Part A, E4 resolves only in hindsight.
- **Consolidation counterevidence.** LLMCompiler's WebShop slowdown and the "Token Reduction Is Not Cost Reduction" study both cut against naive application of E4 and E5.

## Novelty ledger

Each claim stated once. Verdicts: **Superseded** (prior art states it with equal or greater precision); **Restatement** (same idea, new vocabulary or domain); **Refinement** (prior art contains it; the philosophy adds a distinction that changes application); **Uncommon** (no reviewed source states it; may exist outside the corpus).

| Element | Nearest prior art | Verdict |
| --- | --- | --- |
| E1 four-boundary model | Bockeler's two-by-two; CaMeL as architecture; LangChain as inventory | **Refinement.** The specific carving is uncommon, but novelty-by-taxonomy is weak, and the components are individually covered. |
| E2 enforcement guarantee and conditions | Anderson (1972); Saltzer and Schroeder (1975); Floyd, Hoare, Meyer; Shingo | **Superseded.** Withdraw as a novelty claim; cite instead. |
| E2 state invariant versus transition constraint | Meyer's invariant versus precondition; safety properties; declarative constraint versus trigger | **Superseded.** |
| E2 instruct versus enforce | Shingo's control versus warning poka-yoke; Norman's forcing functions; Bockeler's feedforward guide versus computational sensor | **Superseded.** |
| E3 make relationships explicit | Evans (2003); Naur (1985); Norman (1988) | **Restatement.** |
| E3 three mechanisms with distinct failure modes | The canon bundles these under "good structure" | **Refinement.** Genuine and worth keeping. |
| E3 declaration is not intent | King (parsing proves structure, not intent); DRY-as-knowledge | **Refinement.** |
| E3 false canonicalization | Metz (2016); Rule of Three; DRY's own scope limit | **Superseded.** Cite, do not claim. |
| E4 pre-observation decision test | Howard (1966); Gat (1998); Sutton et al. (1999); workflow deciders | **Restatement**, with an unstated falsifiability problem. |
| E4 grouping is not validation | Standard in transaction processing and API design; not stated in the agent literature | **Refinement.** Uncommon in genre. |
| E5 decision-completeness | Grice (1975); sufficient statistic; GraphQL; Fowler's Remote Facade; SWE-agent ACI; Anthropic high-signal responses | **Restatement.** |
| E5 bidirectionality | Request-side coverage is thinner in the agent literature than result-side | **Refinement.** |
| E6 Safer / Cleaner / Faster split | Internal versus external quality; defect stock versus inflow in technical-debt literature | **Refinement.** Uncommon in the agent-tool literature specifically. |
| E7 maintenance cycle | Cunningham's debt metaphor; OpenAI's garbage collection; Fagan-era prevention economics | **Restatement**, with clearer conditions. |
| E8 non-additive accounting | Standard in cost-benefit analysis and causal mediation; absent from every reviewed source | **Uncommon.** The strongest claim in the ledger. |
| Published Limits section | Absent from every reviewed source except as scattered caveats | **Uncommon.** Not claimed by the prior document. |
| Evidence base carrying counterevidence and rejected evidence | No reviewed source does this | **Uncommon.** The strongest and least contested contribution. Not claimed by the prior document. |

## Calibrated closing claim

> The thesis - probabilistic judgment inside deterministic containment - is a 2025-2026 consensus, reached independently by OpenAI, Thoughtworks, LangChain, Anthropic, and others, and it rests on much older foundations: the reference monitor and complete mediation (1972-1975), design by contract, mistake-proofing, domain-driven design, value of information, and Grice's maxims. This document does not originate the enforcement boundary, explicit structure, decision-based control, or context-economical interfaces, and several of its per-crossing tests are restatements of established criteria in unfamiliar vocabulary.
>
> What is comparatively rare is the packaging: four placement questions applied as a single checklist to one model-tool loop; the decomposition of Cleaner into state quality and structural clarity; explicit accounting rules that forbid counting one causal chain three times; a published limits section; and an evidence base that records counterevidence and the evidence that was considered and rejected. The last two are the strongest and least contested contributions.

## Open items

1. **Establish drafting dates** for the philosophy and its predecessors in this folder, so that "adds" can be separated from "was first" where it matters.
2. **Re-verify the ten inherited sources** and replace inherited characterisations with quoted, anchored ones.
3. **Run an academic search** (arXiv, ACL Anthology, ICML, NeurIPS, CHI, ICSE) for agent-tool interface design, verifier-in-the-loop generation, and tool-call consolidation. The current corpus is practitioner-biased.
4. **Add the omitted citations to the philosophy itself**, not just to this review: Saltzer and Schroeder for the enforcement conditions, Shingo or Norman for control-versus-warning, Evans and Naur for representation, Metz for false canonicalization, Howard for the control test, Grice for decision-completeness.
5. **Add the falsifiability limitation of E4** to the philosophy's Limits section.
6. **Decide whether to adopt requisite variety and harnessability**, which are the two ideas in this corpus with no counterpart in the philosophy.
7. **Recheck cadence.** The contemporary cluster is moving fast enough that this assessment has a useful life measured in months.
