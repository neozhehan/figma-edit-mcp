# Supporting Evidence for the Design Philosophy

[DESIGN_PHILOSOPHY.md](DESIGN_PHILOSOPHY.md) rests on four insights and the connections they create between its three goals — Safer, Cleaner, Faster. This document collects the evidence behind them: direct quotes, links to sources, and the caveats that apply to each item. Its structure mirrors the philosophy's: one section for each connection between the goals, and one for the fourth insight, which acts on Faster directly.

Two rules govern this document. First, every quotation was checked against its source; where a source could not be quoted directly, the entry says so. Second, every entry lists its weaknesses. Evidence we examined and rejected is listed at the end, with the reasons.

---

## Safer leads to Cleaner

The first insight: a programmatic check is more reliable than instructing the AI, and it costs less. The entries below measure enforcement against instruction, and one large-scale result shows what sustained prevention does to the cleanliness of the whole environment.

### Enforced output formats versus prompted output formats (OpenAI)

**Supports:** the claim that instructing a model produces probable compliance, while enforcement produces a guarantee.

In its August 2024 "Introducing Structured Outputs in the API" announcement, OpenAI reported the results of its internal evaluation of complex JSON-schema following:

> "On our evals of complex JSON schema following, our new model gpt-4o-2024-08-06 with Structured Outputs scores a perfect 100%. In comparison, gpt-4-0613 scores less than 40%."

The 100% condition constrains the model so that invalid output is impossible; the announcement's accompanying chart shows the sub-40% figure is the "Prompting Alone" condition.

