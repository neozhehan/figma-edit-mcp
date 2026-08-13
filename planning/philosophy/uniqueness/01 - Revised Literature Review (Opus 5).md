# Revised Literature Review: Overlap, Precedent, and Residual Contribution

**Assessment date:** 10 August 2026, revised 11 August 2026
**Subject:** [Unified Design Philosophy](../12%20-%20Unified%20Design%20Philosophy%20%283%20-%20Added%20Thesis%20by%20GPT-5.6%29.md). Drafts [14](../14%20-%20Unified%20Design%20Philosophy%20%285%20-%20Sharpened%20by%20Opus%205%29.md) and [15](../15%20-%20Unified%20Design%20Philosophy%20%286%20-%20Evidence-Hardened%20by%20Opus%205%29.md) postdate the original assessment; where draft 15 closes an item raised here, this document says so.
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

**What was done.** Fifteen sources from the prior document were carried forward and **all fifteen have now been fetched and read**, in two passes on 10 and 11 August 2026. Quotations are verbatim, with punctuation normalised to ASCII. Outbound citations were followed one hop, which surfaced additional agent-era sources the prior pass missed. The philosophy's own evidence base was screened for sources that function as prior art rather than as supporting measurement. The eight rubric elements were traced back to their nearest antecedents in the pre-LLM literature. A bibliographic search of computer-science venues was then run against DBLP.

**A third pass added fourteen documents supplied directly as files.** Where the fetch tooling was blocked - arXiv and Semantic Scholar rate limits, an OpenReview browser-verification wall, ACL Anthology PDFs that would not extract - local text extraction from supplied PDFs worked, and eleven peer-reviewed papers plus three practitioner documents were read in full on 11 August 2026. This closed the Horvitz gap, corrected one withdrawal made in error, and added three peer-reviewed measurements of the control boundary that the earlier passes could not reach. The channel matters as a method note: **the papers that most directly test this philosophy's claims were the ones the automated search could not retrieve.**

**Priority dates: settled, and they close the question.** Draft 09 of the philosophy was written on 9 August 2026, and drafts 10 and later after that. Every source in this corpus predates it, the most recent by under a month (Joshi, 14 July 2026). **No priority claim of any kind is available to the philosophy against any source reviewed here.** The hedged framing this document already used - *says more*, never *was first* - is therefore the only defensible one, and every remaining "adds" should be read strictly as scope or precision, never as precedence. What remains undetermined is when the underlying design decisions were made in the project itself; the shipped constraints in `planning/completed/` predate the write-up, but the write-up is what is being compared.

**What was not done, and matters.**

- **The academic search is partial, and blocked rather than skipped.** The arXiv export API and the Semantic Scholar graph API both returned HTTP 429 (rate limited) on every attempt, and the arXiv HTML search UI could not be parsed. DBLP answered, but it indexes **titles, authors, and venues only, not abstracts**, and applies AND semantics, so queries of four or more terms returned near-zero hits. Recall is therefore low for compound concepts and for relevant work whose title does not contain the search phrase. What follows is a keyword probe, not a sweep. The third pass mitigated this only for documents that were supplied directly; it did not widen the search.
- **No source-quality weighting was applied by the prior document, and this one states it instead of correcting it.** One source it ranked as the "closest rhetorical match" is a knowledge-base page on a solo consultancy site; several peer-reviewed sources with closer content were absent.
- **The reviewed sources are not independent observations.** OpenAI cites King and Krenzel. Bockeler cites OpenAI and LangChain. Joshi builds on Evans and Fowler. Horthy cites Anthropic and Metz. Anthropic's code-execution post cites Cloudflare. Sources 1 to 7 and 12 to 15 of the prior document form one citation cluster. Fifteen entries overstate the breadth of the search.

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

Legend: **F** = expressly formulated. **P** = present in substance, not formulated as such. **-** = absent or immaterial. **v** = fetched and read in this review; **r** = confirmed by reference only; unmarked = recalled, not verified.

### Contemporary sources (2024-2026)

