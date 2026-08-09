# Causal Structure Review

Date: 2026-08-08

Reviewed document: [DESIGN_PHILOSOPHY.md](../../DESIGN_PHILOSOPHY.md)

## Scope

This is a review of the philosophy and strategy expressed by `DESIGN_PHILOSOPHY.md`: its definitions, causal arrows, mechanisms, feedback relationships, units of analysis, tradeoffs, and benefit accounting.

It is not a review of the current implementation. Figma-specific examples are considered only where they illustrate or obscure a general strategic principle.

Line references refer to the version reviewed on 2026-08-08.

## Executive assessment

The revised Safer → Cleaner and Cleaner → Safer sections are substantially stronger than their earlier versions:

- Safer → Cleaner now distinguishes actions proposed by an agent from state committed to an artifact.
- Cleaner → Safer now identifies observability as a prerequisite for mechanical enforcement.
- The Android example now distinguishes reduced defect inflow from removal of existing defects.
- The shared-source caveat correctly acknowledges that centralization can increase blast radius.

The remaining weakness is causal accounting. The document often presents causal arrows as separate benefit categories even when they describe different portions of the same mediated pathway. No numerical total is currently calculated, so nothing has literally been added twice. But the structure would double-count benefits if these arrows were later used to justify investment, calculate ROI, or score the three goals.

The central accounting rule should be:

> **The arrows describe causal pathways, not separate benefit buckets. Where one goal affects another through an intermediate goal, the resulting benefit is counted once as a mediated effect.**

## The causal model currently expressed

The document contains the following variables, even though it does not name them separately:

- **Safety coverage and reliability** — which invalid transitions are caught, and how dependably they are refused.
- **Defect stock** — errors and broken states currently present in the artifact.
- **Structural observability** — how much intent is represented through explicit, machine-readable relationships.
- **Ambiguity and duplication** — the number of plausible-but-wrong alternatives and independently mutable copies.
- **Task time** — time or cost required to reach correct completion.
- **Repair and cleanup** — work that removes existing defects or converts implicit structure into explicit structure.
- **Safeguard engineering** — the independent act of turning an observable rule into an enforced predicate.
- **Decision-aligned interface design** — tool boundaries and responses that reduce unnecessary model coordination.

The intended high-level model appears to be:

```text
Structural cleanlinessₜ
    ├──► checkability ──► deployed safeguardsₜ ──► lower defect inflow
    │                                      │                 │
    │                                      │                 ▼
    │                                      │        lower defect stockₜ₊₁
    │                                      │                 │
    │                                      ▼                 ▼
    │                           cheaper local recovery   less future rework
    │
    └──► less search, interpretation, and recreation

Independent repair ──────────────────────► lower defect stockₜ₊₁

Decision-aligned interface ────────────────► less coordination
```

That model is coherent. The present organization obscures it in several important ways.

## Priority findings

### 1. Cleaner contains two different causal variables

Cleaner is defined as a bundle of:

- fewer errors and broken relationships;
- less ambiguity;
- less duplication;
- less implicit state;
- more authoritative sources and explicit links; and
- more distinguishable legitimate alternatives.

See the definition at lines 67–69.

The reciprocal arrows operate on different portions of that bundle:

- **Safer → Cleaner** mainly reduces defect inflow and therefore future **defect stock**. See lines 31–39.
- **Cleaner → Safer** mainly relies on **structural observability** and reduced choice ambiguity. See lines 90–103.

The apparent Safer ↔ Cleaner loop is therefore not automatically a loop over the same variable. Preventing a harmful edit does not create authoritative sources, explicit links, or less duplication. Conversely, making a relationship explicit does not create a safeguard.

The loop becomes valid only when:

1. Cleanup or normalization first creates explicit structure.
2. Someone turns that structure into a checkable predicate.
3. A safeguard is designed and deployed over the relevant transitions.
4. That safeguard subsequently prevents the established state from regressing.

The strategically accurate time-indexed relationship is:

```text
Structural Cleanerₜ → checkability → Saferₜ
Saferₜ → lower defect inflow → Defect Cleanerₜ₊₁
```

