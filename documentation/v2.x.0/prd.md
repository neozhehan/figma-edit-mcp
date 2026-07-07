# v2.x.0 PRD: Graph-Based Operational Plans

This document is the product/implementation spec for a future **v2.x.0** release of `figma-edit-mcp`. The current baseline is **v2.3.1**: the server already has strict input schemas, discover-before-acting guidance, plugin-enforced scope/name/batch safety, variable/style permission axes, image/clear fill support, and hardened `node_bind_variable` guardrails.

This release adds a new planning layer: an LLM can build an **implementation plan as a dependency graph**, submit that graph to the plugin for programmatic verification and user review, and let the plugin execute the approved graph programmatically after explicit user approval.

The purpose is not to let the MCP server "trust the LLM more." It is the opposite: make the LLM's intended edit sequence explicit enough that the server, plugin, and human designer can inspect it before the live Figma document is mutated.

---

## Release identity

> [!IMPORTANT]
> **This is a placeholder future release: v2.x.0.** v2.3.1 (`documentation/completed/v2.3.1-bind-variable-guardrails/`) is the current shipped baseline and `package.json` currently reads `"version": "2.3.1"` (verified). Before implementation starts, replace `x` with the chosen release number. If no other minor release intervenes, this is likely a **v2.4.0** class feature because it adds a new planning tool and a new plugin approval/execution workflow.

## API Change Notice (informational)

> [!NOTE]
> This release is **additive**. It introduces one new public tool: `plan_manage`. The tool lets the LLM create/edit/validate/inspect/submit/discard a plan, and query status. Existing direct tools (`node_set_fill`, `create_frame`, `variable_manage`, etc.) remain available and keep their v2.3.1 contracts.
>
> `plan_manage` does **not** mutate the Figma document at call time. However, its `SUBMIT` action can start a plugin-owned workflow that later mutates the Figma document after the plugin verifies the canonical graph and the user approves it in the plugin UI.
>
> The new plan path does **not** weaken existing hard safety controls. Live document validation and final execution must continue to pass through the plugin-side guard stack described in `SAFETY.md`: scope, permission axes, name verification, locked-node checks, instance-interior checks, remote-asset checks, scope-root preservation, and handler-specific guardrails.

---

## Decisions

> [!NOTE]
> **D1 - Graph, not stack/tree.** The operational plan is a directed acyclic graph (DAG) of typed operation steps. A stack is too positional and a tree is too restrictive: real design edits have shared dependencies (`one variable -> many bindings`) and multi-parent dependencies (`component creation depends on a frame, children, variables, and bindings`). The graph executes in a stable topological order.

> [!NOTE]
> **D2 - Incremental construction, with chunk support.** The LLM may build the graph step-by-step or in small chunks. A single giant JSON plan is not required. The non-mutating planner tool is `plan_manage` with a mandatory `action` discriminator; its `ADD_STEPS` action accepts one step or many. This gives the LLM the consistency benefits of incremental construction without forcing one MCP call per low-level edit.

> [!NOTE]
> **D3 - The MCP server owns draft plan state; the plugin owns live safety and user review.** The MCP server stores draft graphs, validates schemas, validates graph topology, resolves symbolic references, computes risk summaries, and can return agent-facing inspections for debugging. The Figma plugin remains the trust boundary for anything involving live document state and is the only authoritative user review surface. The server must not become a mirrored model of the Figma document.

> [!NOTE]
> **D4 - Validation is layered.** Plan validation has four levels:
> 1. **Schema validation** in the MCP server using the same strict Zod discipline as the existing tools.
> 2. **Graph validation** in the MCP server: no cycles, no missing dependencies, no references to outputs that do not exist, no invalid command names, no use-after-delete/invalidation where statically knowable.
> 3. **Plugin live verification**: validate all existing literal node/style/variable/component references against the current document and current connection permissions during `SUBMIT`.
> 4. **Immediate execution-time revalidation** in the plugin before each mutation, using the existing dispatcher/handler guard stack. This closes as much of the TOCTOU window as the architecture can close without document locks.

> [!NOTE]
> **D5 - Symbolic outputs are first-class.** Steps may reference outputs from earlier steps via structured refs such as `{ "$ref": "buttonFrame.result.nodeId" }`. Do not rely on string interpolation or positional stack order. Output contracts are command-specific and generated/maintained alongside tool schemas.

> [!NOTE]
> **D6 - User approval is bound to a submitted plan digest.** A submitted plan receives a canonical digest over its graph, arguments, dependency edges, risk flags, target channel, and scope snapshot. The plugin verifies and displays that exact canonical plan, and approval is valid only for that digest. Any edit to the plan invalidates approval.

> [!NOTE]
> **D7 - Approval and execution happen in the Figma plugin UI/workflow.** Chat approval is useful for communication, but it is not a reliable enforcement point because the LLM can claim it. The plugin UI should display the review panel, store the approved digest in plugin state, and then execute that exact digest through the plugin-owned execution engine after user approval.