| Source | E1 | E2 | E3 | E4 | E5 | E6 | E7 | E8 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Horthy, 12-Factor Agents (2025) **v** | P | P | P | P | F | - | - | - |
| Anthropic, Writing effective tools for agents (2025) **v** | P | P | P | P | F | - | - | - |
| Anthropic, Building effective agents (2024) **v** | P | P | - | P | P | - | - | - |
| Anthropic, Code execution with MCP (2025) **v** | - | P | P | F | F | - | - | - |
| Anthropic, Effective context engineering (2025) **v** | - | - | - | P | F | - | - | - |
| Anthropic, Effective harnesses for long-running agents (2025) **v** | - | P | P | P | F | - | - | - |
| OpenAI, Harness engineering (2026) **v** | P | F | F | P | F | P | F | - |
| OpenAI, Practical guide to building agents (2025) **v** | P | P | - | P | P | - | - | - |
| LangChain, Anatomy of an Agent Harness (2026) **v** | P | P | P | P | F | - | - | - |
| Bockeler, Harness engineering for coding agent users (2026) **v** | F | P | F | P | F | P | P | - |
| Joshi, DSLs Enable Reliable Use of LLMs (2026) **v** | P | F | F | P | F | - | P | - |
| Setter, Probabilistic Core / Deterministic Shell (2026) **v** | P | F | P | P | P | - | - | - |
| Krenzel, AI Is Forcing Us To Write Good Code (2025) **v** | P | F | F | P | P | P | P | - |
| Cloudflare, Code Mode (2025) **v** | - | P | P | F | P | - | - | - |
| Stripe, minions, parts 1 and 2 (2026) **v** | P | P | - | F | P | - | - | - |
| Chroma, Context Rot (2025) **v** | - | - | P | - | F | - | - | - |
| Yang et al., SWE-agent ACI (NeurIPS 2024) | P | F | P | P | F | - | - | - |
| Kambhampati et al., LLM-Modulo (ICML 2024) **v** | P | F | P | P | P | - | - | - |
| Debenedetti et al., CaMeL (2025) **v** | F | F | F | F | P | - | - | - |
| Cognition, Don't Build Multi-Agents (2025) **v** | - | - | P | F | F | - | - | - |
| Wang, Li and Chen, LLM-friendly OS interfaces (EuroSys 2026) **v** | - | - | P | F | F | - | - | - |
| Wen et al., AutoDroid-V2 (MobiSys 2025) **v** | - | - | - | F | - | - | - | - |
| Lu et al., AXIS (ACL 2025) **v** | - | P | P | F | P | - | - | - |
| Zhang et al., API Agents vs. GUI Agents (ICML 2025) **v** | P | P | P | F | P | - | - | - |

### Pre-LLM canon

| Source | E1 | E2 | E3 | E4 | E5 | E6 | E7 | E8 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Anderson (1972); Saltzer and Schroeder (1975) | - | F | - | - | - | - | - | - |
| Floyd (1967); Hoare (1969); Meyer (1986, 1997) | - | F | P | - | - | - | - | - |
| Shingo, poka-yoke (1985); Toyota jidoka | - | F | - | - | - | P | F | - |
| Norman, forcing functions and knowledge in the world (1988) | P | F | F | - | P | - | - | - |
| Evans, DDD (2003); Naur (1985) | - | - | F | - | - | P | F | - |
| Hunt and Thomas, DRY (1999); Metz (2016) | - | - | F | - | - | P | P | - |
| King, Parse don't validate (2019) **v** | - | P | F | - | - | - | - | P |
| Howard, Information Value Theory (1966) | - | - | - | F | F | - | - | - |
| Gat (1998); Sutton, Precup and Singh (1999) | P | - | - | F | - | - | - | - |
| Fowler, Remote Facade (2002); GraphQL (2015) | - | - | - | P | F | - | - | - |
| Grice, Logic and Conversation (1975) | - | - | - | - | F | - | - | - |
| Horvitz, Mixed-Initiative (CHI 1999) **v** | P | - | - | F | P | - | - | - |
| Amershi et al., Guidelines for Human-AI Interaction (CHI 2019) **v** | P | - | - | P | F | - | - | - |

**Empirical sources are deliberately absent from both matrices.** Huang et al. (ICLR 2024), Fu et al. (AbsenceBench, 2025), Shi et al. (ICML 2023), Strom et al. (2010) and the bar-code administration trial supply *measurement* of the philosophy's claims, not *formulation* of them. They belong in [EVIDENCE.md](../../../EVIDENCE.md) and are discussed in Part B below, but scoring them against a rubric of design claims would inflate the apparent coverage.

