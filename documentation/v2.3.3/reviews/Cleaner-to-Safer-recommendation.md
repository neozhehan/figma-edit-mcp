# Recommendations for Strengthening Cleaner → Safer

Date: 2026-07-17

Prepared against the repository versions of `DESIGN_PHILOSOPHY.md` and `EVIDENCE.md` present on 2026-07-17. This document recommends edits; it does not apply them to either source file.

## Executive recommendation

Retain **Cleaner → Safer**, but replace the current naming-centered explanation. The present paragraph identifies one real but narrow mechanism: distinct names make an ID-and-name cross-check more discriminating. It does not explain the broader or stronger safety value of a clean design file.

The stronger argument is structural:

> **The safety value of cleanliness is not tidiness; it is that structure converts design intent into machine-observable state.**

The relationship should be strengthened in six ways:

1. Define Cleaner independently of Safer so the arrow is causal rather than circular.
2. Make the relevant comparison explicit: the same task, agent, server, and visually equivalent file, with design intent represented structurally in one file and left implicit or duplicated in the other.
3. Separate three safety mechanisms: one authoritative representation, explicit dependencies, and fewer valid-but-wrong choices.
4. Reposition names as one example of discriminability, distinguishing **meaningful**, **distinct**, and **unique** names rather than treating them as interchangeable.
5. State the centralization counterweight: an incorrect source edit can affect more consumers, so canonicalization becomes safer when dependencies are visible and the source mutation is guarded.
6. Replace the current evidence paragraph with artifact-level evidence, direct Figma transfer rationale, and clearly labeled mechanism precedents and analogies.

The strongest concise formulation is:

> **Cleaner makes intent structural: authoritative representations remove divergent copies, explicit bindings expose dependencies to safeguards, and eliminating obsolete alternatives removes valid-but-wrong choices.**

This is stronger than saying a tidy file makes checks "more accurate." It identifies safety capabilities that an unstructured file does not provide at all: impact analysis, referential-integrity checks, consistent propagation, and elimination of semantically wrong alternatives that would otherwise remain mechanically valid.

## Recommended changes to `DESIGN_PHILOSOPHY.md`

### 1. Make the causal comparison explicit

The relevant comparison is:

> The same task, agent, model, MCP server, and initially equivalent visual result, with one file representing shared decisions through authoritative objects and explicit links, and the other representing them through independent copies, hidden conventions, or obsolete near-duplicates.

The claim is about the safety of **later work starting from those two states**. It is not the claim that every cleanup operation is itself safe, worthwhile, or cost-effective.

This comparison makes the arrow testable. It asks whether the cleaner representation changes:

- the number of wrong-but-valid targets available;
- whether affected consumers can be enumerated before an edit;
- whether a shared correction reaches all intended consumers;
- whether a broken relationship produces a visible refusal or a silent defect; and
- whether an inconsistent partial-update state can be created through the normal edit path.

### 2. Broaden the definition of Cleaner without turning it into Safer

Current formulation:

> Cleaner means fewer errors in the work environment — the design file. Fewer broken references, fewer near-duplicate tokens, fewer layers whose names carry no information.

This definition names symptoms but omits the structural property needed for the stronger Cleaner → Safer argument. It also risks circularity: if Cleaner simply means "fewer errors," then claiming that fewer errors make future errors less likely can collapse into an assertion rather than an explained mechanism.

Recommended formulation:

> Cleaner means fewer errors and less ambiguous, duplicated, or implicit state in the work environment — the design file. Broken relationships and accidental near-duplicates are removed; shared decisions are represented through authoritative variables, styles, or components when appropriate; consumers retain explicit links to those sources; and names distinguish legitimate alternatives.

Why this is stronger:

- It keeps the existing concern with defects in the file.
- It gives Cleaner a structural meaning independent of the server's safety checks.
- It includes both the existence of authoritative sources and the links that make them useful.
- It does not equate cleanliness with fewer layers, aesthetic neatness, or maximal reuse.
- It leaves room for legitimate local copies, overrides, and variants where the underlying decisions are genuinely different.

### 3. Replace the naming-centered mechanism

Current formulation:

> Several of the plugin's protections work by comparing what the AI claims against what the file actually contains. Those comparisons identify a wrong target far more reliably when layers have distinct, meaningful names than when thirty layers are all named "Frame 427". A tidy file therefore makes the plugin's own protections more effective.

Recommended central mechanism:

> **A safeguard can reliably enforce only the relationships the file makes observable.**

Much design intent can exist either as explicit structure or as an unstated convention:

- A layer can be bound to a variable, or it can merely contain the same literal value.
- A reusable object can remain an instance of a component, or it can be a detached copy that people still expect to follow the component.
- A semantic token can be the sole current choice, or it can coexist with obsolete near-duplicates that remain valid selectable objects.

Each pair can initially produce the same pixels. They do not provide the same safety properties. Software can inspect an explicit binding or instance relationship. It cannot reliably reconstruct a missing relationship from visual resemblance or equal values.

This is the nontrivial Cleaner → Safer insight: **clean structure changes which safety guarantees are possible.**

### 4. Separate the three safety mechanisms

#### A. One authoritative representation removes inconsistent-copy states

When several objects genuinely express the same design decision, every unlinked copy is another independently mutable site. Updating eight copies correctly requires eight successful choices. A canonical source with eight live references turns that into one governed decision whose intended effects propagate.

This does more than make consistency easier. It removes some partial-update states from the ordinary edit path. For example, "seven copies contain the correction and one silently retains the old value" is possible with eight literals. It is not the normal result of changing one variable to which all eight consumers remain bound.

Expected safety effects:

- fewer missed consumers during corrections;
- fewer independently drifting versions of one decision;
- fewer stale copies reused as if they were current; and
- fewer opportunities to copy a latent defect into another independently maintained object.

This applies only where the objects truly share one decision. Consolidating legitimately different variants would erase intent rather than clarify it.

#### B. Explicit dependencies make consequences computable

A binding or instance relationship gives machinery a consumer graph. That graph can support:

- pre-edit impact analysis;
- refusal to delete an object that still has consumers;
- consistent propagation from source to consumers;
- detection of dangling, circular, or type-incompatible references; and
- reporting that identifies which dependent structures require attention.

The variable-consumer check is the project's direct example. `figma-edit-mcp` can scan for consumers and refuse deletion of an in-use variable because the file records those bindings. It cannot infer that an equal-looking raw fill was intended to be governed by that variable.

The distinction is not "clean files have fewer mistakes." It is "clean files preserve information that safeguards need in order to detect a class of mistakes."

#### C. Fewer semantic aliases remove valid-but-wrong choices

Scope, type, schema, and name checks reject invalid operations. They cannot reject an obsolete token or component that remains a valid object but is semantically wrong for the task.

For example, all of these might exist, resolve, and pass structural checks:

- `Brand/Blue/500`
- `Brand/Blue/500-old`
- `Brand Blue Final`
- `Blue/500-copy`

Removing obsolete and accidental aliases does not merely help the AI search faster. It eliminates some ways to be wrong without violating any mechanical rule. This directly reduces the residual intent risk described as R2 in `SAFETY.md`.

Expected safety effects:

- fewer wrong-but-valid asset selections;
- fewer stale assets treated as authoritative;
- fewer plausible targets that a name or type check cannot distinguish; and
- fewer inconsistencies introduced by reusing different representations of the same decision.

The relevant property is not raw option count. Removing a legitimate alternative can itself cause errors. The gain comes from removing **obsolete or semantically redundant** alternatives and making the remaining legitimate distinctions observable.

### 5. Distinguish meaningful, distinct, and unique names

The current paragraph conflates three properties:

- **Meaningful names** communicate role or purpose, such as `Checkout/Submit button`.
- **Distinct names** discriminate one plausible target from another.
- **Unique names** occur only once within a defined comparison set.

These properties overlap, but none implies the others. Two nodes can both have the meaningful name `Submit button` and still be indistinguishable. A generated identifier can be unique without communicating any meaning. A name can be distinctive within one frame without being globally unique across the document.

For `figma-edit-mcp`'s name verification:

- Meaningfulness helps the AI or user select and reason about the intended node.
- Distinctiveness makes the ID-and-name pair better at detecting a stale or substituted ID.
- Uniqueness within the relevant candidate set provides the strongest collision resistance, but Figma does not require global name uniqueness.

The deterministic comparison itself does not become more "accurate" when names improve. It becomes **more discriminating** because fewer wrong nodes share the expected name.

Recommended treatment:

> Distinct names are one narrow instance of the broader rule. They preserve an independent identity cue that makes right-node verification more discriminating. Meaningful names also help the AI choose the intended target, but meaning and distinctiveness should not be treated as the same property.

### 6. Distinguish structural cleanliness from aesthetic tidiness

Cleaner → Safer should not be used to justify arbitrary cleanup. None of the following is sufficient by itself:

- fewer layers;
- shorter names;
- visually aligned canvases;
- shallower nesting;
- more components;
- more variables;
- fewer components or variables; or
- one source for objects that do not actually embody the same decision.

The safety-producing properties are narrower:

- authoritative representations for genuinely shared decisions;
- accurate, intentional, and inspectable relationships;
- distinguishable legitimate alternatives;
- removal of obsolete or accidental aliases; and
- boundaries that make expected impact legible.

This prevents "clean" from becoming an aesthetic label that can be attached to any preferred file organization.

### 7. State the centralization and coupling counterweight

Canonicalization removes inconsistent copies but concentrates impact. A wrong edit to one local literal affects one site; a wrong edit to a shared variable or main component can affect every consumer.

The correct design rule is therefore:

> **Centralize the decision, expose its dependencies, and guard the point of change.**

Cleaner becomes Safer most strongly when:

1. the source genuinely represents one shared decision;
2. consumers remain explicitly linked;
3. affected consumers can be inspected before a high-fan-out mutation;
4. the mutation is protected by scope, identity, type, lock, permission, and other relevant checks; and
5. rollback or repair remains possible if the source itself was changed incorrectly.

This is not a ceremonial caveat. Without it, "use one source of truth" can trade inconsistent local states for a larger single-point-of-failure risk.

### 8. Replace the evidence paragraph

Recommended evidence paragraph:

> Evidence supports each part of this mechanism at a different level. In experiments on three industrial CAD parts, explicit and resilient dependency structures either produced correct alterations or exposed affected features through rebuild errors, while a dependency-free strategy could silently produce missing features and incorrect geometry. Database dependency tracking demonstrates the same enforcement principle by construction: declared references can be validated and destructive operations can be refused, while undeclared relationships remain invisible to the engine. Figma's own components and variable aliases provide the domain mechanism by propagating changes through retained source relationships, and the Design Tokens Community Group format requires tools to validate reference targets and detect circular or unresolved references. Studies of duplicated code document propagated bugs and incomplete fixes among independently maintained copies, while a hospital identification intervention reduced wrong-patient electronic orders by 36.3% after replacing nondistinct newborn identifiers with more distinctive ones. These sources support separate mechanisms; none measures the combined effect on an AI editing Figma, so the project-specific magnitude remains to be measured. ([Quotes, methods, limitations, and sources](EVIDENCE.md#cleaner-leads-to-safer).)

### 9. Preserve the existing four-insight structure

`DESIGN_PHILOSOPHY.md` currently says that four insights carry the philosophy. Cleaner → Safer should not silently become a fifth numbered insight unless the introduction is also rewritten.

The cleanest treatment is to present it as a boundary and corollary of the first insight:

- The first insight explains why a programmatic check is more reliable than an instruction **once a condition is evaluable**.
- Cleaner → Safer explains how file structure determines **which conditions are evaluable**.

That relationship strengthens the existing architecture instead of changing the count.

### 10. Suggested complete replacement copy

Replace the opening definition under `## Cleaner` with:

~~~markdown
Cleaner means fewer errors and less ambiguous, duplicated, or implicit state in the work environment — the design file. Broken relationships and accidental near-duplicates are removed; shared decisions are represented through authoritative variables, styles, or components when appropriate; consumers retain explicit links to those sources; and names distinguish legitimate alternatives.
~~~

Replace the complete `### Cleaner leads to Safer` subsection with:

~~~markdown
### Cleaner leads to Safer

The first insight explains why a programmatic check is more reliable than an instruction once a condition can be evaluated. Cleaner leads back to Safer by determining which conditions are available to evaluate:
**A safeguard can reliably enforce only the relationships the file makes observable.**

Much design intent can exist either as structure or as convention. A layer can be explicitly bound to a variable, or it can merely contain the same value. A reusable object can remain an instance of a component, or it can be a detached copy that people still expect to follow the component. A current token can be the only valid choice, or it can sit beside obsolete near-duplicates. In each pair, the initial visual result may be the same. The safety properties are not: software can inspect the structured relationship, but it cannot reliably reconstruct the missing convention.

A cleaner file makes more of that intent machine-observable through three mechanisms:

1. **One authoritative representation.** Shared decisions live in variables, styles, or components rather than in independently mutable copies. This removes partially updated states in which some copies change and others do not.
2. **Explicit dependencies.** Consumers stay linked to the authoritative source. The plugin can detect consumers and refuse deletion of an in-use variable; it cannot infer that a copied literal was intended to be a consumer.
3. **Fewer valid-but-wrong choices.** Obsolete and accidental near-duplicates no longer remain legitimate targets. Distinct names make name verification more discriminating, but the stronger gain comes from eliminating alternatives that would pass every structural check while still being the wrong choice.

