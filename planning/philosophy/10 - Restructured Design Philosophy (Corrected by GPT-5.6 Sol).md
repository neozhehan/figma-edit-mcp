# Design Philosophy

> **Corrected draft.** This is a proposed replacement for [DESIGN_PHILOSOPHY.md](../../DESIGN_PHILOSOPHY.md). It retains the rule-first structure introduced in [09 - Restructured Design Philosophy.md](./09%20-%20Restructured%20Design%20Philosophy.md) and incorporates the findings in [08 - Causal Structure Review.md](./08%20-%20Causal%20Structure%20Review.md). It changes the organization and precision of the philosophy; it does not change the guarantees defined in [SAFETY.md](../../SAFETY.md).

The [README](../../README.md) states what figma-edit-mcp does. This document explains the principles behind those choices. The precise enforcement contract lives in [SAFETY.md](../../SAFETY.md), and the studies, quotations, methods, and limitations behind the empirical claims are collected in [EVIDENCE.md](../../EVIDENCE.md).

## Purpose and scope

This document concerns tools through which an AI model reads or discloses protected data, changes authoritative state, or triggers external effects. The examples come from design software, but the principles apply to any LLM tool that observes state, proposes effectful operations, and receives results.

The central problem is not whether the model is capable. It is how intent, authority, observability, enforcement, execution, and feedback should be divided when a capable model can still propose a wrong action.

The four principles below govern the model–tool interaction and the representations on which it depends. They are not a complete system architecture. Authentication, authorization, concurrency, retry semantics, recovery, and auditability remain necessary foundations and are stated separately below.

## Trust model

Four roles may participate in an operation. The same person or system can occupy more than one role, but the responsibilities remain distinct:

1. **The principal owns the requested intent.** A person or organization states the desired outcome and the distinctions that matter. The principal may exercise and delegate only authority already granted by the resource owner and governing policy.
2. **The authority owner and policy define what is permitted.** A resource owner, tenant administrator, organization, regulator, or policy system grants permissions, reserves approvals, and sets non-negotiable risk limits. This role may be the principal, but a tool must not assume that it is.
3. **The model proposes and coordinates actions.** It interprets the principal's goal, observes the state available to it, composes requests, and interprets results. A well-formed request is still a proposal. It is not proof that the action is authorized, safe, or what the principal intended.
4. **The authoritative execution boundary validates, executes, and commits effects.** This is the boundary—or coordinated set of boundaries—that jointly has the authoritative observations and control required for every operation covered by the guarantee. Depending on the system, it may involve a tool server, plugin, service, policy gateway, transaction coordinator, database, or several of them.

For brevity, “authoritative boundary” below includes a coordinated set of boundaries when no single component has both the required policy context and control over every covered effect.

The governing relationship is:

> **The principal supplies intent. The authority owner sets the permitted scope. The model proposes. The authoritative boundary executes and commits.**

The model is trusted to reason and propose work, but not to enforce policy against itself or certify facts it cannot observe. The execution boundary is trusted only for the rules it correctly evaluates over sufficiently authoritative, current state. Neither can mechanically prove subjective intent.

Authority must remain bounded. A model request cannot enlarge it, and a principal cannot delegate authority the principal does not possess. When an action exceeds the permitted scope, depends on intent the system cannot observe, requires reserved approval, or creates unacceptable irreversible impact, the correct response is not to guess. The system should refuse the action, narrow it, stage it for review, offer admissible alternatives, or return control to the appropriate principal or authority owner.

Returning control therefore does not always mean returning control to the model. It means returning control to whichever actor has the authority and information required for the next decision.

Approval and override are not bypasses. They are separately authorized, mediated transitions. An approval must be bound to an authenticated authorizer, the exact resource and action, material parameters and aggregate impact, the state or version reviewed, an expiry and reuse policy, and an audit record. If no boundary or coordinated set can enforce that binding, the effect must not execute. If approval is enforceable for each effect but cross-resource atomicity is unavailable, the system may narrow only its atomicity guarantee and define partial-success or compensation semantics.

### Operating assumptions

Six durable assumptions motivate the design:

- **Model compliance is probabilistic.** Instructions improve behavior, but an important guarantee should not depend solely on the model recalling, interpreting, and following them.
- **Decisions are bounded by observable state.** The model and the safeguard can act reliably only on state exposed with sufficient accuracy, freshness, meaning, and provenance.
- **Authoritative state is not authoritative instruction.** Authenticated metadata may establish resource facts, while free-form artifact content and tool output remain untrusted data. Their text cannot grant authority, override governing instructions, or turn itself into policy.
- **Every exchange has both cost and value.** A model turn consumes time, tokens, and context, but it can also supply new evidence, isolate failure, verify an outcome, or obtain approval.
- **Model-generated actions are fallible proposals.** They may be capable and well reasoned while still being confidently wrong.
- **Effectful execution can be uncertain.** Calls can fail, be retried, race with other changes, complete only in part, or leave their outcome uncertain.