**What the matrix shows.** Every element is expressly formulated by at least one source, and most by several. E6 and E7 are formulated only in adjacent literatures (quality engineering, technical debt) rather than in the agent-tool literature. E1 is covered as a taxonomy by Bockeler and as an architecture by CaMeL, but not with the philosophy's specific carving. **E8 is no longer empty:** verification showed that King (2019) states the substance of its fifth rule. Only the benefit-accounting rules 1 to 4 remain unattested.

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

King (2019) is more of a precursor than the prior document allowed, and verification changed two cells in the matrix.

First, the addition the prior document did identify holds: parsing proves *structure*, never *intent*, which is the same gap the philosophy names when it says a declaration is not ground truth.

Second, and larger: King states the **partial-effects** argument that the philosophy treats as its own, quoting the 2016 LangSec taxonomy on shotgun parsing - *"Late-discovered errors in an input stream will result in some portion of invalid input having been processed, with the consequence that program state is difficult to accurately predict"* - and adding that such a program *"runs the risk of acting upon a valid portion of the input, discovering a different portion is invalid, and suddenly needing to roll back whatever modifications it already executed in order to maintain consistency. Sometimes this is possible - such as rolling back a transaction in an RDBMS - but in general it may not be."* That is the substance of the philosophy's fifth accounting rule (grouping and validation are different capabilities) and of its treatment of calls that stop partway, stated in 2019.

Third, King states the canonical-source mechanism **with its qualification**: *"Avoid denormalized representations of data, especially if it's mutable. Duplicating the same data in multiple places introduces a trivially representable illegal state: the places getting out of sync. Strive for a single source of truth,"* immediately followed by *"Keep denormalized representations of data behind abstraction boundaries."*

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

### Sources verified in the second pass

The remaining nine were fetched on 11 August 2026. The prior characterisations survive, with one global correction and four specific findings.

**Global correction.** Every bullet in the prior document that claims the E2 formalisation, the E4 decision test, or the E5 completeness criterion as an addition is superseded by Part A. The remaining differences are matters of scope and vocabulary.

**Anthropic, *Building effective agents* (19 December 2024) - the mistake-proofing claim must be withdrawn.** Appendix 2 says, in a bulleted list of tool-design advice: *"Poka-yoke your tools. Change the arguments so that it is harder to make mistakes,"* with a link to the Wikipedia article. It also names the concept the philosophy uses without naming: *"think about how much effort goes into human-computer interfaces (HCI), and plan to invest just as much effort in creating good agent-computer interfaces (ACI)."* Mistake-proofing and the ACI framing were therefore both in the agent-tool literature in December 2024, eighteen months before the philosophy was drafted. The programmatic "gate" in prompt chaining is confirmed, as is *"agents can then pause for human feedback at checkpoints or when encountering blockers."* The page now carries a currency notice: *"Much of the tooling landscape described in this post has changed since December 2024."*

**OpenAI, *A practical guide to building agents* (2025) - a sharper contrast than the prior document drew.** The guardrail taxonomy is confirmed (relevance classifier, safety classifier, PII filter, moderation, tool safeguards, rules-based protections, output validation), as are tool risk ratings scored on *"read-only vs. write access, reversibility, required account permissions, and financial impact"* and the two human-intervention triggers. But the execution model is stated explicitly and it is the opposite of complete mediation: *"The Agents SDK treats guardrails as first-class concepts, relying on optimistic execution by default. Under this approach, the primary agent proactively generates outputs while guardrails run concurrently, triggering exceptions if constraints are breached."* Concurrent checking against in-flight output is not a pre-effect guard. The philosophy's third condition - a refused request leaves the artifact unchanged - is a genuinely stronger requirement, and this is now evidenced rather than asserted.

**Krenzel, *AI Is Forcing Us To Write Good Code* (29 December 2025) - closer to Principles 1 and 2 than credited.** He applies database constraints as write-time guards on an agent: *"we use Postgres' type system as best as we can, and add checks and triggers for invariants that don't fit into simple column types... If an agent tries to write invalid data, our database will usually complain clearly and loudly."* And he states make-illegal-states-unrepresentable in agent terms: *"Entire categories of illegal states and transitions can be eliminated. And types shrink the search space of possible actions the model can take."* This is the representation-to-enforcement chain for a mutating agent, in December 2025. It is a six-person team's field report with no measurements.