> [!NOTE]
> **D8 - No true rollback guarantee in this release.** A successfully verified graph can still fail during mutation because Figma is live and some API constraints only surface at write time. The execution contract is: verify as much as possible, execute in topological order, stop on first non-recoverable step failure, return completed/failed step reports, and never claim all-or-nothing rollback unless a later release implements it.

> [!NOTE]
> **D9 - User review is rendered by the plugin, not the LLM.** The plugin review surface must show a graph/list summary, grouped operations, affected nodes, generated assets, risk flags, permission requirements, destructive/global edits, and the reason for each step. Any LLM-displayed plan text is non-authoritative. Raw tool-call JSON can be available in the plugin's advanced/details view, but it is not the main user approval artifact.

> [!NOTE]
> **D10 - Direct tools remain supported.** This release does not force every edit through a plan. A future "approval-required mode" could block direct write tools when enabled, but that is out of scope for this release. The new feature is a safer orchestration path for complex multi-step tasks, not a removal of the existing API.

> [!NOTE]
> **D11 - All decisions recorded and confirmed.** The feature is an additive, graph-based planning and approval layer exposed as one public tool: `plan_manage`. It keeps plugin-side safety authoritative, supports incremental graph construction, uses symbolic references for created objects, submits the canonical graph to the plugin for programmatic verification and human vetting, binds approval to a digest, and executes the approved graph through the plugin-owned guard stack. No open product decisions remain for this PRD.

---

## Benefits

This feature turns an implicit chain of LLM tool calls into an explicit operational artifact. The benefits are both safety-oriented and product-oriented:

| Benefit | Why it matters |
| :- | :- |
| Earlier error detection | Missing dependencies, invalid refs, wrong ordering, invalid command names, missing permissions, and impossible operations can be caught before mutation. |
| Safer execution | The graph path gives the plugin a chance to verify scope, names, locks, instance interiors, remote assets, and destructive operations as a coherent unit. |
| User approval | Designers can review the intended edit sequence before the live file changes, especially for broad, destructive, or design-system-level work. |
| Better dependency tracking | Steps can depend on explicit symbolic outputs instead of the LLM remembering that "the frame I just created" is needed later. |
| More predictable LLM behavior | The model externalizes intent instead of improvising across 10-50 independent mutation calls. |
| Less blind retrying | A failed validation points to a specific step and dependency, so the LLM can repair the plan instead of retrying the same bad write. |
| Permission awareness | The plan can say "requires node edits + variable edits" before execution, instead of discovering `VARIABLE_EDITS_DISABLED` halfway through a workflow. |
| Clearer user communication | The plugin review can summarize the canonical graph as "create tokens, create frame, add layers, bind variables, convert to component" instead of exposing raw tool JSON as the primary artifact. |
| Auditability | Plans create a record of what was proposed, what was approved, and what executed. |
| Explainability | Each step can carry a `reason`, making the LLM's implementation logic inspectable by the user and by maintainers. |
| Reduced accidental edits | Explicit approval plus risk flags reduce the chance that a misunderstood user request becomes document damage. |
| Batching and latency opportunities | Once the system sees the whole graph, compatible steps can be grouped or verified together, reducing mutation/retry churn. |
| Better test fixtures | Plans can become regression fixtures for safety tests, schema tests, execution ordering, and live verification. |
| Resumability and repair | A draft or failed plan can be inspected, amended, and revalidated instead of recreated from scratch. |
| Product trust | The agent feels less like a black box and more like a careful assistant operating under visible constraints. |
| Handoff and reproducibility | A saved plan graph can be shared in issues, PRDs, test cases, bug reports, or documentation. |
| Telemetry and prioritization | The project can measure which operation sequences are common, which validations fail, and where new compound tools would pay off. |
| Human-designer control | The designer remains the final approver of intent; the AI does orchestration and the plugin enforces mechanical safety. |

---

## Scope & priority

| # | Change | Priority | Primary location |
| :- | :- | :-: | :- |
| §1 | Plan graph model, lifecycle, in-memory plan store | **P0** | `src/mcp_server/tools/plan.ts` (new), `src/mcp_server/plan/` (new) |
| §2 | Plan step schema, command allowlist, symbolic refs, output contracts | **P0** | `src/mcp_server/plan/schema.ts` (new), generated helpers from `src/mcp_server/tools/*` |
| §3 | Static graph validation and risk classification | **P0** | `src/mcp_server/plan/validate.ts` (new) |
| §4 | Plugin live verification command | **P0** | `figma_plugin/src/main.ts`, `figma_plugin/handlers/planHandlers.ts` (new) |
| §5 | Plugin review and approval flow | **P1** | `figma_plugin/ui.html`, `figma_plugin/src/main.ts`, `src/mcp_server/tools/plan.ts` |
| §6 | Plugin-owned execution engine and step result reporting | **P0** | `figma_plugin/handlers/planHandlers.ts`, existing handlers/dispatcher |
| §7 | Documentation, skill guidance, safety manual update | **P1** | `README.md`, `SAFETY.md`, `skills/figma-edit/references/*` |
| §8 | Telemetry, progress updates, and test fixtures | **P2** | `src/mcp_server/tests/`, `figma_plugin/utils/progressUtils.ts` |

