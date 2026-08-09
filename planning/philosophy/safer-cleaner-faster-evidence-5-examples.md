# Real-World Evidence for the Safer → Cleaner → Faster Philosophy

This document collects concrete, externally sourced examples that support causal links between **Safer**, **Cleaner**, and **Faster** systems.

These are not one-to-one claims that design files behave exactly like databases, factories, deployment pipelines, or agent research benchmarks. They are evidence that the same operating pattern appears in mature domains:

> Guardrails are not just defensive. In mature systems, constraints and cleanup often create speed by preventing invalid state, reducing ambiguity, and shrinking recovery work.

---

## Executive Summary

| # | Evidence Area | Link Between Goals | Hardest Numbers / Facts | README-Relevant Lesson |
|---:|---|---|---|---|
| 1 | Figma ghost variables / deleted in-use variables | **Safer → Cleaner** | Public Figma Forum report: **1,548** deleted-variable references detached by the quick action, yet cleanup still missed at least one frame linked to a deleted variable. | Deleting variables without consumer checks can create large-scale dangling-reference cleanup work. |
| 2 | Structured Figma files for AI/MCP | **Cleaner → Faster / Better** | Figma says semantic names help the model understand what it is working with; Code Connect prevents the model from “guessing”; Auto Layout usually yields cleaner, more predictable code. Quantitative support is adjacent: SupervisorAgent reports **29.68%** token reduction on GAIA/Smolagent without compromising success rate. | Cleaner structure gives agents better context and reduces guessing/retry work. |
| 3 | Database constraints / referential integrity | **Safer → Cleaner** | PostgreSQL foreign keys make invalid child references impossible; Gartner estimates poor data quality costs organizations **at least $12.9M/year on average** and says **59%** of organizations do not measure data quality; IBM reports a Unity bad-data incident cost about **$110M** in lost revenue. | Prevent invalid references before they enter the system. |
| 4 | DORA / high-performing software delivery | **Safer ↔ Faster** | Google Cloud’s 2021 Accelerate report says elite performers deploy **973×** more frequently, have **6,570×** faster lead time, restore service **6,570×** faster, and have a **3× lower** change-failure rate than low performers. | Safety and speed can reinforce each other when changes are smaller, clearer, validated, and recoverable. |
| 5 | Toyota / 5S / lean production | **Cleaner → Faster**, also **Cleaner → Safer** | Academic 5S case study: operational time reduced **8%** for blowing and **18%** for printing; iSixSigma case study: finance report workflow reduced from **3 hours to 10 minutes** (**94.4% reduction**, **18× speedup**). | Clean, standardized environments reduce search, motion, waiting, ambiguity, and defects. |

---

## 1. Figma Ghost Variables / Deleted In-Use Variables

**Best link:** **Safer → Cleaner**

This is the most directly relevant example because it is inside Figma itself.

The relevant pattern is:

> If the editor allows deletion of a shared token/variable while consumers still reference it, the file can accumulate broken or “ghost” references that are hard to find and clean up later.

That maps directly to a safety guard that refuses to delete variables still in use.

### Hard Numbers and Evidence