**Anthropic, *Code execution with MCP* (4 November 2025) and Cloudflare, *Code Mode* (26 September 2025) - both understate their own enforcement content.** Anthropic reports 150,000 tokens down to 2,000 (98.7%), states the cost honestly (*"code execution introduces its own complexity... should be weighed against these implementation costs"*), and describes PII tokenisation that lets data flow between tools without entering model context, adding: *"You can also use this to define deterministic security rules, choosing where data can flow to and from."* Cloudflare's bindings are a capability mechanism, not merely a sandbox: the generated code has no network access at all and reaches MCP servers only through injected bindings, which also means *"the AI cannot possibly write code that leaks any keys."* Both belong at E2=P rather than E2=absent, and both are closer to CaMeL's data-flow control than the prior document allowed.

**Horthy, *12-Factor Agents*** and **Amershi et al. (2019)** are confirmed as characterised: the twelve factor titles, the three-step loop, and the eighteen guidelines in four phases all match. Two details worth recording. Horthy's Related Resources link to Metz's *The Wrong Abstraction*, so the false-canonicalization counterweight is already inside this corpus's citation network. Amershi et al. state a scope limit the philosophy's use of them should respect: *"The guidelines were developed and tested on products with graphical user interfaces."*

### Agent-era sources the prior pass missed

Six were one hop from sources already reviewed; three are peer-reviewed or security-critical work that a search of the field should have surfaced.

- **Yang et al., SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering (NeurIPS 2024).** Cited in the philosophy's evidence base. Introduces guardrails plus model-shaped feedback as joint interface design principles. Prior art for E2 and E5.
- **Kambhampati et al., LLM-Modulo Frameworks (ICML 2024).** The model generates candidates; sound external verifiers critique or reject; the loop iterates. The strongest academic statement of the enforcement boundary, with an explicit argument about where soundness can and cannot come from.
- **Debenedetti et al., CaMeL: Defeating Prompt Injections by Design (2025).** A privileged planner model emits a program, a quarantined model handles untrusted data, and a deterministic interpreter enforces capability policies over an explicit data-flow graph. This is enforcement, representation, and control in one architecture, with a threat model the philosophy does not have. The nearest thing in the literature to the philosophy's four boundaries realised as a system.
- **Anthropic, Effective harnesses for long-running agents (2026).** Linked from Bockeler.
- **Stripe, minions (2026).** Linked from Bockeler. Pre-push hooks selected by heuristic, "shift feedback left," blueprints wiring sensors into agent workflows.
- **Chroma, *Context Rot: How Increasing Input Tokens Impacts LLM Performance* (14 July 2025).** Fetched and read. Eighteen models, published codebase, an LLM judge aligned above 0.99 to human labels, and - the property that makes it usable - task difficulty held constant while only input length varies. Two results bear directly on the philosophy: on LongMemEval, every model scored significantly higher on focused prompts (about 300 tokens) than on full prompts (about 113,000 tokens) containing the same answer plus irrelevant context; and *"even a single distractor reduces performance relative to the baseline, and adding four distractors compounds this degradation,"* with distractors defined as topically related but not answering the question. The first is the philosophy's over-stuffing claim measured; the second is its choice-clarity mechanism measured on the model rather than on humans. It is a vendor technical report from a company selling retrieval infrastructure, and not peer-reviewed.
- **Anthropic, Effective context engineering for AI agents (2025).** "Smallest set of high-signal tokens" is E5 under another name.
- **Cognition, Don't Build Multi-Agents (2025).** Actions carry implicit decisions; conflicts arise when parallel actors cannot see the decisions others made. A control-and-information boundary argument.
- **matklad, ARCHITECTURE.md (2021); agents.md; llms.txt.** Legibility and progressive-disclosure precursors, all linked from OpenAI's post.

### Sources verified in the third pass, from supplied documents

Fourteen documents were supplied directly and read in full on 11 August 2026. Six findings change this review.

**Horvitz (1999) is now verified, and the "by reference" caveat is withdrawn.** *Principles of Mixed-Initiative User Interfaces*, Proceedings of CHI '99, ACM SIGCHI, Pittsburgh, May 1999. Its twelve principles include computing the expected utility of acting, considering uncertainty about a user's goal, employing dialog to resolve key uncertainties, and minimizing the cost of poor guesses about action and timing. The characterisation in Part A now stands on the primary source: the philosophy's control test is the same shape of question with the expectation operator removed.