### The reliable-execution substrate

The four principles do not replace the foundations required by any production tool that reads protected data or changes external state:

- authentication, authorization, and least privilege;
- data classification, least disclosure, and isolation of untrusted content from instructions and authority;
- complete mediation for every guarantee being claimed;
- concurrency and stale-state handling;
- atomicity where promised, or explicit partial-success semantics where it is not;
- duplicate-call and retry behavior, including idempotency where required;
- postcondition verification and truthful outcome reporting;
- approvals and overrides bound to authenticated actors, reviewed state, exact scope, expiry, and audit;
- auditability, provenance, recovery, and reversal where the risk requires them.

A result must distinguish among **completed**—including what committed or was disclosed—**refused**, **partially completed**, and **outcome unknown**. Unknown must not be reported as success or treated as safe to retry blindly.

These foundations take precedence over speed. A performance optimization is valid only inside the authority, integrity, and recovery boundaries the system is required to preserve.

## What we are trying to achieve

The principles are intended to improve three outcomes.

- **Safer** — lower expected frequency and severity of harmful tool-mediated outcomes—including unauthorized or wrong mutations, disclosures, external actions, and availability or resource-exhaustion failures—within the surface the tool mediates, while still allowing legitimate work to complete. Attempts, refusals, false refusals, admitted harm, and consequence severity must not be collapsed into one count.
- **Cleaner** — a family of artifact properties that must be evaluated separately:
  - **Artifact integrity:** the stock of broken, inconsistent, or otherwise defective state.
  - **Structural legibility:** whether important identities, dependencies, and shared decisions are accurately, currently, and explicitly represented enough to inspect and test.
  - **Choice clarity:** whether legitimate alternatives are distinguishable and accidental duplicates or obsolete choices have been removed.
- **Faster** — lower end-to-end elapsed time for correctly completed work over a stated finite horizon, without hiding failed attempts or reducing correct-completion probability. On-path validation, retries, reconciliation, and recovery belong in elapsed time. Turns, tokens, engineering labor, compute, and monetary cost are companion measures or causal mediators; they are not interchangeable with elapsed time.

Cleaner is deliberately not one scalar score. A file can contain no known defects while leaving important relationships implicit. It can be highly structured but encode the wrong declaration. It can become easier to inspect while temporarily surfacing more defects. The three dimensions should therefore be reported separately.

Cleaner applies where the environment contains durable state. A stateless read or action may have Safety and efficiency consequences without creating an artifact-cleanliness outcome.

Every Faster evaluation must state how unsuccessful or abandoned attempts are treated. At minimum, report both the probability of correct completion by horizon H and elapsed time conditional on completion. A useful companion measure is total elapsed attempt time—with every failed or abandoned attempt capped at H—divided by the number of correct completions. Failed attempts must not disappear from the denominator, and construction or maintenance labor must not be inserted into task latency unless it lies on that task's critical path.

**The outcomes are connected, but they are not separate accounts.** A single refused harmful proposal can avoid a committed consequence, keep a defect out of the artifact, and avoid later repair. That is one causal sequence viewed through three outcomes, not three benefits to add together.

This document uses four accounting terms:

- A **direct effect** reaches an outcome without passing through another named outcome.
- A **mediated effect** reaches an outcome through an intermediate state.
- A **joint effect** requires two or more inputs, none sufficient alone.
- A **total effect** already includes its direct and mediated paths.

A total effect must not be added to its components, and a joint effect must not be credited in full to every participant.

## The four design principles

1. **Put guarantees at the authoritative execution boundary.**
2. **Make consequential relationships explicit, authoritative, and observable.**
3. **Keep determined work together only while its authority, assumptions, and risk remain bounded.**
4. **Make every exchange decision-sufficient and its outcome verifiable.**

## Principle 1 — Put guarantees at the authoritative execution boundary

Stable, mechanically decidable constraints belong where operations are authoritatively validated and their effects committed or data disclosed. The model should be taught the rules, but it should not be asked to provide the guarantee itself.

**Programmatic checks are more reliable than instructions for enforcing mechanically checkable rules.**

An instruction influences what the model proposes. Whether it is followed depends on the model retaining the rule, interpreting the situation correctly, and choosing to apply it. A programmatic check determines whether a covered proposal may execute, commit an effect, or disclose protected data. Its application does not depend on which model is connected or whether that model read or remembered the instruction.

