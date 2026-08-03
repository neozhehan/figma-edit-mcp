# Recommendations for Strengthening Safer → Cleaner

Date: 2026-07-18

Prepared against the repository versions of `DESIGN_PHILOSOPHY.md`, `EVIDENCE.md`, and `SAFETY.md` present on 2026-07-18. This document recommends edits; it does not apply them to those source files.

## Executive recommendation

Retain **Safer → Cleaner** as a guiding principle, but change which proposition carries the connection.

The current first insight combines two claims:

> A programmatic check is more reliable & costs less than instructing the AI.

The reliability claim is important and should remain prominent. It explains why the plugin can deliver safety more dependably than instructions alone. It does not, however, explain the strongest consequence of applying that check to every write, and the cost claim belongs under Safer → Faster.

Replace the first insight with:

> **A rule enforced at every relevant write boundary becomes an invariant of the file, not a behavior expected of the AI.**

Then retain the former reliability claim immediately underneath it as the mechanism:

> **Programmatic checks are more reliable than instructions for enforcing mechanically checkable rules.**

The resulting argument has two levels:

1. **Why the system is Safer:** an instruction influences which action the AI proposes; a programmatic check determines which proposed actions can execute.
2. **Why Safer leads to Cleaner:** when the same rule is enforced on every relevant write, individual refusals compose into a file-state invariant across the editing session.

This preserves the important checks-versus-instructions argument while giving the Safer → Cleaner arrow a stronger and more specific insight.

The section should be strengthened in seven ways:

1. Replace the current first-insight headline rather than adding a fifth insight.
2. Keep the checks-versus-instructions comparison as the explicit explanation of why enforcement works.
3. Explain that enforcement changes the set of file states the tool can reach, not merely the probability that the AI behaves correctly.
4. Define checks as a **cleanliness ratchet**: they preserve covered good states and reduce covered defect inflow, but they do not repair existing defects.
5. Move the token and operating-cost comparison to Safer → Faster.
6. Replace the current evidence hierarchy with direct boundary-enforcement evidence, guarded-agent editing, controlled error-admission studies, and corrected longitudinal evidence.
7. State the design boundary as **enforce mechanically decidable invalidity, not contextual intent or risk heuristics**.

The strongest concise formulation is:

> **One correctly refused violating call prevents one mistake; the same invariant enforced on every relevant write prevents that mistake class from becoming a reachable file state. Instructions reduce invalid requests, while programmatic checks prevent invalid requests from committing.**

## Recommended changes to `DESIGN_PHILOSOPHY.md`

### 1. Replace the first insight rather than adding another one

`DESIGN_PHILOSOPHY.md` says that four insights carry the philosophy. Preserve that structure.

Current first insight:

> A programmatic check is more reliable & costs less than instructing the AI.

Recommended first insight:

> **A rule enforced at every relevant write boundary becomes an invariant of the file, not a behavior expected of the AI.**

This replacement answers the question posed by the subsection heading. It explains how a collection of safer individual operations changes the cleanliness of the resulting file.

Do not discard the reliability claim. Reposition it as the mechanism that makes the new insight possible.

### 2. Preserve the checks-versus-instructions argument explicitly

The recommended subsection should contain this sentence as a standalone supporting proposition:

> **Programmatic checks are more reliable than instructions for enforcing mechanically checkable rules.**

The explanation should make four distinctions clear:

- An instruction is input to a generative decision. It changes the probability that the AI proposes a compliant action.
- Compliance still depends on the AI retaining, interpreting, and applying that instruction on the relevant turn.
- A programmatic check runs after the AI has chosen an action but before the plugin executes it.
- A correctly implemented, unavoidable check makes execution of the prohibited action independent of the AI's attention, context length, model, or willingness to comply.

The strongest formulation is not that a check makes the AI itself reliable. It makes the checked property independent of whether the AI is reliable:

> The AI can forget or disregard an instruction and still request the prohibited action. It cannot make figma-edit-mcp execute an action that the plugin-side guard refuses.

This guarantee remains subject to the enforcement assumptions documented in `SAFETY.md`, especially that the plugin is the sole write path and that the checked predicate and implementation are correct. Those conditions define an enforced invariant; they are not reasons to compare the server with unrelated threats outside its scope.

Treat instructions and checks as complementary layers rather than mutually exclusive alternatives. Instructions can prevent some invalid attempts and help the AI recover efficiently. Programmatic checks provide the stronger execution guarantee because the guarantee does not depend on instruction compliance.