---

## §1. Plan graph model and lifecycle (P0)

**The gap.** Today, the LLM must orchestrate a complex design operation through many independent tool calls. The server validates each call individually, and the plugin enforces safety at execution time, but there is no shared object representing the full intended implementation.

**v2.x.0 change.** Add a server-side plan store and a graph model.

**Plan statuses.**

```
draft -> static_validated -> submitted_for_review -> approved
      -> executing -> executed
      -> failed
      -> discarded
```

**Plan shape.**

```ts
type PlanGraph = {
  planId: string;
  title: string;
  goal: string;
  status: PlanStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  channelId?: string;
  scopeSnapshot?: {
    scopeRootId: string | null;
    scopeRootName?: string;
    allowEditNode: false | "page" | "node";
    allowEditVariable: boolean;
    allowEditStyle: boolean;
  };
  steps: PlanStep[];
  validation?: PlanValidationReport;
  approval?: PlanApprovalState;
};
```

**Step shape.**

```ts
type PlanStep = {
  id: string;                         // unique, stable, user-readable
  command: PlanCommand;               // mutation command only
  args: Record<string, unknown>;      // may contain refs
  dependsOn?: string[];               // explicit edges
  produces?: Record<string, OutputSpec>;
  reason?: string;                    // short explanation for user review
  group?: string;                     // optional UI grouping, e.g. "Tokens"
  riskHint?: "low" | "medium" | "high";
};
```

**Rules.**

- `id` must be unique within a plan and match `^[a-zA-Z][a-zA-Z0-9_-]{1,63}$`.
- The graph must be acyclic.
- Step order in the array is display order only; execution order is stable topological order.
- Every `dependsOn` target must exist.
- A step may only reference outputs from steps it depends on, directly or transitively.
- Plan state is scoped to the MCP server process and active channel. It is not persisted across server restarts.
- Draft plans remain available for review until explicitly discarded or until the server process/session boundary removes in-memory state. Stale document assumptions are handled by live validation and immediate execution-time revalidation, not by arbitrary plan removal.
- A channel disconnect invalidates live validation and approval; the draft may remain inspectable but must be revalidated and reapproved.

**Notes.**

- Store large or sensitive payloads carefully. `node_set_fill.image.bytesBase64` can be large; agent-facing inspections and plugin review payloads must redact bytes and show only size/type metadata. A future release may move large payloads into an object store, but the MVP can keep them in process memory with limits.
- Do not expose raw approval tokens in agent-facing inspections or user-facing plugin review details.

---

## §2. New MCP tool (P0)

**The gap.** Existing tools are single operations or same-command batches. There is no API for a heterogeneous, dependency-aware edit plan.

**v2.x.0 change.** Add exactly one public tool: `plan_manage`. It manipulates, validates, inspects, submits, and monitors a draft graph through a mandatory `action` parameter. It never mutates the Figma document synchronously during the tool call, but its `SUBMIT` action can hand the canonical graph to the plugin for user-approved execution.

| Tool | Purpose | Mutates Figma during call? |
| :- | :- | :-: |
| `plan_manage` | Create, edit, validate, inspect, submit for plugin review/execution, check review/execution status, or discard a draft plan via a mandatory `action` parameter. | No |

**Tool naming.** Names comply with the existing tool-name constraint `^[a-zA-Z0-9_-]{1,64}$`.

**`plan_manage` actions.**

| Action | Purpose |
| :- | :- |
| `CREATE` | Start a new draft plan with `title` and `goal`; optionally capture the current connect payload as the plan basis. |
| `ADD_STEPS` | Add one or more steps to a draft plan. Array length 1 is the node-by-node path. |
| `REPLACE_STEP` | Replace one existing step and increment plan version. |
| `REMOVE_STEP` | Remove a step if no remaining step depends on it, or remove it plus dependents when explicitly requested. |
| `VALIDATE` | Run MCP-side static validation only. |
| `INSPECT` | Return a normalized, redacted, non-authoritative summary for the LLM to debug or repair the plan. |
| `SUBMIT` | Send the canonical graph to the plugin for live verification, authoritative user review, and plugin-owned execution after approval. |
| `STATUS` | Return the plugin workflow state for the submitted digest: not submitted, verifying, awaiting user, approved, rejected, executing, executed, failed, stale, or failed verification. |
| `DISCARD` | Delete a draft/failed/executed plan from the server plan store. |