This does not make instructions unnecessary. Prompts, examples, and explanatory guidance teach policy and reduce invalid proposals. Formal request schemas have two different roles: they expose the request contract to the model, and executable validation can reject malformed inputs. The layers must not be credited for the same improvement twice:

- explanatory instructions reduce invalid proposals and wasted refusals;
- schemas make the formal request space legible and may enforce syntactic or structural validity;
- authoritative checks prevent covered prohibited effects.

### What enforcement can guarantee

Three kinds of rule should not be conflated:

1. **State invariant.** Every accepted successor state must satisfy a property. If the property already holds, every capable transition is mediated, the predicate is correct, and refusal is non-mutating, repeated enforcement preserves it.
2. **Transition constraint.** A particular action is allowed only under stated conditions. This constrains accepted changes without necessarily becoming a property stored in the artifact.
3. **Protocol guarantee.** A request or group of requests follows stated execution semantics, such as whole-request prevalidation or an explicit partial-success contract.

A hard check provides its claimed guarantee only when:

- the rule is sufficiently objective and mechanically decidable;
- the boundary observes the authoritative state required to evaluate it;
- every covered operation capable of violating it passes through that boundary or coordinated set;
- authorization and predicate validity remain current until every covered effect occurs—mutation commitment, disclosure, or external action—or intervening change is detected;
- the predicate correctly represents the intended policy; and
- a claimed refusal leaves the protected property unchanged.

Detection without refusal is not prevention. If effects may already have occurred, the result must report partial completion or outcome-unknown rather than refusal. Truthful partial reporting is a protocol guarantee; it does not preserve an invariant or turn partial mutation into prevention. Prevalidation before any mutation is not the same as transactional rollback after execution begins. A system should claim only the stronger property it actually provides.

When a condition depends on ambiguous intent, contextual judgment, or incomplete evidence, use a warning, constrained choice, confirmation, or human approval rather than pretending it is a hard invariant.

### How enforcement changes artifact integrity

Let:

- D(t) be the stock of defects at time t;
- A(t) be defects admitted during the period; and
- R(t) be defects repaired or retired.

Then:

~~~text
D(t+1) = D(t) + A(t) - R(t)
~~~

Enforcement reduces the covered portion of A(t). It does not remove defects already in D(t), and it does not stop uncovered defects. The defect stock falls only when R(t) is greater than total residual A(t).

A guard can therefore leave the artifact cleaner than the unchecked counterfactual while the absolute defect stock still rises. From an already-valid state, it can preserve a covered invariant. From an invalid starting state, it can prevent covered regression but cannot make the invariant retroactively true.

Legacy-invalid state requires an explicit migration policy. A system may grandfather bounded existing debt, permit transitions that monotonically reduce it, prohibit transitions that increase it, use scoped and expiring exceptions, or require a repair transaction. A strict successor-state rule that blocks every intermediate repair is not a workable migration strategy.

### Evidence

The evidence plays several different roles. Runtime enforcement studies directly show harmful proposals being prevented from taking effect even when the agent continues to attempt them. The SWE-agent edit result is a joint system result involving rejection, feedback, retry, and task completion; it supports the guarded-edit pattern but does not isolate the check alone. Clinical identity checks provide a large randomized boundary-verification analogue. Android's memory-safety trend illustrates reduced defect inflow combined with continued repair; annual vulnerability counts are not a direct census of the remaining defect stock. See [Safer leads to Cleaner](../../EVIDENCE.md#safer-leads-to-cleaner).

### Decision test

Before adding a hard check, ask:

1. Can the rule be stated precisely and evaluated from trustworthy current state?
2. Does this boundary or coordinated set authoritatively observe and control every operation covered by the claim?
3. Is refusal the right response, or does uncertainty require warning or confirmation?
4. Does the protected state already conform? If not, what migration or monotonic-improvement policy permits repair without allowing regression?
5. What separately authorized, tightly scoped, expiring, and audited recovery or override exists if the predicate is wrong?
6. Is the control mandatory? If it is discretionary, what common risk, utility, monetary, or time unit will be used to compare expected benefit with latency, construction, maintenance, retry, and false-refusal cost?

## Principle 2 — Make consequential relationships explicit, authoritative, and observable

A safeguard can reliably enforce only a formalized predicate over state it can observe. Important identities, dependencies, ownership, and shared decisions should therefore be represented explicitly when a system is expected to preserve them.

The relevant state need not live in the artifact being changed. It may come from the request, resource owner, authorization service, registry, schema, configuration, policy system, or another authoritative source. What matters is whether its meaning, ownership, freshness, and completeness support the decision.

