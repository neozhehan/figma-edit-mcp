# Supporting Evidence for the Design Philosophy

[DESIGN_PHILOSOPHY.md](DESIGN_PHILOSOPHY.md) rests on four insights and the connections they create between its three goals — Safer, Cleaner, Faster. This document collects the evidence behind them: direct quotes, links to sources, and the caveats that apply to each item. Sections 1, 2, 3, and 5 below correspond to the four insights; section 4 holds the evidence for how the goals relate.

Two rules govern this document. First, every quotation was checked against its source; where a source could not be quoted directly, the entry says so. Second, every entry lists its weaknesses. Evidence we examined and rejected is listed at the end, with the reasons.

---

## Section 1: Preventing an error costs less than repairing it

### Deleting an in-use variable in Figma

**Supports:** the claim that Figma provides few repair tools, so the cost of repairing a reference error is high and sometimes unbounded.

Figma lets a user delete a variable that layers still use, without a warning. Users on Figma's forum describe what happens afterwards:

> "There's no way to locate all instances of broken variable references."

One user in the same thread reported that Figma's **Detach deleted variables** quick action detached **1,548** variables after a reorganization — and that the cleanup was still incomplete:

> "I ran the command and it did say it detached a ton, however I just clicked on a frame and it was still linked to a deleted variable."

A second thread reports the same pattern, with Figma community support advising that when the quick action does not work, users must review the file manually. An external guide documents the same "ghost variable" problem and workaround.