Real-world precedents support each mechanism. In parametric-CAD experiments, explicit and resilient dependency structures made affected features observable through correct propagation or rebuild errors, while a dependency-free strategy sometimes produced silent geometry errors. Database dependency tracking likewise prevents invalid references and refuses destructive operations because relationships are declared. Figma's component instances and variable aliases preserve source relationships directly. Studies of duplicated code find propagated bugs and incomplete fixes among independently maintained copies, and a hospital identifier intervention reduced wrong-patient orders after replacing nondistinct newborn names with more distinctive identifiers. These domains support the mechanisms rather than a quantified effect for this project; the magnitude for an AI editing Figma has not yet been measured. ([Quotes, methods, limitations, and sources](EVIDENCE.md#cleaner-leads-to-safer).)

Stated precisely: Cleaner leads to Safer when cleanup replaces duplicated or implicit decisions with authoritative objects and explicit relationships, or removes obsolete but still selectable alternatives. A smaller layer count, visual neatness, or meaningful-sounding names alone does not establish this connection.

Two caveats keep the claim bounded:

- **Canonical sources concentrate impact.** A wrong edit to a shared variable or component can affect more consumers than a wrong edit to one local copy. Centralization becomes safer when the dependencies are visible and the point of change is guarded; it is not safer by itself.
- **Structure does not prove intent.** The AI can bind the wrong variable, choose the wrong but valid component, or make a semantically wrong edit to the correct target. [SAFETY.md](SAFETY.md) records this as residual risk R2.
~~~

## Recommended changes to `EVIDENCE.md`

### 1. Change the evidential question

The current Cleaner → Safer section relies almost entirely on internal reasoning about meaningful names and points to a comprehension-speed experiment from Cleaner → Faster. That source does not measure safety, and the paragraph does not support the stronger structural connection.

The evidential question should become:

> Does representing shared decisions through authoritative sources, explicit dependencies, and distinguishable alternatives remove error states or make failures detectable that would remain possible or silent in an unstructured artifact?

Keep the existing heading `## Cleaner leads to Safer` so the philosophy's link and document layout remain stable.

### 2. Order evidence by directness to the mechanism

Recommended hierarchy:

1. Structured-artifact evidence showing correct propagation or visible failure versus silent corruption.
2. Direct Figma behavior and design-token reference requirements.
3. Mature enforcement precedents showing what explicit relationships enable.
4. Empirical duplication evidence for propagation and missed updates.
5. Wrong-selection evidence for discriminability.
6. Counterevidence and boundary conditions.

This hierarchy should not pretend that all sources have the same status. In particular:

- The CAD study is adjacent-artifact empirical evidence.
- Figma documentation and the design-token format establish domain mechanisms, not error-rate reductions.
- PostgreSQL establishes enforcement by construction, not an empirical Figma outcome.
- Code-clone studies demonstrate a related failure mode in software.
- The hospital study measures actual wrong-target errors but has a substantial domain and operator transfer gap.

### 3. Lead with the parametric-CAD study

This is the strongest available external evidence because it compares stateful design artifacts that encode dependencies differently and examines what happens when they are modified.

The important result is not merely that one modeling strategy was faster. It is that explicit or resilient dependency structures exposed downstream failures, while the strategy that removed direct dependencies could produce incorrect geometry without a warning.

The entry must preserve the study's qualifications:

- mechanical CAD is not interface design;
- participants were engineering students, not AI agents;
- the study compared bundles of modeling choices, not a single isolated variable;
- the two advanced experiments used a fixed presentation order; and
- poorly chosen or excessive dependencies can themselves create instability.

The supported claim is therefore "accurate explicit dependencies make some consequences observable," not "more dependencies are safer."

### 4. Add direct Figma and design-token transfer rationale

Figma's own documentation establishes that:

- component instances remain linked to a main component and receive non-overridden source changes;
- variable aliases link one variable's value to a source so one source update replaces manual updates to every occurrence; and
- variable scopes limit where variables appear, reducing the set of inapplicable choices.

The Design Tokens Community Group format adds a broader ecosystem precedent. It requires tools to validate reference targets, reject unresolved or circular references, preserve references, and propagate changes from referenced tokens to aliases.

These are direct domain mechanisms, but neither source measures fewer errors. Label them **transfer rationale**, not empirical safety evidence.

### 5. Add PostgreSQL as a precise mechanism precedent

PostgreSQL's documentation provides a useful proof of capability:

- a declared foreign key lets the database reject a reference to a nonexistent record;
- tracked dependencies let the engine refuse to drop an object that another object still needs; and
- a dependency hidden inside an unparsed string is not tracked, while the equivalent dependency in parsed structure is recognized and enforced.

