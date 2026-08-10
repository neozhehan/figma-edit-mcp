# Design Philosophy

> **Draft.** This is a proposed restructure of [DESIGN_PHILOSOPHY.md](../../DESIGN_PHILOSOPHY.md), written in response to [8 - Causal Structure Review.md](./8%20-%20Causal%20Structure%20Review.md). The claims and evidence are carried over from the current document; what changes is the organization. A summary of the changes, and the follow-up work this would create, is at the end.

The [README](../../README.md) states what figma-edit-mcp does. This document explains why we built it that way. The exact enforcement rules live in [SAFETY.md](../../SAFETY.md), and the evidence behind the claims here — direct quotes and links to sources — is collected in [EVIDENCE.md](../../EVIDENCE.md).

## Who this is built for

figma-edit-mcp is a tool whose primary user is not a person. It is an AI model composing calls. Four things are true of that user, and the rest of this document follows from them.

- **It does not remember your rules.** It may have read them at the start of the session, or not at all. Over a long session, its attention to any single rule fades.
- **It sees only what it is given.** Anything the file does not record, and anything a response leaves out, does not exist for it.
- **Every return trip costs something.** Each turn spends time, tokens, and context.
- **It is capable and sometimes confidently wrong.** It will propose actions that look correct and are not.

Four design rules follow:

1. **Put the rule in the tool, not in the prompt** — because the model will not reliably hold the rule.
2. **You can only enforce what the file records** — because a check cannot read an intention that was never written down.
3. **Return control only when there is something new to decide** — because turns cost and most operations decide nothing.
4. **Make every result decision-complete** — because the model's next move is built from the last response and nothing else.

Rules 1 and 2 govern what the tool refuses. Rules 3 and 4 govern the shape of the exchange. None of them are specific to Figma.

## What we are trying to achieve

Three goals measure whether the rules are working.

- **Safer** — more errors are caught and prevented, and there are fewer ways to make an error in the first place.
- **Cleaner** — this has two parts, and the difference matters. One is *what is wrong in the file*: broken relationships, orphaned references, accidental near-duplicates. The other is *how much of the intent the file records*: shared decisions stored once as variables, styles, or components, with explicit links from everything that uses them, and names that distinguish legitimate alternatives.
- **Faster** — tasks complete correctly in less time.

The two parts of Cleaner do different work. Rule 1 lowers what is wrong in the file. Rule 2 depends on how much the file records. Preventing a bad deletion does not create explicit links, and making a link explicit does not create a safeguard.

**The goals are connected, but they are not separate accounts.** A single prevented mistake makes the file safer, leaves it cleaner, and saves the time that repairing it would have taken. That is one benefit seen from three sides, not three benefits. Where this document traces a connection between goals, it is describing a path, not adding a column.

Two consequences are worth stating plainly, because the goals can otherwise be read as promising more than they do.

**The connection from Safer to Cleaner and back is a maintenance cycle, not a self-starting one.** Enforcement holds a state in place; it does not create one. Cleaning up a file makes new rules checkable, but someone still has to write the check. The cycle turns only while cleanup and enforcement work continue.

**Faster does not lead back to the other two.** Speed is where Safer and Cleaner become visible, but going faster is not itself a way to make a file safer or cleaner, and some ways of going faster work against both. That said, Safer and Cleaner are not only means to Faster. A design file that was not destroyed has value on the day nobody was going to touch it again.

## Rule 1 — Put the rule in the tool, not in the prompt

There are two ways to stop any tool, or any person, from making a particular mistake. You can give an instruction — "don't delete something that other things still depend on" — and hope it is followed. Or you can put a check before the action, so the action cannot go through when it would break the rule. The first depends on attention and memory. The second does not.

An instruction only makes the right action more likely. Whether it is followed still depends on the AI holding the rule in mind, reading the situation correctly, and choosing to apply it.

A check does not work that way. It runs before every action it covers, reads the file's actual current state, and gives the same answer every time — no matter which AI is connected, how full its context is, or whether it ever read the rules. The AI can still ask to do the forbidden thing. It cannot make the tool carry it out.

figma-edit-mcp checks every action the AI requests, inside Figma, before the action runs. An action that fails a check is refused, with an error message that tells the AI what was wrong. Each check enforces one rule on every action: is the target inside the area you are working in, is it really the layer the AI named, does a new layer have somewhere to go, is the layer locked, does this variable still have things using it. Batch edits follow the same principle — every item is validated before anything changes, so a batch with a single bad item changes nothing.