**`plan_manage` input shape.**

```ts
type PlanManageInput = {
  action: "CREATE" | "ADD_STEPS" | "REPLACE_STEP" | "REMOVE_STEP" | "VALIDATE" | "INSPECT" | "SUBMIT" | "STATUS" | "DISCARD";
  planId?: string;
  params?: Record<string, unknown>;
};
```

Internally, `plan_manage` must dispatch to strict per-action schemas. Do not place every action's fields at the top level as optional fields; that would make the contract mushy and weaken error recovery.

**Annotations.**

- `plan_manage` is read-only with respect to Figma **during the MCP tool call**, but some actions mutate server-side plan state and `SUBMIT` can start a plugin-owned workflow that later mutates Figma after explicit user approval.
- Because MCP annotations cannot express "not mutating now, but may trigger a later approved mutation," the tool description must state this clearly. The plugin review supplies the finer risk classification before any document mutation occurs.

**Command allowlist.**

The initial plan command set should include write commands only:

- Node writes: `node_transform`, `node_rename`, `node_delete`, `node_clone`, `node_group`, `node_ungroup`, `node_flatten`, `node_insert_child`, `node_set_auto_layout`, `node_set_fill`, `node_set_stroke`, `node_set_corner_radius`, `node_set_effects`, `node_apply_style`, `node_bind_variable`.
- Creation: `create_shape`, `create_frame`, `create_text`, `create_svg`, `create_component`, `create_instance`, `create_component_set`, `create_connection`.
- Text/style/variable/component/instance/annotation/reaction writes: `text_set_content`, `text_set_style`, `style_manage`, `style_delete`, `variable_manage`, `variable_delete`, `component_manage_property`, `component_delete_property`, `instance_set_property`, `instance_set_overrides`, `annotation_set`, `reaction_update`.

Excluded from the plan graph in the MVP:

- Reads (`node_info`, `page_info`, `style_list`, etc.). The agent still performs discovery before planning.
- Navigation/export (`view_navigate`, `node_export_visual`) because they do not mutate the document and belong before/after execution rather than inside the operational plan.
- Channel tools.

---

## §3. Plan step schema, refs, and output contracts (P0)

**The gap.** Many useful workflows depend on IDs that do not exist when the plan is being authored. Example: create a frame, create text inside that frame, then convert the frame into a component. A one-shot list of literal tool calls cannot represent this reliably.

**v2.x.0 change.** Add structured symbolic references and command-specific output contracts.

**Reference syntax.**

Use objects, not magic strings:

```json
{ "$ref": "buttonFrame.result.nodeId" }
```

Accepted ref roots:

- `<stepId>.result.<field>` for actual output values returned by a completed prior step.
- `<stepId>.planned.<field>` for statically known planned values, such as a requested `name` before the real node exists. Use sparingly; execution must prefer actual plugin results.

**Example graph.**

```json
{
  "steps": [
    {
      "id": "buttonFillVar",
      "command": "variable_manage",
      "args": {
        "action": "CREATE_VARIABLE",
        "name": "Button/bg/default",
        "type": "COLOR",
        "value": { "r": 0.1, "g": 0.2, "b": 0.9, "a": 1 },
        "scopes": ["ALL_FILLS"]
      },
      "reason": "Create the semantic fill token before binding it."
    },
    {
      "id": "buttonFrame",
      "command": "create_frame",
      "args": {
        "parentId": "123:456",
        "parentNodeName": "Components",
        "name": "Button",
        "x": 0,
        "y": 0,
        "width": 120,
        "height": 40,
        "layoutMode": "HORIZONTAL"
      },
      "reason": "Create the frame that will become the component."
    },
    {
      "id": "label",
      "command": "create_text",
      "dependsOn": ["buttonFrame"],
      "args": {
        "parentId": { "$ref": "buttonFrame.result.nodeId" },
        "parentNodeName": { "$ref": "buttonFrame.result.nodeName" },
        "text": "Button",
        "x": 16,
        "y": 10
      },
      "reason": "Add the visible label."
    },
    {
      "id": "bindFill",
      "command": "node_bind_variable",
      "dependsOn": ["buttonFrame", "buttonFillVar"],
      "args": {
        "nodeId": { "$ref": "buttonFrame.result.nodeId" },
        "nodeName": { "$ref": "buttonFrame.result.nodeName" },
        "bindVariables": {
          "fills": { "$ref": "buttonFillVar.result.variableId" }
        }
      },
      "reason": "Bind the component fill to the semantic token."
    },
    {
      "id": "mainComponent",
      "command": "create_component",
      "dependsOn": ["buttonFrame", "label", "bindFill"],
      "args": {
        "nodeId": { "$ref": "buttonFrame.result.nodeId" },
        "nodeName": { "$ref": "buttonFrame.result.nodeName" }
      },
      "reason": "Convert the finished frame into a main component."
    }
  ]
}
```