Explicit representation expands what can be checked. It does not prove intent, implement a safeguard, or make the representation correct. A declared relationship may be wrong, stale, incomplete, or owned by the wrong source.

A source can be authoritative for a fact without its free-form content becoming an instruction. Observable artifact text remains untrusted data; it cannot grant permission or redefine the policy under which it is being read.

Match enforcement strength to observation quality:

- **Explicit, authoritative, and current:** eligible for hard enforcement.
- **Inferable but uncertain:** suitable for warnings, ranked alternatives, or confirmation.
- **Unobservable or subjective:** unable to support a mechanical guarantee and may require the principal's judgment.

### Three distinct ways structure helps

These mechanisms are related, but they are not the same causal claim.

1. **Explicit relationships expand the enforcement surface.** A declared dependency can be inspected and tested. A convention that exists nowhere in observable state cannot support the same guarantee. Actual Safety still requires a formal rule, an implemented guard, and complete mediation.
2. **Canonical sources reduce independent divergence.** A genuinely shared decision stored once has fewer independently mutable copies. This can lower inconsistency without a checker, but it also concentrates the impact of a wrong change.
3. **Choice clarity reduces selection risk directly.** Removing obsolete alternatives and distinguishing legitimate ones reduces the chance of selecting a valid-but-wrong target. This mechanism does not require a checker and should not be presented as evidence of enforceability.

In Figma, an explicit variable binding, an attached component instance, a maintained authoritative style, and distinguishable names illustrate these mechanisms. They record declared structure, not ground-truth intent.

### Evidence