**What repetition adds.** Stopping one bad action prevents one mistake. Running the same check before every change keeps the rule true for the whole session.

**What a check does and does not make permanent.** Not every enforced rule becomes a property the file stores. Some rules describe the file's state, such as "no layer refers to a variable that no longer exists." Others constrain which changes are allowed, such as "only layers inside the working area may be modified." A state rule that already holds stays true for as long as every change capable of breaking it goes through the check. A rule about which changes are allowed shapes the file without ever being stored in it.

**A check only guarantees the rule it tests.** figma-edit-mcp can verify where an edit lands, which layer it targets, and what type of change it makes. It cannot verify whether the edit is the one you wanted. A wrong edit that follows all the rules will go through. [SAFETY.md](../../SAFETY.md) records this as residual risk R2.

**What this achieves.** Think of the errors in a file as a level that rises when new errors are added and falls when old ones are fixed. The checks do not erase the errors already there — they stop new ones from being added. If you and the AI keep fixing old errors while fewer new ones arrive, the level falls. The checks do not clean the file; they hold a clean state in place and let ordinary work reduce what remains. Note that the level can still rise while the checks are helping: preventing inflow leaves the file better than it would otherwise have been, which is not the same as leaving it better than it was.

**Evidence.** In the closest guarded-edit analogue, the SWE-agent research team gave a coding agent an edit command that discards any edit introducing a syntax error and asks the agent to retry — the same pattern figma-edit-mcp uses — and the agent solved 18.0% of its benchmark tasks with the check versus 15.0% without it. A randomized trial covering 901,776 clinical ordering sessions found that requiring a clinician to re-enter the patient's identity cut wrong-patient orders by 41%, against 16% for a click-through confirmation alone. In a controlled security benchmark for tool-calling agents, moving the same model behind a runtime check at the tool-call boundary cut successful attacks from 40% to 5% while the model kept attempting them — the check stopped the consequence, not the attempt.

At scale, and over years: in 2019, memory-handling errors caused 76% of Android's security vulnerabilities. Google then required new code to be written in languages whose compilers refuse memory-unsafe code, and left the existing code in place. The annual count of these vulnerabilities fell from 223 in 2019 to 85 in 2022, on the way to a projected 24% share by 2024. Google did not rewrite the old code. It kept fixing old vulnerabilities and hardening the rest while new ones stopped arriving. The decline came from reduced inflow together with continued removal, not from prevention alone. ([Methods, limitations, and sources](../../EVIDENCE.md#safer-leads-to-cleaner).)

**This project ships instructions too.** The `figma-edit` skill and the `figma-edit://guide/*` resources teach the AI the rules before it starts. They are a useful preventive layer — an AI that knows the rules wastes fewer calls on actions figma-edit-mcp would refuse — but the guarantees are stronger because they never depend on the AI reading or following them.

## Rule 2 — You can only enforce what the file records

Any design or engineering document can hold a decision in one of two forms. The decision can be recorded as structure that the software stores and can read back — a stated link from one thing to another. Or it can exist only as a convention: the author knows two things are meant to match, but nothing in the file says so. The two forms can produce the same visible result. They are not the same to a checker. A check can read a recorded relationship and act on it. It cannot read an intention that was never written down.

So the more of the author's intent a file records as structure, the more of it a check can protect. This is what makes Rule 2 a design rule and not just an observation: it tells you that the enforcement surface of your tool is set by the environment it operates on, and that preserving structure is therefore part of building the safeguard, not a separate concern.

In Figma the choice shows up in concrete pairs. A layer can be explicitly bound to a variable, or it can just happen to contain the same value. A reusable element can stay an instance of a component, or it can be a detached copy that people still expect to behave like the component. A colour or spacing value in current use can be the only one of its kind, or it can sit next to leftover near-duplicates from earlier work. In each pair the design can look identical. Only the first form records what was intended, so only the first can be checked.

A file records more of that intent through three mechanisms:

1. **One authoritative copy.** A shared decision is stored once and referred to, rather than pasted into many places that can each be changed on their own. In Figma that single store is a variable, style, or component. Keeping one copy removes the situation where some uses get updated and others are silently left behind.
2. **Explicit links.** Whatever uses a shared decision stays connected to it, so the software can list every user. In Figma the plugin can find everything that uses a variable and refuse to delete it while it is still in use. It cannot do the same for a layer that merely holds an equal value, because nothing in the file records that the value was meant to follow the variable.
3. **Fewer valid-but-wrong choices.** Leftover and accidental near-duplicates are removed, so they are no longer sitting there to be picked by mistake. Distinct names help the plugin's name check tell targets apart, but the larger gain is removing alternatives that would pass every structural check and still be the wrong one. This mechanism works differently from the first two: it reduces the chance of an error without any checker being involved.

**Evidence.** The same pattern appears well outside design tools, which is the reason to trust it rather than treat it as a quirk of Figma.

- **Engineering CAD software**, which engineers use to model physical parts, can record how the pieces of a model depend on one another. In a study comparing modelling styles, the models that recorded those dependencies showed an error pointing straight at the piece that broke when a designer changed something it relied on. A style that left the dependencies out instead produced broken geometry that still looked finished, so the mistake could pass unnoticed.
- **Databases** can be told that one record depends on another. Once that link is declared, the database refuses to delete a record that other records still point to. Without the declared link, the same deletion goes through and leaves broken references behind.
- **Copied code.** When programmers duplicate a block of code instead of sharing a single copy, a bug in the original is carried into every duplicate, and a later fix often reaches only some of them.
- **Hospital patient names.** Units caring for newborns that gave babies near-identical temporary names, such as "Babyboy Smith," had staff place orders on the wrong baby. Giving each newborn a more distinctive name reduced those wrong-patient orders.