**Output contracts.**

Each allowed command needs an output adapter that exposes stable fields for downstream refs. Examples:

| Command | Required output fields |
| :- | :- |
| `create_frame`, `create_shape`, `create_text`, `create_svg`, `create_instance`, `node_clone` | `nodeId`, `nodeName`, `nodeType` |
| `create_component` | `componentId`, `componentName`, `nodeId`, `nodeName`, `nodeType` |
| `variable_manage` create path | `variableId`, `variableName`, `collectionId`, `collectionName`, `resolvedType` |
| `style_manage` create path | `styleId`, `styleName`, `styleType` |
| `create_component_set` | `componentSetId`, `componentSetName`, `nodeId`, `nodeName` |

**State-effect contracts.**

Validation also needs a small effect model:

- `node_delete` invalidates referenced node IDs.
- `create_component` replaces the source frame with a new component ID; downstream refs must use the component output, not the old frame output.
- `node_rename` changes `nodeName`; downstream literal name references to the old name should be flagged.
- `node_insert_child` changes parentage; downstream assumptions about siblings/parents may need live validation.
- `variable_delete` and `style_delete` invalidate asset refs.

**Tests.**

- Ref parser rejects string interpolation such as `"$buttonFrame.nodeId"` unless it is in the structured `{ "$ref": ... }` form.
- A step cannot reference an output from an unrelated or later step.
- `create_component` invalidates the source frame ref; a downstream step that still uses the old frame ID is rejected or warned.
- Unknown output fields are rejected with a specific message.

---

## §4. Static validation and risk classification (P0)

**The gap.** Existing Zod schemas validate each tool call in isolation. They do not know whether a later call depends on a missing output, whether a graph has a cycle, or whether a plan has a risky shape.

**v2.x.0 change.** Add static validation through `plan_manage` action `VALIDATE` before plugin submission. Plugin-side live verification happens during `SUBMIT` and again immediately before execution.

**Static validation checks.**

- Tool command is in the plan allowlist.
- Tool arguments parse against the existing registered tool schema, after replacing refs with type-compatible placeholders.
- Unknown keys are rejected, preserving `withStrictInputSchemas` behavior.
- Graph has no cycles.
- Every `dependsOn` target exists.
- Every ref points to an existing upstream step and known output field.
- No use-after-delete/use-after-replacement when statically knowable.
- Required name fields are either literal strings or refs to a produced actual name.
- Creation tools have literal or produced `parentId` + `parentNodeName`.
- `variable_manage` create steps that omit `scopes` are warnings or errors, matching current v2.3.1 guidance.
- `node_bind_variable` fields are validated against the generated bindable-fields allowlist.
- Large payloads are summarized and capped according to existing image-fill constraints.

**Risk classification.**

Each plan and step gets risk flags:

| Risk flag | Trigger examples |
| :- | :- |
| `destructive` | `node_delete`, `style_delete`, `variable_delete`, `component_delete_property`, clearing fills on many nodes |
| `global_asset_edit` | `variable_manage`, `variable_delete`, `style_manage`, `style_delete` |
| `scope_sensitive` | operations on the editable scope root or near it |
| `layout_structural` | grouping, ungrouping, flattening, reparenting, component conversion |
| `large_batch` | many target nodes or many created nodes |
| `external_resource` | URL image fills |
| `large_payload` | large `bytesBase64` image payloads |
| `permission_required` | requires node/variable/style permission not present in the current connect payload |

**Validation result.**

```ts
type PlanValidationReport = {
  valid: boolean;
  level: "static" | "live";
  planVersion: number;
  digest: string;
  errors: PlanIssue[];
  warnings: PlanIssue[];
  riskFlags: PlanRiskFlag[];
  executionOrder?: string[];
};
```

**Error strings.**

> `plan_manage: VALIDATE step 'bindFill' references unknown output 'buttonFillVar.result.variableID'. Did you mean 'variableId'?`

> `plan_manage: VALIDATE cycle detected: buttonFrame -> label -> buttonFrame.`

> `plan_manage: VALIDATE step 'createLabel' uses parentId from 'buttonFrame' but does not depend on it. Add 'buttonFrame' to dependsOn.`

> `plan_manage: VALIDATE step 'mainComponent' uses nodeId from 'buttonFrame' after that ref was invalidated by create_component. Use 'mainComponent.result.nodeId' in later steps.`

---

## §5. Plugin live verification (P0)

**The gap.** The MCP server can validate graph structure, but it cannot reliably validate live Figma state without becoming a stale mirror. The current safety model deliberately makes the plugin the trust boundary.

**v2.x.0 change.** Add a plugin command, e.g. internal wire command `plan_submit`, that receives the canonical plan graph, verifies it against the current plugin state without mutating the Figma document, and opens/updates the plugin review UI for that exact verified graph.

