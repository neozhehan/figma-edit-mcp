# Recommendations for Strengthening Cleaner → Faster

Date: 2026-07-12

## Executive recommendation

Retain **Cleaner → Faster** as a guiding principle. The relationship is credible and has substantially better real-world support than the evidence currently used in `DESIGN_PHILOSOPHY.md` and `EVIDENCE.md`.

The argument should be strengthened in four ways:

1. Define the relationship as an effect on **expected correct-completion time across repeated work**, rather than as a guarantee that every task will be faster.
2. Separate the speed mechanisms: less searching and disambiguation, greater reuse, and less diagnosis and rework.
3. Replace the weak SWE-agent compounding inference and Toyota analogy with direct Figma evidence, controlled comprehension experiments, CAD-modification research, and production-code field data.
4. State the remaining transfer gap honestly: the proposed evidence measures designers, engineers, and production development work; the size of the effect for an LLM editing Figma has not yet been measured directly.

The strongest concise formulation is:

> Task-relevant defects, ambiguity, and inconsistency create additional discovery, reasoning, retries, and repair. Across repeated work on a file, reducing those conditions lowers expected correct-completion time.

## Recommended changes to `DESIGN_PHILOSOPHY.md`

### 1. Preserve the claim but make its unit of comparison explicit

The correct comparison is:

> The same task, agent, MCP server, and functionally equivalent file, with one file containing additional relevant defects or ambiguity.

The argument does not require every cleanup to accelerate every task. It requires a cleaner working state to reduce expected completion time across a representative distribution of later tasks.

Recommended wording:

> Cleaner leads to Faster as an expected lifecycle effect. A task that never encounters an existing defect or ambiguity may see no difference. Across repeated work, however, a cleaner file reduces the probability that a task must spend time locating the right object, distinguishing near-duplicates, diagnosing latent defects, or repairing an inherited mistake.

### 2. Replace “errors compound” with a more precise insight

Current formulation:

> Errors in a design file compound.

Recommended formulation:

> **Task-relevant defects and ambiguity create work for later changes, and combinations of them can compound that cost.**

Why this is stronger:

- Some individual imperfections have negligible cost.
- Some errors spread through duplication or shared bindings.
- Some shared abstractions amplify the visible effect of an error but also centralize its repair.
- Controlled research on structural antipatterns finds that combinations can impose a larger comprehension penalty even when one isolated occurrence has little measurable effect.

This avoids implying that every imperfection grows exponentially while preserving the important lifecycle mechanism.

### 3. Separate the three speed mechanisms

The current section mixes propagation, ambiguity, context use, and repair. Replace that with three explicit mechanisms.

#### A. Less search and disambiguation

Semantic names, clear component roles, and a single authoritative token reduce the work required to identify an intended target.

Expected measurable effects:

- fewer discovery reads;
- fewer candidate targets considered;
- fewer wrong-target attempts; and
- less time spent reconciling similar names or values.

#### B. More reuse and fewer repeated decisions

A current, relevant design system lets the operator reuse components, styles, variables, and established decisions instead of recreating them or searching old files.

Expected measurable effects:

- fewer construction operations;
- fewer micro-decisions;
- fewer searches for prior examples; and
- faster propagation of intentional changes.

#### C. Less diagnosis and rework

Broken references, latent mode errors, and inconsistent structures create work when a later task encounters them.

Expected measurable effects:

- fewer failed or misleading results;
- less diagnosis;
- fewer repairs before the requested task can continue; and
- fewer inherited mistakes duplicated into new work.

### 4. Distinguish a clean starting state from the cost of cleanup

The statement “working in a cleaner file is faster” is different from “every cleanup investment pays for itself.”

Recommended caveat:

> This claim concerns the cost of later work given a cleaner starting state. Whether a particular cleanup is worth performing depends on its cost, the file’s expected reuse, and the likelihood and severity of future encounters with the problem.

This prevents the argument from being interpreted as a demand for unlimited tidiness or premature abstraction.

### 5. Avoid claiming that global cleanliness affects every local task

Recommended wording:

> The effect is strongest when the cleaned structure is reused frequently, lies in a high-churn part of the file, or must be interpreted to complete the task. Unrelated cleanup may have no measurable effect on an isolated task.