Each shows the same thing: a safeguard helps when the relationship it depends on is recorded, and cannot help when that relationship exists only by convention. ([Quotes, methods, limitations, and sources](../../EVIDENCE.md#cleaner-leads-to-safer).)

**Stated precisely.** Recording more intent makes more rules enforceable. It does not enforce them. Turning a newly explicit relationship into a working safeguard is a separate piece of engineering, and until someone does it the file is more checkable but no safer.

## Rule 3 — Return control only when there is something new to decide

A model turn is one reasoning cycle: the AI reads the last result, thinks, and composes its next call. A single operation does not justify another turn. Another turn is useful when the AI must see an operation's result before it can determine what follows. If the AI can already state the remaining operations — or a rule that selects them — returning after every operation adds coordination without adding judgment.

The boundary test is: **can the AI state what follows, or the rule for determining it, before seeing the result?** If yes, the work can stay inside the current call. If no, the result marks a real decision, and control should return to the AI.

"Already determined" covers more than a fixed list. It includes deterministic control logic — a filter, loop, comparison, or branch — that the AI can state now and ordinary code can apply. It does not include a choice that depends on the AI interpreting an observation it has not yet seen.

**How the plugin applies it.** Once the AI has determined the targets and changes, a batch lets it express them in one invocation. The plugin still validates and executes every item; what disappears is the requirement to return to the AI between items that require no new judgment. This is why the speed of a batch does not depend on Figma executing each operation faster.

Batch tools have a second, separate property — every item is validated before anything changes — which belongs to Rule 1 and is described there. Consolidating a call and validating a whole request are different features with different benefits: valid requests gain from consolidation, invalid ones from validation.

The current batch tools implement the simplest case: the AI supplies the full list of items and arguments together. The rule also identifies a future opportunity for higher-level tools, where a filter, loop, comparison, or branch stays inside one call because the AI can state the rule before execution. That an intermediate value selects which branch runs does not by itself require another turn; a turn becomes useful when the AI must see the value before it can decide what the value means for the task.

**Evidence.** This boundary, rather than a blanket preference for fewer calls, is what the measurements support. Anthropic's programmatic tool calling — letting a model run many tool calls inside one turn — cut billed input tokens by roughly 38% with no change in accuracy on a multi-tool benchmark, yet on tasks whose every call depends on fresh model judgment it left scores unchanged and cost roughly 8% more. ([Sources, methods, and limitations](../../EVIDENCE.md#faster-designing-tools-around-decisions).)

## Rule 4 — Make every result decision-complete

The contract between tool and model has two jobs.

Before execution, it must expose the parameters, distinctions, and constraints the AI needs to translate its current decision into a valid request. A required read discovers facts about the design. Trial and error caused by an ambiguous interface merely discovers facts the tool already knew.

After execution, the result must supply what the AI needs to decide what happens next. A success response should make the outcome legible. A refusal should identify the failed condition, the observed value that failed it, and — when it can do so safely — the alternatives the plugin would have accepted. An opaque result forces another turn to reconstruct information the tool already possessed.

We call such a result decision-complete: it contains what the next decision needs, and as little else as possible. Decision-complete does not mean short. Irrelevant output consumes context, but removing an exact identifier, an edit anchor, or an accepted value can create more work than the shorter result saves. The goal is the smallest result that makes the next decision possible.

**Refusals are where Rules 1 and 4 meet.** Rule 1 turns an invalid mutation into a refusal. Rule 4 makes recovery from that refusal cheap, by naming the condition that failed while the target, parameters, and intended operation are all still current. A local correction replaces a later investigation. Neither rule produces that saving alone, which is why it is described here once rather than credited to enforcement and to the interface separately.

**Evidence.** Filtering results down to what the next decision needs improved benchmark performance by 11% while using 24% fewer input tokens. Refusals that named the accepted alternatives raised repair success by roughly 40 percentage points over raw diagnostics. A study that trimmed tool results too aggressively cut tokens but raised total cost and failures. Most of these results measure tokens, steps, and success rather than elapsed time. ([Sources, methods, and limitations](../../EVIDENCE.md#faster-designing-tools-around-decisions).)

## Why this pays

Two facts about the economics make the rules worth their cost.

**Preventing an error costs less than repairing it.** A refused action does not alter the file, so later work never begins from an invalid state, and the defect never gets the opportunity to acquire consumers, be duplicated, become entangled with later valid work, or force a rollback that discards good changes.

Other industries have measured this, including the overhead of the checks themselves. IBM's original inspection study reported 23% higher coding-operation productivity after counting inspection and rework effort, together with 38% fewer errors during later equivalent testing. A field study of 30 industrial software products modeled both the direct overhead of process controls and the quality-mediated reduction in rework; at the sample average, the estimated net effect was lower cycle time and effort. An observational study of 35 industrial projects found that automated static analysis identified unique defects with comparatively low find-and-fix effort and modeled a positive operational return. ([Quotes and sources](../../EVIDENCE.md#safer-leads-to-faster).)

Stated precisely: this is an expected end-to-end effect for the failure modes the checks cover. It is zero in a task where no covered harmful action would otherwise occur, and largest for latent, high-fan-out, or difficult-to-reverse errors.

**Disorder is paid for again by every task that reads, reuses, or changes it.** A cleaner file does not make every task faster. The effect appears when a task must interpret, reuse, or modify the affected part of the file — and then it appears every time. Semantic names, clear component roles, and a single authoritative token reduce the reads and decisions needed to identify the intended target. Current components, variables, and styles let the AI reuse established work instead of recreating it. Broken references, inconsistent structures, and latent binding errors create work for whichever later task encounters them.

In a counterbalanced Figma experiment, designers completed matched tasks 34% faster when they had a current, task-relevant design system instead of old design files to search. In a controlled experiment with 72 professional developers, meaningful word identifiers made finding semantic defects 19% faster than abbreviations or single letters. Studies of CAD models, production codebases, and structural antipatterns point the same way: structure that communicates intent lowers the cost of later modification, and combinations of structural problems raise it. Figma's own guidance for its MCP server makes the point from the other direction — structured files with real components, semantic layer names, and variables [produce the best model output](https://developers.figma.com/docs/figma-mcp-server/structure-figma-file/). ([Quotes, methods, limitations, and sources](../../EVIDENCE.md#cleaner-leads-to-faster).)

Stated precisely: this is an expected lifecycle effect, largest in frequently reused or high-churn structures.

**Where a saving belongs.** These two facts overlap, and it is worth being explicit about how. When a check prevents a defect and later work is therefore easier, the saving belongs to the file never having received the defect. Enforcement's own direct saving is narrower: the correction made at the boundary, while the context of the failed call is still to hand. Counting both the local correction and the avoided downstream repair as separate wins for enforcement would describe the same avoided work twice.

### One example, end to end

Figma lets you delete a variable that layers still use. It shows no warning, and provides no complete way to list and repair the resulting broken references. Users on Figma's own forum describe the consequences: one user found [1,548 orphaned variable references](https://forum.figma.com/suggest-a-feature-11/make-it-easier-to-fix-broken-variable-references-33999) after reorganizing their variables, and the "Detach deleted variables" quick action [fixes only some of them](https://forum.figma.com/ask-the-community-7/locate-and-delete-lingering-used-variables-16794).

All four rules meet in this one case:

- Because Figma records which layers are bound to the variable, the dependency can be read back at all (Rule 2). Layers that merely hold an equal value are invisible to the same check.
- Because that relationship is observable, figma-edit-mcp can check it before every deletion and refuse the ones that would break it (Rule 1).
- The refusal names the variable's remaining consumers, so the AI can act on the answer instead of asking again (Rule 4).
- The check runs inside the call that requested the deletion, so no extra turn is spent discovering the problem (Rule 3).

The result is a file that never acquires 1,548 broken references. That is one avoided repair, not four. The example is worth stating once, in full, rather than as separate evidence under each rule.

## What this costs

Every rule here has a cost, and the costs are what tell you where to apply each rule rather than applying it everywhere.

- **Checks add latency and false refusals.** A check runs on every covered action, including the overwhelming majority that were fine. A check whose predicate is slightly wrong refuses correct work, and the recovery from a wrong refusal is real work.
- **Cleanup is paid up front.** Making implicit structure explicit costs time before it saves any.
- **A shared source concentrates impact.** A wrong edit to a shared variable or component reaches more places than a wrong edit to a single local copy. A shared source is safer when its links are visible and the point of change is guarded — not on its own.
- **Deduplication can erase real distinctions.** Two values that look like near-duplicates are sometimes two decisions.
- **Larger batches amplify a wrong decision.** Consolidation removes turns, and turns are also where a mistaken plan could have been noticed. A wrong batch that passes validation is wrong in more places at once.
- **Whole-request rejection enlarges the retry.** When one item fails, the whole request is refused, and the AI must resubmit work that was individually valid.
- **Explicit structure has to be maintained.** A recorded relationship that no longer reflects intent is worse than no record, because a check will faithfully enforce it.

The selection rule that follows: enforce where the rule is mechanically decidable, where the error is expensive or hard to reverse, and where the check can be stated precisely enough that correct work is not caught by it. Structure what is genuinely shared. Batch what is genuinely already decided.

## Where this does not reach

The rules bound the file's structure and the tool's behaviour. They do not bound intent. The AI can bind the wrong variable, pick the wrong but valid component, or make a wrong edit to the right target — and every one of those actions can pass every check. [SAFETY.md](../../SAFETY.md) records this as residual risk R2 and lists the full set of checks with the conditions under which each holds.

---

These four rules and three goals produce the system described in the README: you direct the design, the AI executes the operations, and the plugin checks each one.

---

## Notes on this draft

**What changed from the current document**

- The organizing skeleton moved from six goal-to-goal arrows to four design rules. Each rule now has one home, so no feature is described under more than one heading.
- The premise about the AI as the consumer of the tool, previously implied in two scattered sentences, is stated first and the rules are derived from it.
- The "four insights" count problem is resolved by separating the two design rules that were bundled (enforcement and observability) and demoting the two economic claims to the section that explains why the rules pay.
- The third insight's headline was replaced. It previously claimed defects cause further defects; its mechanisms and evidence describe a recurring cost of search, reuse, and rework, which is what the new wording states.
- Cleaner is defined in two named parts, and each rule says which part it uses.
- The Safer/Cleaner cycle is described as a maintenance cycle that requires continued cleanup and safeguard work, resolving the tension between the old line 11 and line 37.
- The absence of Faster-to-Safer and Faster-to-Cleaner connections is now explained rather than left as a gap.
- Refusal diagnostics, batch consolidation, and batch validation are each described once, in the rule that owns them.
- The variable-deletion example is presented once, as the worked example spanning all four rules.
- Tradeoffs are collected into one section and given a selection rule, rather than appearing as caveats attached to individual claims.
- Added: the note that a file's error count can still rise while the checks are helping, and the statement that Safer and Cleaner have value independent of time saved.

**Follow-up this would create**

[EVIDENCE.md](../../EVIDENCE.md) is organized by the arrow structure this draft replaces — its top-level sections are "Safer leads to Cleaner," "Safer leads to Faster," "Cleaner leads to Faster," "Cleaner leads to Safer," and "Faster: designing tools around decisions." The links in this draft point at those existing anchors and resolve correctly, but the mapping is no longer one-to-one: Rule 1 draws on two sections, and Rules 3 and 4 both draw on the Faster section. If this restructure is adopted, EVIDENCE.md should be re-sectioned to match, and the anchors here updated.

Nothing in this draft changes [SAFETY.md](../../SAFETY.md) or the README.