### 3. Explain the state-space change

The current section says that reliable checks stop errors before they enter the file. Strengthen that statement by explaining what the interface changes.

For the same initial file and proposed operation:

- an unchecked server permits both the valid successor state and the state produced by the prohibited operation;
- the checked server permits only successors that satisfy the enforced predicate; and
- a refused operation leaves the file in its preceding state.

The check therefore removes covered invalid states from the set of states reachable through the tool. This is stronger than saying the AI is less likely to make a mistake.

Recommended wording:

> Instructions change the distribution of requests. Checks change the set of states those requests are allowed to create.

### 4. Explain how per-call checks compose across a session

Define an invariant in plain language:

> An invariant is a property that, once true, every accepted change must preserve.

Use the variable-consumer check as the primary example:

1. The file currently contains a variable that still has consumers.
2. Deleting that variable would create dangling references.
3. Every deletion request passes through the consumer check.
4. The check refuses the deletion before mutation.
5. Therefore no accepted `variable_delete` call can be the first operation that creates that prohibited state.

The same reasoning applies to the other guarantees in `SAFETY.md`:

- scope checks prevent accepted node writes from landing outside the user-selected subtree;
- name verification prevents an accepted write when the caller's claimed identity does not match the resolved node;
- explicit-parent checks prevent creation without a resolved destination;
- lock, instance-interior, remote-asset, and scope-root guards preserve their corresponding protected states; and
- batch prevalidation prevents a detectably invalid batch from beginning and producing a partially applied prefix.

Avoid describing batch tools as generally transactional. Their guarantee is zero mutation when prevalidation finds an invalid member. `SAFETY.md` explicitly does not promise rollback after mutation has begun and a later runtime or time-of-check/time-of-use failure occurs.

### 5. Describe safety as a cleanliness ratchet

The current text moves too quickly from preventing new errors to making an existing environment cleaner.

Use the stock-flow relationship:

> `next defect stock = existing defects + admitted new defects − removed defects`

Safety reduces the admitted-defect term. It has two consequences:

- If a covered good state already holds, enforcement can preserve it across later writes.
- If covered defects already exist, enforcement prevents additional inflow but does not remove the existing stock. The stock declines only when repair, retirement, or replacement continues to remove old defects faster than new ones enter.

Recommended formulation:

> **Checks are a cleanliness ratchet, not a cleanup operation. They stop covered good states from regressing and reduce the arrival of new covered defects; existing defects disappear only through repair or retirement.**

This is the rigorous version of the Android example.

### 6. Move the cost claim to Safer → Faster

Remove this paragraph from Safer → Cleaner:

> The costs differ as well. An instruction consumes tokens on every request, because its text must sit in the AI's context window every time. A check runs by itself on every call. Over any sustained use, the check is the cheaper of the two.

It does not support Cleaner. It concerns token use, validation cost, and operating cost, which are Faster questions.

If retained under Safer → Faster, narrow it. A programmatic check has implementation, maintenance, execution, false-refusal, and recovery costs. The relevant claim is not that a check is automatically cheaper, but that a reusable low-cost check can replace repeated model-side reasoning and avoid downstream repair.

### 7. Replace the evidence paragraph

The philosophy should summarize evidence by the proposition it supports:

1. **Enforcement versus instruction:** a controlled MCP-agent study compared no defense, prompt-only defense, and runtime enforcement using the same agent. Runtime enforcement prevented consequences even though the model continued attempting violations.
2. **Guarded AI editing:** SWE-agent's edit tool discarded syntax-invalid writes and improved benchmark resolution from 15.0% to 18.0%.
3. **Reduced admission of wrong-target actions:** a randomized clinical ordering trial found a larger reduction from required identity re-entry than from a click-through confirmation.
4. **Lifecycle effect:** Android's absolute memory-safety vulnerability count declined as memory-safe development reduced new vulnerability inflow, while ordinary repair and parallel hardening continued.

Do not ask any one of these sources to prove the entire arrow. Together they establish that:

- AI instructions do not eliminate invalid proposals;
- runtime boundaries can stop proposed actions from executing;
- enforced verification can reduce errors admitted into a real operational environment; and
- reducing defect inflow can contribute to a declining defect stock over time.

### 8. Correct the Android claim

Current heading in `EVIDENCE.md`:

> Prevention alone made a large codebase cleaner

Recommended heading:

> **Reducing new defect inflow accompanied a large decline in Android memory-safety vulnerabilities**