**AXIS was withdrawn in error and is reinstated.** An earlier pass dropped it on the grounds that its headline numbers came from a human study. The paper (ACL 2025, pages 7711 to 7743) does contain an agent-versus-agent comparison: on 50 Word tasks with GPT-4o, AXIS averaged 29.9 seconds against 59.5 seconds for the UFO agent, with higher success and fewer steps, moving from 103 UI and 9 API actions to 48 and 39. Only that comparison is usable. The widely quoted 65 to 70 percent time reduction and 97 to 98 percent accuracy figures come from the separate human study and should not be presented as agent results. *This is the fourth time in this review that actually reading a source changed the assessment of it; the running score argues for reading before recommending, not after.*

**Three peer-reviewed papers now measure Principle 3 on wall-clock time, which the philosophy had conceded it could not show.** DMI (EuroSys 2026) reports 44.4 to 74.1 percent success, 8.16 to 4.61 steps, and 392 to 239 seconds across 27 office tasks - and, more valuably, an ablation in which the same navigation knowledge supplied as prompt context with the declarative interface disabled produced 42.0 percent success in 8.41 steps, that is, no change at all. That is precisely the confound a critic would raise against the philosophy's control principle, tested and eliminated by the authors. AutoDroid-V2 (MobiSys 2025) reports 10.5 to 51.7 percentage points higher completion at 5.7 to 13.4 times lower runtime latency. AXIS supplies the third. All three are GUI automation rather than artifact mutation, all three paid substantial offline modelling costs, and DMI's model is version-specific.

**Zhang et al., API Agents vs. GUI Agents (ICML 2025), is the framing precedent.** It describes itself as "the first comprehensive comparative study of API-based and GUI-based LLM agents" and treats the same tradeoff Principle 3 describes - deterministic structured invocation against operating a surface built for humans - as a design-selection question. It is comparative analysis rather than measurement, and it predates the philosophy.

**CaMeL contains a measured conflict between Principles 1 and 4, and the "cost of a guarantee" reading of it must be withdrawn.** The 84-to-77 percent gap is not a clean price for security: the authors state that CaMeL "does not significantly degrade utility" outside one suite, that it occasionally improves success, and that much of the residual gap came from undocumented tool output formats which newer models handled with no change to CaMeL - Claude Sonnet's travel-suite utility rising from 25 to 55 to 75 percent across versions. What is valuable is the failure analysis: "the Q-LLM cannot communicate to the P-LLM which data is missing, as this could introduce a prompt injection vector." Decision-completeness is deliberately sacrificed to hold the enforcement guarantee, and the companion mode - "data requires action" - is the structural cost of the boundary itself. This is a documented case of two of the philosophy's own principles trading against each other, and it is better material for its Limits section than anything it previously had.

**Three practitioner documents add prior art, none of it favourable to a novelty claim.** Anthropic's *Effective context engineering for AI agents* (29 September 2025) states the philosophy's own caveat ten months earlier and more compactly: find "the smallest possible set of high-signal tokens", and "Note that minimal does not necessarily mean short." Anthropic's *Effective harnesses for long-running agents* (26 November 2025) records a representation choice made for agent behaviour rather than for tooling - a feature list stored as JSON because "the model is less likely to inappropriately change or overwrite JSON files compared to Markdown files." Stripe's two *minions* posts describe blueprints as "workflows defined in code" in which "a given node can run either deterministic code or an agent loop" and "those particular nodes don't invoke an LLM at all - they just run code", with the rationale that "writing code to deterministically accomplish small decisions we can anticipate ... saves tokens ... and gives the agent a little less opportunity to get things wrong." That is Principle 3's placement test as shipped practice. Cognition's *Don't Build Multi-Agents* supplies its coordination corollary: "Actions carry implicit decisions, and conflicting decisions carry bad results."

**Empirical additions, kept out of the matrix.** Three papers supply measurement rather than design claims and were added to the evidence base instead: Huang et al. (ICLR 2024), showing that intrinsic self-correction degrades accuracy across every model and benchmark tested while an external verdict reverses the direction, which is the premise beneath Principle 1 and was previously asserted rather than evidenced; Fu et al. (AbsenceBench, 2025), showing that models detect removed content far worse than inserted content in the same documents and that an explicit placeholder recovers much of the gap, which sharpens Principle 4 from "say what was omitted" to "mark where it was omitted"; and Shi et al. (ICML 2023), whose GSM-IC result carries the detail that recall of the correct answer stays at 99.7 percent - the information was present and retrievable, and the model was distracted anyway.