This is a cumulative maintenance loop requiring continued cleanup and safeguard engineering, not a self-starting loop.

### 2. Cleaner creates safeguard potential, not actual Safety by itself

The statement at lines 90–95 is correct as a necessary condition:

> A safeguard can reliably enforce only the relationships the file makes observable.

But the causal chain is incomplete:

```text
observable relationship
    → testable predicate
    → safeguard designed
    → safeguard deployed
    → relevant transitions mediated
    → violations refused
```

Cleaner expands the potential enforcement surface. Actual Safety requires the independent strategic decision to build and apply a safeguard.

The Cleaner → Safer section also combines two different mechanisms:

1. **Machine-enforceability.** Explicit relationships make more predicates testable.
2. **Reduced opportunity.** Removing obsolete alternatives and independently mutable copies can reduce error opportunities even when no checker exists.

The second mechanism does not follow from the section's observability headline and should be stated separately.

### 3. Not every enforced rule becomes a persistent artifact invariant

The first insight at lines 19–20 says:

> A rule enforced before every change becomes a property the file is guaranteed to keep.

Conceptually, safeguards can enforce at least three different things:

- **State invariants:** every accepted successor state must satisfy a property.
- **Transition constraints:** a particular action is allowed only under defined conditions.
- **Protocol guarantees:** a collection of actions is admitted or rejected together.

Only the first literally becomes a persistent property of the artifact. Authority restrictions and identity preconditions constrain transitions. Whole-request validation is a protocol property. They may contribute to a cleaner artifact without themselves being properties stored in it.

Even a genuine state invariant is preserved only when:

- it holds in the starting state;
- every transition capable of violating it is mediated;
- the predicate correctly represents the rule; and
- refusal leaves the state unchanged.

The document later acknowledges that checks do not repair existing defects, but that condition should be integrated into the insight rather than left downstream.

A more precise strategic formulation is:

> **Enforcement constrains every accepted transition. When the enforced rule is a state invariant and already holds, complete enforcement preserves it across future states.**

### 4. Cleaner → Safer is a conditional interaction, not a monotonic arrow

The caveat at line 118 identifies a strategically important countereffect:

> A wrong edit to a shared source reaches more places than a wrong edit to a local copy.

Centralization therefore changes both:

- the probability of inconsistency; and
- the consequence or blast radius of a wrong source edit.

The safety result depends on the interaction:

```text
appropriate centralization
    × visible dependencies
    × effective guarding
    → lower expected risk
```

This conditionality belongs in the primary causal claim, not only in a caveat. Cleaner is not monotonically safer when canonicalization collapses legitimate distinctions, records the wrong relationship, or increases the reach of an unguarded error.

### 5. The document claims four insights but contains five independent propositions

Line 11 promises four insights. The current document then presents:

1. Repeated enforcement preserves a rule across changes — line 20.
2. Prevention costs less than repair — line 49.
3. Defects and inconsistencies compound — line 74.
4. Observable relationships make safeguards possible — line 91.
5. Tool boundaries should match decision boundaries — line 126.

Line 90 attempts to make the Cleaner → Safer proposition an application of the first insight, but the two answer different questions:

- What makes a rule enforceable?
- What happens when an enforceable rule is applied repeatedly?

One does not follow from the other.

Two coherent options exist:

- Explicitly count five insights.
- Merge lines 20 and 91 into one reciprocal insight:

> **Make important relationships explicit so software can enforce them; enforce them at every relevant transition so they remain true.**

The claim that programmatic checks are more reliable than instructions can remain the supporting mechanism beneath the enforcement half.

### 6. The Cleaner → Faster insight does not match its mechanisms

The third insight at line 74 says defects compound by making additional defects more likely.

The supporting mechanisms at lines 76–82 instead concern:

- search and disambiguation;
- reuse and repeated decisions; and
- diagnosis and rework.

Those mechanisms establish a recurring productivity tax. They do not require defects to cause additional defects. Increased probability of future errors belongs more naturally under Cleaner → Safer.

A causally aligned Cleaner → Faster insight would be:

> **Disorder is paid for repeatedly: every later task that must interpret, reuse, or modify it incurs the cost again.**