**Source:** [OpenAI: Introducing Structured Outputs in the API](https://openai.com/index/introducing-structured-outputs-in-the-api/) *(the page blocks automated retrieval; the quote was checked against the page in a browser in July 2026.)*

**Caveats:** this is a vendor-run evaluation, and the comparison spans two model generations — a newer model with enforcement against an older model with prompting — so part of the gap comes from model improvement. The direction is still unambiguous: prompting alone never approached the compliance that enforcement made automatic.

### A guardrail on an AI agent's edit command (SWE-agent, NeurIPS 2024)

**Supports:** the claim that a programmatic check on an AI agent's write operations improves the agent's results. This is the closest published analog to this project's design.

The SWE-agent paper built a guarded interface for a coding agent. From the abstract:

> "The ACI uses guardrails to prevent common mistakes, and an agent receives specific, concise feedback about a command's effects at every turn."

The guardrail on the edit command works exactly like a plugin refusal:

> "…we integrate a code linter into the edit function to alert the agent of mistakes it may have introduced when editing a file. Select errors from the linter are shown to the agent along with a snippet of the file contents before/after the error was introduced. Invalid edits are discarded, and the agent is asked to try editing the file again."

The results, from the same paper:

> "Using GPT-4 Turbo as a base LM, SWE-agent solves 12.47% of the 2,294 SWE-bench test tasks, substantially outperforming the previous best resolve rate of 3.8% by a non-interactive, retrieval-augmented system."

The ablation study isolates the guardrail itself: with the linting check, the agent resolved **18.0%** of SWE-bench Lite tasks; with the same edit command but no linting check, **15.0%**:

> "This intervention improves performance considerably (without linting, 15.0% ↓ 3.0)."

The full guarded interface also beat an unguarded shell: "SWE-agent solves 10.7 percentage points more instances than the baseline agent, which uses only the default Linux shell."

The paper's behavioral analysis shows what the guardrail is stopping. Failed edits were common — "out of 2,294 task instances, 1,185 (51.7%) of SWE-agent w/ GPT-4 Turbo trajectories have 1+ failed edits" — and hard to escape: "the odds of recovery decrease as the agent accumulates more failed edits." The authors credit the check: "Linting is beneficial for stymieing cascading errors that often start with an error-introducing edit by the agent." Read this precisely: the guardrail discarded the invalid edits, so the cascade runs through the agent's own trajectory, not through errors persisting in the artifact. It is evidence for checking writes, not for the compounding of errors left in a file — an earlier revision of this document miscategorized it as the latter.

**Source:** [Yang et al., "SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering" (arXiv:2405.15793)](https://arxiv.org/abs/2405.15793)

**Caveats:** the domain is software engineering tasks, and the ablation was measured on the 300-instance SWE-bench Lite subset. The ablation measures task success, not completion time — it supports safety and completion probability, and only indirectly speed.

**Relevance:** the pattern is identical to this plugin's: a program validates the agent's write, discards the invalid write, and returns an error that tells the agent what to fix. The measured result is that the guarded agent completes more work, not less.

### Runtime supervision reduces token waste (SupervisorAgent)

**Supports:** the claim that catching agent mistakes with machinery is cheaper than letting the agent reason its way out of them.

The SupervisorAgent paper ("Stop Wasting Your Tokens") adds a lightweight, LLM-free supervisor that corrects errors and cleans problematic observations during an agent's run. From the abstract, the system:

> "reduces the token consumption of the Smolagent framework by an average of 29.68% without compromising its success rate"

on the GAIA benchmark, with validation across five further benchmarks.

**Source:** [arXiv:2510.26585 — Stop Wasting Your Tokens](https://arxiv.org/abs/2510.26585)

**Caveats:** a research prototype, measured on one agent framework and a specific benchmark family.

### Prevention alone made a large codebase cleaner (Android memory safety)

**Supports:** the claim that Safer preserves Cleaner — and its strongest measurable form: preventing new errors lowers the rate at which errors accumulate, so the whole environment becomes cleaner over time, even without repairing old errors.

In 2019, memory-handling errors caused 76% of Android's security vulnerabilities. Google then adopted "Safe Coding": new code is written in languages whose compilers refuse memory-unsafe code (such as Rust), while the existing C/C++ code is left in place. In September 2024, Google reported the result — memory safety vulnerabilities fell, as The Register quotes the report, "from 76 percent in 2019 to an expected 24 percent by the end of 2024."

Google's explanation of the mechanism:

> "Once we turn off the tap of new vulnerabilities, they decrease exponentially, making all of our code safer."

Old errors are found and fixed over time while new ones stop arriving. Google's data on code age supports this:

> "5-year-old code has a 3.4x (using lifetimes from the study) to 7.4x (using lifetimes observed in Android and Chromium) lower vulnerability density than new code."

And the old code did not need to be rewritten:

> "Based on what we've learned, it's become clear that we do not need to throw away or rewrite all our existing memory-unsafe code."

**Sources:**
- [Google Security Blog: Eliminating Memory Safety Vulnerabilities at the Source (September 2024)](https://security.googleblog.com/2024/09/eliminating-memory-safety-vulnerabilities-Android.html)
- [The Register: Google's Rust belts bugs out of Android in Safe Coding push](https://www.theregister.com/2024/09/25/google_rust_safe_code_android/)
- [BleepingComputer: Google sees 68% drop in Android memory safety flaws over 5 years](https://www.bleepingcomputer.com/news/security/google-sees-68-percent-drop-in-android-memory-safety-flaws-over-5-years/)

**Caveats:** this is Google's own data about its own operating system, and the 24% figure was a projection for the end of 2024 at publication time. The figures are shares of total vulnerabilities, so changes in other vulnerability categories also move the percentage. The mechanism claim rests on Google's cited code-age lifetime data.

**Relevance:** this example supports two of the philosophy's claims at once. First, Safer → Cleaner in the positive direction: prevention applied only to new work reduced the defect share of the entire environment, with no cleanup of the old work required. Second, enforcement over instruction: style guides had instructed C/C++ developers to avoid these same errors for decades; the compiler that refuses the error succeeded where the instructions did not.

---

## Safer leads to Faster

The second insight: preventing an error costs less than repairing it. The philosophy states this as a net comparison — the same task and action with the check enabled versus absent, counting the validation, any refusal and recovery, and any downstream work an unchecked error would have caused. Evidence is strongest when it measures both sides of that comparison. The entries below are ordered accordingly: the domain failure mode first, then industrial comparisons that counted both the overhead and the savings, then a human-facing operational analogue for the conditions a check must meet, then counterevidence that fixes the time horizon, then precedents and illustrations that carry no net-speed weight.

### Deleting an in-use variable in Figma

**Supports:** the cost asymmetry in the philosophy's variable-deletion example: before deletion, the consumer relationship is cheap to check and the diagnosis can ride along with the refusal; after an unchecked deletion, the same information is scattered across the file and cleanup is incomplete. This is mechanism and failure-mode evidence, not a measured average speedup — the reports below do not establish how often the error occurs, the average cleanup time, or the aggregate net benefit of the check.

Figma lets a user delete a variable that layers still use, without a warning. Users on Figma's forum describe what happens afterwards:

> "There's no way to locate all instances of broken variable references."

One user in the same thread reported that Figma's **Detach deleted variables** quick action detached **1,548** variables after a reorganization — and that the cleanup was still incomplete:

> "I ran the command and it did say it detached a ton, however I just clicked on a frame and it was still linked to a deleted variable."

In a second thread reporting the same pattern, Figma's support team confirms there is no automated repair:

> "…we don't have an automatic solution to fix this or a simple way to view which variables come from what collections. But in order to completely remove ghost variables, you'll need to manually remove all instances of those variables from your file."

An external guide documents the same "ghost variable" problem and workaround.

**Sources:**
- [Figma Forum: Make it easier to fix broken variable references](https://forum.figma.com/suggest-a-feature-11/make-it-easier-to-fix-broken-variable-references-33999)
- [Figma Forum: How to clear "Used variables" that don't exist in the file anymore?](https://forum.figma.com/ask-the-community-7/how-to-clear-used-variables-that-don-t-exist-in-the-file-anymore-18616)
- [Delasign: How to remove deleted variables that are still attached in Figma](https://www.delasign.com/blog/figma-detach-deleted-variables/)
- [Figma Help: Create and manage variables and collections](https://help.figma.com/hc/en-us/articles/15145852043927-Create-and-manage-variables-and-collections) — describes the delete action; describes no consumer check or warning.

**Caveats:** these are user reports, not a controlled study. Several independent threads describe the same behavior.

**Relevance:** this is the exact failure that `variable_delete`'s consumer scan prevents. Prevention costs one document scan; the reports above show what the repair costs.

### Early inspections improved net productivity after their overhead was included (Fagan, IBM, 1976)

**Supports:** the net claim directly: the cost of the checking activity was counted, and the checked process still finished faster and produced fewer downstream errors.

Michael Fagan reported production studies of formal design and code inspections at IBM. In the main study, an operating-system component was designed by three programmers and coded by 13; the productivity calculation included inspection time and inspection-induced rework alongside normal coding and unit testing. The inspected sample showed a "23% net increase" in coding productivity, and on quality (both results from the paper's summary figure, which is set in capitals in the original):

> "An inspection sample had 38% fewer errors/K.LOC than a walk-through sample during equivalent testing between post unit test and system test in this study."

The first two inspection stages produced estimated net savings of 94 and 51 programmer-hours per thousand lines of code; a third inspection stage cost a net 20 hours per thousand lines — evidence that additional gates are not automatically worth their cost. A separate application project at Aetna, compared against the department's standard estimating system:

> "…this project would require 62 programmer days. In fact, the time actually taken was 46.5 programmer days including inspection meeting time. The resulting saving in programmer resources was 25 percent."

The paper reports an "inspection error detection efficiency of 82 percent" for that project, measured against all errors found through testing and six months of actual usage.

**Sources:**
- [Michael E. Fagan, "Design and Code Inspections to Reduce Errors in Program Development" (IBM Systems Journal 15(3), 1976, PDF)](https://www.ida.liu.se/~TDDC90/labs/lab-papers/fagan76.pdf)
- [DOI: 10.1147/sj.153.0182](https://doi.org/10.1147/sj.153.0182)

**Caveats:** the evidence comes from 1970s IBM and Aetna development environments; the comparator was constructed from production norms rather than a concurrent randomized control; the Aetna comparison used an estimating model rather than an observed parallel project; human inspections are slower and broader interventions than automated MCP checks; and later-lifecycle benefits were inferred from lower error rates rather than measured end to end.

### Quality-mediated savings outweighed process overhead in 30 industrial products (Harter, Krishnan & Slaughter, 2000)

**Supports:** the net claim end-to-end: disciplined checking practices had a direct cost, and the quality-mediated savings still produced a net reduction in cycle time and effort.

The authors analyzed 30 software products built by one major IT firm over 12 years, measuring process maturity (the SEI Capability Maturity Model), product quality (lines of code per defect found in system and acceptance testing), cycle time (first day of design through final customer acceptance), and total development effort, controlling for product size, design complexity, and requirements ambiguity. Higher maturity predicted higher quality — "a 1% improvement in process maturity is associated with a 1.589% increase in product quality" — and higher quality predicted less downstream work. The net result:

> "At the average values for process maturity and software quality, a 1% improvement in process maturity leads to a 0.32% net reduction in cycle time, and a 0.17% net reduction in development effort (taking into account the positive direct effects and the negative indirect effects through quality)."

The paper estimates that moving the average product from CMM level 1 to level 2 corresponds to "a reduction in cycle time of 183 calendar days and in development effort of 23 person-months", with smaller additional savings from level 2 to level 3.

**Sources:**
- [Harter, Krishnan & Slaughter, "Effects of Process Maturity on Quality, Cycle Time, and Effort in Software Product Development" (Management Science 46(4), 2000)](https://pubsonline.informs.org/doi/10.1287/mnsc.46.4.451.12056)
- [DOI: 10.1287/mnsc.46.4.451.12056](https://doi.org/10.1287/mnsc.46.4.451.12056) *(the journal page is paywalled; the quotes above were checked against the published full text.)*

**Caveats:** an observational field study, not a randomized intervention; 30 products from one firm in one mainframe/COBOL domain; process maturity bundles reviews, tools, configuration management, and personnel practices, so it does not isolate a single check; the direct effect of maturity on cycle time was positive but not statistically significant (p = 0.137); the CMM transition estimates are model predictions rather than observed before-and-after durations; and the authors warn of diminishing returns at higher maturity levels.

### Automated checks found defects at low operational cost in 35 industrial projects (Nichols, 2020)

**Supports:** the closest analogue to an automated write-time guard: ordinary developers running automated checks inside real workflows, with observed remediation effort and modeled later repair.

Nichols analyzed detailed activity, effort, defect, and fix-time records from 35 completed projects in three organizations (avionics, business intelligence, and industrial design automation), then used a Team Software Process model calibrated on the observed data to estimate the counterfactual without static analysis:

> "…the removal yields of a single tool were small, somewhere in the 15%-35% range, and… the find and fix rates were among the fastest of all removal techniques."

(Individual organizations recorded tool yields of 14% and 38%, the endpoints around that summary range.) In one organization, build-time static analysis corresponded to a "substantial reduction (35%) in test failures," and:

> "The defect density after test changed from 1.9 to 1.2 Defects/KLOC."

**Source:** [William R. Nichols Jr., "The Cost and Benefits of Static Analysis During Development" (arXiv:2003.03001, PDF)](https://arxiv.org/pdf/2003.03001)

**Caveats:** the no-tool condition was modeled, not observed; the model is deterministic and does not establish causality; tool use was inconsistent in two of the three organizations; false positives and their cost to developers were not measured; licensing, acquisition, and training costs were excluded; and the paper is an ICSE draft on arXiv rather than a peer-reviewed final publication — it corroborates the argument and should not anchor it.

### Message wording determines whether a check helps (Google Tricorder) — human-facing operational analogue

**Supports:** the operating conditions a check must meet before it contributes to speed at all. The findings are measured on human developers responding to analyzer results, so this is an operational analogue for the plugin's refusals rather than direct evidence about AI agents.

Google's Tricorder paper describes why its earlier static-analysis deployments fell out of use: poor workflow integration, stale or delayed results, scaling problems, high false-positive rates, and inactionable findings. The platform that succeeded enforces strict limits. For checks that run during builds:

> "the effective false positive rate must be essentially zero. They also cannot significantly slow down compiles, so must have < 5% overhead."

For findings shown during code review, Google enforces "a very low effective false positive rate here (< 10%)" and expects "analyses to complete in less than 5 − 10 minutes (ideally much less)". Analyzers can be disabled when they consume excessive resources or annoy developers. And on message wording:

> "for one analyzer 75% of all bugs filed against the tool from Tricorder were due to misinterpretations of the result wording and were fixed by updating the message text and/or linking to additional documentation."

A check helps only when its result is understood: a refusal whose wording sends the reader in the wrong direction converts a cheap early catch into new diagnostic work.

**Sources:**
- [Sadowski et al., "Tricorder: Building a Program Analysis Ecosystem" (ICSE 2015, PDF)](https://research.google.com/pubs/archive/43322.pdf)
- [Google Research publication page](https://research.google/pubs/tricorder-building-a-program-analysis-ecosystem/)

**Caveats:** Tricorder surfaces warnings during builds and code review rather than blocking design-file mutations; the thresholds are Google's operational policies, not universally optimal values; and developer clicks and annoyance are proxies for saved time. It measures the conditions for a check to be worth running, not a net speedup, and it measures humans rather than AI agents.

### Industrial TDD reduced defects but increased initial development time (Nagappan et al., 2008) — counterevidence on the time horizon

**Supports:** the boundary of the claim: "safer output" does not automatically mean "shorter initial implementation." The Faster outcome must name its horizon — a safeguard can slow initial construction and still reduce end-to-end time, but the latter has to be measured rather than assumed.

Four industrial teams at Microsoft and IBM adopted test-driven development:

> "The results of the case studies indicate that the pre-release defect density of the four products decreased between 40% and 90% relative to similar projects that did not use the TDD practice. Subjectively, the teams experienced a 15–35% increase in initial development time after adopting TDD."

The authors argue that maintenance savings could offset the initial cost, but they did not measure end-to-end lifecycle time.

**Sources:**
- [Nagappan et al., "Realizing quality improvement through test driven development" (Empirical Software Engineering 13, 2008, PDF)](https://www.microsoft.com/en-us/research/wp-content/uploads/2009/10/Realizing-Quality-Improvement-Through-Test-Driven-Development-Results-and-Experiences-of-Four-Industrial-Teams-nagappan_tdd.pdf)
- [DOI: 10.1007/s10664-008-9062-z](https://doi.org/10.1007/s10664-008-9062-z)

**Caveats:** TDD is a development practice, not an execution-time guardrail; the comparison projects were not randomized or perfectly matched; the development-time increases were the teams' subjective estimates; and the lifecycle savings were asserted, not measured.

### A poka-yoke fixture reduced both errors and assembly time — cross-domain analogue

**Supports:** the philosophy's broad definition of Safer — fewer ways to make an error in the first place — improving correctness and throughput at the same time.

Erlandson, Noblett, and Phelps redesigned a fuel-clamp assembly fixture using poka-yoke (error-proofing) principles:

> "the workers in this study showed an 80% increase in productivity and an average percent error drop from 52% to about 1%"

**Sources:**
- [Erlandson, Noblett & Phelps, "Impact of a poka-yoke device on job performance of individuals with cognitive impairments" (IEEE Transactions on Rehabilitation Engineering 6(3), 1998)](https://pubmed.ncbi.nlm.nih.gov/9749904/)
- [DOI: 10.1109/86.712222](https://doi.org/10.1109/86.712222)

**Caveats:** the participants were workers with cognitive impairments performing one physical assembly task; the redesign also reduced the task's physical and cognitive demands, so the productivity gain cannot be attributed solely to avoided rework; the design was pre/post rather than randomized; and a physical fixture is an analogy to an execution gate, not the same intervention.

### Precedents and illustrations

The entries below inform the argument but carry no net-speed weight.

#### Foreign-key constraints in relational databases — precedent, not measurement

Blocking the deletion of a referenced object is a mature engineering rule, not an invention of this project. The PostgreSQL documentation defines the rule:

> "A foreign key constraint specifies that the values in a column (or a group of columns) must match the values appearing in some row of another table. We say this maintains the *referential integrity* between two related tables."

And the deletion behavior:

> "RESTRICT is a stricter setting than NO ACTION. It prevents deletion of a referenced row."

**Source:** [PostgreSQL Documentation: Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)

**Caveats:** an analogy, not a measurement. Design files are not databases.

**Relevance:** `variable_delete` applies `ON DELETE RESTRICT` semantics to design tokens: a variable with consumers cannot be deleted.

#### Unity's bad-data incident (2022) — failure-cost illustration

One unvalidated input at a system boundary participated in a very costly incident. The incident does not measure validation cost or task time, so it illustrates failure severity rather than carrying the net claim.

In 2022, Unity Technologies disclosed two related problems in its advertising business. As reported by The Motley Fool:

> "Unity's ML algorithm ingested some bad data from a large customer. Consequently, Unity lost the value of a portion of its training data."

The same article reports that management "estimated an impact on its business of $110 million in 2022, or almost 8% of Unity's full-year 2022 expected revenues of $1.4 billion." Nasdaq's report of the same week — headlined "Why Unity Software Tanked 39% This Week" — attributes the fall to the two problems directly:

> "…since it got bad data from a large customer and made a mistake with its Audience Pinpointer tool, Unity is going to lose $110 million in revenue than it otherwise would have earned in 2022." *(grammar as in the original)*

**Sources:**
- [The Motley Fool: 2 Reasons Unity Software's Virtual World Is Facing a Stark Reality](https://www.fool.com/investing/2022/07/17/2-reasons-unity-softwares-virtual-world-is-facing/)
- [Nasdaq: Why Unity Software Tanked 39% This Week](https://www.nasdaq.com/articles/why-unity-software-tanked-39-this-week)

**Caveats:** the $110 million figure is Unity's own estimate, and it covers the combined effect of two problems — the bad-data ingestion and a separate fault in the Audience Pinpointer tool. Attribute the number to the incident, not to the bad data alone. Revenue impact is not task-completion time.

#### Static type checking prevents shipped bugs — coverage evidence, not net speed

This study estimates what share of shipped defects a mechanical check could have caught. It does not measure annotation effort, checking cost, false positives, or lifecycle repair effort, so it establishes preventable coverage rather than a net speedup.

The ICSE 2017 study "To Type or Not to Type: Quantifying Detectable Bugs in JavaScript" sampled 400 real, fixed bugs from public JavaScript projects on GitHub, added type annotations to each buggy version (spending at most ten minutes per bug), and checked whether a static type checker would have caught the bug before release:

> "Running the binomial test on the results shows that, at the confidence level of 95%, the true percentage of detectable bugs for Flow and TypeScript falls into [11.5%, 18.5%] with mean 15%."

**Sources:**
- [Gao, Bird & Barr, "To Type or Not to Type: Quantifying Detectable Bugs in JavaScript" (ICSE 2017, PDF)](https://earlbarr.com/publications/typestudy.pdf)
- [The Morning Paper: summary and quotes](https://blog.acolyer.org/2017/09/19/to-type-or-not-to-type-quantifying-detectable-bugs-in-javascript/)

Airbnb's engineering team reached a larger figure for its own codebase. As reported by InfoQ:

> "After conducting a postmortem analysis of bugs, Bunge estimated that 38% of bugs in the Airbnb codebase were preventable with TypeScript."

**Sources (Airbnb):** [InfoQ: Airbnb Releases Tool to Convert Large Codebases to TypeScript](https://www.infoq.com/news/2020/08/airbnb-typescript-migration/) — reporting Brie Bunge's "Adopting TypeScript at Scale" talk at JSConf.

**Caveats:** the study covers JavaScript codebases, and the ten-minute annotation cap makes the 15% figure conservative — more annotation effort might have detected more bugs. The Airbnb figure is an internal estimate presented in a conference talk; its methodology is not published.

---

## Cleaner leads to Faster

The third insight: defects, and the inconsistencies they cause, create work for later changes, and combinations of them can compound that cost. "Cleaner" here is not an aesthetic property. The evidence below addresses four measurable characteristics of a working artifact: reusable and current design-system assets, semantic naming, structural comprehensibility, and maintainability during later modification. Together they support a directional claim: task-relevant cleanliness reduces the expected time to complete later work correctly. Entries are ordered by relevance to Figma, then by methodological strength. All of it measures people rather than an AI editing Figma; the agent-specific size of the effect is an open, project-specific question. Two analogies are kept at the end, labeled as illustration rather than evidence.

### A current design system made matched Figma tasks 34% faster

**Supports:** the claim that reusable, current, consistently structured Figma assets reduce design-task completion time. This is the only entry measured in Figma itself.

Figma's research team had designers complete two matched tasks in a bank-account aggregator app — a transaction-viewing screen and an account-connection flow:

> "All designers completed both tasks but were only given access to a design system for one of the two tasks. For the task without a design system we provided old design files that each designer could reference for the task."

> "We found that when participants had access to a design system they completed their objective 34% faster than without a design system."

The mechanisms Figma identifies are the same first two mechanisms the philosophy names: reuse instead of recreation, and less searching through old files. Figma also bounds the result itself:

> "It's important to call out that the design system used in this experiment was directly applicable to the task the designers were given; it was up-to-date and relevant to what they were working on. As a result, we expect that this time-savings finding is the maximum time savings one would find in a real-world scenario."

**Source:** [Figma: Measuring the value of design systems (2019)](https://www.figma.com/blog/measuring-the-value-of-design-systems/)

**Caveats:** an internal vendor study; the article publishes no sample size, uncertainty, or significance testing. Participants chose their own stopping points, so output quality was not independently scored. The comparison is design system versus old reference files; it does not isolate naming, broken references, or duplicate tokens. By Figma's own statement, 34% is a ceiling. It measures human designers, not an editing agent.

### Meaningful names made semantic-defect discovery 19% faster

**Supports:** the first mechanism — semantic names reduce the time required to understand intent and diagnose problems.

Hofmeister, Siegmund, and Holt ran a within-subject experiment — "We conducted an experimental study with 72 professional C# developers, who looked for defects in source-code snippets" — with each snippet's identifiers rendered as full words, abbreviations, or single letters:

> "We found that words lead to, on average, 19% faster comprehension speed compared to letters and abbreviations, but we did not find a significant difference in speed between letters and abbreviations."

The control task shows the effect is semantic, not visual: for syntax errors, which require no understanding of the names, the authors interpret their result as support "that identifier names have at most a negligible effect on finding syntax errors."

**Sources:**
- [Hofmeister, Siegmund & Holt, "Shorter Identifier Names Take Longer to Comprehend" (SANER 2017, PDF)](https://www.se.cs.uni-saarland.de/publications/docs/HoSeHo17.pdf)
- [Extended journal version, Empirical Software Engineering (DOI: 10.1007/s10664-018-9621-x)](https://doi.org/10.1007/s10664-018-9621-x)

**Caveats:** small code snippets (15 lines), not large working artifacts; time-to-find-a-defect is a proxy for comprehension; the participants were human developers; and the measured effect is small to medium (dz = 0.32), not transformative.

### Combinations of structural problems raised comprehension cost; single ones often did not

**Supports:** the compounding half of the third insight — and its honest boundary: one isolated imperfection often costs little.

Politowski and colleagues combined three empirical studies at three universities — "We collect data from 372 tasks obtained thanks to 133 different participants" — measuring task duration, correct answers, and NASA-TLX effort on code with and without Blob and Spaghetti Code antipatterns:

> "…although single occurrences of Blob or Spaghetti code anti-patterns have little effect on code comprehension, two occurrences of either Blob or Spaghetti Code significantly increases the developers' time spent in their tasks, reduce their percentage of correct answers, and increase their effort."

**Sources:**
- [Politowski et al., "A Large Scale Empirical Study of the Impact of Spaghetti Code and Blob Anti-patterns on Program Comprehension" (arXiv:2009.02438)](https://arxiv.org/abs/2009.02438)
- [DOI: 10.1016/j.infsof.2020.106278](https://doi.org/10.1016/j.infsof.2020.106278)

**Caveats:** source code, not a Figma file; most participants came from academic settings; Blob and Spaghetti Code do not map one-to-one onto broken bindings, duplicate tokens, or layer names. The result cuts both ways: it supports compounding and cautions against claiming that every isolated imperfection causes meaningful delay.

### CAD models: communicated design intent reduced later alteration effort

**Supports:** the closest artifact-level analogy — a structured, stateful design model records or obscures its author's intent, and that structure affects the cost of later modification.

An educational study using SolidWorks and Pro/Engineer examined how model attributes affected other people's alteration of the models; properly conveyed design intent was positively associated with retaining the original design and negatively associated with alteration time. A follow-up analyzed models created and altered by 30 practicing product-development engineers; simpler reusable features, reference geometry, and correct feature sequencing improved alterability, and the results showed a tradeoff between initial creation speed and later reuse. *(Both articles are paywalled; the findings are stated without quotation marks, from the published abstracts and secondary reporting.)*

**Sources:**
- ["An educational exercise examining the role of model attributes on the creation and alteration of CAD models" (Computers & Education, DOI: 10.1016/j.compedu.2011.03.018)](https://doi.org/10.1016/j.compedu.2011.03.018)
- ["Analyzing the effect of alternative goals and model attributes on CAD model creation and alteration" (Computer-Aided Design, DOI: 10.1016/j.cad.2011.11.003)](https://doi.org/10.1016/j.cad.2011.11.003)

**Caveats:** mechanical CAD, not interface design; some relationships are correlational rather than randomized; the participants were human; and the tradeoff finding means structure that helps later work can cost more up front.

### Production code: low-maintainability files took far longer to change

**Supports:** large-scale field corroboration that the state of the working artifact is associated with how long later changes take.

Tornhill and Borg: "We analyze 39 proprietary production codebases from a variety of domains using the CodeScene tool based on a combination of source code analysis, version-control mining, and issue information from Jira." Across 30,737 files:

> "…resolving issues in low quality code takes on average 124% more time in development."

> "…already in the Warning category, the average development time for a Jira issue is 78% longer than in Healthy code."

Unpredictability rose too: implementing an issue in the lowest-quality category "might require up to 9 times longer Time-in-Development compared to corresponding changes to Healthy code."

**Sources:**
- [Tornhill & Borg, "Code Red: The Business Impact of Code Quality" (arXiv:2203.04374, PDF)](https://arxiv.org/pdf/2203.04374)
- [DOI: 10.1145/3524843.3528091](https://doi.org/10.1145/3524843.3528091)

**Caveats:** observational, so causality is not established; task-difficulty and organizational confounders remain possible; the code-quality measure is proprietary and one author created it; per-file time is inferred from Jira and commit history rather than observed; the paper reports the average Healthy-versus-lowest-category difference as a small-to-medium effect size (d = 0.45) despite the large percentage; and production software is an adjacent domain, not Figma.

### Technical debt consumed about 23% of developers' time

**Supports:** independent field corroboration that problems embedded in the working artifact create future work.

Besker, Martini, and Bosch: "This study reports the results of a longitudinal study surveying 43 developers and including 16 interviews followed by validation by an additional study using a different and independent dataset…":

> "…developers waste, on average, 23% of their time due to TD and that developers are frequently forced to introduce new TD. The most common activity on which additional time is spent is performing additional testing."

The second finding — existing debt forcing new debt — is the same feedback loop the philosophy describes for design files.

**Sources:**
- ["Software developer productivity loss due to technical debt — A replication and extension study" (Journal of Systems and Software, DOI: 10.1016/j.jss.2019.06.004)](https://doi.org/10.1016/j.jss.2019.06.004)
- [Open-access full text (Chalmers)](https://research.chalmers.se/publication/511450/file/511450_Fulltext.pdf)

**Caveats:** the time loss is self-reported; technical debt is broader and less precisely defined than Cleaner in this philosophy; the study does not isolate naming, duplication, or broken references; and it measures neither Figma nor AI agents.

### Figma's guidance for AI-readable files — transfer rationale, not outcome evidence

**Supports:** the transfer of the mechanism to a model reading a Figma file: Figma itself expects structured files to improve model interpretation and output.

From Figma's developer documentation on structuring files for its MCP server — on components:

> "This is the #1 way to get consistent component reuse in code."

On semantic layer names (replacing defaults like `Frame1268`):

> "This helps the model understand what it's working with, and what functionality it should have."

On Auto Layout, which Figma says "usually results in cleaner, more predictable code," and on the overall goal of producing "code that's clear, consistent, and aligned with your system."

**Source:** [Figma Developer Docs: Structure your Figma file for better code](https://developers.figma.com/docs/figma-mcp-server/structure-figma-file/)

**Caveats:** vendor best-practice guidance, qualitative, with no quantitative benchmark. Do not read it as measured evidence of lower task time, fewer calls, or a quantified Cleaner → Faster effect. (An earlier revision of this document also cited Figma's help-center MCP guide for the same point; that page has since been rewritten as a setup overview and no longer makes it.)

### Analogies, kept for illustration only

Neither entry below measures a structured digital artifact; they carry no evidential weight for the third insight.

**Toyota — stopping work at the first defect.** Toyota describes its production system as built on *jidoka*: when an abnormality is detected, the machine or worker stops the line immediately, so defects are not passed to later stations. A manufacturing principle, offered without measurement. ([Toyota: Toyota Production System](https://global.toyota/en/company/vision-and-philosophy/production-system/))

**A 5S factory case — order reduced search time.** A 2022 case study at a Bangladeshi plastic-bag factory reports that after tools were given fixed, labeled storage places, "the total operational time was reduced by 8% for blowing and 18% for printing," and "the number of customer complaints about printing errors decreased from eight to one." A single factory, before/after with no control group. ([ScienceDirect: Implementation of 5S in a plastic bag manufacturing industry: A case study](https://www.sciencedirect.com/science/article/pii/S2666790822000933))

---

## Cleaner leads to Safer

The philosophy argues this connection from the system's own design rather than from external studies: several protections compare what the AI claims against what the file actually contains, and those comparisons identify a wrong target more reliably when layers carry distinct, meaningful names. The mechanism is internal to the checks, so no external source is cited for it. The nearest external support is the identifier experiment under [Cleaner leads to Faster](#cleaner-leads-to-faster): meaningful names made mismatches easier to detect for the humans measured there, and the plugin's name-verification comparisons benefit from the same property by construction.

---

## Faster: designing tools around decisions

The fourth insight is an interface-design claim:

> **Design tools around decisions, not operations: one model turn should express all work already determined, and one tool result should provide all information needed for the next decision.**

The claim predicts a crossover. When the model can already specify the remaining operations or the rule that determines them, keeping that execution behind one model boundary should reduce coordination cost. When a new observation requires fresh model judgment, removing the boundary should provide no such benefit and may add planning or execution overhead.

"Decision" here means model judgment, not every conditional branch. A program can filter data, repeat a call, compare a value, and choose a branch under a rule the model already supplied. The boundary belongs where the model must interpret a new observation and decide something it could not encode beforehand.

Model turns, MCP invocations, and primitive operations are different units. A host may emit several tool calls from one model turn, and one tool invocation may execute many primitive operations. The evidence below is organized around the substantive distinction: whether another model judgment is needed, and whether the result contains the information that judgment requires. Where an entry reproduces a results table, the figures were checked against the source's published tables in July 2026.

### Direct crossover evidence: programmatic tool calling helped composed work but not short sequential work

**Supports:** the placement rule on both its positive and negative sides.

Anthropic's programmatic tool calling lets a model write code that invokes tools repeatedly, processes intermediate results, and returns only the final output to the model. The tools still execute; the model is simply not re-consulted between calls inside the program. The feature documentation reports three results from Anthropic's internal evaluations on a production Claude model:

> "On a 75-tool project-management agent benchmark, enabling programmatic tool calling reduced billed input tokens by roughly 38% with no change in task accuracy."

> "Across production API traffic, requests whose `tools` array contains 10 to 49 tool definitions see typical token savings of 20% to 40% with programmatic tool calling enabled."

> "On τ²-bench (airline, retail, and telecom domains), where each turn makes one or two sequential tool calls, programmatic tool calling left scores unchanged and cost roughly 8% more. Sequential single-call workflows do not benefit."

Anthropic accordingly identifies fan-out operations and large-result filtering as strong fits, and workflows in which each call depends on Claude reasoning over the preceding result as weak fits.

**Source:** [Anthropic, "Programmatic tool calling"](https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling)

**Caveats:** vendor-reported internal evaluations and production aggregates. The page publishes neither the project-management benchmark nor confidence intervals, and the results measure token savings rather than elapsed task time. Programmatic calling also combines call composition, code execution, and result filtering, so the savings cannot be attributed to boundary placement alone.

**Relevance:** the strongest available evidence for the decision-boundary claim, because the same mechanism helps workloads with composable work and adds cost to workloads with little model mediation to remove.

### Executable composition improved multi-tool success while reducing turns (CodeAct)

**Supports:** the action side — giving one model turn a language capable of expressing composed work.

CodeAct replaces one-operation-at-a-time JSON or text actions with executable Python. On M3ToolEval, the paper's 82-task human-curated multi-tool benchmark, gpt-4-1106-preview achieved (paper's Table 3):

| Action interface | Success rate | Average turns |
|---|---:|---:|
| CodeAct | 74.4% | 5.5 |
| JSON | 52.4% | 7.6 |
| Text | 53.7% | 7.7 |

The same paper supplies a scope check on a separate benchmark. On API-Bank's atomic API calls (Table 2), the same model scored **82.7%** with JSON and **76.7%** with CodeAct. Code syntax was not inherently superior; the CodeAct advantage appeared on the benchmark where multi-tool composition was useful.

**Source:** [Wang et al., "Executable Code Actions Elicit Better LLM Agents" (ICML 2024)](https://proceedings.mlr.press/v235/wang24h.html)

**Caveats:** the multi-tool benchmark contains 82 tasks, the models predate current frontier systems, and turn count is not wall-clock time. CodeAct also changes the action language, not only the number of model boundaries, so it is not a same-task ablation of boundary placement alone.

**Relevance:** an action space that can express composed work improved both interaction count and correct completion, and the atomic-task comparison prevents attributing the result to executable syntax alone.

### Higher-level web tools reduced agent steps while improving success (WALT)

**Supports:** designing tools around task-level decisions instead of low-level interface operations.

WALT exposes deterministic, higher-level website capabilities — such as search, filter, create, edit, and delete — as tools, instead of requiring the agent to perform the corresponding click-and-type sequence. In a VisualWebArena-Classifieds comparison using the same surrounding agent architecture (paper's Table 2):

| Model | Primitive interface | Discovered tools |
|---|---:|---:|
| GPT-4.1 | 7.6 steps, 34.9% success | 6.6 steps, 36.4% success |
| Gemini 2.5 Flash | 10.5 steps, 52.6% success | 8.3 steps, 55.3% success |
| GPT-5-mini | 8.9 steps, 57.5% success | 6.5 steps, 61.5% success |

The engineering happens before the task rather than during it:

> "Tool discovery and optimization happen offline during website exploration, ensuring both efficiency and reliability."

**Sources:** [Prabhu et al., "WALT: Web Agents that Learn Tools" (ICLR 2026)](https://iclr.cc/virtual/2026/poster/10008481); [arXiv:2510.01524](https://arxiv.org/abs/2510.01524)

**Caveats:** agent steps are not wall-clock latency, offline tool construction is not charged to the runtime task, and browser workflows differ from Figma mutation.

**Relevance:** moving already-engineered low-level work behind a task-level tool reduced model-visible steps without trading away task success.

### Direct MCP evidence found the same workload boundary (CE-MCP)

**Supports:** MCP-specific corroboration of the crossover.

The CE-MCP study compared conventional model-mediated MCP orchestration with an architecture in which the model writes code that invokes MCP tools. Across 10 representative MCP servers and 34 tasks, CE-MCP generally reduced tokens, time, and turns while maintaining comparable task quality (scored by GPT-4o-based judges).

Its trace analysis matters more than its aggregate result. Tasks with linear execution chains were, in the paper's words, "handled well by both architectures"; "the CE-MCP is favored in tasks with tree-like or fan-out structures", where the logic can run without repeated model reasoning; and "MCP is favored for tasks with iterative or semantically adaptive structures", where intermediate observations benefit from model interpretation.

The same paper is equally direct about the price of executable orchestration:

> "while CE-MCP significantly reduces token usage and execution latency, it introduces a vastly expanded attack surface."

**Source:** ["From Tool Orchestration to Code Execution: A Study of MCP Design Choices" (arXiv:2602.15945)](https://arxiv.org/html/2602.15945)

**Caveats:** a recent preprint with a small, programmatically synthesized task set and model-judged quality. Its numeric results should not be generalized to figma-edit-mcp, and its security finding means it argues for the boundary mechanism, not for adopting model-generated code execution in this project.

**Relevance:** direct evidence that the useful MCP boundary depends on the semantic structure of the task rather than on call count alone.

### Fusing sequential operations reduced measured task time (LLM-Tool Compiler)

**Supports:** the batch mechanism when primitive operations still execute sequentially — the closest external wall-time test.

The LLM-Tool Compiler was evaluated on a geospatial Copilot platform (the GeoLLM-Engine benchmark). Its fused-only ablation presented several operations as one model-visible action while leaving the underlying tool execution sequential (paper's Table 4). Average task time fell by **14.35–22.50%** across GPT-3.5 configurations and **7.33–9.01%** across GPT-4 configurations (chain-of-thought and ReAct, zero- and few-shot). Concurrent execution produced additional savings, but the fused-only condition shows the saving persisted without making the primitive operations simultaneous.

**Source:** [Singh et al., "An LLM-Tool Compiler for Fused Parallel Function Calling" (arXiv:2405.17438)](https://arxiv.org/abs/2405.17438)

**Caveats:** a domain-specific preprint. The fuser adds its own model call, the GPT-3.5 configurations lost roughly 5.5–8.3 percentage points of task success, and the design does not isolate fusion from the added fuser or the altered tool surface. The percentages cannot be transferred to Figma tasks.

### Filtering results before model re-entry improved both performance and token use

**Supports:** the observation side — returning decision-relevant information rather than unfiltered payloads.

Anthropic evaluated Sonnet 4.6 and Opus 4.6 "with and without dynamic filtering and no other tools enabled" across BrowseComp and DeepSearchQA. Dynamic filtering improved performance by an average of **11%** while using **24%** fewer input tokens. On BrowseComp, Sonnet rose from **33.3% to 46.6%** and Opus from **45.3% to 61.6%**.

**Source:** [Anthropic, "Improved Web Search with Dynamic Filtering"](https://claude.com/blog/improved-web-search-with-dynamic-filtering)

**Caveats:** a vendor evaluation of search, not mutation tools, and it does not report wall-clock latency. The filtering mechanism can itself execute multiple queries and transformations. The efficiency result is also not uniform: the post reports that "price-weighted tokens decreased for Sonnet 4.6 on both benchmarks but increased for Opus 4.6", so fewer input tokens did not always mean lower total cost.

**Relevance:** less context and better decisions occurred together — consistent with filtering enough irrelevant material while retaining what the tasks required.

### Admissible alternatives — not formatting alone — produced the large recovery gain

**Supports:** what a refusal must return for the next decision.

"Structured Feedback Improves Repair in an LLM Agent Loop" compared four feedback policies on the same 50 TextWorld games per model, under the same four-call budget. "Admissible alternatives" are the study's term for the actions the validator would have accepted. From the paper's primary results table:

| Feedback | Qwen solved | Llama solved |
|---|---:|---:|
| Raw diagnostic | 14/50 | 8/50 |
| Failure location + observed value | 18/50 | 9/50 |
| Location + observation + alternatives, in prose | 35/50 | 29/50 |
| The same repair information in typed fields | 36/50 | 29/50 |

Location and observed value alone stayed near the raw baseline; the paper's ablations place "most of the gain in the admissible alternatives", and it reports that "TypedFields improves over RawDiag by 44 points for Qwen (95% interval 28–60)" and "by 42 points for Llama (28–56)". Prose and keyed fields carrying approximately the same information performed similarly.

**Source:** ["Structured Feedback Improves Repair in an LLM Agent Loop" (arXiv:2607.14167)](https://arxiv.org/html/2607.14167)

**Caveats:** a July 2026 preprint using 50 synthetic games and two relatively small, quantized models (Qwen2.5-Coder-14B-Instruct-AWQ and Llama-3.1-8B-Instruct in 4-bit form). The keyed and prose conditions are closely matched but not punctuation-identical. The mechanism applies only when the validator can detect the failure and expose useful alternatives.

**Relevance:** the matched ablation points to an informational mechanism: supplying the choices required for the next decision mattered far more than JSON syntax alone.

### Counterevidence: smaller tool results can increase total cost and failures

**Supports:** "decision-complete," and rejects "shortest possible result."

"Token Reduction Is Not Cost Reduction" ran, in its own words, "a pre-specified, hash-frozen, paired campaign of 2,908 provider-billed Claude Code runs, of which 2,848 were analyzed, covering 103 tasks, seven repositories, and three models". On compression:

> "An arm that removed 38% of estimated raw tool-output tokens incurred 6.8% higher paired cost (95% CI: +2.8% to +11.3%)"

And in a separate 40-task experiment, "on SWE-bench-derived Go tasks, compression reduced successful patch application from 27/40 to 15/40 by corrupting verbatim edit anchors" — the compressed results no longer contained the exact text the next edit operation needed.

**Source:** ["Token Reduction Is Not Cost Reduction: An Empirical Study of End-to-End Efficiency in API-Based Coding Agents" (arXiv:2607.12161)](https://arxiv.org/abs/2607.12161)

**Caveats:** a recent preprint. The cost result and the patch-application result come from different experimental components, and the latter is a small single-shot study.

**Relevance:** the necessary negative case for result design — a result should omit irrelevant material, not information the next action depends on.

### Production deployment: Cloudflare returns decision-oriented error contracts

**Supports:** a real deployment of compact, actionable refusal information.

Cloudflare deployed RFC 9457 error representations extended with machine-readable fields — `error_code`, `error_name`, `error_category`, `retryable`, `retry_after`, and `owner_action_required`:

> "The YAML frontmatter is the critical layer for automation. It lets an agent extract stable keys without scraping HTML or guessing intent from copy."

For its live error 1015 example, the representations contained:

| Representation | Tokens |
|---|---:|
| Browser-oriented HTML | 14,252 |
| Markdown | 221 |
| JSON | 256 |

**Source:** [Cloudflare, "Slashing agent token costs by 98% with RFC 9457-compliant error responses"](https://blog.cloudflare.com/rfc-9457-agent-error-pages/)

**Caveats:** Cloudflare measured representation size, not agent retries, wall-clock recovery, or task completion. The deployment demonstrates an architecture, not its end-to-end speed effect.

**Relevance:** a production example of returning the facts needed to decide whether to retry, wait, change the request, or involve the resource owner.

### Mature systems batch known work and synchronize for dependencies

**Supports:** the same boundary rule outside LLM agents.

PostgreSQL pipeline mode lets a client send multiple known statements without waiting for each preceding result, and its documentation states the stopping rule and the arithmetic explicitly:

> "Pipeline mode is not useful when information from one operation is required by the client to produce the next operation. In such cases, the client would have to introduce a synchronization point and wait for a full client/server round-trip to get the results it needs."

> "A 100-statement operation run on a server 300 ms round-trip-time away would take 30 seconds in network latency alone without pipelining; with pipelining it may spend as little as 0.3 s waiting for results from the server."

Amazon Simple Workflow Service uses a corresponding decision architecture. Its developer guide states that "every time a state change occurs for a workflow execution, Amazon SWF schedules a decision task"; a decider interprets the delivered history and returns a list of decisions; and pending work accumulates rather than interleaving — "decision tasks are batched in the sense that, if multiple activities complete while a decider is processing a decision task, Amazon SWF will create only a single new decision task to account for the multiple task completions."

**Sources:** [PostgreSQL, "Pipeline Mode"](https://www.postgresql.org/docs/current/libpq-pipeline-mode.html); [Amazon SWF, "Developing deciders"](https://docs.aws.amazon.com/amazonswf/latest/developerguide/swf-dg-dev-deciders.html)

**Caveats:** PostgreSQL's comparison is round-trip arithmetic rather than an end-to-end application benchmark, and the same page documents the costs: more complex clients, higher memory use, and trickier error recovery. Pipeline mode also synchronizes whenever the client needs a value to construct the next statement, even when deterministic client code — not semantic judgment — would process that value. Amazon SWF documents an operating architecture but publishes no before-and-after speed measurement here. Neither system contains an LLM.

**Relevance:** mature precedents for batching known work and returning at information dependencies — partial analogues, not proof of the finer model-judgment boundary.

### Secondary corroboration

The following evidence remains useful but no longer leads the section:

- **Self-Debugging:** execution and unit-test feedback improved code repair — corroboration that environment feedback can improve the next judgment. Its strongest round-trip result (feedback matching more than 10× candidate sampling) compares against independent candidate generation, not sequential retries. ([Chen et al., ICLR 2024](https://arxiv.org/abs/2304.05128))
- **SWE-agent search ablation:** summarized search results achieved 18.0% success on SWE-bench Lite, human-style iterative search 12.0%, and no search tool 15.7% — evidence that observation shape affects later decisions, but not a latency or sufficiency experiment. ([Yang et al., NeurIPS 2024](https://arxiv.org/abs/2405.15793))
- **Wu et al. and EASYTOOL:** refining and standardizing tool instructions reduced redundant or malformed calls — request-legibility evidence, but both interventions change several aspects of the contract at once and do not isolate decision boundaries. ([Wu et al., ACL 2025](https://aclanthology.org/2025.findings-acl.1149/); [Yuan et al., NAACL 2025](https://aclanthology.org/2025.naacl-long.44/))
- **ProMCP:** shows that planning, schema injection, and final synthesis can dominate latency in some MCP topologies — cost-profile background, not an intervention that tests where a boundary should be placed. ([Anjum et al., ACL 2026](https://aclanthology.org/2026.findings-acl.1967/))
- **LLMCompiler:** dependency-graph execution implements a compatible principle and reports large gains on parallel tasks, but planner changes and concurrent execution confound the causal mechanism. Its WebShop slowdown remains useful counterevidence against assuming consolidation is free. ([Kim et al., ICML 2024](https://proceedings.mlr.press/v235/kim24y.html))
- **Microsoft Agent Framework CodeAct demonstration:** with the same model, prompt, output schema, and tools, one reported run fell from 27.81 to 13.23 seconds and from 6,890 to 2,489 tokens when only the orchestration wiring changed. Microsoft states plainly that "the benchmark above is one data point" from an alpha package, and its guidance keeps operations whose side effects require individual approval as direct tool calls. ([Microsoft Agent Framework](https://devblogs.microsoft.com/agent-framework/codeact-with-hyperlight/))

### What the evidence supports

The evidence supports the following mechanism:

- An action interface can reduce model-visible coordination when it lets the model express composed operations or deterministic decision logic in one turn.
- The benefit has a boundary: when an intermediate observation requires fresh semantic judgment, hiding that observation from the model may not help and can add cost.
- At a necessary model boundary, selecting decision-relevant information can improve both efficiency and correct completion.
- "Decision-relevant" is not synonymous with "short." Removing action-critical facts can increase total cost and failure.

The evidence does **not** establish:

- That the fewest tool calls, model turns, or output tokens is always optimal.
- That every figma-edit-mcp batch makes a task faster.
- A percentage speedup for Figma editing.
- That every decision-complete error produces a successful next attempt.
- That arbitrary model-generated code execution — or collapsing per-operation safety and approval boundaries — is appropriate for figma-edit-mcp.
- That results from search, read/compute, browser, or synthetic tasks transfer unchanged to safety-constrained, side-effecting Figma mutations.

The strongest defensible external conclusion is:

> **Tool-mediated tasks can benefit when already-determined work stays behind one model boundary and when the next boundary returns the information required for the judgment that follows. The gain can disappear or reverse when consolidation hides a genuine semantic dependency or when result reduction removes action-critical information.**

---

## Evidence we considered and did not use

- **Boehm's defect-cost curve (the "1:10:100 rule" — a bug costs 10× to 100× more to fix in later phases).** This figure is widely quoted and weakly sourced. Laurent Bossavit's *[The Leprechauns of Software Engineering](https://leanpub.com/leprechauns)* traces the citation chain and finds little primary data behind it, and the 2016 empirical study by Menzies et al., "Are Delayed Issues Harder to Resolve? Revisiting Cost-to-Fix of Defects throughout the Lifecycle," largely failed to reproduce the effect. The philosophy states no general cost multiplier for prevention; the Safer leads to Faster section instead cites studies that counted both the prevention overhead and the downstream effort.
- **The iSixSigma 5S anecdote (a finance report reduced from three hours to ten minutes).** The [source](https://www.isixsigma.com/5s/case-study-5s-in-practice/) describes an unnamed team with no company, timeframe, or data — a teaching illustration, not evidence.
- **DORA's speed-and-stability findings as causal support for Safer → Faster.** DORA's yearly surveys find that the fastest-shipping teams also run the most stable systems — compatibility evidence that speed and stability are not opposites at the organizational level. They do not compare a workflow with and without a safety check, so they cannot carry the causal claim, and the philosophy no longer cites them. The cohort multipliers (973×, 6,570×) are additionally self-reported, best-versus-worst comparisons whose values swing between report years. ([DORA metrics guide](https://dora.dev/guides/dora-metrics/); [Google Cloud: 2021 Accelerate State of DevOps report announcement](https://cloud.google.com/blog/products/devops-sre/announcing-dora-2021-accelerate-state-of-devops-report))
- **Gartner's data-quality figures (a $12.9 million average annual cost; 59% of organizations not measuring data quality).** Previously cited as directional support for Cleaner → Faster. The methodology behind the figures is not published, organizational data quality is remote from design-file cleanliness, and as of July 2026 the 59% figure no longer appears on [Gartner's page](https://www.gartner.com/en/data-analytics/topics/data-quality) at all — only the $12.9 million sentence remains. A figure that cannot be traced or re-verified should not carry a causal claim.
- **SlopCodeBench (coding agents degrade over long-horizon iterative tasks).** The closest emerging agent-side evidence for the third insight: it tracks duplication, structural erosion, correctness, and cost as agents iterate on a growing codebase, and finds quality declining across checkpoints. It does not cleanly isolate Cleaner → Faster — later checkpoints are also intrinsically harder, quality and task progression change together, and quality-focused prompts improved structural metrics without improving solve rates. We treat it as motivation to measure maintainability and later-task cost together, not as proof of the causal arrow. ([Orlanski et al., arXiv:2603.24755](https://arxiv.org/pdf/2603.24755))
- **Self-Repair ("Is Self-Repair a Silver Bullet for Code Generation?", ICLR 2024).** Previously cited under Faster for error-message quality. Its diagnosis — "self-repair is bottlenecked by the model's ability to provide feedback on its own code" — still motivates informative refusals, but its strongest quantitative result (1.58× more successful repairs) came from replacing the model's feedback with an experienced human programmer's, an upper bound a tool cannot ship. The matched ablation in "Structured Feedback Improves Repair" (see the Faster section) isolates tool-generatable feedback conditions directly, so it carries the recovery claim instead. ([Olausson et al., arXiv:2306.09896](https://arxiv.org/abs/2306.09896))
- **Anthropic's qualitative tool-author guidance ("Writing effective tools for AI agents").** Previously cited under Faster for schema and error-response design ("Even small refinements to tool descriptions can yield dramatic improvements."). The advice remains sound and informed this project's contract, but its before-and-after charts publish no figures, and Anthropic's measured results now in the Faster section — programmatic tool calling and dynamic filtering — make the same points with published numbers. ([Anthropic Engineering](https://www.anthropic.com/engineering/writing-tools-for-agents))