### The bibliographic probe

Run against DBLP on 11 August 2026, after arXiv and Semantic Scholar rate-limited every request. DBLP matches titles only, so this is a keyword probe with low recall, not a survey. Three findings.

**The gap the philosophy scopes out is a mature field, not a frontier.** The title phrase "prompt injection defense" alone returns 63 records, including at least four 2026 systematic reviews (IEEE Access; *Information*; two on arXiv), a critical evaluation of defenses at SACMAT 2026, and *Architecting Secure AI Agents: Perspectives on System-Level Defenses Against Indirect Prompt Injection Attacks* (Xiang, Zagieboylo, Ghosh, Kariyappa, Greshake, Xiao, Suh et al., 2026). Two are close enough to bear on the philosophy directly: *Defense Against Indirect Prompt Injection via Tool Result Parsing* (Yu, Cheng and Liu, 2026), which is the peer-reviewable counterpart of "results are data, not instructions," and *Agent Privilege Separation... A Structural Defense Against Prompt Injection* (2026). The philosophy is right to scope this out and right to name it, but it should point at this literature rather than describe it as unaddressed.

**One peer-reviewed systems paper is a direct precursor to Principles 3 and 4.** Wang, Li and Chen, *From Imperative to Declarative: Towards LLM-friendly OS Interfaces for Boosted Computer-Use Agents*, EuroSys 2026 (earlier as arXiv:2510.04607, 2025), argues for redesigning the interface itself so an agent expresses an outcome once instead of driving a sequence of primitive operations. That is the philosophy's decision-boundary argument at the systems level, in a top venue, before the philosophy was drafted.

**Principle 3 has continuing empirical work.** Lin, Liew, Savarese and Li, *W&D: Scaling Parallel Tool Calling for Efficient Deep Research Agents* (2026).

What the probe could not do: search abstracts, cover venues DBLP indexes thinly, or return anything for compound queries such as "agent action verification safety LLM," which matched zero titles. Absence of hits here is not evidence of absence in the field.

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
- **A threat model.** The information boundary assumes benign inputs. CaMeL and the prompt-injection literature treat model-visible content as attacker-controlled. A tool that returns "the exact identifiers needed to continue" is also a tool that returns attacker-influenced text into the model's context. **Partly addressed as of draft 15**, which records the Principle 1 versus Principle 4 conflict in its Limits section; the philosophy still has no threat model of its own.
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
- **Unfalsifiable control test.** As noted in Part A, E4 resolves only in hindsight. Draft 15 concedes this in its Limits section, which converts the objection into a stated scope limit rather than answering it.
- **Consolidation counterevidence.** LLMCompiler's WebShop slowdown and the "Token Reduction Is Not Cost Reduction" study both cut against naive application of E4 and E5. This is now the weakest counter-position in the list: DMI, AutoDroid-V2 and AXIS measure the other direction on wall-clock time, and DMI's ablation rules out the obvious confound. The remaining honest objection is external validity - every one of those results is GUI automation with a large offline modelling cost, and none is artifact mutation.
- **Nothing here is contested on priority.** The third pass added eleven peer-reviewed papers and three practitioner documents. Every one predates the philosophy. The corpus grew, the verdict did not move.

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
| E4 grouping is not validation | King (2019) quoting LangSec on shotgun parsing; standard in transaction processing and API design; not stated in the agent literature | **Restatement.** Uncommon in the agent genre, established elsewhere. |
| E5 decision-completeness | Grice (1975); sufficient statistic; GraphQL; Fowler's Remote Facade; SWE-agent ACI; Anthropic high-signal responses | **Restatement.** |
| E5 bidirectionality | Request-side coverage is thinner in the agent literature than result-side | **Refinement.** |
| E6 Safer / Cleaner / Faster split | Internal versus external quality; defect stock versus inflow in technical-debt literature | **Refinement.** Uncommon in the agent-tool literature specifically. |
| E7 maintenance cycle | Cunningham's debt metaphor; OpenAI's garbage collection; Fagan-era prevention economics | **Restatement**, with clearer conditions. |
| E8 non-additive accounting | Standard in cost-benefit analysis and causal mediation; rule 5 is stated in substance by King (2019); rules 1 to 4 absent from every reviewed source | **Refinement.** Rules 1 to 4 remain the strongest claim in the ledger; rule 5 must be attributed. |
| Published Limits section | Absent from every reviewed source except as scattered caveats | **Uncommon.** Not claimed by the prior document. |
| Evidence base carrying counterevidence and rejected evidence | No reviewed source does this | **Uncommon.** The strongest and least contested contribution. Not claimed by the prior document. |