This leaves compounding error probability under the safety relationship where it belongs.

## Accidental double-counting

### 1. The same avoided repair is credited to Safer → Faster and Safer → Cleaner → Faster

Safer → Cleaner says checks reduce defect inflow and preserve a cleaner future state at lines 31–39.

Cleaner → Faster says a lower defect stock avoids later diagnosis and rework at lines 76 and 82.

Safer → Faster independently credits Safety with:

- immediate containment;
- preventing propagation;
- avoiding later diagnosis and repair; and
- avoiding rollback.

See lines 51–55.

For a defect stopped by a guard, the causal sequence is:

```text
Safety
    → defect does not enter
    → cleaner future state
    → no later diagnosis or repair
    → faster future work
```

That is the indirect effect of Safety through Cleaner. It cannot also be counted as an additional direct Safer → Faster benefit.

The clean partition is:

- **Direct Safer → Faster:** boundary-local diagnosis and correction of the attempted operation.
- **Indirect Safer → Cleaner → Faster:** downstream work avoided because the defect never entered the artifact.

Alternatively, Safer → Faster can be described as a total effect that already includes the Cleaner-mediated path. If so, it must not be added to that path again.

### 2. Cleaner → Faster also includes Cleaner → Safer → Faster

Cleaner → Safer says that removing obsolete alternatives reduces wrong selections at lines 99–114.

Safer → Faster says that preventing those errors avoids recovery at lines 49–55.

Cleaner → Faster separately claims reduced diagnosis, inherited mistakes, and rework at lines 76–86.

For a near-duplicate that would otherwise be selected incorrectly, the same avoided error and repair can therefore be presented as:

- a direct Cleaner → Faster benefit; and
- Cleaner → Safer → Faster.

The document should distinguish:

- **Direct Cleaner → Faster:** less search, interpretation, and recreation even when no error would otherwise occur.
- **Safety-mediated Cleaner → Faster:** fewer wrong selections followed by less error recovery.

### 3. The same broken-relationship example supports four arrows but produces one final avoided repair

The repeated broken-reference example illustrates:

- Cleaner → Safer: an explicit relationship makes the dependency checkable.
- Safer → Cleaner: the check prevents the relationship from being broken.
- Safer → Faster: refusal avoids later reconstruction and repair.
- Cleaner → Faster: an unbroken relationship avoids future diagnosis and rework.

This is strategically powerful, but it is one time-ordered loop:

```text
Cleaner stateₜ
    → checkability
    → guarded transition
    → Cleaner stateₜ₊₁
    → less later repair
```

It is not four independent benefits. The example should be presented explicitly as the worked example of the complete feedback loop, with the final avoided repair counted once.

### 4. Actionable refusal diagnostics are credited twice

Safer → Faster credits diagnosis at the boundary at line 54.

The direct Faster section again credits refusals that identify the failed condition, observed value, and accepted alternatives at lines 148–156.

These are not two independent speed mechanisms:

- Safety creates a refusal instead of an invalid mutation.
- A decision-complete interface makes recovery from that refusal faster.
- The shortened recovery is produced by their interaction and should be counted once.

### 5. Batch tools receive three credits without clearly separating two capabilities

Batching appears as:

- state preservation through whole-request prevalidation at line 33;
- avoided partial-state repair under Safer → Faster at line 65; and
- fewer model round trips under direct Faster at lines 136–142.

There are actually two strategic features:

- **Invocation consolidation:** already-determined operations are expressed in one call, reducing coordination.
- **Whole-request validation:** a detectably invalid request is refused before any member is applied, preserving state.

These features have different benefits and operating conditions. Valid requests benefit from consolidation. Invalid requests benefit from prevalidation. Any repair avoided by prevalidation is mediated through preserved cleanliness and must not also be counted as a separate speed benefit.

### 6. The goal definitions permit scorecard double-counting

Safer includes fewer ways to make an error at lines 7 and 15.

Cleaner includes less duplicated and ambiguous state at lines 8 and 69.

Cleaner → Safer then says that removing a near-duplicate creates fewer valid-but-wrong choices at line 103.

