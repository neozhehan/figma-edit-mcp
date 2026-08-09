# Recommendations for Strengthening Safer → Faster

Date: 2026-07-14

## Executive recommendation

Retain **Safer → Faster** as a guiding principle. Its core logic is sound for the error classes that figma-edit-mcp checks: when the server blocks a harmful action at the boundary, the relevant comparison is the same action passing through an otherwise equivalent MCP server without that check. Unrelated failures outside the server's control are not part of that comparison.

The current argument should nevertheless be strengthened in five ways:

1. Define Faster as **expected time to correct completion over a representative set of tasks**, including validation and refusal overhead.
2. State the mechanism as a comparison between immediate containment and downstream recovery, not as an unqualified rule that every prevention is cheaper than every repair.
3. Replace DORA as the primary evidence for the arrow with industrial studies that measured or modeled both prevention overhead and downstream effort.
4. Preserve the Figma broken-reference example as direct domain evidence, while labeling its forum reports as an illustration rather than a controlled time study.
5. Remove or narrow unsupported absolutes such as “one refused call,” “every error,” and “an order of magnitude cheaper.”

The strongest concise formulation is:

> For an error class a check can reliably identify, blocking an invalid action at the execution boundary reduces expected correct-completion time when validation and recovery cost less than the downstream discovery, diagnosis, repair, rollback, and propagation the check avoids. Industrial evidence shows that targeted, early, low-friction checks can satisfy this condition in real work.

This does not compare the server with protection against every possible failure. It compares the checked server with the same server lacking the relevant check.

## Recommended changes to `DESIGN_PHILOSOPHY.md`

### 1. Make the counterfactual explicit

The relevant comparison is:

> The same task, agent, model, MCP server, file state, and intended operation, with the relevant execution-time check enabled versus absent.

The outcome should be measured through correct completion, not merely until the first API call returns. An unchecked call may return sooner while leaving work that must later be discovered and repaired.

Recommended wording:

> Safer leads to Faster as an expected end-to-end effect. An unchecked action can execute slightly sooner, but execution is not completion if the action leaves the file in a state that must later be diagnosed and repaired. The relevant comparison includes the check, any refusal and retry, and any downstream recovery caused by an error that the unchecked server allowed.

### 2. Refine the second insight

Current formulation:

> Preventing an error costs less than repairing it.

Recommended formulation:

> **For the harmful actions targeted by a well-calibrated check, immediate containment can cost less than downstream recovery.**

Why this is stronger:

- It preserves the intended scope: errors that the server can check.
- It identifies the actual mechanism rather than relying on a slogan.
- It includes the cost of validation, refusals, retries, and false refusals.
- It remains true as a design principle without requiring every individual session to contain an attempted error.
- It recognizes that the value of a check depends on the frequency and repair cost of the error it blocks.

### 3. Separate the three speed mechanisms

The current section compresses prevention, diagnosis, propagation, and rollback into one comparison. Make the mechanisms explicit.

#### A. Immediate containment

The invalid action does not alter the file. No later operation begins from the bad state.

Expected saving:

- no search for the resulting defect;
- no cleanup of affected consumers;
- no reconstruction of the pre-error state; and
- no good later work discarded during rollback.

#### B. Diagnosis while the action is current

The refusal identifies the violated rule while the agent still has the target, parameters, and intended action in context. A structured error can turn an unknown latent defect into a local correction.

Expected saving:

- fewer diagnostic reads;
- fewer speculative repairs;
- fewer blind retries; and
- less human investigation.

This saving depends on the refusal being specific and actionable. An opaque refusal can replace a downstream repair with an expensive guessing loop.

#### C. Prevention of propagation and entanglement

An error that enters a shared artifact may acquire consumers, be duplicated, or be followed by valid edits that make rollback more destructive.

Expected saving:

- fewer affected objects;
- less ambiguity about which later changes depend on the error;
- fewer individually repaired sites; and
- less loss of unrelated good work.

### 4. Replace “one refused call” with a measured-cost description

Current formulation:

> Preventing an error costs one refused call.

Problem:

A refusal includes more than the rejected request. It includes validation latency and the agent's recovery work. A clear error may lead to one corrected attempt, but some refusals require another read, a changed plan, user input, or multiple calls.

Recommended wording:

> Prevention costs the validation itself plus recovery from any refusal. When the error identifies the violated condition and the information needed to proceed, recovery can be one corrected attempt; when the diagnosis is incomplete, it may take longer. These costs belong in the comparison.

### 5. Replace “every error” with the correct causal condition

Current formulation:

> Every error the plugin refuses is a repair that never lands on anyone's schedule.

Problem:

A refused action represents an avoided repair only if:

1. the refusal is correct;
2. the unchecked action would have produced a harmful persistent state; and
3. that state would eventually have required recovery or caused additional work.

Recommended wording:

> Every correctly refused harmful action prevents that action from becoming downstream diagnosis and repair work. Across repeated tasks, the time saved by those preventions can exceed the small cost paid by all checked calls.

### 6. Remove the general “order of magnitude” claim

Current formulation:

> Prevention is still an order of magnitude cheaper.

The current sources do not establish a general tenfold difference for this server's checks. The variable-deletion example plausibly has a very large ratio, but the evidence does not measure both sides under a controlled comparison. Historical defect-cost multipliers are also highly context-dependent.

Recommended replacement:

> For latent, high-fan-out, or difficult-to-reverse errors, downstream recovery can be far more expensive than immediate refusal. The ratio depends on the check and failure mode and should not be generalized without measurement.

If “order of magnitude” is retained anywhere, attach it only to a measured, named error class with documented validation and repair times.

### 7. Keep the Figma variable example, but state exactly what it demonstrates

The broken-variable-reference example is valuable because it is:

- in the same application domain;
- the exact failure prevented by `variable_delete`;
- latent and difficult to enumerate after the fact; and
- capable of affecting many consumers.

It demonstrates a credible **cost asymmetry**, not a measured average speedup. The forum reports establish that downstream cleanup can be large and incomplete. They do not establish how frequently the error occurs, the average cleanup time, or the aggregate net benefit of running the check on every deletion.

Recommended wording:

> The variable-consumer check illustrates the mechanism directly. Before deletion, the plugin can determine whether the variable has consumers and return that diagnosis with the refused call. After an unchecked deletion, the same information is no longer readily available in Figma, and users report hundreds or thousands of orphaned references with incomplete cleanup tooling. This does not quantify the average speedup of the check, but it identifies an error class for which immediate containment is predictably cheaper than reconstructing the affected state later.

### 8. Replace the DORA evidence paragraph

DORA shows that high delivery speed and operational stability can coexist. It does not compare one team with and without a safety check, does not isolate validation as the cause of speed, and does not measure this server's check and recovery costs.

Keep DORA, if desired, as a secondary rebuttal to the claim that speed and stability must trade off. Do not use it as the primary causal evidence for Safer → Faster.

Recommended replacement evidence paragraph:

> Industrial studies have measured the relevant tradeoff more directly. IBM's original inspection study included inspection and rework effort and reported 23% higher coding-operation productivity, together with 38% fewer errors found during later equivalent testing. A field study of 30 software products modeled both the direct overhead of process controls and their indirect savings through improved quality; at the sample average, the estimated quality-mediated savings outweighed the overhead, producing lower net cycle time and development effort. A later observational study used detailed defect and effort records from 35 industrial projects to model static analysis with and without the automated checks; it found that the tools located unique defects at comparatively low find-and-fix cost and estimated a positive operational return. These studies differ from an MCP editing Figma, but they measure the mechanism the philosophy relies on: paying a small, early validation cost can reduce total work by moving detection and correction ahead of downstream testing and repair. ([Methods, limitations, and sources](EVIDENCE.md#section-1-targeted-prevention-can-reduce-total-work).)

### 9. Add explicit boundary conditions

Recommended caveat:

> The saving is an expected effect, not a promise that every checked task finishes sooner. It is zero when no covered error would otherwise occur, largest for errors that are latent, high-fan-out, or hard to reverse, and can become negative if a check is slow, noisy, redundant, or returns an unactionable refusal. This is why checks should be deterministic, narrowly targeted, fast, and paired with diagnostic errors.

This caveat strengthens the principle by making it falsifiable and by explaining the project's emphasis on precise validation and structured recovery.

### 10. Suggested complete replacement section

The following is proposed replacement copy for the existing Safer → Faster section.

---

### Safer leads to Faster