**Live verification responsibilities.**

- Capture current `scopeRootId`, `allowEditNode`, `allowEditVariable`, `allowEditStyle`.
- Validate literal existing node refs with the same resolved-name discipline as the existing dispatcher.
- Validate literal parent refs for creation steps.
- Validate literal style/variable/component refs where the tool requires them.
- Validate permission axes for every step.
- Validate locked ancestors for existing literal node/parent refs.
- Validate scope boundaries for existing literal node/parent refs.
- Validate instance-interior constraints for structural operations.
- Validate remote-asset constraints for asset definition edits.
- Validate scope-root destructive/replacing operations.
- Validate step-specific constraints from v2.3.1, such as auto-layout prerequisites and bind-field shape, where the target already exists.

**Important limitation.**

Live verification must not mutate the document. Therefore it cannot fully validate a future node that does not exist yet. For symbolic refs to newly created nodes, verification validates the creation step's existing parent and the static output contract. During execution, each later step is validated against the real node after it has been created.

**TOCTOU handling.**

Live verification during `SUBMIT` is not enough. The plugin-owned execution engine must run plugin-side validation again immediately before execution and the existing dispatcher/handler checks must still run per step.

**Implementation note.**

Do not copy every guard into a second unrelated verification implementation if it will drift. Prefer shared helper functions for validation where practical:

- Reuse `validateSingleNodeWrite`.
- Reuse `validateParentWrite`.
- Reuse batch prevalidation helpers where they can be extracted.
- Keep handler-only checks in handlers when verification cannot safely evaluate them.

**Tests.**

- A plan targeting a locked node fails live verification before execution.
- A plan with `variable_manage` fails live verification when `allowEditVariable` is false.
- A plan that creates a child under a produced frame passes live verification if the produced frame's parent is valid.
- A plan with a stale literal `nodeName` returns `NAME_MISMATCH` during live verification.
- A plan with a future-created ref is not rejected merely because the node does not exist yet.

---

## §6. Plugin review and user approval (P1)

**The gap.** Tool calls are technically precise but poor approval artifacts, and an LLM-rendered summary is not trustworthy enough for approval. If the LLM displays the plan, the user is trusting the LLM's description rather than the actual graph that will execute.

**v2.x.0 change.** `plan_manage` action `SUBMIT` sends the full canonical plan graph to the plugin. The plugin performs live verification, renders the authoritative review UI from that exact graph, records the user's approve/reject decision for the submitted digest, and executes that exact approved graph itself. The LLM may use `INSPECT` for debugging, but `INSPECT` is explicitly non-authoritative and must not be treated as the approval surface.

**`plan_manage` action `INSPECT` output (agent-facing, non-authoritative).**

```ts
type PlanInspection = {
  planId: string;
  planVersion: number;
  digest: string;
  status: PlanStatus;
  summary: string[];
  riskFlags: PlanRiskFlag[];
  executionOrder?: string[];
  redactedSteps: PlanStep[];
  note: "Non-authoritative agent inspection. User approval is based only on the plugin-rendered review.";
};
```

**`plan_manage` action `SUBMIT` behavior.**

`SUBMIT` canonicalizes the graph, computes the digest, sends the entire canonical plan to the plugin, and returns the plugin's submission result. It does not wait indefinitely for a human decision or execution completion.

```ts
type PlanSubmitResult = {
  planId: string;
  digest: string;
  status: "awaiting_user" | "failed_verification";
  pluginVerification?: PlanValidationReport;
};
```

**`plan_manage` action `STATUS` output.**

```ts
type PlanWorkflowStatus = {
  planId: string;
  digest: string;
  status: "not_submitted" | "verifying" | "awaiting_user" | "approved" | "rejected" | "executing" | "executed" | "failed" | "stale" | "failed_verification";
  pluginVerification?: PlanValidationReport;
  execution?: PlanExecutionResult;
};
```

**Plugin review content.**

The plugin UI review panel should render from the canonical submitted graph, not from text supplied by the LLM. It should show:

- Goal/title.
- Summary of intended changes generated from the canonical graph.
- Count of created, updated, deleted, and converted nodes.
- Count of variable/style/component definition edits.
- Destructive steps.
- Permission requirements and whether the current session has them.
- A graph/list view grouped by `group` and topological order.
- Step reasons.
- Plugin verification errors and warnings.
- Advanced details with redacted raw args.

**Approval mechanics.**

1. The LLM builds the draft graph with `plan_manage` actions.
2. The LLM may call `plan_manage({ action: "VALIDATE", planId })` for MCP-side static validation.
3. The LLM calls `plan_manage({ action: "SUBMIT", planId })`.
4. The MCP server sends the canonical graph and digest to the plugin.
5. The plugin performs live verification and renders the authoritative review from that canonical graph.
6. The user approves or rejects in the plugin UI.
7. If rejected, the plugin stores a rejection record and no mutation occurs.
8. If approved, the plugin stores `{ digest, planId, channelId, scopeRootId, approvedAt }`, immediately runs final validation, and executes the approved graph through the plugin-owned execution engine.
9. The LLM may call `plan_manage({ action: "STATUS", planId })` to inspect the plugin review/execution state and retrieve final results.