The same state change—removing an obsolete alternative—is therefore:

- an improvement in Cleaner; and
- an improvement in Safer because the action space now contains one fewer way to be wrong.

That overlap is not conceptually invalid. It becomes double-counting if the two goal scores or benefits are added. The goals should be treated as linked indicators, not additive buckets.

### 7. Cleaner semantics and interface legibility jointly produce some of the same saved search

Cleaner → Faster credits semantic names, clear roles, and authoritative objects with reducing reads and decisions at line 80.

The direct Faster section credits the interface with exposing distinctions, constraints, identifiers, anchors, and accepted alternatives at lines 148–152.

The interface cannot expose semantics the environment does not contain, and clean semantics cannot help the agent if the interface does not transmit them. Some saved search is therefore produced by the chain:

```text
Cleaner structure → interface exposes it → less search → Faster
```

Neither Cleaner nor the interface should receive the full saving independently.

## Legitimate shared mechanisms that are not necessarily double-counting

The reuse of one intervention across multiple arrows is not automatically an error.

- Removing an obsolete alternative can independently reduce search time and wrong-selection probability.
- A batch can reduce model coordination while whole-request validation protects state.
- Canonicalization can reduce repeated decisions while explicit links enable integrity checks.
- Programmatic-check reliability is a mechanism supporting invariant preservation, not a second downstream benefit.
- Instructions can reduce invalid proposals while guards independently prevent covered proposals from committing.

The accounting problem begins only when the same prevented defect, saved repair, saved retry, or saved search is credited in full to multiple pathways.

## Additional strategic gaps

### 1. The stock-flow condition is incomplete

The document's level metaphor is directionally useful, but absolute defect stock falls only when:

```text
errors removed per period > errors admitted per period
```

The complete relationship is:

```text
Defectsₜ₊₁ = Defectsₜ + Admitted defectsₜ − Removed defectsₜ
```

Safety can make the artifact cleaner than the unchecked counterfactual even while its absolute defect stock continues rising. The document should distinguish:

- **Counterfactual cleanliness:** fewer defects than the otherwise-equivalent unchecked path.
- **Absolute cleanup:** a declining defect stock.

### 2. The three goals use different units

- **Safer** is primarily a transition-risk or harmful-admission measure.
- **Cleaner** is an artifact stock plus several structural qualities.
- **Faster** is an expected performance outcome.

That is workable, but the goals should not be treated as interchangeable scalar scores.

A more useful strategic definition would be:

- **Safer:** lower expected frequency and severity of harmful committed transitions.
- **Cleaner:** lower defect stock and clearer explicit structure in the current artifact.
- **Faster:** lower expected time or cost to correct completion over a stated horizon.

### 3. Faster mixes several time horizons and proxy outcomes

The document uses Faster to cover:

- correction of the current refused action;
- downstream repair later in the same task;
- future tasks touching the same artifact;
- total lifecycle effort;
- model turns;
- token cost;
- task success; and
- elapsed time.

These are related but not interchangeable. Each causal claim should state whether it concerns:

- the current task;
- future tasks touching the artifact; or
- cumulative lifecycle cost.

Likewise, fewer tokens may lower cost without lowering wall time, fewer turns may lower latency, and higher success may improve throughput without shortening a successful attempt.

### 4. The causal graph contains almost entirely positive arrows

A strategic model should also make the balancing effects visible:

- More checks can add latency, false refusals, and recovery work.
- Cleanup and structural normalization have an upfront cost.
- Canonical sources increase the blast radius of a valid-but-wrong edit.
- Aggressive deduplication can erase legitimate distinctions.
- Larger batches reduce coordination but amplify a wrong decision that passes validation.
- Whole-request rejection can enlarge retry scope when one member fails.
- Explicit relationships create their own maintenance obligations and can become stale or incorrect.

These effects do not invalidate the strategy. They provide the selection rules for when and where each principle should be applied.

### 5. Faster is described as the payout of the other two goals

Line 123 says Faster is where Safer and Cleaner pay out.

That framing makes Safety and Cleanliness sound purely instrumental. If fewer destructive errors and a healthier artifact are valuable independently of time saved, the document should say so.