The second insight: **for the harmful actions targeted by a well-calibrated check, immediate containment can cost less than downstream recovery.**

The relevant comparison is the same task and action with the check enabled versus absent. An unchecked call may execute slightly sooner, but execution is not correct completion if the action leaves a defect that must later be discovered and repaired. The comparison therefore includes validation, any refusal and recovery, and any downstream work caused by an error the unchecked server allowed.

The saving comes from three places:

1. **Immediate containment.** A refused action does not alter the file, so later work never begins from the invalid state.
2. **Diagnosis at the boundary.** The error identifies the violated condition while the target, parameters, and intended operation are still current. A local correction replaces later investigation.
3. **No propagation or destructive recovery.** The defect cannot acquire consumers, be duplicated, become entangled with later valid work, or force a rollback that discards good changes.

Variable deletion shows the mechanism in Figma. Figma permits deletion of a variable that layers still reference and provides no complete way to enumerate and repair the resulting broken references. Users report hundreds or thousands of orphaned references and incomplete cleanup. figma-edit-mcp instead scans for consumers before deletion and refuses the action while the relationship can still be identified directly. The scan and refusal have a bounded local cost; reconstructing the affected state after deletion may require distributed manual investigation.

Industrial evidence shows that early checks can produce a net time saving after their overhead is included. IBM's original inspection study reported 23% higher coding-operation productivity after counting inspection and rework effort, together with 38% fewer errors during later equivalent testing. A field study of 30 industrial software products modeled both the direct overhead of process controls and the quality-mediated reduction in rework; at the sample average, the estimated net effect was lower cycle time and effort. An observational study of 35 industrial projects found that automated static analysis identified unique defects with comparatively low find-and-fix effort and modeled a positive operational return. ([Methods, limitations, and sources](EVIDENCE.md#section-1-targeted-prevention-can-reduce-total-work).)

Stated precisely: Safer leads to Faster as an expected end-to-end effect for the failure modes the checks cover. The effect is zero in a task where no covered harmful action would otherwise occur and largest for latent, high-fan-out, or difficult-to-reverse errors. A slow, noisy, or unactionable check can cost more than it saves, so the checks must remain targeted, deterministic, fast, and diagnostic. The magnitude for this MCP server has not yet been measured directly.

---

## Recommended changes to `EVIDENCE.md`

### 1. Change the evidential question

The current Section 1 mostly establishes three different propositions:

1. some downstream failures are expensive;
2. mechanical checks can prevent some shipped defects; and
3. early prevention therefore ought to be cheaper.

Only the third proposition directly supports Safer → Faster, and it requires measuring or modeling both sides of the comparison.

Recommended section title:

## Section 1: Targeted prevention can reduce total work

Recommended introduction:

> This section evaluates the net comparison behind Safer → Faster: the same class of work with a relevant early check versus without it. Evidence is strongest when it includes the cost of the check and recovery as well as downstream defects, rework, effort, or cycle time. Sources that establish only preventability or failure severity are retained as mechanism evidence and labeled accordingly.

### 2. Add Fagan's industrial inspection study as the primary direct evidence

#### Early inspections improved net productivity after their overhead was included

**Method**

Michael Fagan reported production studies of formal design and code inspections at IBM. In one large operating-system component, three designers and thirteen programmers used design, code, and unit-test inspections. The productivity calculation included inspection time, inspection-induced rework, normal coding, and unit testing. Fagan also selected a random post-study production sample after inspections had become routine to reduce the risk that developers performed differently merely because they were being studied.

**Result**

- The inspected process produced a reported **23% increase in coding-operation productivity** relative to the no-inspection case.
- The inspected sample had **38% fewer errors per thousand lines of code** than a walkthrough sample during equivalent later testing.
- The study's first two inspection stages produced estimated net savings of 94 and 51 programmer-hours per thousand lines; a third stage cost an estimated 20 additional hours, demonstrating diminishing returns from an extra gate.

A separate Aetna COBOL project cited in the same paper took 46.5 programmer-days, including inspection meetings, compared with 62 days from the department's standard estimating system. Inspections found 82% of the errors observed through six months of use.

**What this supports**

This is the closest published industrial comparison to the philosophy's mechanism. It counts the prevention activity instead of treating it as free, observes fewer downstream errors, and reports a net productivity improvement.