## Calibrated closing claim

> The thesis - probabilistic judgment inside deterministic containment - is a 2025-2026 consensus, reached independently by OpenAI, Thoughtworks, LangChain, Anthropic, and others, and it rests on much older foundations: the reference monitor and complete mediation (1972-1975), design by contract, mistake-proofing, domain-driven design, value of information, and Grice's maxims. Every source reviewed here predates the philosophy, so no claim of precedence is available against any of them. This document does not originate the enforcement boundary, explicit structure, decision-based control, or context-economical interfaces, and several of its per-crossing tests are restatements of established criteria in unfamiliar vocabulary. Mistake-proofing had already been named in the agent-tool literature in December 2024; the partial-effects argument had been made in 2019.
>
> What is comparatively rare is the packaging: four placement questions applied as a single checklist to one model-tool loop; the decomposition of Cleaner into state quality and structural clarity; explicit accounting rules that forbid counting one causal chain three times; a published limits section; and an evidence base that records counterevidence and the evidence that was considered and rejected. The last two are the strongest and least contested contributions.

**What the third pass changed, and what it did not.** Reading fourteen further documents did not move the novelty verdict in either direction. It moved three other things. It closed the last unverified source. It corrected one withdrawal made in error, bringing the count of assessments changed by actually reading the source to four out of roughly thirty - a base rate high enough that no source in this corpus should be characterised from memory. And it supplied the philosophy with the empirical support it had previously conceded it lacked: three peer-reviewed measurements of the control boundary on wall-clock time, one of them with the confounding explanation tested and eliminated by its own authors. That strengthens the philosophy's *evidence*, which was never the contested part, while leaving its *priority* exactly where it was.

## Open items

1. ~~**Establish drafting dates.**~~ **Closed, 11 August 2026.** Draft 09 was written 9 August 2026; later drafts after that. Every source predates the philosophy, so no priority claim is available and none is made. Still worth recording separately: when the shipped constraints themselves were designed, which the completed-work folders would answer.
2. ~~**Re-verify the inherited sources.**~~ **Closed, 11 August 2026.** All fifteen carried-forward sources have been fetched and read. Horvitz (1999) was the last outstanding item and was read in full in the third pass from a supplied PDF; the **r** marker is withdrawn. Five characterisations changed in total; see Part B.
3. **Run a full academic search.** **Advanced further, still not closed.** A DBLP title probe was run, and a third pass read eleven peer-reviewed papers supplied directly as files - which surfaced three EuroSys/MobiSys/ACL results the automated search had missed entirely. That is the point: arXiv, Semantic Scholar, ACL Anthology, ICML, NeurIPS, CHI and ICSE remain unsearched at the abstract level, and the papers that most directly test this philosophy were exactly the ones the tooling could not retrieve. This remains the largest hole, and the third pass is evidence of its size rather than a substitute for closing it.
4. ~~**Add the omitted citations to the philosophy itself.**~~ **Partly closed in draft 15**, which attributes the partial-effects argument to King (2019) and the LangSec taxonomy it quotes. Still outstanding: Saltzer and Schroeder for the enforcement conditions, Shingo or Norman for control-versus-warning, Evans and Naur for representation, Metz for false canonicalization, Howard for the control test, and Grice for decision-completeness.
5. ~~**Add the falsifiability limitation of E4** to the philosophy's Limits section.~~ **Closed in draft 15.**
6. ~~**Point the injection paragraph at the literature.**~~ **Partly closed in draft 15**, which names the quarantined-model pattern and records the resulting Principle 1 versus Principle 4 conflict under Limits. It still does not cite a survey by name.
7. **Decide whether to adopt requisite variety and harnessability**, which are the two ideas in this corpus with no counterpart in the philosophy.
8. **Recheck cadence.** The contemporary cluster is moving fast enough that this assessment has a useful life measured in months.