The last comparison is particularly valuable. It directly supports the representational claim: equivalent human intent can be enforceable or invisible depending on whether the artifact exposes the relationship structurally.

Do not describe this as empirical proof that Figma files become safer. It is a mature implementation precedent for the mechanism.

### 6. Add duplication evidence with counterevidence

Code-clone research demonstrates two relevant failures:

- copying an object can propagate a latent defect; and
- correcting one copy can leave related copies uncorrected.

Use at least one quantified result and one incomplete-fix case study, but preserve their denominators. For example, the finding that 18.42% of clone fragments **that experienced bug fixes** were associated with bug propagation does not mean that 18.42% of all duplicated code contained propagated bugs.

Include counterevidence. Research at release boundaries found that only a small share of clone genealogies introduced defects, and other studies report that developers often manage known clones consistently. The defensible claim is that independent copies create a consistency obligation and a documented failure mode, not that every duplicate produces defects.

### 7. Replace the identifier-comprehension source with wrong-target evidence

The existing cross-reference to the identifier experiment under Cleaner → Faster measures how quickly developers detect semantic defects. It is useful for speed and comprehension, but it does not measure safer selection.

The newborn-identification study is a stronger fit. It changed nondistinct patient identifiers and measured wrong-patient electronic orders. The result supports **distinctiveness**, not meaningfulness in general and not the entire Cleaner → Safer arrow.

Include the following boundaries:

- single health system;
- before-and-after rather than randomized concurrent design;
- retract-and-reorder events as a validated proxy rather than completed patient harm;
- human clinicians rather than an LLM; and
- no transferable effect size for Figma.

Also note the negative control from a later randomized EHR trial: limiting clinicians to one open patient record rather than four did not significantly reduce wrong-patient orders. This supports discriminability and canonicality, not a simplistic "fewer visible choices is always safer" claim.

### 8. Remove the current unsupported paragraph

Replace the current section wholesale. Do not retain this sentence:

> The mechanism is internal to the checks, so no external source is cited for it.

The mechanism should still be explained internally, but external evidence now exists for its individual parts. The old cross-reference to Cleaner → Faster should either be removed or retained only as secondary evidence that meaningful names help comprehension.

### 9. Suggested complete replacement section

Replace the current `## Cleaner leads to Safer` section with:

~~~markdown
## Cleaner leads to Safer

This connection is not a claim that visual tidiness is inherently safe. It applies where Cleaner means that design intent is represented structurally:

- a shared decision has one authoritative definition rather than several unlinked copies;
- consumers are explicitly linked to that definition rather than merely happening to contain the same value; and
- current alternatives are distinguishable, while obsolete or accidental near-duplicates have been removed.

The claim is:

> **Cleaner makes intent structural: authoritative representations remove divergent copies, explicit bindings expose dependencies to safeguards, and fewer near-duplicates remove valid-but-wrong choices.**

The evidence below supports those mechanisms separately. No study measures their combined effect on an AI editing Figma, so it does not establish a universal or quantified Cleaner → Safer effect for this project.

### Structured dependencies turned silent CAD corruption into visible failures

**Supports:** the strongest part of the connection: when relationships are represented explicitly, machinery can expose the consequences of a change instead of allowing an incorrect artifact to appear valid.

Camba, Contero, and Company compared three formal methods of structuring parametric CAD models using three industrial parts. Two methods retained managed dependencies between features; the horizontal method deliberately removed most direct parent-child dependencies.

The first experiment assigned 92 engineering students across four model conditions. Two further experiments each involved 32 senior engineering students modifying all three formal models. Requested alterations caused downstream features to fail. In the explicit-reference and resilient models, the design tree produced rebuild errors that pointed users toward affected features. In horizontal models, no dependency error was possible because the relevant direct dependencies were absent. The resulting geometry nevertheless contained missing ribs, unavailable features, unintended surfaces, and other errors.

The authors warn that a model can be accepted as correct even though significant problems have occurred. In the later experiments, the resilient strategy also produced the best alteration times, while the horizontal strategy performed worst.

**Sources:**