CAD dependency and database-integrity examples support the observability-to-enforceability mechanism. Copied-code research speaks primarily to duplication and missed updates. Distinct patient identifiers speak primarily to choice clarity, and counterevidence shows that merely displaying fewer choices need not reduce wrong selections. These sources therefore support different parts of the principle and should not be treated as measurements of one identical effect. See [Cleaner leads to Safer](../../EVIDENCE.md#cleaner-leads-to-safer).

### Decision test

Before making a relationship structural or authoritative, ask:

1. Is this genuinely one shared decision, or are similar values carrying different meanings?
2. Which system owns the declaration, and who keeps it current?
3. How will consumers remain linked and stale relationships be detected?
4. Does centralization reduce divergence enough to justify its coupling and blast radius?
5. What level of enforcement does the representation's confidence actually support?

## Principle 3 — Keep determined work together only while its authority, assumptions, and risk remain bounded

A model turn is valuable when a decision-maker must interpret new information. It is wasteful when it merely relays operations whose targets, parameters, and controlling rule have already been determined.

Keep work inside one execution unit only while:

- the remaining actions, or the deterministic rule selecting them, can already be stated;
- ordinary code can continue without semantic interpretation by the model;
- the observations on which the plan depends remain current;
- every required intermediate verification can be completed inside the execution unit without new semantic judgment or external approval;
- every action fits the same authorization, approval, and budget scope;
- the combined blast radius remains acceptable; and
- interruption, partial failure, duplication, cancellation, and retry have defined behavior.

Return control when the model must interpret a new observation, a principal or authority owner must approve a consequence, an assumption becomes stale, an impact threshold is crossed, or further execution would make failure harder to isolate or reverse.

The right boundary is therefore neither one operation per call nor as many operations as possible. It is the largest execution unit that requires no new judgment and remains safe to validate, commit, observe, retry, and recover.

### Grouping is not validation

Two capabilities commonly called batching have different mechanisms:

- **Invocation consolidation** places already-determined operations in one call and reduces model–tool coordination.
- **Whole-request prevalidation** refuses detectably invalid input before mutation and protects state.

Valid requests demonstrate consolidation's benefit. Detectably invalid requests demonstrate prevalidation's state-protection benefit, while the size of the consolidated unit and reject-the-whole-request semantics jointly determine retry scope. Runtime failure after mutation begins requires separate execution semantics; prevalidation alone does not provide transactional atomicity.

### Evidence

Programmatic tool-calling evidence supports this workload boundary rather than a blanket preference for fewer calls: composed, already-determined work can use fewer turns or tokens without sacrificing accuracy, while tasks requiring fresh model judgment may gain nothing or cost more. These studies generally measure turns, tokens, cost, and success rather than elapsed time, so they support the coordination mechanism and not every definition of Faster directly. See [Faster: designing tools around decisions](../../EVIDENCE.md#faster-designing-tools-around-decisions).

### Decision test

Before combining operations, ask:

1. Can the continuation or selection rule be stated before execution?
2. Can every intermediate result be verified or handled without changing the meaning of what follows or requiring new judgment?
3. Do all actions share the same authority and approval boundary?
4. If the plan is wrong, the call is duplicated, execution is interrupted, or one item fails, does aggregate harm remain inside the approved risk envelope and can the outcome be contained, observed, and recovered?
5. Does consolidation save more coordination than it adds in verification, retry scope, and concentrated risk?

If any answer is no, return control or split the unit.

## Principle 4 — Make every exchange decision-sufficient and its outcome verifiable

The model–tool contract has two jobs.

Before execution, it must expose the operations, parameters, distinctions, constraints, authority requirements, and relevant state assumptions needed to express a valid request. Trial and error should discover facts about the environment, not facts the interface already knew but failed to communicate.

After execution, it must provide enough for the next legitimate decision-maker—the model, principal, or authority owner—to determine:

- whether the request completed, committed effects or disclosed data, was refused, partially completed, or was left outcome-unknown;
- what actually changed and what did not;
- which stable identifiers or state versions now refer to the result;
- which condition failed and what value was observed;
- whether an assumption changed during execution; and
- what verification, recovery, retry, or approval is required next.

Call such an exchange **decision-sufficient**. It need not include everything any future task might conceivably need. It should contain the smallest trustworthy account of the outcome and continuation state that avoids reconstructing information the tool already possessed.

A refusal should identify the failed condition and, when safe, the admissible ways forward. A success should make the committed postcondition verifiable rather than merely assert that code ran. Partial success and unknown outcome must never be indistinguishable from complete success.

Authoritative metadata and untrusted content must also remain distinguishable. A result should preserve provenance, label free-form resource content as data, and disclose no more protected information than the authorized decision requires. Text found in an artifact or returned by another tool cannot grant authority, override governing instructions, or become executable policy merely because it appears in a trusted response envelope.

### Joint effects

Refusal recovery is a joint Principle 1 × Principle 4 effect:

- Principle 1 creates a refusal instead of a covered harmful commit.
- Principle 4 reduces the information and coordination cost of recovering from that refusal.
- The local correction remains a cost on the guarded path. The benefit is the difference between that guarded-path cost and the more expensive downstream failure path.

Usable semantic information is a joint Principle 2 × Principle 4 effect:

- the environment must contain an authoritative, meaningful distinction; and
- the interface must expose it at the decision boundary.

The same saved search must not be credited once to clean structure and again to the interface that merely transmitted it.

### Evidence

Evidence on filtered tool results, admissible refusal alternatives, and overly aggressive result trimming supports the information-sufficiency mechanism. It shows that both omission and excess have costs, but most measurements concern tokens, benchmark performance, repair success, or total cost rather than elapsed time. See [Faster: designing tools around decisions](../../EVIDENCE.md#faster-designing-tools-around-decisions).

### Decision test

For the request side, ask:

1. Can the caller compose a valid request without trial and error over facts the interface already owns?
2. Are authority, preconditions, consequences, and state-version assumptions visible?

For the result side, ask:

1. Can the caller determine what committed and what did not?
2. Can it make the next continuation, recovery, verification, or approval decision without re-querying information the tool already had?
3. Can the claimed outcome be checked against authoritative state?
4. Can the caller distinguish authoritative metadata from untrusted content?
5. Is every returned field relevant enough to justify its context, disclosure, and interpretation cost?

## How the principles combine

Every pathway below is conditional on the reliable-execution substrate and the scope stated for the claimed guarantee. Rows identify immediate causal paths; they are not additive benefit columns.

| Source and path | Effect type | Outcome | Accounting rule |
| --- | --- | --- | --- |
| Authoritative guard → prohibited mutation, disclosure, or external action refused | Direct | Safer | Count harmful effects prevented, not proposal attempts. |
| Guard → admitted covered artifact defects fall → future counterfactual defect stock is lower | Mediated | Cleaner: integrity | The guard did not repair existing defects; count the later repair saving only through this path. |
| Cleanup or repair → existing defect stock falls | Independent input | Cleaner: integrity | Do not credit removal to enforcement. |
| Correct observable relationship × formal rule × implemented guard × coordinated complete mediation | Joint prerequisite | Enforcement coverage | This enables realized prevention; it is not another prevented event to count. |
| Prompts, examples, and explanatory guidance—excluding formal schema information—→ invalid proposals fall → refusals and retries fall | Direct operational effect | Lower refusal load; Faster is conditional | Guidance supplies no committed-state guarantee; include its context and maintenance cost. |
| Accidental valid-but-wrong alternatives fall | Direct but conditional | Safer and Cleaner: choice clarity | Account for legitimate distinctions that could be erased. |
| Independently mutable copies of a genuinely shared decision fall | Direct but conditional | Cleaner: structural legibility; Safer is indeterminate | Divergence may fall while coupling and wrong-change blast radius rise; the net Safety effect is not predetermined. |
| Lower defect stock → later diagnosis and repair fall | Mediated | Faster over a future horizon | Count only when later work encounters the affected state. |
| Structural legibility × interface exposure → search and interpretation fall | Joint | Faster | Do not give both inputs full credit for the same saved search. |
| Choice clarity × interface exposure → disambiguation search falls | Joint | Faster | Keep this separate from the wrong-selection-risk path, which can avoid an error even after search succeeds. |
| Canonical reusable source × interface access → recreation and repeated update work fall | Joint | Faster over a reuse horizon | Count separately from search only when genuinely shared work was reused. |
| Request contract exposes tool-owned constraints → schema trial and error falls | Direct | Faster on the current task | Distinguish interface-owned facts from genuine artifact discovery. |
| Decision-sufficient success or partial-result report → outcome reconstruction and redundant re-query fall | Direct | Faster on the current task | Limit this to tool-owned outcome facts; do not duplicate semantic-search, retry, or refusal savings. |
| Truthful completed, partial, refused, or unknown status × defined retry semantics → unsafe duplicate or blind retry falls | Joint | Safer directly; Faster is conditional | Safe reconciliation can take longer than a blind retry; evaluate elapsed time through the matched comparison. |
| Refusal × decision-sufficient diagnostic → refusal recovery cost falls | Joint | Faster on the current task | Recovery remains a guarded-path cost; richer feedback reduces it. |
| Consolidated predetermined work → coordination turns fall | Direct | Lower coordination; Faster is conditional | Establish elapsed-time savings after verification, retry, and wrong-plan amplification costs. |
| Consolidated unit × reject-the-whole-request semantics → retry scope rises | Joint countereffect | Potentially Slower | Do not assign this cost to validation or consolidation alone. |
| Checks → validation time rises | Direct countereffect | Potentially Slower | Include the cost on valid as well as invalid requests. |
| False refusal → authorized work is delayed or denied | Direct countereffect | Slower and potentially less Safe | Measure retries, correct-completion probability, availability, and harm from denied time-sensitive work—not latency alone. |
| Cleanup and explicit structure → upfront, maintenance, and structural-risk costs rise | Direct countereffect | Higher lifecycle resource cost; potentially Slower only on the critical path | Include stale declarations, erased distinctions, coupling, and concentrated impact over the stated horizon. |

The Safer/Cleaner relationship is a maintenance cycle:

~~~text
valid explicit structure
    → greater checkability
    → correctly implemented enforcement
    → less covered regression
~~~

It is not self-starting. Cleanup or normalization must create valid explicit structure. Safeguard engineering must turn a formalizable rule into a working guard. Continued maintenance must keep both the representation and predicate correct.

Time-indexed:

~~~text
formalized observable rule at time t
    × implemented guard
    × authoritative coordinated mediation
    → fewer harmful tool-mediated outcomes

for artifact-integrity rules only:
    fewer admitted covered defects
    → lower counterfactual defect stock at time t+1
~~~

Faster does not lead back automatically. Some speed optimizations increase blast radius, reduce verification, or enlarge retry scope. Safer and Cleaner also retain value when no future task produces a time saving.

## Why this can pay

Two economic principles explain when the design is worthwhile.

### Cheap, precise boundary checks beat expensive downstream reconstruction

A refused harmful proposal can be corrected before it becomes entangled with later valid work. That is not a universal claim that every possible check is faster.

For a stated horizon H, a matched counterfactual, and the cohort of consequences covered by the safeguard, the time comparison is:

~~~text
total downstream consequence and recovery elapsed time avoided
for true-positive covered proposals within H
- on-path validation and incremental verification time
- true-positive boundary correction and retry time
- false-positive refusal and retry time
- outcome-unknown reconciliation time
= expected net task elapsed-time benefit within H
~~~

If no covered harmful proposal would otherwise commit, the gross avoided-repair benefit is zero while validation overhead remains. The net time effect is neutral only if that overhead is negligible; otherwise it is negative.

The true-positive, false-positive, and outcome-unknown terms are disjoint attempt cohorts. Safeguard design, implementation, testing, rollout, maintenance, compute, and operator labor must be reported separately from task elapsed time unless they are on the task's critical path. A total investment or risk comparison may include them only after converting every term to an explicit common unit. Non-time harm likewise requires a separate risk, utility, or monetary evaluation; milliseconds and severe consequences cannot be compared without such a valuation model.

For discretionary checks, the case is strongest when the failure is sufficiently likely, latent, severe, high-fan-out, or difficult to reverse, and the predicate is cheap and precise. Mandatory authorization, compliance, or integrity controls may still be required independently of their speed payoff.

Industrial inspection and automated-analysis studies report cases where quality-mediated savings exceeded control overhead. These are total or net effects that include the downstream rework pathway; they must not be added to that same pathway again. See [Safer leads to Faster](../../EVIDENCE.md#safer-leads-to-faster).

### Disorder is paid for again by work that encounters it

Broken state, unclear roles, accidental alternatives, and lost reuse create search, interpretation, recreation, diagnosis, and repair costs for later tasks that touch them.

For pre-existing disorder and structural investments not already credited to the prevention calculation, the Cleaner-to-Faster effect is:

~~~text
future task elapsed time avoided through search, interpretation,
recreation, and repair within H
= gross Cleaner-to-Faster elapsed-time benefit over H
~~~

Whether cleanup is a worthwhile investment is a separate resource calculation:

~~~text
value of future task time, labor, and recovery avoided within H
- cleanup and migration labor or cost
- structural maintenance labor or cost
- expected cost of stale declarations, erased distinctions,
  coupling, and concentrated wrong changes
= net lifecycle resource value over H
~~~

Only the first calculation measures Faster. The second may be expressed in labor hours, money, or another declared common unit. Cleaner structure pays most when it is frequently reused or changed, and it may never repay its upfront investment in disposable or rarely touched state. Evidence from design systems, identifier quality, CAD modification, and software maintainability supports the direction of this lifecycle effect, while differing in outcome and method. See [Cleaner leads to Faster](../../EVIDENCE.md#cleaner-leads-to-faster).

The prevention and cleanup calculations must not both contain the same avoided repair. If cleanup makes a guard possible, or a guard preserves the cleaned state, evaluate the combined strategy against one matched baseline instead of adding the two partial estimates. Because unsuccessful work has no ordinary completion time, compare:

~~~text
baseline versus strategy over the same finite horizon H:
1. probability of correct completion by H
2. elapsed time conditional on correct completion by H
3. total capped elapsed attempt time divided by correct completions
~~~

Every failed or abandoned attempt is capped at the same H for the third measure. A total-cost or ROI comparison should be reported separately in its own common unit.

### Faster has more than one cost component

Expected time to correct completion is affected by:

- execution work;
- model–tool handoffs;
- information acquisition and interpretation;
- safeguards, verification, and approval;
- refusal, retry, reconciliation, diagnosis, and recovery; and
- cleanup or maintenance performed on the task's critical path.

These are causal drivers, not additive wall-clock buckets. A retry may contain coordination, validation, execution, and diagnosis; the elapsed interval must be assigned once in any measurement. Off-path cleanup and maintenance remain companion labor, cost, or lifecycle-investment measures rather than task latency. Principle 3 acts primarily on avoidable handoffs. Principle 4 acts on interface-driven reconstruction, outcome certainty, and recovery. Cleaner structure acts on artifact-driven search, reuse, and inherited disorder. Principle 1 changes admitted risk and, for integrity rules, the future artifact state.

## One example, end to end

Consider deleting a shared variable that still has consumers.

- The environment's explicit consumer bindings make the dependency observable. That is Principle 2.
- A formal rule and commit-time check can refuse deletion while consumers remain. That is Principle 1.
- A result that states that nothing committed, identifies the failed condition, and lists safely disclosable consumers makes recovery cheaper. That is Principle 4.

This example does not require Principle 3 merely because the check runs inside the deletion call. Principle 3 would become relevant if the model had already determined a larger cleanup sequence that could safely continue without new judgment, verification, or approval.

The final benefit is one causal path: an observable relationship enables a guard; the guard prevents the covered broken references from entering the artifact; the diagnostic reduces the cost of deciding what to do next. The prevented defect and its avoided downstream repair are counted once.

The project-specific evidence and limitations for this example are collected under [Deleting an in-use variable in Figma](../../EVIDENCE.md#deleting-an-in-use-variable-in-figma).

## Selection rules and tradeoffs

Use the principles selectively:

- **Enforce** when the rule is mechanically decidable, the state is authoritative enough, the mediated surface supports the claim, and either policy requires it or expected harm avoided justifies the cost.
- **Represent explicitly** when a relationship is consequential, genuinely shared, owned, and maintainable.
- **Canonicalize** only when similar values really express one decision; preserve legitimate distinctions.
- **Consolidate** only work that is genuinely predetermined and remains inside acceptable authority, verification, recovery, and blast-radius boundaries.
- **Return information** when it can change the next legitimate decision, verification, or recovery step; preserve provenance, apply least disclosure, and omit it when it cannot.
- **Escalate** ambiguous, high-impact, or unobservable intent to the principal rather than converting uncertainty into a confident mutation.

Every principle has a counter-cost:

- checks add latency, maintenance, and false refusals;
- cleanup is paid before future reuse produces a return;
- authoritative shared sources concentrate impact;
- deduplication can erase real distinctions;
- larger execution units amplify valid-but-wrong decisions;
- whole-request rejection enlarges retry scope;
- explicit relationships can become stale and then make the wrong policy easier to enforce;
- additional output consumes context, attention, and disclosure budget.

The correct architecture does not maximize enforcement, structure, batching, or output independently. It chooses the least complexity consistent with required risk reduction, defense in depth, authority, integrity, resilience, operability, and recovery, then minimizes expected total cost within those constraints.

## Limits and non-goals

These principles do not make an LLM tool infallible.

- An authoritative boundary or coordinated set governs only the operations it actually mediates.
- Formal validity does not establish correctness of intent.
- Explicit structure can be wrong, stale, or incomplete.
- A valid-but-wrong proposal can pass every hard check.
- A check can faithfully enforce the wrong predicate.
- Authenticated artifact content can still contain adversarial instructions, and must remain data rather than acquire authority over the model.
- Read and result surfaces can cause harm through excessive disclosure even when no mutation commits.
- A shared source can reduce divergence frequency while increasing consequence severity.
- A system with ambiguous partial failure, unsafe retry, or unverifiable outcomes remains unreliable even if its prompts and schemas are excellent.
- Tokens, turns, task success, error rate, monetary cost, and elapsed time remain different measurements.

This philosophy covers the model–tool interaction, the representation it depends on, and the causal reasoning behind the expected benefits. It does not replace a product-specific safety contract, threat model, permission system, transaction design, or operational recovery plan.

For figma-edit-mcp, those concrete guarantees, conditions, and residual risks are defined in [SAFETY.md](../../SAFETY.md).

---

These principles produce a clear division of responsibility: the principal supplies intent; the authority owner defines the permitted scope; the model proposes and coordinates; the authoritative boundary validates, executes, and commits effects; the environment records the result; and the next decision-maker receives enough trustworthy information to continue.

---

## Notes on this corrected draft

### What changed from the previous restructure

- Replaced “the AI is the primary user” with a principal–authority–proposer–committer trust model.
- Replaced absolute claims about memory and visibility with durable assumptions about probabilistic compliance and bounded observation.
- Scoped the four principles to the model–tool interaction and added the reliable-execution substrate they depend on.
- Distinguished requested intent from governing authority and treated free-form environment content as untrusted data rather than instruction.
- Replaced “put the rule in the tool, not in the prompt” with authoritative-boundary enforcement while retaining the explicit argument that programmatic checks are more reliable than instructions.
- Replaced “you can only enforce what the file records” with formalized predicates over trustworthy observable state.
- Separated observability, canonicalization, and choice clarity into distinct mechanisms.
- Added authority, approval, verification, stale-state, retry, fault-isolation, and blast-radius conditions to the execution-unit principle.
- Replaced “decision-complete result” with a decision-sufficient request-and-result contract.
- Defined Safer using committed harm and severity, split Cleaner into three separately measured dimensions, and bounded Faster to an explicit horizon.
- Added explicit direct, mediated, joint, and total-effect accounting.
- Corrected the stock-and-flow inequality and distinguished counterfactual improvement from absolute cleanup.
- Replaced the universal prevention-cost claim with a net expected-value calculation that includes validation and false-refusal costs.
- Treated boundary correction as a guarded-path cost whose reduction is jointly produced by enforcement and diagnostic quality.
- Separated artifact search from interface reconstruction and counted their interaction once.
- Preserved the distinction between invocation consolidation and whole-request prevalidation.
- Removed Principle 3 from the variable-deletion example unless a distinct coordination boundary is actually eliminated.
- Added selection rules, precedence, tradeoffs, and explicit non-goals.

### Follow-up this draft would create

[EVIDENCE.md](../../EVIDENCE.md) is still organized by the older goal-arrow structure. The links above resolve to those existing sections, but the mapping is no longer one-to-one. If this philosophy is adopted, the evidence document should be reorganized around:

1. authoritative-boundary enforcement;
2. observable structure, canonicalization, and choice clarity;
3. safe execution-unit design;
4. decision-sufficient exchanges;
5. net prevention economics;
6. lifecycle cleanliness economics; and
7. counterevidence, boundary conditions, and proxy outcomes.

The evidence should label each study as supporting a direct, mediated, joint, or total effect and should keep elapsed time, tokens, turns, task success, error rates, and monetary cost distinct.

Nothing in this draft changes [SAFETY.md](../../SAFETY.md), the README, or the current root philosophy.