**Approval invalidation.**

Approval is invalidated when:

- Any step is added, replaced, or removed.
- Any args or dependency edges change.
- The active channel changes.
- The plugin reconnects.
- The scope root or permission axes change.
- Final validation immediately before plugin-owned execution finds the current document no longer matches the approved assumptions.

**Error strings.**

> `plan_manage: SUBMIT failed plugin verification for plan 'plan_abc'. See verification issues for the blocked steps.`

> `plan_manage: STATUS plan 'plan_abc' failed final validation after approval. The document changed before execution; submit the updated canonical plan for review again.`

**Notes.**

- The plugin approval UI should be clear but not theatrical. It is an operational review, not a marketing page.
- LLM-rendered summaries are allowed for conversation, debugging, or repair, but they are **never** the approval artifact.
- For clients that cannot render the plugin UI, the plan can still be submitted, but execution still requires plugin-side user approval.

---

## §7. Plugin-owned execution engine (P0)

**The gap.** Executing many dependent commands from the LLM side means each call is isolated, approval cannot cover the whole sequence, and dependency substitution is fragile. Once the plugin has the canonical graph and the user's approval, sending control back to the LLM for a second execution call weakens the trust boundary.

**v2.x.0 change.** After the user approves the canonical graph in the plugin UI, the plugin executes that approved graph itself in stable topological order. The LLM observes progress and results with `plan_manage` action `STATUS`.

**Execution rules.**

- Recompute the canonical digest and verify it still matches the plugin-approved digest.
- Re-run live validation immediately after approval and immediately before the first mutation.
- Resolve refs step-by-step using actual prior step results.
- Before each step, run the same plugin validation path that a direct tool call would run.
- Execute through existing handlers rather than creating a separate mutation path.
- Emit progress updates using the existing `sendProgressUpdate` pattern.
- Stop on first non-recoverable failure.
- Store a step-by-step report, including completed outputs and failed step error, retrievable through `plan_manage` action `STATUS`.

**Execution result.**

```ts
type PlanExecutionResult = {
  success: boolean;
  planId: string;
  digest: string;
  completedSteps: Array<{
    id: string;
    command: string;
    result: unknown;
  }>;
  failedStep?: {
    id: string;
    command: string;
    error: string;
  };
  skippedSteps: string[];
  warnings: string[];
};
```

**Rollback policy.**

No automatic rollback in this release. If step 7 fails after steps 1-6 succeeded, the result must say exactly that. The LLM can then inspect the document, create a repair plan, or ask the user how to proceed.

**Idempotency policy.**

Plan execution is not generally idempotent because create/delete operations change the file. Re-executing an executed or partially failed plan is rejected by default:

> `plan_manage: SUBMIT plan 'plan_abc' has already executed or partially executed. Create a repair plan instead of replaying it.`

**Progress.**

Long-running plans should emit progress at least once per step and at least every 1 second during expensive internal scans, following the v2.3.0 `variable_delete` responsiveness principle.

---

## §8. Documentation impact (P1)

Update the single source of operational guidance:

- **`skills/figma-edit/references/workflows.md`** - add a "Graph-planned edits" workflow: discover -> draft plan -> validate -> submit to plugin for verification/review -> wait for plugin approval -> execute -> verify.
- **`skills/figma-edit/references/tool-selection.md`** - explain when to use direct tools, same-tool batches, and graph plans. Use graph plans when operations are heterogeneous, dependent, high-risk, or user approval is desired.
- **`skills/figma-edit/references/error-playbook.md`** - add plan validation, approval, digest mismatch, stale live verification, and partial execution errors.
- **`skills/figma-edit/references/constraints.md`** - reinforce that plan validation does not bypass discover-before-acting, name verification, or plugin refusal.
- **`SAFETY.md`** - add a section clarifying that graph plans are an orchestration and approval layer, while the plugin remains the trust boundary. Add residual risk: approved in-scope wrong edits remain possible if the human approves a bad plan.
- **`README.md`** - add a short feature overview under Core Principles or Usage once implemented.
- **Tool descriptions** - `plan_manage` needs clear parameter descriptions and output schemas, including explicit wording that `SUBMIT` may lead to later plugin-owned mutation after user approval.

---

## §9. Testing & rollout

**Build.**

- Register the new `plan_manage` tool in `src/mcp_server/tools/index.ts`.
- Update the expected tool count in `tests/unit/tools/v2Tools.test.ts`.
- Add new plan modules under `src/mcp_server/plan/`.
- Add plugin plan handlers and rebuild `figma_plugin/code.js`.
- Confirm Node and Bun paths both work.