- [Camba, Contero & Company, "Parametric CAD Modeling: An Analysis of Strategies for Design Reusability" (Computer-Aided Design, 2016, preprint PDF)](https://riunet.upv.es/bitstream/10251/82267/3/CAD%202016%20preprint%20M%20Contero.pdf)
- [DOI: 10.1016/j.cad.2016.01.003](https://doi.org/10.1016/j.cad.2016.01.003)

**Caveats:** mechanical CAD is an adjacent domain, not interface design. The participants were students rather than AI agents, each methodology bundled several structural choices, and the two within-subject experiments presented the model strategies in a fixed order. Dependencies are not automatically beneficial: the paper also shows that poorly chosen or excessive dependencies can make a model unstable. The result supports accurate, intentional dependency structures rather than maximizing dependencies.

**Relevance:** a Figma variable binding, variable alias, or component-instance relationship makes a dependency inspectable. A copied literal or detached component may look identical but does not preserve that relationship. `variable_delete` can enumerate and protect bound consumers; it cannot infer that a layer containing an equal raw value was intended to be a consumer.

### Figma and the design-token ecosystem preserve source relationships

**Supports:** that the proposed structural mechanisms exist in the relevant design domain.

Figma's component instances are linked to their main component. Changes to the main component are reflected in instances except where local overrides preserve a different value. Figma variable aliases similarly link a variable to a source variable; Figma explains that changing the source avoids manually updating every occurrence. Variable scopes can also limit which properties offer a variable, reducing inapplicable choices.

The Design Tokens Community Group format makes the relationship explicit at the interchange level. It requires tools to validate reference targets, report unresolved and circular references, preserve references, and propagate source-token changes to aliases.

**Sources:**

- [Figma, "Components in Figma"](https://www.figma.com/blog/components-in-figma/)
- [Figma Help, "Create and manage variables and collections"](https://help.figma.com/hc/en-us/articles/15145852043927-Create-and-manage-variables-and-collections)
- [Design Tokens Community Group, "Design Tokens Format Module 2025.10"](https://www.w3.org/community/reports/design-tokens/CG-FINAL-format-20251028/)

**Caveats:** these sources document product behavior and format requirements; they do not measure error rates. A source of truth guarantees consistency with the source, not correctness of the source. Overrides and detached instances can prevent uniform propagation, and a wrong central edit can propagate farther than a wrong local edit.

**Relevance:** these sources establish direct transfer of the mechanism to design artifacts. They do not establish its magnitude for this MCP server.

### Declared relationships permit integrity enforcement

**Supports:** the general principle that machinery can protect a relationship only when the system represents and tracks it.

PostgreSQL foreign keys make relationships between records explicit. The database can then reject records whose referenced target does not exist. PostgreSQL's dependency tracker also refuses to drop an object while another tracked object still depends on it.

Its documentation provides a useful boundary. When a function body is stored as an unparsed string, PostgreSQL does not track a table referenced only inside that string. When the equivalent body is written in parsed SQL-standard form, the dependency is recognized, stored, and enforced during a later drop operation.

**Sources:**

- [PostgreSQL documentation, "Foreign Keys"](https://www.postgresql.org/docs/current/tutorial-fk.html)
- [PostgreSQL documentation, "Dependency Tracking"](https://www.postgresql.org/docs/current/ddl-depend.html)

**Caveats:** this is documented system behavior rather than an experiment, and a relational database is not a design file. Declaring and maintaining dependencies also has modeling costs.

**Relevance:** the parallel is representational. A safeguard does not recover intent from resemblance: it protects relationships that the artifact exposes. A Figma binding is available to a consumer scan; a coincidentally equal literal is not.

### Duplicated representations create propagated bugs and missed updates, but not universally

**Supports:** the authoritative-source mechanism: independently mutable copies turn one correction into a multi-site consistency obligation.

Mondal and colleagues analyzed thousands of commits across seven software systems. Overall, 18.42% of clone fragments that underwent bug fixes were associated with the study's bug-propagation patterns, and near-miss clones were more frequently involved than identical clones.

Poehlmann and Juergens analyzed version histories from six industrial and open-source systems. They identified likely incomplete bug fixes in every system: a correction was applied to one cloned fragment while one or more related fragments retained the suspected defect.

**Sources:**

- [Mondal et al., "An Empirical Study on Bug Propagation Through Code Cloning" (Journal of Systems and Software, 2019)](https://www.sciencedirect.com/science/article/pii/S0164121219301815)
- [DOI: 10.1016/j.jss.2019.110407](https://doi.org/10.1016/j.jss.2019.110407)
- [Poehlmann & Juergens, "Revealing Missing Bug-Fixes in Code Clones in Large-Scale Code Bases" (2013)](https://eceasst.org/index.php/eceasst/article/view/2074)

**Counterevidence:** duplication does not make every artifact meaningfully less safe. A release-level study reported that only 1.02% to 4.00% of clone genealogies introduced defects in its subject systems, and other studies find that developers often update known clones consistently. [Bettenburg et al., "An Empirical Study on Inconsistent Changes to Code Clones at the Release Level"](https://doi.org/10.1016/j.scico.2010.11.010)

**Caveats:** source-code clones are not Figma tokens or copied layers. The studies use different clone definitions and infer propagation or incomplete fixes from repository histories. The 18.42% denominator is clone fragments that underwent bug fixes, not all clones. Copies can legitimately diverge, while forcing unrelated objects through one shared source can introduce harmful coupling.

**Relevance:** the evidence establishes the failure mode, not its frequency in design files. When several Figma objects truly express one decision, a shared variable, style, or component removes an independent update obligation. It does not follow that superficially similar objects should always be consolidated.

### Distinct identifiers reduced wrong-target electronic orders

**Supports:** the claim that reducing indistinguishable alternatives can eliminate valid-but-wrong selections that ordinary validity checks do not catch.

Many neonatal intensive-care units assigned temporary names such as `Babyboy [surname]` and `Babygirl [surname]`, producing multiple patients with similar identifiers. Adelman and colleagues conducted a two-year before-and-after study in which one health system replaced those generic names with identifiers incorporating the mother's first name, such as `Wendysgirl`.

Retract-and-reorder events fell by 36.3% after the change. After accounting for clustered orders, the estimated odds ratio was 0.64 with a 95% confidence interval of 0.42 to 0.97. The authors concluded that nondistinct naming was associated with greater wrong-patient risk and that the more distinct convention mitigated it.

**Sources:**

- [Adelman et al., "Use of Temporary Names for Newborns and Associated Risks" (Pediatrics, 2015)](https://pubmed.ncbi.nlm.nih.gov/26169429/)
- [DOI: 10.1542/peds.2015-0007](https://doi.org/10.1542/peds.2015-0007)

**Caveats:** this was a single-health-system before-and-after study rather than a randomized concurrent comparison. Retract-and-reorder events are a proxy for wrong-patient orders, not a count of completed harmful treatments. The users were human clinicians selecting patients, not an AI selecting Figma nodes. The effect size cannot be transferred to this project.

**Relevance:** this evidence supports distinctiveness rather than meaningful naming in the abstract. For `figma-edit-mcp`, a name supplies independent identity evidence only to the extent that it differentiates the intended node from plausible alternatives.

### Fewer visible choices alone did not reduce wrong-patient orders

**Supports:** an important boundary: raw option count is not the mechanism.

A randomized clinical trial involving 3,356 clinicians compared an electronic health record configured to allow only one patient record open at a time with one allowing up to four. Wrong-patient order rates did not differ significantly between the two groups.

**Source:** [Adelman et al., "Effect of Restriction of the Number of Concurrently Open Records in an Electronic Health Record on Wrong-Patient Order Errors" (JAMA, 2019)](https://jamanetwork.com/journals/jama/fullarticle/2733207)

**Caveats:** the intervention changed concurrently open records, not the distinguishability of names or the existence of obsolete choices. It is a healthcare interface study, not a Figma or LLM study.

**Relevance:** Cleaner → Safer should not be phrased as "fewer objects are safer." The supported mechanism is the removal of semantically redundant or obsolete alternatives and improved discrimination among the legitimate alternatives that remain.

### What the evidence supports

Taken together, the evidence supports a bounded Cleaner → Safer connection:

1. **Explicit relationships make some consequences detectable.** If the file records that one object depends on another, machinery can calculate impact and refuse or report some unsafe changes.
2. **Authoritative definitions remove partial-update states.** Where several consumers genuinely express one decision, replacing unlinked copies with a shared source removes the ordinary possibility that only some copies receive a correction.
3. **Distinct current alternatives reduce wrong selection.** Removing obsolete and indistinguishable choices eliminates some mechanically valid but semantically wrong actions.

The evidence does not support the broader claims that tidy-looking files are automatically safer, every duplicate is dangerous, more dependencies are always better, or centralization alone improves safety. Canonical sources also concentrate risk, so the connection is strongest when authoritative definitions, explicit consumers, and write-time safeguards are used together.
~~~

## Proposed claim-to-evidence map

| Claim in `DESIGN_PHILOSOPHY.md` | Best supporting evidence | Evidential status |
|---|---|---|
| Explicit relationships make consequences machine-observable. | CAD dependency experiments; PostgreSQL dependency tracking. | Strong mechanism support in adjacent artifacts; no direct LLM–Figma measurement. |
| Bound consumers can be identified before destructive mutation. | `figma-edit-mcp` variable-consumer scan; PostgreSQL drop restriction. | Direct project mechanism plus mature system precedent. |
| One authoritative source removes inconsistent partial updates. | Figma component and alias behavior; code-clone propagation and incomplete-fix studies. | Direct domain behavior plus adjacent empirical failure-mode evidence. |
| Near-duplicate alternatives create wrong-but-valid selections. | Newborn identifier intervention. | Actual wrong-target outcome, but substantial domain and operator transfer gap. |
| Distinct names improve right-node assurance. | Newborn identifier intervention; internal ID-and-name collision logic. | Supports discriminability, not meaningfulness or global uniqueness. |
| Fewer choices in general are safer. | Randomized one-record-versus-four EHR trial. | Not supported; use as counterevidence. |
| Canonicalization alone is safer. | Figma propagation behavior and CAD coupling findings. | Not supported without qualification; central errors can have greater fan-out. |
| Cleaner reduces error rate for an AI editing Figma. | No direct study located. | Open empirical question. |

## Recommended project-specific evaluation

External evidence can support the direction and mechanisms, but the project should measure the actual Cleaner → Safer effect in Figma rather than borrowing effect sizes from CAD, software, databases, or healthcare.

### Experimental comparison

Create matched Figma fixtures with identical or near-identical initial visual output but different internal representations:

1. **Canonical versus copied values:** layers bound to one variable versus layers containing equal raw values.
2. **Instances versus detached copies:** component instances versus visually identical independent frames.
3. **Clean versus ambiguous asset catalogs:** one current token/component versus the same current asset surrounded by obsolete near-duplicates.
4. **Distinct versus colliding names:** nodes with discriminating names versus plausible wrong targets sharing the same name.
5. **Visible versus hidden dependency impact:** linked consumers that can be enumerated versus implicit consumers represented only by equal values.

Run the same tasks with the same model, prompt, MCP server, permissions, and starting visual result.

### Task classes

- Update a shared design decision across all intended consumers.
- Delete or replace a source object that has consumers.
- Select the current token from a catalog containing stale alternatives.
- Modify one of several visually similar nodes.
- Repair a defect in one of several repeated structures.
- Make a deliberately wrong edit to a high-fan-out canonical source.

The last task is necessary to measure the centralization counterweight rather than assuming it away.

### Primary measures

- wrong-target actions attempted and accepted;
- mechanically valid but semantically wrong asset selections;
- missed intended consumers after an update;
- unintended consumers affected by a source edit;
- dangling or broken references created;
- partial-update states created;
- harmful operations refused before mutation;
- correct-completion rate; and
- human interventions required to recover.

### Secondary measures

- discovery reads and tool calls;
- refusals and retries;
- time or model turns to correct completion;
- size of the affected consumer set;
- success in identifying all affected consumers before mutation; and
- reversibility of a wrong canonical edit.

These secondary measures can also connect the experiment to Cleaner → Faster and Safer → Faster, but the primary Cleaner → Safer outcome is the rate and severity of errors, not speed.

### Important controls

- Score the intended result independently of whether the operation passed schema and safety checks.
- Keep the visual appearance constant where the test concerns internal structure.
- Separate the benefit of **starting from** a clean file from the cost and risk of performing the cleanup.
- Record whether duplicate-looking objects were intended to remain coupled or to diverge legitimately.
- Test both a correct and an incorrect edit to the canonical source.
- Report results per mechanism rather than collapsing everything into one cleanliness score.
- Do not count a refused harmless operation as a safety success.

### Expected falsifiable predictions

The revised philosophy predicts that:

1. Bound-variable fixtures will permit more complete consumer enumeration and safer deletion handling than visually identical literal-value fixtures.
2. Canonical-source fixtures will have fewer missed-consumer errors during correct shared updates.
3. Canonical-source fixtures may show larger collateral impact when the source edit itself is wrong.
4. Removing obsolete near-duplicates will reduce wrong-but-valid asset selections, while merely reducing unrelated visible objects will not necessarily do so.
5. Distinct names will improve right-node detection only where the wrong candidate would otherwise share the expected name.

If these predictions do not hold, the Cleaner → Safer claim should be narrowed accordingly.

## Recommended final position

Retain the arrow in the philosophy, but state it as a conditional structural claim:

> **Cleaner leads to Safer when cleanup replaces genuinely shared but independently mutable decisions with guarded authoritative sources and explicit consumer relationships, or removes obsolete alternatives that remain valid-but-wrong choices.**

The causal chain is:

> **less implicit, duplicated, and ambiguous state → more computable impact, fewer independent consistency obligations, and fewer valid-but-wrong choices → fewer opportunities for future error.**

This preserves a strong insight without turning it into the empty proposition that "having fewer errors is safer." It also makes the relationship actionable: the project should prefer structures that preserve intent, expose dependencies, and support enforcement, while treating high-fan-out canonical edits as safety-critical operations rather than assuming that centralization is automatically safe.