| Evidence | Number / Fact | Source |
|---|---:|---|
| Broken variable references after deletion | A Figma Forum user reports that deleting variables can leave references to nonexistent variables “all over the place.” | [Figma Forum: Make it easier to fix broken variable references](https://forum.figma.com/suggest-a-feature-11/make-it-easier-to-fix-broken-variable-references-33999) |
| Large-scale cleanup | A user reports that Figma’s **Detach deleted variables** quick action detached **1,548 variables**. | [Figma Forum: Make it easier to fix broken variable references](https://forum.figma.com/suggest-a-feature-11/make-it-easier-to-fix-broken-variable-references-33999) |
| Incomplete cleanup | The same thread reports that the quick action did **not** detach all deleted variables; after running it, the user clicked a frame and it was still linked to a deleted variable. | [Figma Forum: Make it easier to fix broken variable references](https://forum.figma.com/suggest-a-feature-11/make-it-easier-to-fix-broken-variable-references-33999) |
| No automatic/simple full fix in some cases | Figma Community Support says that if **Detach deleted variables** does not work, remaining ghost variables may still be actively used from collections within components or deleted color styles, and users should review the file manually. | [Figma Forum: How to clear “Used variables” that don’t exist in the file anymore?](https://forum.figma.com/ask-the-community-7/how-to-clear-used-variables-that-don-t-exist-in-the-file-anymore-18616) |
| Official delete path is simple deletion | Figma’s variable-management docs describe deleting a variable by right-clicking and selecting **Delete variable**. The public doc does not describe an in-use consumer scan or warning. | [Figma Help: Create and manage variables and collections](https://help.figma.com/hc/en-us/articles/15145852043927-Create-and-manage-variables-and-collections) |
| Ghost variables are recognized as a user-facing Figma problem | External Figma guides describe “ghost variables” as deleted variables that are still being used in a Figma file. | [Delasign: How to remove deleted variables that are still attached in Figma](https://www.delasign.com/blog/figma-detach-deleted-variables/) |

### Evidence-Weighted Takeaway

In-use variable deletion is not hypothetical. Public Figma users have reported broken “ghost” variable references at large scale, including one case where **1,548** deleted-variable references were detached and cleanup still missed at least one broken link.

### README-Relevant Framing

> Deleted design variables can leave broken ghost references behind. The safer move is to scan consumers first and refuse the deletion before the file enters a dangling-reference state.

---

## 2. Structured Figma Files for AI/MCP

**Best link:** **Cleaner → Faster / Better**

This example supports the idea that cleaner, more structured Figma files give AI agents better context and reduce guessing.

Figma’s own MCP guidance is qualitative rather than quantitative, but it is highly relevant because it comes from Figma and speaks directly about AI agents consuming Figma files.

### Hard Numbers and Evidence

| Evidence | Number / Fact | Source |
|---|---:|---|
| Structured files improve AI output | Figma says structuring the file gives MCP and AI assistants better context so they can generate code that is clear, consistent, and aligned with the system. | [Figma Developer Docs: Structure your Figma file for better code](https://developers.figma.com/docs/figma-mcp-server/structure-figma-file/) |
| Components keep files cleaner | Figma says repeated things should be components because this makes reuse possible and keeps the file cleaner. | [Figma Developer Docs: Structure your Figma file for better code](https://developers.figma.com/docs/figma-mcp-server/structure-figma-file/) |
| Code Connect reduces guessing | Figma says Code Connect is the **#1 way** to get consistent component reuse in code and that without it, “the model is guessing.” | [Figma Developer Docs: Structure your Figma file for better code](https://developers.figma.com/docs/figma-mcp-server/structure-figma-file/) |
| Semantic names help model understanding | Figma says replacing default names like `Frame1268` and `Group5` with intent-driven names helps the model understand what it is working with and what functionality it should have. | [Figma Developer Docs: Structure your Figma file for better code](https://developers.figma.com/docs/figma-mcp-server/structure-figma-file/) |
| Auto Layout improves predictability | Figma says Auto Layout communicates layout intent and usually results in cleaner, more predictable code. | [Figma Developer Docs: Structure your Figma file for better code](https://developers.figma.com/docs/figma-mcp-server/structure-figma-file/) |
| Figma MCP is framed as quick and accurate | Figma’s help-center MCP guide says the MCP server helps developers explore and implement designs quickly and accurately, and that agents can use a design system as the source of truth. | [Figma Help: Guide to the Figma MCP server](https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server) |
| Runtime supervision can reduce token burn | The SupervisorAgent paper reports **29.68%** token-consumption reduction on GAIA/Smolagent without compromising success rate. The arXiv abstract reports **29.45%**, while the PDF text reports **29.68%**; cite the PDF value if quoting the more precise number. | [arXiv: Stop Wasting Your Tokens](https://arxiv.org/abs/2510.26585), [PDF](https://arxiv.org/pdf/2510.26585) |
| Guardrails can avoid expensive model/tool work | OpenAI Agents SDK docs describe guardrails as checks that can run before invoking a slow/expensive model; if the guardrail detects misuse, it can stop the costly model from running. | [OpenAI Agents SDK: Guardrails](https://openai.github.io/openai-agents-python/guardrails/) |
| Delayed guardrails can waste tokens | An OpenAI Agents Python issue describes a case where the main agent continues into an LLM request while a guardrail is still running, causing token waste; the issue proposes blocking/sequential validation for expensive tasks. | [openai-agents-python issue #867](https://github.com/openai/openai-agents-python/issues/867) |

### Evidence-Weighted Takeaway

Figma directly supports the “cleaner structure helps the model” part: semantic names, components, variables, Auto Layout, and Code Connect help the model understand the file and reduce guessing. External agent research and guardrail docs support the broader claim that early validation/supervision can reduce token and retry waste.

There is **no direct benchmark yet** showing a measured token reduction for this specific project. Keep README phrasing qualitative unless a project-specific benchmark is run.

### README-Relevant Framing

> Cleaner Figma files give agents better context: semantic names, components, variables, and Auto Layout help the model understand the file instead of guessing. Early guardrails also prevent expensive retry loops by failing before bad work propagates.

---

## 3. Database Constraints / Referential Integrity

**Best link:** **Safer → Cleaner**, with a secondary **Cleaner → Faster** argument.

This is the closest cross-domain analogy to refusing dangling references.

In relational databases, constraints are hard boundary checks. A foreign key prevents a child record from referencing a nonexistent parent record. PostgreSQL describes foreign keys as a mechanism for maintaining referential integrity; in its product/order example, it becomes impossible to create an order referencing a product that does not exist. PostgreSQL also supports `ON DELETE RESTRICT`, which prevents deleting a referenced row.

### Hard Numbers and Evidence

| Evidence | Number / Fact | Source |
|---|---:|---|
| Referential integrity | Foreign keys ensure values in one table match rows in another table; deletes can be restricted when referenced. | [PostgreSQL Documentation: Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html) |
| Cost of poor data quality | Gartner estimates poor data quality costs organizations **at least $12.9 million per year on average**. | [Gartner: Data Quality — Why It Matters and How to Achieve It](https://www.gartner.com/en/data-analytics/topics/data-quality) |
| Data-quality measurement gap | Gartner reports that **59%** of organizations do not measure data quality. | [Gartner: Data Quality — Why It Matters and How to Achieve It](https://www.gartner.com/en/data-analytics/topics/data-quality) |
| Concrete bad-data incident | IBM reports that Unity lost about **$110 million** in revenue after bad ingested data corrupted datasets used for advertising machine-learning models. | [IBM: The Cost of Poor Data Quality](https://www.ibm.com/think/insights/cost-of-poor-data-quality) |

### Evidence-Weighted Takeaway

The lesson is not that Figma files are databases. The lesson is that invalid references are cheapest and safest to reject **before** they enter the working system.

This supports product claims like:

- Do not delete variables that still have consumers.
- Do not write to stale or hallucinated nodes.
- Do not report success for a no-op.
- Reject invalid state at the boundary instead of repairing damage later.

### README-Relevant Framing

> Like database constraints, the safest time to reject a broken reference is before it enters the file.

---

## 4. DORA / High-Performing Software Delivery

**Best link:** **Safer ↔ Faster**

DORA is useful because it directly challenges the intuition that speed and safety are opposites.

DORA’s metrics measure both throughput and instability. Its research says speed and stability are not long-term tradeoffs: top performers perform well across both.

DORA also argues that smaller changes are easier to reason about, move through delivery, and recover from. That mechanism maps well to a guardrailed design-editing workflow: exact target names, scope checks, prevalidation, and structured refusal errors make automated edits less risky and easier to retry.

### Hard Numbers and Evidence

| Evidence | Number / Fact | Source |
|---|---:|---|
| Speed and stability relationship | DORA states that speed and stability are not tradeoffs; top performers perform well across both throughput and stability metrics. | [DORA: DORA Metrics](https://dora.dev/guides/dora-metrics/) |
| Deployment frequency | Elite performers deploy on demand / multiple times per day; Google Cloud reports this as **973×** more frequent than low performers. | [Google Cloud Blog: Announcing the 2021 Accelerate State of DevOps Report](https://cloud.google.com/blog/products/devops-sre/announcing-dora-2021-accelerate-state-of-devops-report) |
| Change lead time | Elite performers have lead time of less than one hour versus greater than six months for low performers; Google Cloud reports **6,570×** faster lead time. | [Google Cloud: 2021 Accelerate State of DevOps](https://cloud.google.com/resources/state-of-devops) |
| Service restoration | Google Cloud reports elite performers restore service **6,570×** faster than low performers. | [Google Cloud Blog: Announcing the 2021 Accelerate State of DevOps Report](https://cloud.google.com/blog/products/devops-sre/announcing-dora-2021-accelerate-state-of-devops-report) |
| Change failure rate | Google Cloud reports elite performers have a **3× lower** change-failure rate than low performers. | [Google Cloud Blog: Announcing the 2021 Accelerate State of DevOps Report](https://cloud.google.com/blog/products/devops-sre/announcing-dora-2021-accelerate-state-of-devops-report) |
| Mean failure-rate comparison | The 2021 report gives mean change-failure rates of **7.5%** for elite performers versus **23%** for low performers. | [Google Cloud: 2021 Accelerate State of DevOps](https://cloud.google.com/resources/state-of-devops) |

### Evidence-Weighted Takeaway

The relevant lesson is not “move recklessly.” It is the opposite:

> Safer systems can move faster because changes are smaller, clearer, validated, observable, and easier to recover from.

This supports product claims like:

- Guardrails reduce troubleshooting spirals.
- Clear errors are faster than silent wrong states.
- Prevalidated batches let automation move quickly without creating cleanup work.
- A trustworthy file reduces reasoning and repair overhead.

### README-Relevant Framing

> High-performing software teams do not get faster by removing safety. They get faster by making changes smaller, clearer, validated, and easier to recover from.

---

## 5. Toyota / 5S / Lean Production

**Best link:** **Cleaner → Faster**, with **Cleaner → Safer** also present.

Toyota’s lean production philosophy is almost a physical-world version of the Safer / Cleaner / Faster loop.

The Toyota Production System focuses on eliminating waste and shortening lead times. Its `jidoka` principle means stopping immediately when abnormalities are detected so defective products are not produced. Toyota also explicitly frames improvement around reducing waste, inconsistency, and unreasonable requirements: `muda`, `mura`, and `muri`.

The 5S method — sort, set in order, shine, standardize, sustain — is about keeping work environments predictable and uncluttered. This maps naturally to design files: fewer stray tokens, stale overrides, inconsistent components, and silent errors means less searching, hesitation, repair, and rework.

### Hard Numbers and Evidence

| Evidence | Number / Fact | Source |
|---|---:|---|
| Toyota Production System goal | Toyota describes TPS as eliminating waste and shortening lead times while delivering quickly, at low cost, and with high quality. | [Toyota: Toyota Production System](https://global.toyota/en/company/vision-and-philosophy/production-system/) |
| Built-in quality / `jidoka` | Toyota describes `jidoka` as stopping immediately when abnormalities are detected to prevent defective products from being produced. | [Toyota: Toyota Production System](https://global.toyota/en/company/vision-and-philosophy/production-system/) |
| Waste categories | Toyota explicitly names eliminating waste, inconsistency, and unreasonable requirements: `muda`, `mura`, and `muri`. | [Toyota: Toyota Production System](https://global.toyota/en/company/vision-and-philosophy/production-system/) |
| 5S academic case study | A 2022 open-access case study in a plastic-bag manufacturing company reports 5S reduced total operational time by **8%** for blowing and **18%** for printing. | [ScienceDirect: Implementation of 5S in a plastic bag manufacturing industry](https://www.sciencedirect.com/science/article/pii/S2666790822000933) |
| 5S office/process case study | An iSixSigma case study reports a finance report workflow reduced from **3 hours to 10 minutes** after applying 5S. That is a **94.4% reduction** in elapsed time, or an **18× speedup**. | [iSixSigma: Case Study — 5S in Practice](https://www.isixsigma.com/5s/case-study-5s-in-practice/) |

### Evidence-Weighted Takeaway

The lesson is that cleanliness is operational leverage, not cosmetic polish.

Cleaner, standardized environments reduce:

- searching,
- motion,
- waiting,
- ambiguity,
- rework,
- and defects.

That directly supports the README logic:

> A cleaner design file with fewer inconsistencies and less cruft lets an AI agent work faster.

### README-Relevant Framing

> Lean systems show the same loop in physical work: cleaner, standardized environments reduce search, motion, waiting, and defects — which makes work both safer and faster.

---

## Cross-Example Mapping Back to Safer / Cleaner / Faster

| Project Concept | Figma Ghost Variables | Structured Figma / MCP | Database Constraints | DORA | Toyota / 5S |
|---|---|---|---|---|---|
| Refuse deleting in-use variables | Prevents broken ghost references | Keeps model-facing token structure intact | `ON DELETE RESTRICT` | Validate before release | Stop abnormalities before defects propagate |
| Reject stale or hallucinated nodes | Avoids broken references | Semantic names help models understand targets | Prevent invalid references | Small explicit changes are easier to reason about | Standardized workspace reduces confusion |
| No silent success | Avoids hidden file damage | Better model context, less guessing | Constraints fail loudly | Observability and clear failure reduce recovery time | Stop the line when abnormality is detected |
| Cleaner design file | Fewer ghost references | Components, variables, Auto Layout, semantic names | Valid, consistent data | Lower failure and faster recovery | Less clutter, less wasted motion |
| Faster agent workflow | Less cleanup after broken references | Less guessing / fewer retries | Less downstream data repair | Faster lead time and recovery | Less searching, waiting, and rework |

---

## Evidence-Weighted Takeaway

The strongest defensible claim is:

> Guardrails create speed when they prevent invalid state, reduce ambiguity, and shrink recovery work.

Each example supports a different part of that loop:

- **Figma ghost variables** show that unguarded variable deletion can create large-scale broken-reference cleanup work.
- **Structured Figma MCP guidance** shows that cleaner files give agents better context and reduce guessing.
- **Database constraints** show that invalid references should be blocked before they enter the system.
- **DORA** shows that safety and speed can reinforce each other when changes are small, explicit, validated, and recoverable.
- **Toyota / 5S** shows that clean, standardized environments reduce waste and increase efficiency.

Together, they provide credible external support for the core philosophy:

> A safer operating environment keeps the file cleaner; a cleaner file lets automated work move faster.

---

## Source Index

### Figma / Design / Agents

- [Figma Forum: Make it easier to fix broken variable references](https://forum.figma.com/suggest-a-feature-11/make-it-easier-to-fix-broken-variable-references-33999)
- [Figma Forum: How to clear “Used variables” that don’t exist in the file anymore?](https://forum.figma.com/ask-the-community-7/how-to-clear-used-variables-that-don-t-exist-in-the-file-anymore-18616)
- [Figma Help: Create and manage variables and collections](https://help.figma.com/hc/en-us/articles/15145852043927-Create-and-manage-variables-and-collections)
- [Figma Developer Docs: Structure your Figma file for better code](https://developers.figma.com/docs/figma-mcp-server/structure-figma-file/)
- [Figma Help: Guide to the Figma MCP server](https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server)
- [Delasign: How to remove deleted variables that are still attached in Figma](https://www.delasign.com/blog/figma-detach-deleted-variables/)
- [arXiv: Stop Wasting Your Tokens](https://arxiv.org/abs/2510.26585)
- [arXiv PDF: Stop Wasting Your Tokens](https://arxiv.org/pdf/2510.26585)
- [OpenAI Agents SDK: Guardrails](https://openai.github.io/openai-agents-python/guardrails/)
- [openai-agents-python issue #867](https://github.com/openai/openai-agents-python/issues/867)

### Databases / Data Quality

- [PostgreSQL Documentation: Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)
- [Gartner: Data Quality — Why It Matters and How to Achieve It](https://www.gartner.com/en/data-analytics/topics/data-quality)
- [IBM: The Cost of Poor Data Quality](https://www.ibm.com/think/insights/cost-of-poor-data-quality)

### Software Delivery

- [DORA: DORA Metrics](https://dora.dev/guides/dora-metrics/)
- [DORA: Accelerate State of DevOps Report 2021](https://dora.dev/research/2021/dora-report/)
- [Google Cloud: 2021 Accelerate State of DevOps](https://cloud.google.com/resources/state-of-devops)
- [Google Cloud Blog: Announcing the 2021 Accelerate State of DevOps Report](https://cloud.google.com/blog/products/devops-sre/announcing-dora-2021-accelerate-state-of-devops-report)

### Lean / Toyota / 5S

- [Toyota: Toyota Production System](https://global.toyota/en/company/vision-and-philosophy/production-system/)
- [ScienceDirect: Implementation of 5S in a plastic bag manufacturing industry](https://www.sciencedirect.com/science/article/pii/S2666790822000933)
- [iSixSigma: Case Study — 5S in Practice](https://www.isixsigma.com/5s/case-study-5s-in-practice/)