**Unit tests - MCP server.**

- `plan_manage` action `CREATE` creates a draft with status `draft`.
- `plan_manage` action `ADD_STEPS` supports one step and multiple steps.
- Strict schema rejects unknown top-level plan fields.
- Unknown command names are rejected.
- Read-only commands are rejected inside the plan graph.
- Cycle detection works.
- Missing dependency detection works.
- Symbolic refs resolve only to upstream outputs.
- Output-field typo gets a "Did you mean" style message when possible.
- Risk classification catches destructive/global/large/external-resource plans.
- Approval digest changes when any step changes.
- Large `bytesBase64` payloads are redacted in agent inspections and plugin review payloads.

**Unit tests - plugin.**

- Plugin live verification rejects stale names, outside-scope targets, locked nodes, disabled variable/style permissions, and remote-asset edits.
- Plugin live verification accepts future symbolic nodes when their creation parent is valid.
- Plugin-owned execution does not start without plugin approval.
- Plugin-owned execution rejects digest mismatch.
- Plugin-owned execution revalidates before mutation.
- Plugin-owned execution stops on first failed step and reports completed/skipped steps accurately through `plan_manage` action `STATUS`.

**Integration tests.**

- Build a simple button component plan: create variables, create frame, create text, bind variables, convert to component.
- Build a plan that intentionally omits variable permission; assert plugin live verification fails before mutation.
- Build a plan against a locked parent; assert plugin live verification fails before mutation.
- Approve a plan, then edit the plan; assert approval invalidates.
- Approve a plan, rename a target node in Figma before execution; assert execution revalidation catches the stale name.
- Reject a plan in the plugin UI; assert execution is refused.

**Manual verification.**

- Live Figma channel: create and approve a button component plan.
- Inspect the plugin approval UI for clarity, grouping, risk flags, and redaction.
- Confirm the final document visually with `node_export_visual` after execution.
- Confirm a failed partial execution returns enough detail for a repair plan.

**Rollout notes.**

- Keep direct tools unchanged so existing integrations do not break.
- The first release should mark `plan_manage` as experimental in its description until live usage validates the workflow.
- Add telemetry/logging for validation failures by category, but do not log large image bytes or sensitive raw payloads.

---

## §10. Non-goals and follow-ups

**Non-goals for v2.x.0.**

- No true all-or-nothing transaction rollback.
- No server-side mirrored Figma document state.
- No requirement that all existing direct tools go through the plan system.
- No AI quality scoring of whether the design itself is good.
- No visual simulation of future Figma pixels before execution. The plugin review is an operational graph review, not a rendered mock of unexecuted changes.
- No arbitrary command executor; only allowlisted typed mutation commands are accepted.

**Follow-ups.**

- Optional plugin mode: "Require approval for all write commands," blocking direct write tools unless they are part of an approved plan.
- Persistent plan artifacts for bug reports or replay in a test harness.
- Plan templates for common workflows such as "create tokenized component" or "bulk text update with verification."
- Best-effort rollback or compensation plans for selected safe operations.
- Automatic grouping/optimization of compatible steps after telemetry shows common patterns.
- Mermaid/SVG export of the plan graph for documentation and PR reviews.

---

## §11. Provenance - baseline verification

The PRD was grounded against the current v2.3.1 tree before writing:

| Baseline fact | Verified at | Finding |
| :- | :- | :- |
| Current version | `package.json` | Root package version is `2.3.1`. |
| Current tool registration count | `src/mcp_server/tests/unit/tools/v2Tools.test.ts` | The current test expects 46 registered tools; this release must update that count for the one new tool: `plan_manage`. |
| Strict input schemas | `src/mcp_server/tools/index.ts` | `withStrictInputSchemas` centrally rejects unknown top-level tool keys. Plan tools should preserve this behavior. |
| Fixed command union | `src/mcp_server/figma-client.ts` | `FigmaCommand` is an explicit union of wire commands. The internal `plan_submit` command must be added deliberately; execution itself is plugin-owned after approval. |
| Plugin is the trust boundary | `SAFETY.md`, `figma_plugin/src/main.ts` | Safety guarantees depend on plugin-side enforcement, not MCP-side mirrors. |
| Existing plugin queue | `figma_plugin/src/main.ts` | Commands are serialized through `state.commandQueue`; plan execution should preserve serialized mutation semantics. |
| Existing dispatcher guards | `figma_plugin/src/main.ts` | Single-node and parent writes already share validation helpers that plan verification/execution should reuse where possible. |
| v2.3.1 operational guidance | `skills/figma-edit/references/*.md` | The current guidance already teaches discover-before-acting, clear fills, variable scopes, and `node_bind_variable` ordering guardrails. Plans must build on that, not replace it. |
    