**Sources:**
- [Figma Forum: Make it easier to fix broken variable references](https://forum.figma.com/suggest-a-feature-11/make-it-easier-to-fix-broken-variable-references-33999)
- [Figma Forum: How to clear "Used variables" that don't exist in the file anymore?](https://forum.figma.com/ask-the-community-7/how-to-clear-used-variables-that-don-t-exist-in-the-file-anymore-18616)
- [Delasign: How to remove deleted variables that are still attached in Figma](https://www.delasign.com/blog/figma-detach-deleted-variables/)
- [Figma Help: Create and manage variables and collections](https://help.figma.com/hc/en-us/articles/15145852043927-Create-and-manage-variables-and-collections) — describes the delete action; describes no consumer check or warning.

**Caveats:** these are user reports, not a controlled study. Several independent threads describe the same behavior.

**Relevance:** this is the exact failure that `variable_delete`'s consumer scan prevents. Prevention costs one document scan; the reports above show what the repair costs.

### Foreign-key constraints in relational databases

**Supports:** the claim that refusing to delete a referenced item is a long-established engineering rule, not an invention of this project.

The PostgreSQL documentation defines the rule:

> "A foreign key constraint specifies that the values in a column (or a group of columns) must match the values appearing in some row of another table. We say this maintains the *referential integrity* between two related tables."

And the deletion behavior:

> "RESTRICT is a stricter setting than NO ACTION. It prevents deletion of a referenced row."

**Source:** [PostgreSQL Documentation: Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)

**Caveats:** this is an analogy, not a measurement. Design files are not databases.

**Relevance:** `variable_delete` applies `ON DELETE RESTRICT` semantics to design tokens: a variable with consumers cannot be deleted.

### Unity's bad-data incident (2022)

**Supports:** the claim that one unvalidated input at a system boundary can cost far more to repair than to prevent.

In 2022, Unity Technologies disclosed two related problems in its advertising business. As reported by The Motley Fool:

> "Unity's ML algorithm ingested some bad data from a large customer. Consequently, Unity lost the value of a portion of its training data."

The same article reports that management "estimated an impact on its business of $110 million in 2022, or almost 8% of Unity's full-year 2022 expected revenues of $1.4 billion." Unity cut its revenue-growth guidance from 36% to 26%, and the stock fell roughly 37% in the week after the announcement.

**Sources:**
- [The Motley Fool: 2 Reasons Unity Software's Virtual World Is Facing a Stark Reality](https://www.fool.com/investing/2022/07/17/2-reasons-unity-softwares-virtual-world-is-facing/)
- [Nasdaq: Why Unity Software Tanked 39% This Week](https://www.nasdaq.com/articles/why-unity-software-tanked-39-this-week)

**Caveats:** the $110 million figure is Unity's own estimate, and it covers the combined effect of two problems — the bad-data ingestion and a separate fault in the Audience Pinpointer tool. Attribute the number to the incident, not to the bad data alone.

**Relevance:** validating data at the point of ingestion would have been a routine engineering cost. The repair — discarding corrupted training data and rebuilding models — took months and consumed roughly 8% of expected annual revenue.

### Static type checking prevents shipped bugs

**Supports:** the claim that a mechanical check, written once, prevents a measurable share of the errors that otherwise ship and must be repaired.

The ICSE 2017 study "To Type or Not to Type: Quantifying Detectable Bugs in JavaScript" sampled 400 real, fixed bugs from public JavaScript projects on GitHub, added type annotations to each buggy version (spending at most ten minutes per bug), and checked whether a static type checker would have caught the bug before release:

> "Running the binomial test on the results shows that, at the confidence level of 95%, the true percentage of detectable bugs for Flow and TypeScript falls into [11.5%, 18.5%] with mean 15%."

**Sources:**
- [Gao, Bird & Barr, "To Type or Not to Type: Quantifying Detectable Bugs in JavaScript" (ICSE 2017, PDF)](https://earlbarr.com/publications/typestudy.pdf)
- [The Morning Paper: summary and quotes](https://blog.acolyer.org/2017/09/19/to-type-or-not-to-type-quantifying-detectable-bugs-in-javascript/)

Airbnb's engineering team reached a larger figure for its own codebase. As reported by InfoQ:

> "After conducting a postmortem analysis of bugs, Bunge estimated that 38% of bugs in the Airbnb codebase were preventable with TypeScript."

**Sources (Airbnb):** [InfoQ: Airbnb Releases Tool to Convert Large Codebases to TypeScript](https://www.infoq.com/news/2020/08/airbnb-typescript-migration/) — reporting Brie Bunge's "Adopting TypeScript at Scale" talk at JSConf.

**Caveats:** the study covers JavaScript codebases, and the ten-minute annotation cap makes the 15% figure conservative — more annotation effort might have detected more bugs. The Airbnb figure is an internal estimate presented in a conference talk; its methodology is not published.

**Relevance:** every bug in the study's sample was a bug that shipped and later required a human to diagnose and fix. A check at the boundary would have converted 15% of those repairs — 38% by Airbnb's own estimate — into immediate, cheap rejections.

---

## Section 2: A programmatic check is more reliable than instructing the AI

### Enforced output formats versus prompted output formats (OpenAI)

**Supports:** the claim that instructing a model produces probable compliance, while enforcement produces a guarantee.

In its August 2024 "Introducing Structured Outputs in the API" announcement, OpenAI reported the results of its internal evaluation of complex JSON-schema following: `gpt-4o-2024-08-06` with Structured Outputs (the system constrains the model so that invalid output is impossible) scored **100%**, while `gpt-4-0613` relying on prompting alone scored **less than 40%**.

**Source:** [OpenAI: Introducing Structured Outputs in the API](https://openai.com/index/introducing-structured-outputs-in-the-api/) *(the announcement page blocks automated retrieval, so the figures above are stated without quotation marks; they appear in the announcement's headline chart and are widely reproduced.)*

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

**Source:** [Yang et al., "SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering" (arXiv:2405.15793)](https://arxiv.org/abs/2405.15793)

**Caveats:** the domain is software engineering tasks, and the ablation was measured on the 300-instance SWE-bench Lite subset.

**Relevance:** the pattern is identical to this plugin's: a program validates the agent's write, discards the invalid write, and returns an error that tells the agent what to fix. The measured result is that the guarded agent completes more work, not less.

### Runtime supervision reduces token waste (SupervisorAgent)

**Supports:** the claim that catching agent mistakes with machinery is cheaper than letting the agent reason its way out of them.

The SupervisorAgent paper ("Stop Wasting Your Tokens") adds a lightweight, LLM-free supervisor that corrects errors and cleans problematic observations during an agent's run. From the abstract, the system:

> "reduces the token consumption of the Smolagent framework by an average of 29.68% without compromising its success rate"

on the GAIA benchmark, with validation across five further benchmarks.

**Source:** [arXiv:2510.26585 — Stop Wasting Your Tokens](https://arxiv.org/abs/2510.26585)

**Caveats:** a research prototype, measured on one agent framework and a specific benchmark family.

---

## Section 3: Errors in a design file compound

### An AI agent's own errors compound (SWE-agent behavioral analysis)

**Supports:** the claim that uncorrected errors make later errors more likely — measured directly on an AI agent.

The SWE-agent paper analyzed its agent's failure behavior across the full benchmark:

> "…out of 2,294 task instances, 1,185 (51.7%) of SWE-agent w/ GPT-4 Turbo trajectories have 1+ failed edits. While agents generally recover more often than not from failed edits, the odds of recovery decrease as the agent accumulates more failed edits."

And on why the guardrail matters:

> "Linting is beneficial for stymieing cascading errors that often start with an error-introducing edit by the agent."

**Source:** [Yang et al., SWE-agent (arXiv:2405.15793)](https://arxiv.org/abs/2405.15793)

**Caveats:** measured on coding tasks, not design files. The mechanism — each uncorrected error lowers the chance of recovering from the next — is what the philosophy claims for design files.

### Figma's guidance for AI-readable files

**Supports:** the claim that an inconsistent file misleads an AI, and a structured file helps it.

From Figma's developer documentation on structuring files for its own MCP server — on components:

> "This is the #1 way to get consistent component reuse in code."

On semantic layer names (replacing defaults like `Frame1268`):

> "This helps the model understand what it's working with, and what functionality it should have."

On Auto Layout, which Figma says "usually results in cleaner, more predictable code," and on the overall goal of producing "code that's clear, consistent, and aligned with your system." Figma's help-center guide makes the same point: structured files with organized components and variables yield the best results.

**Sources:**
- [Figma Developer Docs: Structure your Figma file for better code](https://developers.figma.com/docs/figma-mcp-server/structure-figma-file/)
- [Figma Help: Guide to the Figma MCP server](https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server)

**Caveats:** vendor best-practice guidance, qualitative. No quantitative benchmark accompanies it.

### Stopping work at the first defect (Toyota)

**Supports:** the claim that a defect caught where it occurs costs less than a defect that travels downstream.

Toyota describes its production system as built on *jidoka*: when an abnormality is detected, the machine or worker stops the line immediately, so that defective products are not produced and defects are not passed to later stations. Toyota frames the whole system around eliminating waste (*muda*), inconsistency (*mura*), and overburden (*muri*).

**Source:** [Toyota: Toyota Production System](https://global.toyota/en/company/vision-and-philosophy/production-system/)

**Caveats:** an analogy from manufacturing, offered as a principle rather than a measurement.

### A measured example of order producing speed (5S case study)

**Supports:** the claim that a consistent, organized working environment reduces time spent searching.

A 2022 case study of the 5S workplace-organization method at a plastic-bag factory in Bangladesh reports that after tools were given fixed, labeled storage places, total operational time fell **8%** in the blowing operation and **18%** in the printing operation, mostly by eliminating time spent searching for tools. Customer complaints about printing fell from eight to one across three months of before/after data.

**Source:** [ScienceDirect: Implementation of 5S in a plastic bag manufacturing industry: A case study](https://www.sciencedirect.com/science/article/pii/S2666790822000933)

**Caveats:** a single factory, a before/after comparison without a control group. Illustrative rather than conclusive.

### The cost of unclean data (Gartner) — directional only

Gartner's data-quality research page states that poor data quality costs organizations an average of at least **$12.9 million per year** (2020 research), and that **59%** of organizations do not measure data quality at all.

**Source:** [Gartner: Data Quality — Why It Matters and How to Achieve It](https://www.gartner.com/en/data-analytics/topics/data-quality)

**Caveats:** the methodology behind the figure is not published. Treat it as directional support that unclean shared data is expensive, not as a precise number.

---

## Section 4: How the three goals relate

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

### DORA: speed and stability are not a trade-off

**Supports:** the claim that safety and speed are not opposites over a whole working session, even though each individual check adds a small delay.

Google Cloud's summary of the 2021 Accelerate State of DevOps report (the DORA research program) states:

> "elite performers deploy 973x more frequently than low performers, have a 6570x faster lead time to deploy, a 3x lower change failure rate, and an impressive 6570x faster time-to-recover from incidents when failure does happen."

**How this project uses it:** the philosophy cites only the qualitative finding — the teams that ship fastest also run the most stable systems, so speed and stability rise together. We deliberately do **not** cite the multipliers as support, for three reasons: the figures come from self-reported surveys; they compare the best cohort against the worst cohort, which says nothing about what happens when one team adds safety checks; and the multipliers swing widely between report years, which signals sensitivity to how the cohorts are defined.

**Sources:**
- [DORA: DORA Metrics guide](https://dora.dev/guides/dora-metrics/)
- [Google Cloud Blog: Announcing the 2021 Accelerate State of DevOps Report](https://cloud.google.com/blog/products/devops-sre/announcing-dora-2021-accelerate-state-of-devops-report)

---

## Section 5: First-call correctness and one-round-trip recovery

The fourth insight holds that an AI spends its working time in reasoning cycles, so a task finishes fastest when it needs the fewest of them: few calls per task (batch operations), a correct call on the first try (first-call correctness), and a one-step fix when a call fails (one-round-trip recovery). The evidence below covers first-call correctness and one-round-trip recovery; the case for batch operations rests on the structure of the system itself rather than on external studies. The limiting case of first-call correctness — enforcement that makes an invalid call impossible — is the OpenAI Structured Outputs entry in Section 2.

### Informative feedback converts blind retries into fixes (Self-Debugging)

**Supports:** one-round-trip recovery — an error that explains the failure lets the model fix it immediately.

The ICLR 2024 paper "Teaching Large Language Models to Self-Debug" measured what happens when a model's failed code comes back with execution and unit-test feedback instead of nothing. On text-to-SQL:

> "Self-Debugging with code explanation consistently improves the baseline by 2-3%, and improves the prediction accuracy on problems of the hardest level by 9%."

On code translation and generation:

> "Self-Debugging improves the baseline accuracy by up to 12%."

And on round-trip economics — self-debugging with feedback:

> "can match or outperform baseline models that generate more than 10x candidate programs"

**Source:** [Chen et al., "Teaching Large Language Models to Self-Debug" (arXiv:2304.05128, ICLR 2024)](https://arxiv.org/abs/2304.05128)

**Caveats:** code-generation benchmarks; the feedback there comes from executing the code, which a design tool must approximate with informative error messages instead.

**Relevance:** one informative error replaces many blind retries. The plugin's refusal messages are written to carry that information.

### The diagnosis must come from the environment (Self-Repair)

**Supports:** one-round-trip recovery — the model cannot reliably work out on its own why a call failed, so the error message must do the diagnosing.

The ICLR 2024 paper "Is Self-Repair a Silver Bullet for Code Generation?" examined models repairing their own failed code. From the abstract:

> "self-repair is bottlenecked by the model's ability to provide feedback on its own code"

> "when the cost of carrying out repair is taken into account, performance gains are often modest, vary a lot between subsets of the data, and are sometimes not present at all"

The paper further reports that replacing GPT-4's self-generated feedback with feedback from an experienced human programmer increased the number of repaired programs that pass all unit tests by 1.58×. (This figure appears in the paper body rather than the abstract, so it is stated here without quotation marks.)

**Source:** [Olausson et al., "Is Self-Repair a Silver Bullet for Code Generation?" (arXiv:2306.09896, ICLR 2024)](https://arxiv.org/abs/2306.09896)

**Caveats:** code-generation benchmarks; the strongest condition used human-written feedback, which sets an upper bound rather than a recipe.

**Relevance:** if the model must guess why its call failed, recovery is weak and expensive. An error message that states the cause moves the diagnosis from the model to the environment.

### The shape of a tool changes the agent's results (SWE-agent)

**Supports:** first-call correctness — an interface designed for an LLM consumer outperforms one designed for a human.

The SWE-agent ablations (same paper as the Section 2 entry) compared search-tool designs. A search tool that returned summarized results scored **18.0%** on SWE-bench Lite. A human-style iterative search — results shown one at a time, as in Vim or VS Code — scored **12.0%**, worse than having no search tool at all (**15.7%**). The full LLM-designed interface solved, in the paper's words:

> "10.7 percentage points more instances than the baseline agent, which uses only the default Linux shell."

The paper's abstract states the design goal in terms this project shares:

> "The ACI uses guardrails to prevent common mistakes, and an agent receives specific, concise feedback about a command's effects at every turn."

**Source:** [Yang et al., "SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering" (arXiv:2405.15793)](https://arxiv.org/abs/2405.15793)

**Caveats:** software-engineering tasks; the ablations were measured on the 300-instance SWE-bench Lite subset.

### Practitioner guidance for tool authors (Anthropic)

**Supports:** both halves, from the team whose models consume MCP tools. Quoted for principles rather than numbers, because its before-and-after charts publish no figures.

On descriptions and parameters (first-call correctness):

> "Even small refinements to tool descriptions can yield dramatic improvements."

> "input parameters should be unambiguously named: instead of a parameter named `user`, try a parameter named `user_id`"

On error responses (one-round-trip recovery):

> "you can prompt-engineer your error responses to clearly communicate specific and actionable improvements, rather than opaque error codes or tracebacks."

And one outcome-level claim:

> "Claude Sonnet 3.5 achieved state-of-the-art performance on the SWE-bench Verified evaluation after we made precise refinements to tool descriptions"

**Source:** [Anthropic Engineering: Writing effective tools for AI agents — using AI agents](https://www.anthropic.com/engineering/writing-tools-for-agents)

**Caveats:** vendor guidance; the internal Slack and Asana evaluation improvements are shown as charts without published numbers.

---

## Evidence we considered and did not use

- **Boehm's defect-cost curve (the "1:10:100 rule" — a bug costs 10× to 100× more to fix in later phases).** This figure is widely quoted and weakly sourced. Laurent Bossavit's *[The Leprechauns of Software Engineering](https://leanpub.com/leprechauns)* traces the citation chain and finds little primary data behind it, and the 2016 empirical study by Menzies et al., "Are Delayed Issues Harder to Resolve? Revisiting Cost-to-Fix of Defects throughout the Lifecycle," largely failed to reproduce the effect. Section 1 relies on the domain-specific evidence above instead. The philosophy's own statement that prevention is an order of magnitude cheaper does not come from this rule: it comes from the direct comparison documented above — a refusal arrives in moments, while the repairs described in the Figma threads take hours or have no complete fix at all.
- **The iSixSigma 5S anecdote (a finance report reduced from three hours to ten minutes).** The [source](https://www.isixsigma.com/5s/case-study-5s-in-practice/) describes an unnamed team with no company, timeframe, or data — a teaching illustration, not evidence.
- **The DORA cohort multipliers (973×, 6,570×) as causal support.** Quoted above for completeness, excluded from the philosophy for the reasons given in Section 4.