Do not say that prevention alone produced the decline or that old code received no cleanup. Google's own reports state that:

- existing C/C++ continued to receive bug fixes;
- fuzzing, hardened allocators, sanitizers, and other defenses also contributed;
- the 2024 total was projected from 27 vulnerabilities through September to 36 for the full year; and
- the evidence is an observational vendor report, not a controlled language intervention.

Use the stronger absolute figures:

- 223 annual memory-safety vulnerabilities in 2019;
- 85 in 2022;
- 27 through September 2024, projected as 36 for the year; and
- below 20% of total Android vulnerabilities in Google's near-final 2025 data.

Google's 2025 comparison of approximately five million lines of Android Rust with historical C/C++ vulnerability density can remain as secondary corroboration, with its historical-versus-contemporary and vendor-self-report limitations stated explicitly.

### 9. State the enforcement boundary as a design rule

Retain the existing distinction between mechanical checks and user intent, but sharpen it:

> **Use hard enforcement for properties whose violation is mechanically decidable. Do not turn a contextual risk heuristic into an invariant merely because it can be programmed.**

The plugin can mechanically determine scope membership, ID/name agreement, whether a variable has consumers, whether a node is locked, and whether a batch member fails prevalidation. It cannot mechanically determine whether an otherwise valid visual edit expresses the user's intent.

This boundary is supported by real counterevidence. A randomized nearly-hard-stop drug-interaction alert strongly changed prescribing but caused four clinically important treatment delays and was stopped early. The lesson is not that enforcement is ineffective. It is that enforcement faithfully preserves the predicate it was given, so the predicate must describe invalidity rather than an imperfect proxy for intent.

### 10. Suggested complete replacement copy

Replace the complete `### Safer leads to Cleaner` subsection with:

~~~markdown
### Safer leads to Cleaner

The first insight explains what changes when a rule is enforced at the point where the file changes:
**A rule enforced at every relevant write boundary becomes an invariant of the file, not a behavior expected of the AI.**

An invariant is a property that, once true, every accepted change must preserve. Suppose every variable that still has consumers must continue to exist. If the file satisfies that property now and every deletion is checked against the current file before it runs, no accepted deletion can be the first one to break it. The AI may request an invalid deletion, but that request never becomes part of the file.

This is the important difference between instructing the AI and checking its actions:
**Programmatic checks are more reliable than instructions for enforcing mechanically checkable rules.**

An instruction changes the probability that the AI will request a valid operation. Compliance still depends on the AI retaining the rule, interpreting it correctly, and applying it on that turn. A programmatic check changes which operations the interface will accept. It runs on every applicable request, uses the file's current state, and does not depend on the AI's attention, context length, or model. The AI can disregard an instruction and request the prohibited action; it cannot make figma-edit-mcp execute an action that the plugin-side guard refuses.

One correctly refused violating call prevents one error. Applying the same predicate at every relevant write boundary composes those local refusals into a session-wide invariant. Scope, identity, placement, protection, and variable-consumer checks each remove their prohibited successor states from the file states reachable through the plugin. Batch tools apply the same principle to a set of operations: they prevalidate every item, and a detectably invalid batch changes nothing.