The unprofitable third inspection is also important: Safer → Faster does not justify unlimited checking. It supports checks whose marginal avoided recovery exceeds their marginal cost.

**Limitations**

- The evidence comes from 1970s IBM and Aetna development environments.
- The operating-system result appears to rely on one representative production sample; modern statistical details are limited.
- The comparator was constructed from production experience rather than a concurrent randomized control.
- The Aetna comparison used an estimating model rather than an observed parallel project.
- Human inspections are slower and broader interventions than automated MCP checks.
- Only coding-operation productivity was measured directly; later lifecycle benefits were inferred from fewer errors.

**Sources**

- Michael E. Fagan, [“Design and Code Inspections to Reduce Errors in Program Development”](https://www.ida.liu.se/~TDDC90/labs/lab-papers/fagan76.pdf), *IBM Systems Journal* 15(3), 1976.
- [DOI: 10.1147/sj.153.0182](https://doi.org/10.1147/sj.153.0182).

### 3. Add the Harter, Krishnan, and Slaughter field study

#### Quality-mediated savings outweighed process overhead in 30 industrial products

**Method**

Harter, Krishnan, and Slaughter examined 30 software products comprising approximately 3.3 million lines of COBOL, developed by one major IT firm from 1984 through 1996. Product quality was measured as lines of code per defect found during independent system and customer-acceptance testing. Cycle time ran from the first day of design through final customer acceptance, and effort included all development stages.

The study modeled:

- process maturity's direct effect on cycle time and effort, representing the cost of disciplined practices and controls; and
- its indirect effect through higher product quality and the resulting reduction in defects and rework.

The models controlled for product size, design complexity, and requirements ambiguity. The authors also ran alternative estimators and tests for correlated errors and endogeneity.

**Result**

At the sample's average values:

- a 1% improvement in process maturity was associated with 1.589% higher product quality;
- a 1% quality improvement was associated with 0.454% lower cycle time and 0.611% lower development effort;
- process maturity had a positive direct cost; but
- after the quality-mediated saving was included, the estimated net effect of a 1% maturity improvement was **0.318% lower cycle time** and **0.175% lower development effort**.

The study estimated that moving an average product from Capability Maturity Model level 1 to level 2 corresponded to 183 fewer calendar days and 23 fewer person-months; moving from level 2 to level 3 yielded smaller additional savings.

**What this supports**

This is the strongest end-to-end field evidence for the net mechanism. It explicitly includes the overhead of quality controls and models the reduction in cycle time and effort mediated by improved quality.

**Limitations**

- This is an observational field study, not a randomized intervention.
- It contains only 30 products from one firm and one mainframe/COBOL application domain.
- Process maturity is a bundle that includes tools, reviews, configuration management, personnel practices, and other process changes. It does not isolate a specific check.
- Time trends, learning, and unmeasured organizational changes may contribute to the association.
- The authors identify diminishing returns and warn that extremely high quality targets may cost more than the resulting cycle-time saving.
- The reported CMM transition estimates are model predictions, not directly observed before-and-after durations for identical products.

**Sources**

- Donald E. Harter, Mayuram S. Krishnan, and Sandra A. Slaughter, [“Effects of Process Maturity on Quality, Cycle Time, and Effort in Software Product Development”](https://pubsonline.informs.org/doi/10.1287/mnsc.46.4.451.12056), *Management Science* 46(4), 2000.
- [DOI: 10.1287/mnsc.46.4.451.12056](https://doi.org/10.1287/mnsc.46.4.451.12056).

### 4. Add the Nichols industrial static-analysis study as the closest automated analogue

#### Automated checks found defects at low operational cost in 35 industrial projects

**Method**

Nichols analyzed detailed activity, effort, defect, fix-time, and size records from 35 completed projects across three organizations. The domains included avionics, business intelligence, and industrial design automation. Different organizations ran commercial or platform-provided static analysis during personal review, compilation, build, or integration.

The observed data calibrated a deterministic Team Software Process model. The model moved defects that had been caught by static analysis into later activities to estimate the counterfactual without the tool.

**Result**

- Individual tools had reported defect-removal yields of roughly 14% to 38%.
- Their find-and-fix rates were among the fastest defect-removal activities.
- In one organization, build-time static analysis corresponded to a modeled 35% reduction in test failures and a change in post-test defect density from 1.9 to 1.2 defects per thousand lines.
- Across the organizations, the model suggested that the checks reduced escaped defects and total development effort at positive marginal operational value.

**What this supports**

This is the closest real-world source to an automated MCP guardrail: normal developers used automated checks inside real workflows, and the analysis included observed remediation effort and estimated later repair work.

**Limitations**

- The no-static-analysis condition was modeled, not observed.
- The model is deterministic and reproduces historical parameters; it does not establish causality.
- Tool use was inconsistent in two organizations.
- The study did not measure false positives or their effect on developer work.
- Licensing, acquisition, training, and external customer costs were excluded.
- It did not directly verify that every remediated finding would have become a later fault.
- It uses organization averages and does not report a controlled project-level speedup.
- The paper appears as an arXiv/ICSE draft rather than a peer-reviewed final publication and should corroborate, not anchor, the argument.

**Source**

- William R. Nichols Jr., [“The Cost and Benefits of Static Analysis During Development: Quantitative Observational Results from Industry”](https://arxiv.org/pdf/2003.03001), 2020.

### 5. Add physical error-proofing as a clearly labeled cross-domain analogue

#### A poka-yoke fixture reduced both errors and assembly time

**Method and result**

Erlandson, Noblett, and Phelps redesigned a fuel-clamp assembly fixture using poka-yoke, or error-proofing, principles. Among the workers studied, the redesign reduced the average error rate from 52% to about 1% while increasing productivity by 80%.

**What this supports**

This is a direct real-world demonstration that removing opportunities for error can improve correctness and throughput simultaneously. It closely matches the philosophy's broad definition of Safer: fewer ways to make an error in the first place.

**Limitations**

- The study involved workers with cognitive impairments performing one physical assembly task.
- The intervention also reduced the task's physical and cognitive demands, so the productivity increase cannot be attributed solely to avoided rework.
- It appears to be a pre/post intervention rather than a randomized controlled trial.
- A redesigned fixture is an analogy to an MCP execution gate, not the same intervention.

**Sources**

- R. F. Erlandson, M. J. Noblett, and J. A. Phelps, [“Impact of a poka-yoke device on job performance of individuals with cognitive impairments”](https://pubmed.ncbi.nlm.nih.gov/9749904/), *IEEE Transactions on Rehabilitation Engineering* 6(3), 1998.
- [DOI: 10.1109/86.712222](https://doi.org/10.1109/86.712222).

### 6. Add evidence for the conditions under which checks remain economical

#### Google's static-analysis platform imposed strict noise and latency limits

Google's Tricorder paper describes why earlier static-analysis deployments failed: poor workflow integration, stale or delayed results, scaling problems, high false-positive rates, and inactionable findings. For checks integrated into builds, Google required essentially zero effective false positives and less than 5% compilation overhead. For review-time findings, it required an effective false-positive rate below 10% and normally expected results in less than 5–10 minutes. Analyzers could be disabled when they consumed excessive resources or annoyed developers.

**What this supports**

This does not measure a net speedup. It provides industrial evidence for the philosophy's boundary conditions: a safeguard contributes to Faster only when its latency, relevance, accuracy, and recovery experience are controlled.

It also supports the project's emphasis on actionable error messages. Tricorder reported that, for one analyzer, 75% of filed bugs came from users misinterpreting the result wording; changing the message or linked documentation addressed the problem.

**Limitations**

- Tricorder surfaces warnings during builds and review rather than blocking Figma mutations.
- The thresholds are Google's operational policies, not universally optimal values.
- Developer clicks and annoyance are imperfect proxies for saved time.

**Sources**

- Caitlin Sadowski et al., [“Tricorder: Building a Program Analysis Ecosystem”](https://research.google.com/pubs/archive/43322.pdf), ICSE 2015.
- [Google Research publication page](https://research.google/pubs/tricorder-building-a-program-analysis-ecosystem/).

### 7. Add counterevidence that fixes the time horizon

#### Industrial TDD reduced defects but increased initial development time

Nagappan and colleagues studied four industrial teams at Microsoft and IBM. Compared with similar non-TDD projects, the TDD projects reported 40% to 90% lower pre-release defect density. The teams also estimated a 15% to 35% increase in initial development time. The authors argued that maintenance savings could offset the initial cost, but they did not measure end-to-end lifecycle time.

**What this supports**

This prevents an invalid inference from “safer output” directly to “shorter initial implementation.” The correct Faster outcome must include a declared horizon. A safeguard can slow initial construction and still reduce lifecycle time, but the latter must be measured rather than assumed.

**Limitations**

- TDD is a development practice, not an execution-time guardrail.
- The comparison projects were not randomized or perfectly matched.
- Development-time increases were subjective estimates.
- Lifecycle maintenance savings were not directly measured.

**Sources**

- Nachiappan Nagappan et al., [“Realizing quality improvement through test driven development: results and experiences of four industrial teams”](https://www.microsoft.com/en-us/research/wp-content/uploads/2009/10/Realizing-Quality-Improvement-Through-Test-Driven-Development-Results-and-Experiences-of-Four-Industrial-Teams-nagappan_tdd.pdf), *Empirical Software Engineering* 13, 2008.
- [DOI: 10.1007/s10664-008-9062-z](https://doi.org/10.1007/s10664-008-9062-z).

### 8. Reclassify the existing Section 1 sources

#### Figma broken-variable references

**Retain as direct domain mechanism evidence.** It demonstrates the exact downstream state that `variable_delete` prevents and shows that repair can be distributed and incomplete.

Do not present the reports as evidence of:

- average repair time;
- error frequency;
- average net speedup;
- a general tenfold ratio; or
- the aggregate return from every check.

#### Foreign-key constraints

**Retain as an engineering precedent and analogy.** Referential integrity shows that blocking deletion of a referenced object is a mature design rule. It does not measure speed.

#### Unity's bad-data incident

**Move to an illustrative failure-cost subsection or remove from the core argument.** It establishes that unvalidated inputs can participate in a costly incident, but:

- the reported $110 million combined the bad-data problem with a separate product fault;
- the avoided validation is unspecified;
- no validation cost or implementation counterfactual was measured; and
- revenue impact is not task-completion time.

It should not carry the net Safer → Faster claim.

#### Static type checking of JavaScript bugs

**Retain as evidence of preventable defect coverage.** The study estimates what proportion of sampled shipped bugs a type checker could detect. It does not measure annotation, checking, false-positive, or lifecycle repair effort and therefore does not establish net speed.

#### SWE-agent's guarded edit command

**Retain as direct agent evidence that a write-time guard can improve task success.** The 18.0% versus 15.0% result compares the same agent interface with and without discarded syntax-invalid edits.

Do not translate that result into shorter task time without timing, token, or cost measurements. It supports safety and completion probability, not a measured Faster outcome.

### 9. Demote DORA to compatibility evidence

Recommended label:

#### DORA: speed and stability can coexist

Recommended interpretation:

> DORA's surveys show that fast delivery and stable operation are not necessarily opposites at the organizational level. They do not establish that adding a safety check to one workflow causes that workflow to become faster.

Do not use the cohort multipliers as evidence for this arrow. The current `EVIDENCE.md` already recognizes the self-report, cohort-comparison, and year-to-year instability problems; the philosophy should apply the same caution.

### 10. Add an explicit evidence hierarchy

Order the Safer → Faster sources as follows:

1. Industrial comparisons that include prevention overhead and downstream productivity or cycle time.
2. Automated-check field evidence with explicit cost modeling.
3. Direct Figma failure-mode evidence.
4. Agent guardrail evidence measuring task success.
5. Cross-domain error-proofing analogies.
6. Compatibility evidence such as DORA.
7. Failure anecdotes, clearly labeled and never used as net-effect measurements.

## Proposed claim-to-evidence map

| Claim in the philosophy | Primary evidence | Evidential status |
|---|---|---|
| Early defect containment can improve net productivity after its overhead is counted | Fagan IBM inspection study | Direct industrial evidence; historical and weakly controlled |
| Quality-mediated rework savings can exceed process-control overhead across a full development cycle | Harter, Krishnan, and Slaughter | End-to-end industrial field model; observational and bundled treatment |
| Automated static checks can find unique defects at lower operational cost than later activities | Nichols, 35 industrial projects | Close automated analogue; modeled counterfactual and non-peer-reviewed draft |
| Removing opportunities for error can improve both correctness and throughput | Poka-yoke assembly study | Direct physical intervention; remote domain and combined mechanisms |
| Checks must control latency, false positives, relevance, and message quality | Google Tricorder | Strong industrial boundary evidence; no net-time comparison |
| `variable_delete` prevents a high-fan-out state that is difficult to reconstruct | Figma user reports plus the tool's consumer scan | Direct failure-mode match; anecdotal repair evidence |
| A write-time guard improves this kind of agent's task success | SWE-agent edit ablation | Direct agent evidence; success rather than completion time |
| Faster and more stable organizations can coexist | DORA | Broad compatibility evidence; not causal support for the arrow |
| Every figma-edit-mcp check makes every individual task faster | No evidence and not required by the principle | Reject |
| The complete check suite reduces expected correct-completion time by a particular amount | No direct evidence yet | Project-specific hypothesis |

## Recommended project-specific evaluation

External evidence justifies Safer → Faster as a design principle. A project-specific evaluation is still needed to measure the size of the effect and identify checks whose marginal cost exceeds their value.

### Experimental comparison

Use a replay harness, simulation, or test-only build with disposable Figma files. Do not weaken the production plugin's guarantees.

For representative task families, compare:

- the normal checked execution path; and
- an instrumented counterfactual in which the same validation runs in shadow mode but the test harness records what would happen without blocking.

Keep constant:

- model and model version;
- agent prompt and available guidance;
- MCP tool schemas;
- starting file snapshot;
- task wording;
- Figma/plugin version; and
- retry, time, and token budgets.

Evaluate both:

1. ordinary tasks where no violation is attempted, which measure pure check overhead; and
2. tasks or seeded situations likely to trigger each covered error class, which measure avoided recovery.

The test distribution must approximate real use. A suite composed only of violations exaggerates the benefit; a suite containing none measures only overhead.

### Measure through correct completion

- independently verified task correctness;
- final file integrity;
- active and wall-clock completion time;
- validation latency by check;
- model turns and tool calls;
- tokens and estimated model cost;
- refusal count and reason;
- calls required to recover from refusal;
- false refusals;
- escaped harmful actions;
- time to detect escaped errors;
- diagnosis and repair operations;
- rollback and good work discarded;
- human intervention; and
- engineering and maintenance cost allocated by check.

### Measure the causal chain

For every refusal in the checked condition, determine:

1. Was the refusal correct?
2. Would the unchecked action have changed the file harmfully?
3. Would the harm have persisted to the end of the task?
4. When would it have been detected?
5. What work was required to diagnose and repair it?
6. Did later work increase its repair cost?

This distinguishes a refusal from an actually avoided repair.

### Report by check and error class

Aggregate results can hide both highly valuable and net-negative checks. Report distributions for:

- target/name verification;
- scope locking;
- variable-consumer checks;
- component-instance protections;
- batch atomicity validation; and
- other safety gates defined in `SAFETY.md`.

For each check, estimate:

> Expected net time saved = expected downstream discovery and recovery avoided − validation latency − refusal recovery − false-refusal cost − allocated upkeep.

The purpose of this expression is not to compare the MCP server with unrelated threats. It compares the same covered operation with and without its check.

### Important controls

- Use disposable copies and never expose user files to the unchecked condition.
- Randomize task and condition order.
- Use multiple representative files and task types.
- Run repeated trials because agent behavior is stochastic.
- Blind correctness and integrity scoring where practical.
- Separate true violations from false refusals.
- Preserve raw transcripts, tool calls, validation timings, and final file states.
- Report medians, tails, and catastrophic recovery cases as well as means.
- Publish null or negative check-level results.

## Recommended final position

After these changes, the documents can make a strong and defensible claim:

> Safer → Faster is supported by industrial evidence that includes prevention overhead and measures downstream productivity, cycle time, or repair effort. The mechanism is direct: a targeted check contains a harmful action while its cause and target are current, preventing later discovery, distributed repair, propagation, and destructive rollback. The saving is an expected end-to-end effect for the failure modes the checks cover, not a claim that every individual checked call is faster. The exact magnitude for figma-edit-mcp remains to be measured.

This formulation is stronger than the current argument because it uses evidence that evaluates the net tradeoff, preserves the exact comparison the philosophy intends, and separates established industrial evidence from the remaining project-specific measurement question.