This is not a limitation on the value of cleanliness. It identifies where the return should be largest and makes the claim testable.

### 6. Replace the evidence paragraph

Recommended replacement for the evidence paragraph in the Cleaner → Faster section:

> Real-world and controlled studies support each part of this mechanism. In a counterbalanced Figma experiment, designers completed matched tasks 34% faster when they could use a current, task-relevant design system instead of searching old design files and recreating assets. In a controlled experiment with 72 professional developers, meaningful word identifiers made semantic-defect discovery 19% faster than abbreviations or single-letter names. Studies of CAD model alteration found that models which conveyed design intent better were associated with lower alteration time, while controlled studies of structural software antipatterns found that combinations increased comprehension time, reduced correctness, and increased effort. Finally, field data from 39 production codebases found substantially longer issue-resolution time in low-maintainability files. These studies measure designers and engineers rather than an LLM editing Figma, so they support the mechanism and direction of the effect; the agent-specific magnitude remains to be measured. ([Quotes, methods, limitations, and sources](EVIDENCE.md#section-3-cleaner-working-artifacts-reduce-the-cost-of-later-work).)

### 7. Suggested complete replacement section

The following is proposed replacement copy for the existing Cleaner → Faster section.

---

### Cleaner leads to Faster

The third insight: **task-relevant defects and ambiguity create work for later changes, and combinations of them can compound that cost.**

A cleaner file does not make every possible task faster. The effect appears when a task must interpret, reuse, or modify the affected part of the file. Across repeated work, a cleaner file reduces the probability that the AI must stop to locate an intended object, distinguish near-duplicate tokens, diagnose a latent defect, or repair an inherited mistake before it can complete the requested change.

Three mechanisms produce the saving:

1. **Less search and disambiguation.** Semantic names, clear component roles, and authoritative tokens reduce the number of reads and decisions needed to identify the intended target.
2. **More reuse and fewer repeated decisions.** Current components, variables, and styles let the AI reuse established work instead of recreating it or searching old files for an example.
3. **Less diagnosis and rework.** Broken references, inconsistent structures, and latent binding errors create additional work when a later task encounters them. Preventing those conditions removes that future work.

Some errors can also spread before they are noticed. A duplicated frame can copy an embedded mistake. A wrong shared value can affect every consumer at once. A severed reference can leave distributed cleanup work. Shared abstractions can also centralize repair, so fan-out alone does not determine cost; detectability, reversibility, and the kind of error matter as well.

Measured evidence supports the direction of this relationship. In a counterbalanced Figma experiment, designers completed matched tasks 34% faster when they could use a current, relevant design system. In a controlled experiment with 72 professional developers, meaningful word identifiers made semantic-defect discovery 19% faster. CAD-model studies connect communicated design intent with lower alteration time, and production-code studies associate lower maintainability with substantially longer issue-resolution time. Controlled antipattern experiments also find that combinations of structural problems can increase comprehension time and reduce correctness. ([Quotes, methods, limitations, and sources](EVIDENCE.md#section-3-cleaner-working-artifacts-reduce-the-cost-of-later-work).)

Stated precisely: Cleaner leads to Faster as an expected lifecycle effect. The effect is largest in frequently reused or high-churn structures and may be zero for a task that never encounters the cleaned area. This claim concerns the benefit of starting from a cleaner state; whether a specific cleanup is worth its cost depends on how much future work the file is expected to receive.

---

## Recommended changes to `EVIDENCE.md`

### 1. Replace the current evidence hierarchy

The Cleaner → Faster section should order evidence by relevance and methodological strength:

1. Direct Figma task-time experiment.
2. Controlled studies of specific mechanisms.
3. Studies of comparable structured design artifacts.
4. Large-scale production field evidence.
5. Qualitative agent-transfer rationale.
6. Analogies, clearly labeled and optional.

This is stronger than presenting Toyota, Gartner, 5S, Figma guidance, and SWE-agent results as if they provide equivalent support.

### 2. Add a new evidence section

Suggested section title:

## Section 3 — Cleaner working artifacts reduce the cost of later work

Suggested introductory claim:

> “Cleaner” is not treated as a single unmeasured aesthetic property. The evidence below addresses four specific characteristics: reusable and current design-system assets, semantic naming, structural comprehensibility, and maintainability during later modification. Together, they support the directional claim that task-relevant cleanliness reduces expected correct-completion time.

### 3. Add the direct Figma experiment as the primary source

#### Figma: a relevant design system reduced design-task time by 34%

**Method**

Figma’s data science team used two matched design tasks in a bank-account application. Each participant completed both tasks but received a design system for only one. The other task provided old design files as references. Task order was alternated, and participants were given time to learn the assets.

**Result**

Participants completed their objective 34% faster when they had the current, task-relevant design system.

**Mechanism identified by Figma**

The design system avoided:

- recreating assets;
- searching old files;
- repeated decisions about text styles, placement, and color; and
- uncertainty about consistency with the existing product.

**What this supports**

This is direct evidence that reusable, current, consistently structured Figma assets can reduce design-task completion time.

**Limitations**

- The article does not publish the sample size, raw data, uncertainty, or significance testing.
- Participants chose their own stopping points; final output quality was not independently scored.
- It is an internal vendor study.
- It compares design-system access with old reference files; it does not isolate broken references, naming, or duplicate tokens.
- It measures human designers, not an editing agent.

**Source**

- Figma, [“Measuring the value of design systems”](https://www.figma.com/blog/measuring-the-value-of-design-systems/), 2019.

### 4. Add the semantic-name experiment

#### Meaningful identifiers made semantic-defect discovery 19% faster

**Method**

Hofmeister, Siegmund, and Holt conducted a within-participant experiment with 72 professional C# developers. Participants searched equivalent code snippets for semantic defects under three identifier conditions: full words, abbreviations, and single letters.

**Result**

Full-word identifiers produced an average 19% increase in semantic-defect discovery speed compared with abbreviations and single letters. No comparable advantage appeared for syntax-error detection, where semantic understanding was unnecessary.

**What this supports**

This directly supports the proposed mechanism that meaningful names reduce the time required to understand intent and diagnose semantic problems.

**Limitations**

- The experiment used small code snippets rather than large working artifacts.
- “Time to find a defect” is a proxy for general comprehension.
- Participants were human developers, not LLM agents.
- The reported effect was small-to-medium, not transformative.

**Sources**

- Johannes C. Hofmeister, Janet Siegmund, and Daniel V. Holt, [“Shorter Identifier Names Take Longer to Comprehend”](https://www.se.cs.uni-saarland.de/publications/docs/HoSeHo17.pdf).
- [DOI: 10.1007/s10664-018-9621-x](https://doi.org/10.1007/s10664-018-9621-x).

### 5. Add the controlled structural-antipattern studies

#### Combinations of structural problems increased comprehension time

**Method**

Politowski and colleagues combined three empirical studies conducted at three institutions. The combined dataset contained 133 participants and 372 comprehension tasks. Researchers measured task duration, answer correctness, and NASA-TLX effort for code with and without Blob and Spaghetti Code antipatterns.

**Result**

One isolated occurrence often produced little measurable effect. Two occurrences or combinations significantly increased completion time and effort and reduced correct answers.

**What this supports**

This is stronger evidence for the document’s compounding argument than rejected SWE-agent edits. It shows that combinations of structural problems can impose nonlinear comprehension costs.

**Limitations**

- The artifact was source code, not a Figma file.
- Most participants came from academic settings.
- Blob and Spaghetti Code do not map one-to-one to broken bindings, duplicate tokens, or layer names.
- The result cautions against claiming that every isolated imperfection causes meaningful delay.

**Sources**

- Cristiano Politowski et al., [“A Large Scale Empirical Study of the Impact of Spaghetti Code and Blob Anti-patterns on Program Comprehension”](https://arxiv.org/abs/2009.02438).
- [DOI: 10.1016/j.infsof.2020.106278](https://doi.org/10.1016/j.infsof.2020.106278).

### 6. Add the CAD alteration evidence

#### Communicating design intent reduced later alteration time

**Method and result**

An educational exercise using SolidWorks and Pro/Engineer examined how model attributes affected the creation and alteration of models by other people. Properly conveying design intent was positively associated with retaining the original design and negatively associated with alteration time.

A related study analyzed models created and altered by 30 practicing product-development engineers. Simpler reusable features, reference geometry, and correct feature sequencing improved model perception and alterability, while modeling choices revealed a tradeoff between initial creation speed and later reuse.

**What this supports**

This is a close artifact-level analogy: a structured, stateful design model records or obscures its author’s intent, and that structure affects the cost of later modification.

**Limitations**

- These were mechanical CAD models rather than interface-design files.
- Some relationships were correlational rather than randomized.
- The studies involved humans, not LLMs.
- The findings show tradeoffs: structures that improve later alteration can cost more during initial creation.

**Sources**

- [“An educational exercise examining the role of model attributes on the creation and alteration of CAD models”](https://www.sciencedirect.com/science/article/pii/S0360131511000807).
- [DOI: 10.1016/j.compedu.2011.03.018](https://doi.org/10.1016/j.compedu.2011.03.018).
- [“Analyzing the effect of alternative goals and model attributes on CAD model creation and alteration”](https://www.sciencedirect.com/science/article/abs/pii/S001044851100306X).
- [DOI: 10.1016/j.cad.2011.11.003](https://doi.org/10.1016/j.cad.2011.11.003).

### 7. Add the production-code field study

#### Lower-maintainability production files took longer to change

**Method**

Tornhill and Borg analyzed 39 proprietary production codebases containing 30,737 files. They combined a source-quality measure with version-control activity and Jira data to estimate per-file development time.

**Result**

Compared with files in the healthy category:

- the lowest-quality category required 124% more development time on average;
- the middle-quality category required 78% more; and
- maximum issue-resolution times were much less predictable in the lowest-quality category.

**What this supports**

This supplies large-scale field corroboration that maintainability of the working artifact is associated with the time required to implement changes.

**Limitations**

- The study is observational and does not establish causality by itself.
- Process, organizational, task-difficulty, and reverse-causality confounders remain possible.
- The quality measure is proprietary and one author is its creator.
- The per-file time measure is inferred from Jira state and commit history rather than directly observed.
- Production software is an adjacent domain, not Figma.

**Sources**

- Adam Tornhill and Markus Borg, [“Code Red: The Business Impact of Code Quality”](https://arxiv.org/pdf/2203.04374).
- [DOI: 10.1145/3524843.3528091](https://doi.org/10.1145/3524843.3528091).

### 8. Add independent technical-debt field corroboration

#### Developers reported losing about 23% of their time to technical debt

**Method**

Besker, Martini, and Bosch conducted a longitudinal study of 43 developers, followed by 16 interviews and an extension using an independent dataset.

**Result**

Developers reported that technical debt consumed approximately 23% of development time. Additional testing and analysis were major destinations of the lost time, and existing debt sometimes forced the introduction of further debt.

**What this supports**

This independently supports the lifecycle mechanism that problems embedded in the working artifact create additional future work.

**Limitations**

- The time loss is self-reported.
- Technical debt is broader and less precisely defined than Cleaner in this philosophy.
- The study does not isolate naming, duplication, or broken references.
- It does not measure Figma or AI-agent tasks.

**Sources**

- [“Software developer productivity loss due to technical debt—A replication and extension study”](https://www.sciencedirect.com/science/article/pii/S0164121219301335).
- [DOI: 10.1016/j.jss.2019.06.004](https://doi.org/10.1016/j.jss.2019.06.004).

### 9. Keep Figma’s MCP guidance as transfer rationale, not outcome evidence

Figma’s guidance on components, variables, Auto Layout, and semantic naming remains useful. Reclassify it as:

> Qualitative evidence that Figma expects structured files to improve model interpretation and generated output.

Do not use it as measured evidence of:

- lower editing-task wall time;
- fewer agent calls;
- lower context use;
- fewer wrong-target selections; or
- a quantified Cleaner → Faster effect.

**Source**

- Figma, [“Structure your Figma file for a better output”](https://developers.figma.com/docs/figma-mcp-server/structure-figma-file/).

### 10. Remove or reclassify the current weak support

#### SWE-agent failed edits

Remove this as evidence that errors embedded in an artifact compound. The cited failed edits were rejected and discarded, so they did not persist in the codebase and make later edits harder.

It may remain in the Safer section as evidence about interface design or rejected invalid edits, with its statistical limitations stated.

#### Toyota

Move Toyota to a clearly labeled “illustrative analogy” subsection or remove it. It explains why stopping defects early can be sensible but does not measure Figma cleanliness or agent task time.

#### 5S factory case

At most, retain this as a remote workplace-organization analogy. A single uncontrolled factory case should not carry a core causal claim about structured digital artifacts.

#### Gartner data-quality figures

Remove from the Cleaner → Faster argument. The figures are remote, methodologically opaque, and do not isolate the mechanisms claimed here.

#### Figma customer stories

Datadog and other design-system case studies can illustrate field experience, but their time-saving figures should not be primary evidence unless the measurement method and baseline are available.

### 11. Do not use emerging agent evidence as primary proof yet

SlopCodeBench is relevant because it measures repeated agent modification while tracking duplication, structural erosion, correctness, time, and cost. It found that quality degraded while checkpoint cost increased and correctness declined.

It does not cleanly isolate Cleaner → Faster:

- later checkpoints are also harder;
- quality and task progression change together;
- quality-focused prompts improved initial structural metrics without improving solve rates; and
- those prompts increased cost.

Use it only as evidence that long-horizon agent work should measure maintainability and later-task cost together—not as proof of the causal arrow.

**Source**

- Gabriel Orlanski et al., [“SlopCodeBench: Benchmarking How Coding Agents Degrade Over Long-Horizon Iterative Tasks”](https://arxiv.org/pdf/2603.24755).

## Proposed claim-to-evidence map

| Claim in the philosophy | Primary evidence | Evidential status |
|---|---|---|
| Reusable, current design-system assets reduce design-task time | Figma’s 34% experiment | Direct domain evidence; incomplete reporting |
| Meaningful names reduce semantic comprehension time | Professional identifier experiment | Controlled causal evidence; adjacent artifact |
| Combinations of structural problems increase time and errors | Multi-site antipattern experiments | Controlled causal evidence; adjacent artifact |
| Communicated design intent reduces later modification effort | CAD alteration studies | Close artifact evidence; mixed experimental/correlational |
| Low-maintainability working artifacts take longer to change | 39-codebase production study | Large-scale observational field evidence |
| Accumulated artifact problems consume future work time | Technical-debt longitudinal study and replication | Independent field corroboration; self-reported |
| Structured Figma files help model interpretation | Figma MCP guidance | Qualitative transfer rationale |
| A cleaner Figma file makes this editing agent faster by a particular amount | No direct evidence yet | Project-specific hypothesis |

## Recommended project-specific evaluation

The external evidence is sufficient to justify Cleaner → Faster as a design principle. A small project-specific experiment would establish whether the mechanism transfers to this MCP server and quantify the effect.

### Experimental comparison

Construct matched pairs of functionally equivalent Figma files:

- one clean;
- one containing controlled, realistic defects or ambiguities.

Vary one cleanliness dimension at a time:

1. semantic versus generic layer names;
2. one authoritative token versus near-duplicate tokens;
3. valid bindings versus controlled broken or misleading bindings;
4. reusable components versus detached duplicates; and
5. consistent structure versus equivalent structural irregularity.

Run the same task suite, agent, model, prompt, discovery policy, and tool version against both conditions.

### Measure

- correct task-completion rate;
- wall-clock completion time;
- model turns;
- tool calls;
- tokens;
- discovery reads;
- wrong-target attempts;
- refused calls;
- repair operations;
- human intervention; and
- output-file integrity.

### Important controls

- Randomize condition order.
- Use multiple files and task types.
- Run multiple trials per condition.
- Separate task difficulty from cleanliness.
- Blind outcome scoring where practical.
- Save raw transcripts and tool results.
- Report null and negative results.
- Do not combine several cleanliness interventions into one treatment until their individual effects are known.

## Recommended final position

After these changes, the documents can make a strong but appropriately bounded claim:

> Cleaner → Faster is supported by direct Figma task-time evidence, controlled studies of naming and structural comprehension, CAD-model alteration research, and production maintenance data. The evidence consistently supports the direction of the relationship: reusable structure, communicated intent, semantic naming, and maintainability reduce the work required for later changes. The exact magnitude for an LLM editing Figma through figma-edit-mcp has not yet been measured and should remain a project-specific empirical question.

This formulation is more credible than the current argument because it relies on evidence that directly measures time spent modifying structured artifacts, preserves the documented boundary conditions, and clearly separates established external evidence from the remaining agent-specific hypothesis.