Measured evidence supports the boundary mechanism and its effect on admitted errors. In a controlled MCP-agent benchmark, the same agent achieved a 40.0% attack-success rate without a defense, 35.0% with the strongest prompt-only defense, and 5.0% with runtime enforcement; the agent continued attempting violations, but the boundary stopped most consequences. In the closest guarded-edit analogue, SWE-agent discarded syntax-invalid edits and resolved 18.0% of benchmark tasks with the check versus 15.0% without it. A randomized trial covering 901,776 clinical ordering sessions found that required identity re-entry reduced wrong-patient retract-and-reorder events by 41%, compared with 16% for a click-through verification alert. ([Methods, limitations, and sources](EVIDENCE.md#safer-leads-to-cleaner).)

Cleaner is the stock of errors present in the file; Safer reduces the flow of new errors into it. Checks do not erase existing defects. They prevent covered defects from being committed. If later work continues to remove old defects while fewer replacements enter, the file becomes cleaner over time. Checks are therefore a cleanliness ratchet: they preserve covered good states immediately and let ordinary repair reduce the remaining defect stock.

Android provides a large-scale longitudinal example, although not a controlled causal estimate. As Google shifted new Android development toward memory-safe languages, annual memory-safety vulnerabilities fell from 223 in 2019 to 85 in 2022; Google recorded 27 through September 2024 and projected 36 for that year. Most existing C/C++ was not rewritten, but old vulnerabilities continued to be fixed and the remaining unsafe code received parallel hardening. The evidence supports reduced defect inflow plus continued removal, not prevention as the sole cause. ([Methods, limitations, and sources](EVIDENCE.md#safer-leads-to-cleaner).)

Two boundaries keep the connection precise:

- **The invariant is the checked predicate.** Scope, identity, reference, type, and protection checks can preserve those mechanical properties. They cannot establish that an otherwise valid edit is what the user wanted. [SAFETY.md](SAFETY.md) records the guarantees, assumptions, and residual risks.
- **Preservation is not cleanup.** A check prevents an accepted operation from introducing another covered violation. It does not repair a violation already present unless a tool explicitly performs that repair.

This project therefore ships instructions as well as checks. The `figma-edit` skill and the `figma-edit://guide/*` resources teach the AI the rules before it starts. Instructions are a useful preventive layer because they reduce invalid requests and guide recovery from refusals. The plugin's guarantees are stronger because they do not depend on the AI reading or following those instructions.
~~~

## Recommended changes to `EVIDENCE.md`

### 1. Change the evidential question

The current Safer → Cleaner section asks whether a programmatic check is more reliable and cheaper than instructions, then treats Android as evidence that prevention alone cleans an existing codebase. This combines reliability, cost, invariant preservation, and lifecycle defect stock in one evidential question.

Replace it with three questions:

1. **Reliability:** when an AI agent can still propose a prohibited action, does an execution-time check prevent the action more reliably than an instruction alone?
2. **Composition:** when every relevant write is mediated and refusal is non-mutating, does a per-write rule become a preserved property across a sequence of accepted states?
3. **Lifecycle:** when checks reduce the admission of new defects while repair or retirement continues, can the total defect stock decline?

Keep the existing heading `## Safer leads to Cleaner` so the philosophy and evidence layouts remain aligned.

### 2. Separate deduction from measurement

Invariant preservation is primarily a deductive claim:

> If a property holds before a write, every accepted write preserves it, and every rejected write leaves the state unchanged, the property holds after any finite sequence of writes.

External evidence is not required to prove that implication. Evidence is required to establish the practical premises and magnitude:

- whether AI agents actually attempt prohibited actions despite instructions;
- whether the enforcement point mediates every relevant write;
- whether refusal really leaves the artifact unchanged;
- whether the predicates correspond to meaningful file defects;
- how frequently the guards prevent those defects; and
- whether false refusals or adaptive retries create offsetting errors.

This distinction makes the evidence section stronger. It avoids using a cross-domain correlation to prove a property the interface can establish directly.

### 3. Order evidence by its role

Recommended hierarchy:

1. Deductive mechanism and mature constraint-system precedent.
2. Same-agent runtime-enforcement versus prompt-only evidence.
3. Guarded AI-editing evidence.
4. Controlled real-world evidence on admitted wrong-target or incompatible actions.
5. Longitudinal defect-stock evidence.
6. Counterevidence defining which predicates should become hard invariants.

### 4. Reclassify the current sources

#### OpenAI Structured Outputs

**Remove from the primary comparison or retain only as a secondary illustration.** The published comparison uses a newer model with Structured Outputs and an older model with prompting alone. It therefore does not isolate enforcement as the cause of the difference. It also measures JSON-schema conformance rather than semantic correctness, executed actions, or artifact cleanliness.

Replace it as the main enforcement-versus-instruction evidence with the same-agent MCP runtime-policy study.

#### SWE-agent

**Retain as the closest AI-editing analogue.** Its linting ablation directly compares the same edit interface with and without invalid-edit rejection. Continue to state that it measures task resolution rather than final artifact defect density or completion time.

#### SupervisorAgent

**Move to Safer → Faster or remove from this connection.** Its reported token reduction concerns efficiency. It does not measure whether a write-time rule preserves artifact cleanliness.

#### Android memory safety

**Retain, but rewrite.** Use absolute vulnerability counts, add the 2025 update as secondary corroboration, and state explicitly that bug fixing and parallel hardening continued. Rename the entry so it does not claim that prevention alone caused the decline.

### 5. Suggested complete replacement section

Replace the current `## Safer leads to Cleaner` section with the following structure and copy.

~~~markdown
## Safer leads to Cleaner

The first insight is:

> **A rule enforced at every relevant write boundary becomes an invariant of the file, not a behavior expected of the AI.**

The mechanism underneath that insight is equally important:

> **Programmatic checks are more reliable than instructions for enforcing mechanically checkable rules.**

Instructions influence what an AI proposes. A write-time check controls what the artifact can become. The evidence below separates three propositions: whether runtime enforcement is more dependable than model compliance, whether per-write enforcement composes into a preserved state invariant, and whether reducing defect inflow can lower the total defect stock over time.

### Enforced writes preserve checked invariants by construction

**Supports:** the direct Safer → Cleaner mechanism: a rule applied to every relevant state transition can preserve that property across the complete tool-mediated edit history.

Let `I` be a property of the file. If `I` holds before an operation, every accepted operation preserves `I`, and every refused operation leaves the file unchanged, then `I` holds after the operation. Repeating the same reasoning establishes `I` after any finite sequence of accepted and refused calls.

This is stronger than probable model compliance. An instruction can reduce how often the AI proposes a transition that violates `I`. The execution boundary determines whether that transition can commit at all.

PostgreSQL constraints provide a mature deployed precedent. A check constraint raises an error when a proposed value violates its predicate. Foreign keys make it impossible through ordinary constrained writes to create a reference to a missing target, and `ON DELETE RESTRICT` prevents deletion of a referenced row. These are properties of reachable database states, not expectations that every client remember a rule.

**Source:** [PostgreSQL documentation, "Constraints"](https://www.postgresql.org/docs/current/ddl-constraints.html)

**Caveats:** this is a logical mechanism and documented system behavior, not an empirical Figma outcome. The guarantee is only as strong as the predicate, its implementation, and complete mediation of the relevant writes. PostgreSQL also documents cases where an inappropriate constraint expression cannot provide the intended continuing guarantee.

**Relevance:** `variable_delete` follows the same referential-integrity pattern as a restricted delete. The plugin checks whether a variable has consumers before mutation and refuses a deletion that would create broken references. The other plugin-side guards preserve their own predicates in the same way.

### Runtime enforcement outperformed prompt-only defenses for an MCP agent

**Supports:** the claim that programmatic checks are more reliable than instructions when the objective is to prevent a prohibited tool action from executing.

Wang, Zhu, and Li evaluated an MCP-style policy-enforcement point using one DeepSeek-v4-pro agent on a controlled 30-task dataset. Seven configurations were repeated five times, producing 1,050 runs.

The reported attack-success rates were:

- **40.0%** with no defense;
- **35.0%** with the strongest prompt-only defense; and
- **5.0%** with full runtime enforcement.

The attack-attempt rate under full enforcement remained **66.0%**. The model therefore continued proposing prohibited actions; the execution boundary prevented most of those proposals from producing the prohibited consequence.

**Source:** Wang, Zhu & Li, ["Runtime Policy Enforcement for MCP-Based LLM Agents"](https://www.mdpi.com/2079-9292/15/13/2829), *Electronics*, 2026.

**Caveats:** this is a recent single paper using a small dataset deliberately constructed around five policy rules. Most tools were mocks, the primary outcome was security attack success rather than accidental artifact corruption, and the preliminary official-filesystem-MCP test was limited. The prompt-only condition used Spotlighting rather than natural-language copies of all five runtime rules, so it is not a perfect instruction-versus-check ablation. The study also reports task-level denials caused by intentionally restrictive capability tokens and residual rule-coverage gaps on some other models.

**Relevance:** this is a cleaner enforcement-versus-instruction comparison than the current Structured Outputs evidence because it uses the same agent and places the control at an MCP-style tool boundary. It directly illustrates why instructions improve proposals while programmatic checks control execution.

### A guardrail on an AI agent's edit command improved task resolution

**Supports:** the claim that an AI-editing interface can discard invalid writes, return diagnostic feedback, and improve the agent's result.

SWE-agent integrated a linter into its edit operation. The paper states that invalid edits are discarded and the agent is asked to try again. Its ablation on the 300-instance SWE-bench Lite subset reported:

- **18.0%** task resolution with linting; and
- **15.0%** with the same edit command without linting.

The broader behavioral analysis found that 51.7% of 2,294 trajectories contained at least one failed edit. Failed edits were common in that benchmark, although the category includes failures beyond the syntax violations caught by the linter.

**Source:** Yang et al., ["SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering"](https://papers.neurips.cc/paper_files/paper/2024/file/5a7c947568c1b1328ccc5230172e1e7c-Paper-Conference.pdf), NeurIPS 2024.

**Caveats:** the isolated linting result comes from 300 software-engineering tasks. It reports task resolution, not final defect counts, statistical uncertainty, task time, or cost. The linter covers selected syntax errors rather than semantic correctness.

**Relevance:** this is the closest published analogue to figma-edit-mcp's interaction pattern: the agent proposes a write, machinery checks it, an invalid write is not retained, and the error tells the agent to try a corrected operation.

### Required identity re-entry reduced wrong-target orders in a randomized trial

**Supports:** the target-verification mechanism: enforced identity verification can reduce wrong-target operations more than a weak confirmation prompt.

Adelman and colleagues randomized 4,028 clinical providers across **901,776 ordering sessions**. The rate of retract-and-reorder sessions, a validated proxy for wrong-patient electronic orders, was:

- **1.5 per 1,000 sessions** in the control condition;
- **1.2 per 1,000** with a click-to-verify alert, a **16% reduction**; and
- **0.9 per 1,000** with required re-entry of the patient's initials, gender, and age, a **41% reduction**.

For identity re-entry, the odds ratio was 0.60 with a 95% confidence interval of 0.50 to 0.71 and `p < .001`.

**Source:** Adelman et al., ["Understanding and preventing wrong-patient electronic orders: a randomized controlled trial"](https://pmc.ncbi.nlm.nih.gov/articles/PMC3638184/), *Journal of the American Medical Informatics Association*, 2013.

**Caveats:** the endpoint was a proxy with a reported positive predictive value of 76.2%, not a direct count of completed harmful orders. Required re-entry did not eliminate errors and added a mean 6.6 seconds per ordering session. The users were clinicians operating an electronic health record, not AI agents editing Figma.

**Relevance:** this is unusually close to figma-edit-mcp's right-node assurance. Requiring independent target evidence at the action boundary admitted fewer wrong-target operations than presenting identity information behind a simple confirmation.

### Barcode verification reduced admitted administration errors

**Supports:** the broader admission-control proposition: checking identity and compatibility immediately before an operation can reduce errors that reach the operational environment.

Poon and colleagues observed **14,041 medication administrations** and reviewed **3,082 order transcriptions** before and after implementation of barcode-enabled electronic medication administration records.

They reported:

- non-timing administration errors falling from **11.5% to 6.8%**, a **41.4% relative reduction** (`p < .001`);
- potential adverse drug events from those errors falling from **3.1% to 1.6%**, a **50.8% relative reduction** (`p < .001`); and
- transcription errors falling from **6.1% to zero**.

**Source:** Poon et al., ["Effect of Bar-Code Technology on the Safety of Medication Administration"](https://www.nejm.org/doi/full/10.1056/NEJMsa0907115), *New England Journal of Medicine*, 2010.

**Caveats:** this was a quasi-experimental rollout comparison rather than a randomized trial, and the intervention bundled barcode scanning with an electronic medication-administration record. Timing-related potential harm did not decline significantly. Workarounds, incorrect scanning, and uncovered error classes remained possible.

**Relevance:** the study measures admitted operational errors rather than mere warning compliance. It supports the direction of the boundary mechanism without supplying a transferable effect size for Figma or AI agents.

### Reducing new defect inflow accompanied a long-run decline in Android memory-safety vulnerabilities

**Supports:** the lifecycle argument: reducing the arrival of a defect class can allow its remaining stock to decline as old defects are repaired or retired.

Google reported that Android's annual memory-safety vulnerability count fell from **223 in 2019 to 85 in 2022** as a growing share of new development moved to memory-safe languages. In September 2024 Google had recorded **27** such vulnerabilities and extrapolated **36** for the full year. Their share of Android vulnerabilities fell from 76% in 2019 to 24% in 2024.

Google's 2025 update reported that memory-safety vulnerabilities had fallen below 20% of Android vulnerabilities. It also reported approximately five million lines of Android Rust and one potential Rust memory-safety vulnerability found and fixed before release, yielding Google's estimate of 0.2 per million lines versus historical Android C/C++ density near 1,000 per million.

The lifecycle mechanism is:

> `next defect stock = existing defects + admitted new defects − removed defects`

Memory-safe languages reduced the admitted-defect term. Existing vulnerabilities still had to be found, fixed, or retired.

**Sources:**

- Google Security Blog, ["Memory Safe Languages in Android 13"](https://security.googleblog.com/2022/12/memory-safe-languages-in-android-13.html), 2022.
- Google Security Blog, ["Eliminating Memory Safety Vulnerabilities at the Source"](https://security.googleblog.com/2024/09/eliminating-memory-safety-vulnerabilities-Android.html), 2024.
- Google, ["Rust in Android: move fast and fix things"](https://blog.google/security/rust-in-android-move-fast-fix-things/), 2025.

**Caveats:** these are Google's reports about its own codebase, not independent or randomized evaluations. Language selection, code age, developer differences, concurrent fuzzing, hardened allocators, sanitizers, and continuing repairs confound attribution. The 2024 figure was projected, the 2025 post appeared before year-end, and the Rust-versus-C/C++ density comparison contrasts contemporary Rust with historical C/C++ rather than randomly assigned equivalent code.

**Relevance:** the evidence supports a defect-inflow mechanism and the feasibility of improving a large existing system without wholesale rewriting. It does not support the claim that prevention alone cleaned Android or that no old defects were repaired.

### Counterevidence: hard enforcement can preserve the wrong predicate

**Supports:** the design boundary that only mechanically decidable invalidity should become a hard invariant.

Strom and colleagues randomized 1,981 clinicians to standard practice or a nearly-hard-stop alert intended to prevent concurrent orders for warfarin and trimethoprim-sulfamethoxazole. The alert strongly changed prescribing: the desired response occurred in 57.2% of intervention alerts versus 13.5% in controls.

The study was stopped early after four clinically important treatment delays in the intervention group. In those cases, the rule blocked or delayed therapy that the clinical context required.

**Source:** Strom et al., ["Unintended Effects of a Computerized Physician Order Entry Nearly Hard-Stop Alert to Prevent a Drug Interaction"](https://jamanetwork.com/journals/jamainternalmedicine/fullarticle/226004), *Archives of Internal Medicine*, 2010.

**Caveats:** this is a medical decision-support intervention, not an AI artifact-editing system. The alert was nearly rather than completely non-bypassable, and its predicate concerned context-sensitive clinical risk rather than mechanically invalid state.

**Relevance:** enforcement reliably applies the rule it is given; that does not prove the rule represents the user's actual objective. figma-edit-mcp should use hard refusal for scope, identity, referential integrity, type, and protection predicates, while continuing to treat design intent as a residual risk outside mechanical enforcement.

### What the evidence supports

Taken together, the evidence supports the following bounded claims:

1. **Programmatic checks are more reliable than instructions for enforcement.** Instructions can reduce prohibited proposals; an unavoidable runtime check can prevent those proposals from executing even when the agent still attempts them.
2. **Local checks compose into a longitudinal property.** If every relevant write is mediated, every accepted successor satisfies the predicate, and refusal does not mutate the file, the predicate is preserved across the tool-mediated history.
3. **Reducing admitted errors produces a cleaner counterfactual artifact.** From the same starting state and attempted violating operation, the checked path contains no more—and sometimes fewer—covered defects than the unchecked path.
4. **Reduced defect inflow can lower the long-run stock.** When existing defects continue to be repaired or retired, reducing new admissions can make the total stock decline.
5. **The predicate determines the value of enforcement.** Hard checks are strongest for objective invalidity; enforcing a context-sensitive proxy can block correct work.

The evidence does not establish:

- that the plugin can enforce subjective design intent;
- that every programmatic predicate is correct merely because it is deterministic;
- that prevention repairs defects already present;
- that every refusal makes the final file cleaner after an adaptive agent chooses a different plan;
- that the external effect sizes transfer quantitatively to Figma; or
- that the complete figma-edit-mcp guard suite reduces final-file defects by a particular measured amount.
~~~

## Proposed claim-to-evidence map

| Claim in the philosophy | Primary evidence | Evidential status |
|---|---|---|
| Programmatic enforcement is more reliable than model instructions for preventing prohibited execution | Runtime MCP policy-enforcement experiment | Same-agent controlled benchmark; small constructed security task set |
| A rejected invalid edit can improve an AI agent's task result | SWE-agent linting ablation | Closest guarded-edit analogue; task resolution rather than final cleanliness |
| Required independent target verification reduces admitted wrong-target actions | Adelman et al. randomized identity-reentry trial | Large randomized operational study; human healthcare users and proxy endpoint |
| Boundary verification can reduce actual operational error rates | Poon et al. barcode/eMAR study | Direct observed errors; quasi-experimental bundled intervention |
| Per-write enforcement preserves a state invariant across a sequence | Deductive argument plus PostgreSQL constraints | True by construction under complete mediation and correct implementation; not an effect-size study |
| Reducing new defect inflow can contribute to declining defect stock | Android memory-safety reports | Large longitudinal production system; observational vendor data with concurrent interventions |
| Hard enforcement can create new errors when the predicate is an imperfect proxy | Strom et al. nearly-hard-stop randomized trial | Strong counterevidence from a remote, context-sensitive domain |
| The complete figma-edit-mcp guard suite produces a quantified reduction in final-file defects | No direct evidence yet | Project-specific hypothesis requiring measurement |

## Recommended project-specific evaluation

External evidence supports the design mechanism. The strongest evidence for this project would test the exact file states and checks rather than relying on analogies.

### 1. Conformance tests for every invariant

For each guarantee in `SAFETY.md`:

1. Start from a disposable file state that satisfies the invariant.
2. Record a semantic snapshot of all state the attempted operation could affect.
3. Submit an operation that would violate the invariant.
4. Assert the expected structured refusal code.
5. Record the post-refusal state.
6. Assert semantic equality between the relevant pre- and post-refusal states.

This directly tests the two premises required by the philosophy: the invalid transition is refused and refusal is non-mutating.

### 2. Guard-removal or shadow-mode comparison

In a test-only build or simulation, replay the same violating operation with the relevant gate disabled or operating only in shadow mode.

Demonstrate that:

- the normal guarded path refuses the transition and preserves the state;
- the test-only unchecked path admits the transition or reaches the prohibited state; and
- the difference is caused by the named guard rather than a downstream Figma refusal.

Never weaken the production plugin or run the unchecked condition against user files.

### 3. Sequence and property testing

Generate sequences containing valid and invalid operations. After every call, assert that all invariants that held initially and were supposed to be preserved still hold.

Include:

- repeated refusals;
- mixtures of reads and writes;
- batches with an invalid member at different positions;
- changes in file state between separate calls;
- multiple guards applying to the same operation; and
- permitted escape hatches and residual risks documented in `SAFETY.md`.

This tests the nontrivial composition claim: local guards continue to preserve the property over a long edit history.

### 4. Paired agent evaluation

To measure the actual Safer → Cleaner effect rather than only conformance, compare guarded and instrumented test-only unchecked conditions across representative tasks.

Keep constant:

- model and version;
- system and task prompts;
- available instructions and skill resources;
- MCP schemas and tool descriptions;
- starting file snapshots;
- task, time, token, and retry budgets; and
- Figma and plugin versions.

Because the agent adapts after a refusal, measure complete trajectories and final artifacts rather than assuming the later calls remain identical.

### 5. Primary measures

- prohibited operations attempted;
- prohibited operations refused;
- prohibited operations executed;
- covered defects in the final file;
- uncovered defects in the final file;
- false refusals;
- valid repairs blocked;
- refusals followed by a valid correction;
- refusals followed by a different harmful action;
- task correctness; and
- human intervention.

Report results by individual invariant and error class. An aggregate can hide one highly effective guard and another that is noisy or net harmful.

### 6. Falsifiable predictions

The revised philosophy predicts that:

1. For a fixed violating call, the guarded path never commits the covered invalid state while the otherwise-equivalent unchecked path sometimes does.
2. A file beginning in a covered clean state remains in that state after arbitrary tool-mediated sequences, subject to the assumptions in `SAFETY.md`.
3. Instructions reduce the number of invalid attempts but do not eliminate them.
4. Adding the runtime guard reduces executed violations even when attempted violations remain.
5. Over representative agent tasks, the guarded condition ends with fewer covered defects unless false refusals or adaptive substitutions offset the benefit.

Publishing negative results against predictions 3–5 would improve the philosophy by identifying instructions that already suffice, guards that do not matter in practice, or checks whose refusal behavior creates new problems.

## Recommended final position

After these changes, the documents can make a strong and defensible claim:

> **Programmatic checks are more reliable than instructions for enforcing mechanically checkable rules because they operate at the execution boundary rather than depending on model compliance. Applying the same check to every relevant write composes individual refusals into a preserved file invariant. This makes covered dirty states unreachable through the tool, and reducing their inflow allows normal repair and retirement to reduce the defect stock over time.**

This formulation preserves the existing checks-versus-instructions argument, gives Safer → Cleaner a stronger systems insight, corrects the Android overstatement, and separates what follows by construction from what still requires project-specific measurement.