Otherwise the stated three-goal strategy is actually a one-goal hierarchy in which Safer and Cleaner are merely means to Faster.

## Recommended explicit accounting model

The philosophy would become much harder to double-count if it included two equations.

### Artifact state

```text
Defectsₜ₊₁ = Defectsₜ + Admitted defectsₜ − Repaired or retired defectsₜ
```

Assign effects once:

- Safety reduces **admitted defects**.
- Cleanup and repair reduce **existing defect stock**.
- Structural cleanliness determines part of the **checkable surface** and part of the choice environment.
- Explicit structure and deployed safeguards jointly determine **enforcement coverage**.

### Task and lifecycle time

```text
Expected time to correct completion
    = base execution
    + coordination
    + search and interpretation
    + validation and refusal recovery
    + diagnosis and rework
```

Assign effects once:

- Safety adds validation overhead and can reduce boundary-local correction cost.
- Safety reduces defect inflow; its later rework saving is mediated through Cleaner.
- Structural Cleaner reduces search, interpretation, and recreation directly.
- Defect Cleaner reduces inherited diagnosis and rework.
- Decision-aligned tools reduce coordination and information-reconstruction cost.
- Decision-complete refusals interact with Safety to reduce refusal recovery.

## Recommended causal structure

Retain the three goals, but distinguish the variables and pathways explicitly:

1. **Structural cleanliness** makes more relationships observable and independently reduces ambiguity.
2. **Observable relationships plus deployed safeguards** reduce harmful committed transitions.
3. **Reduced defect inflow plus continued repair** produces lower future defect stock.
4. **Structural cleanliness** directly reduces search, interpretation, and recreation.
5. **Lower defect stock** reduces inherited diagnosis and repair.
6. **Safeguards** have a narrow direct speed effect through boundary-local diagnosis and correction.
7. **Decision-aligned interfaces** reduce coordination independently.
8. **Direct, mediated, and joint effects are not additive unless their outcomes are disjoint.**

Time-indexed:

```text
Structural Cleanerₜ → Saferₜ
Saferₜ → Defect Cleanerₜ₊₁
Saferₜ → Fasterₜ through boundary-local correction
Structural Cleanerₜ → Fasterₜ through search, interpretation, and reuse
Defect Cleanerₜ → Fasterₜ through inherited-state costs
Saferₜ → Defect Cleanerₜ₊₁ → Faster_future as an explicitly mediated path
Decision-aligned interface → Fasterₜ through coordination
```

## Recommended structural changes to the document

1. Introduce the stock/flow distinction in the three goal definitions rather than waiting until Safer → Cleaner.
2. Split Cleaner into named subdimensions: **defect cleanliness** and **structural cleanliness**.
3. Add a sentence near line 11 stating that arrows are causal pathways rather than additive benefit buckets.
4. Time-index the reciprocal Cleaner/Safer relationship.
5. Either count five insights or merge observability and enforcement into a single two-sided first insight.
6. Limit direct Safer → Faster to boundary-local effects; classify downstream avoided rework as Cleaner-mediated.
7. Limit direct Cleaner → Faster to search, interpretation, reuse, and inherited-state costs not already credited through Safety.
8. Treat decision-complete refusals as a joint Safety/interface effect and count their recovery saving once.
9. Separate batch consolidation from whole-request validation.
10. Integrate negative arrows and selection criteria into the main causal claims rather than relegating all of them to caveats.

## Final assessment

The document now has the foundation of a strong strategy:

- make important relationships explicit;
- turn mechanically decidable relationships into enforced transition rules;
- use enforcement to reduce defect inflow and preserve established good states;
- use cleanup and repair to reduce the existing defect stock;
- reduce recurring search and interpretation through clean structure; and
- reduce coordination through decision-aligned interfaces.

The main remaining task is not finding more examples. It is assigning each effect to one causal pathway and distinguishing direct, mediated, and joint effects. Once that accounting is made explicit, the Safer/Cleaner relationship becomes a credible maintenance strategy rather than a circular slogan, and the Faster claims stop counting the same avoided work more than once.
