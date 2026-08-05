# PRD — Lossless Prototype Reaction Reads and Conflict-Safe Localized Updates

| Field | Value |
| :- | :- |
| Status | Proposed; implementation not started |
| Release class | Standalone minor release (`v2.x.0`; assign the exact version when scheduled) |
| Standalone extraction/revision | 2026-08-03 |
| Source scope | Former v2.3.4 Track 3; source decisions D9–D11; Phase T3 |
| Historical source index | [Initiative 01 — Error-Code Burn-Down, Figma Typings Bump & Safe Prototype-Reaction Editing](<../initiative/01 - Error-Code Burn-Down, Figma Typings Bump & Safe Prototype-Reaction Editing/initiative.md>) |
| Historical ledger | [Initiative 01 release changelog](<../initiative/01 - Error-Code Burn-Down, Figma Typings Bump & Safe Prototype-Reaction Editing/release-changelog.md#change-1-prd-revision-history>) |

## Executive summary

This release repairs the two retained native prototype tools as one cohesive API contract:

1. `reaction_list` becomes lossless, deterministic, and coverage-bearing. It returns every native reaction—including `CHANGE_TO`—and makes missing, failed, duplicate, empty, and non-reaction-capable reads distinguishable.
2. `reaction_update` stops accepting a stale caller-supplied whole array. Each call performs exactly one localized operation against an exact observed-state token, rechecks the live safety gates immediately before use, and classifies the authoritative read-back rather than inferring success from promise settlement.
3. Reads remain open to newer runtime fields while writes become recursively strict against the scheduled Figma declaration pin.

> [!IMPORTANT]
> This is a hard cutover of the two existing reaction tools, not a new tool or a restoration of connector automation. It changes their public input/output shapes but adds no permission, scope, or instance-interior rule. The release must follow the standalone typings/`SHADER` release so its authoring schemas target the final declaration pin. Before implementation changes the handler, it must complete the source-required taxonomy review for its six reaction-specific codes and required shared codes. It extends the existing registry itself if the general burn-down release has not landed; it does not depend on completing the unrelated 313-site conversion.

## Release identity and compatibility

- No new public tool is added.
- `reaction_list` changes from a lossy aggregate to exact node rows, counts, coverage, and per-node state tokens.
- `reaction_update` removes the public `reactions` replacement field. There is no compatibility alias, hidden full-array mode, or multi-operation batch.
- Existing scope, exact-name, permission, lock, and reaction-capability gates remain authoritative. The handler rechecks them closer to the setter but does not create a new safety category.
- Version surfaces follow the established minor-release mechanism: `package.json`, root lockfile, both `server.json` fields, root `manifest.json`, plugin About handshake, generated tool manifest, public changelog, and the version/plugin gates.
- The changelog must contain before/after calls and identify the hard cutover, state-token flow, allowed Figma normalizations, and retry rules.

## Origin and evidence boundary

The v2.3.3 connector decision removed `create_connection` and `reaction_to_connector_strategy` after live Design-file testing showed that a pasted FigJam `CONNECTOR` cannot be cloned in Figma Design. It deliberately retained `reaction_list` and `reaction_update` as the same-file native prototype surface. Review of their implementation then found independent Golden Rule failures: reads discard valid state and hide incomplete coverage; writes replace an unbound whole array and can lose concurrent human or agent edits.

The evidence carried into this PRD is historical and dated. Repository findings establish the encoded read/write behavior. Live channels `mksu` and `b05y` establish the observed setter ambiguity and the two narrowly permitted normalization classes only for the paths exercised. They do not prove categorical host behavior outside those fixtures. Implementation must revalidate the scheduled declaration pin and must report new repository, injected-fault, and live evidence separately.

## Problem

- **`reaction_list` deletes valid data before returning it.** The current `getReactions` removes a reaction when either deprecated `reaction.action.navigation` or any member of `reaction.actions[]` is `CHANGE_TO`. A multi-action reaction containing one variant swap disappears in full, including unrelated actions.
- **Read coverage is not truthful.** Missing requested roots and thrown per-root reads are progress-only and absent from the result. `nodesCount` is the request length rather than a completed-read count. A fresh dedupe set per root lets overlapping roots return the same descendant more than once.
- **`reaction_update` is a stale whole-array replacement.** The caller reads an array, edits a local copy, and later supplies the complete replacement. Nothing binds the write to the observed state, so an intervening human or agent edit can be overwritten.
- **The write schema does not model Figma's contract.** It uses arbitrary strings and `any` where Figma defines action, navigation, trigger, transition, easing, vector, media, conditional, variable, and expression variants. It can neither guide a correct first call nor guarantee a lossless rewrite.
- **Success does not close the observation loop.** The current tool returns only a boolean/message, not the authoritative post-write array or a token for the next edit.
- **Setter failures can lose cause and outcome.** Arbitrary rejected values can collapse to `undefined`, and no mandatory read-back proves whether an intended change landed.

## Goals

1. Return complete native reaction state and explicit read coverage.
2. Make traversal and deduplication deterministic for overlapping roots.
3. Give every writable node an opaque exact-state token.
4. Replace whole-array updates with one state-checked localized operation.
5. Preserve untouched and unknown live fields by structural clone.
6. Admit only the two observed, precisely specified Figma read-back normalizations.
7. Reconcile every setter resolution, rejection, synchronous throw, and timeout against authoritative state.
8. Provide recursively strict authoring schemas and declaration-parity tests.

## Explicit non-goals

- No return of `create_connection` or `reaction_to_connector_strategy`.
- No FigJam connector automation, Design-native diagram substitute, or prototype-preview renderer.
- No new tools, permissions, scope-model changes, instance-interior refusal, or INSTANCE-root refusal.
- No stale-state auto-merge, multi-operation batch, full-array compatibility path, automatic retry, rollback, or transaction guarantee.
- No read-side normalization to the pinned write schema. Newer runtime fields remain observable and participate in the state token.
- No claim of atomic compare-and-set. Figma exposes no document lock or atomic CAS API; the final synchronous checks only close avoidable validation-to-use gaps.

## Source identifier mapping

| Former umbrella identifier | This PRD |
| :- | :- |
| v2.3.4 Track 3 problem and origin | Problem; Origin and evidence boundary |
| D9 | D9 — lossless reads |
| D10 | D10 — localized state-checked writes |
| D11 | D11 — open reads, strict writes, declaration parity |
| Scope items 10–12 | Goals; Decisions |
| Phase T3 | Implementation plan |
| Track 3 testing, risks, and provenance | Verification; Risks; Provenance |

The D9–D11 identifiers are intentionally retained so the unchanged umbrella revision ledger remains intelligible.

## Decisions

### D9 — `reaction_list` is lossless, deterministic, and coverage-bearing

Remove the `CHANGE_TO` filter completely. Read each reaction-capable node's native `reactions` array without normalization, preserving cardinality, array order, the deprecated `action` projection when Figma returns it, `actions`, and runtime fields the pinned typings do not yet know. Figma represents a component-state change as `{type:"NODE", navigation:"CHANGE_TO", ...}`; it is not a separate action type and must not be discarded.

The input requires at least one `nodeId`. Normalize IDs once and reject duplicate normalized IDs at the SDK schema boundary. Compute the normalized requested-root set before traversal so `requestedRoot` is independent of traversal order. Traverse in requested-root order and then depth-first Figma child order, with one global normalized-ID set so each node appears once. Both `[ancestor, descendant]` and `[descendant, ancestor]` input orders are mandatory fixtures. `documentDepth` is the live number of parent hops from the containing `PAGE` (`PAGE = 0`, child `= 1`); use `null` only for detached or unclassifiable nodes.

Every explicit root that completes its applicable read and canonicalization phases gets a row:

```ts
interface ReactionNodeRow {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  path: PathTuple[];
  documentDepth: number | null;
  requestedRoot: boolean;
  supportsReactions: boolean;
  reactions: unknown[] | null;
  reactionState: string | null;
}
```

`path` is exactly `[type:string,id:string,name:string][]`, from the containing `PAGE` through the immediate parent, excluding the node. `PAGE` and detached/unclassifiable nodes use `[]`. Emit rows in first-encounter order. The exact variants are:

- Outside the reaction mixin: `supportsReactions:false`, `reactions:null`, `reactionState:null`.
- Reaction-capable: `supportsReactions:true`, the exact array including `[]`, and an `r1:` token. Emit descendants only when reaction-capable and non-empty; emit an explicitly requested reaction-capable root even when empty.

The exact top-level result is:

```ts
interface ReactionListResult {
  requestedCount: number;
  visitedNodeCount: number;
  reactionCapableNodeCount: number;
  nodesWithReactions: number;
  nodes: ReactionNodeRow[];
  coverage: {
    complete: boolean;
    requestedNodeIds: string[];
    foundRootIds: string[];
    missingNodeIds: string[];
    failedNodes: Array<{
      nodeId: string;
      phase: string;
      error: {code: string; message: string; details?: unknown};
    }>;
  };
}
```

`requestedCount` is the normalized input length. `visitedNodeCount` counts unique resolved traversal nodes whether or not they support reactions. `reactionCapableNodeCount` counts nodes whose reaction property was read successfully. `nodesWithReactions` counts emitted reaction-capable rows with non-empty arrays. Requested/found/missing ID lists preserve normalized request order. Append failed rows in first encounter order, including root lookups in request order. `coverage.complete` is true only when every requested root and visited node completed all applicable phases. Never fabricate a row for a failed root.

Coverage errors are deterministic:

- Missing lookup: `NODE_NOT_FOUND`.
- Thrown lookup, traversal, or reaction-property read: `FIGMA_API_ERROR`, preserving normalized origin diagnostics and the phase.
- State outside the token domain: `REACTION_STATE_UNENCODABLE`, details `{nodeId,phase:"canonicalize",paths,reasons}`. Its recovery says this version cannot safely tokenize or edit that state and directs the caller to inspect/report the runtime shape before retrying. The same condition blocks `reaction_update` before any setter call.

`reactionState` is opaque: `r1:` plus unpadded base64url of the UTF-8 bytes of stable-canonical JSON for `{nodeId,reactions}`. The supported domain is JSON-observable `null`, booleans, strings, finite numbers, arrays, and plain objects. Sort object keys recursively; preserve array order; JSON number semantics canonicalize `-0` as `0`. Reject `undefined`, `bigint`, non-finite numbers, functions, symbols, non-plain objects, and cycles instead of dropping/collapsing them. The encoding is injective for this supported canonical JSON domain and makes no collision claim for arbitrary JavaScript values. The encoder must be ES2018/Figma-sandbox-safe and use no Node globals. Clients pass tokens verbatim and never construct or interpret them.

### D10 — `reaction_update` performs one state-checked localized operation

Remove the public `reactions` field. Every call requires `{nodeId,nodeName,expectedReactionState,operation}` where `operation` is exactly one member of this union and `op` is its sole discriminator:

- `{op:"INSERT_REACTION", reactionIndex?:number, reaction:{trigger:Trigger, actions:[Action,...]}}` — insert at `0..length`, default append; deprecated `action` forbidden.
- `{op:"REMOVE_REACTION", reactionIndex:number}` — remove one reaction at `0..length-1`.
- `{op:"SET_TRIGGER", reactionIndex:number, trigger:Trigger}` — replace one non-null trigger. Removal uses `REMOVE_REACTION` because the [Figma Reaction contract](https://developers.figma.com/docs/plugins/api/Reaction/) requires a non-null trigger and at least one action for writes.
- `{op:"INSERT_ACTION", reactionIndex:number, actionIndex?:number, action:Action}` — insert at `0..effectiveActions.length`, default append.
- `{op:"REPLACE_ACTION", reactionIndex:number, actionIndex:number, action:Action}` — replace one action.
- `{op:"REMOVE_ACTION", reactionIndex:number, actionIndex:number}` — remove one action, refusing removal of the final effective action; use `REMOVE_REACTION` instead.

Every supplied index is a non-negative finite safe integer. Enforce that in the SDK schema and again in the plugin before array access, coercion, clone, or setter call. Defaults come only from current array length. SDK-visible violations return `-32602`; the raw plugin boundary returns `REACTION_INDEX_OUT_OF_RANGE`. No layer truncates, rounds, clamps, or otherwise coerces an index.

The generic single-node validator returns the resolved object; the reaction handler does not resolve it twice. After every prerequisite `await`, synchronously recheck edit permission, exact name, scope ancestry, locked target/ancestor, reaction capability, and `expectedReactionState` against that same object. Then clone the live array, derive/validate the candidate, and invoke `setReactionsAsync` once with no intervening lookup, `await`, progress emission, or unrelated callback. Rename, reparent, and newly locked-ancestor fault injections after initial validation must produce zero setter calls.

For a surviving reaction addressed by an action/trigger operation, clone the raw reaction; use a non-empty modern `actions` array when present, otherwise seed it from a lossless clone of non-null legacy `action`. Delete `action` in the setter candidate and set modern `actions` before patching. Preserve every untouched reaction and field by deep structural clone, including unknown runtime fields.

#### Exact setter equivalence

The recursive baseline requires exact array length/order, exact own-key sets, and `Object.is` primitive equality. It admits only these composable normalizations:

1. **Synthesized deprecated projection.** If the intended Reaction has no own `action` and non-empty `actions`, actual may own one additional `action`. It must deeply equal the already-normalized `actual.actions[0]`, which separately must be setter-equivalent to `intended.actions[0]`.
2. **Atomic NODE-action flag modernization.** At a real Action position, including inside recursive `CONDITIONAL` actions, if intended owns `preserveScrollPosition:false` and neither modern reset field, actual must omit the old field and add exactly `resetScrollPosition:true` and `resetVideoPosition:false`. Every other field remains exact. Partial rewrites, opposite booleans, application when a modern field was supplied, `resetInteractiveComponents`, or any other default/change are not equivalent.

Apply equivalence across the whole returned array because Figma may normalize untouched reactions. Return and tokenize raw authoritative read-back, never a projected candidate. Disclose synthesized projections in `compatibilityActionIndexes` and NODE transformations in `nodeActionNormalizationPaths`. When they compose, record every normalized NODE path under modern `actions[0]` and suppress only mirrored paths under a synthesized legacy `action`.

#### Writable state and no-ops

Before the setter, every reaction in the final candidate must have a non-null trigger and non-empty modern actions. The operation may repair/remove its one addressed invalid reaction but must not normalize unrelated reactions. Remaining invalid state returns `REACTION_STATE_NOT_WRITABLE` with `{nodeId,nodeName,currentReactionState,currentNode,invalid:[{reactionIndex,reasons}]}` and zero setter calls. Recovery says to repair or remove the invalid reaction in Figma, or use a targeted operation only when that one operation makes the complete candidate writable; multiple remaining invalid reactions require human cleanup before an API write.

Resolve no-ops before the setter. If the final pre-state is already setter-equivalent to the candidate, return success with `noOp:true`, unchanged raw state/token/counts, both normalization disclosures, and `setterReport:{status:"not_called",reason:"NO_CHANGE"}`. Otherwise `noOp:false`. Remove `idempotentHint`: inserts/removals make the tool non-idempotent. Replaying a state-changing call with its old token must yield `REACTION_STATE_MISMATCH`; a verified no-op may repeat while the token remains current. Never retry an ambiguous outcome automatically.

#### Exact success contract

The returned normalized operation resolves both optional insertion indexes to required numbers:

```ts
type NormalizedReactionOperation =
  | {op:"INSERT_REACTION"; reactionIndex:number; reaction:{trigger:Trigger; actions:[Action, ...Action[]]}}
  | {op:"REMOVE_REACTION"; reactionIndex:number}
  | {op:"SET_TRIGGER"; reactionIndex:number; trigger:Trigger}
  | {op:"INSERT_ACTION"; reactionIndex:number; actionIndex:number; action:Action}
  | {op:"REPLACE_ACTION"; reactionIndex:number; actionIndex:number; action:Action}
  | {op:"REMOVE_ACTION"; reactionIndex:number; actionIndex:number};
```

Success returns:

```ts
{
  success: true;
  nodeId: string;
  nodeName: string;
  noOp: boolean;
  operation: NormalizedReactionOperation;
  beforeCounts: {reactions:number; actionsByReaction:number[]};
  afterCounts: {reactions:number; actionsByReaction:number[]};
  legacyActionMigrated: boolean;
  compatibilityActionIndexes: number[];
  nodeActionNormalizationPaths: Array<Array<string | number>>;
  setterReport: SetterReport;
  reactions: unknown[];
  reactionState: string;
}
```

`operation` includes resolved default insertion indexes and never claims application when `noOp:true`. Both counts objects use effective-action counts. `legacyActionMigrated` is true only when the addressed pre-state lacked non-empty modern actions, a state-changing candidate seeded them from non-null legacy `action`, and read-back verifies success. It is false for whole-reaction insertion/removal, modern-action edits, no-ops, and every other success.

`compatibilityActionIndexes` is unique, strictly ascending, and contains indexes where authoritative state has the permitted synthesized `action` relative to the compared candidate. `nodeActionNormalizationPaths` is unique and rooted at `reactions`. Order paths by ascending reaction, ascending modern action, then an intended own legacy action; recursively traverse conditional blocks and their actions by ascending index. Never traverse a synthesized `actual.action` for paths. Both success kinds compute both fields using the same candidate/authoritative pair used for equivalence.

#### Coded refusals

- `REACTION_STATE_MISMATCH`: `{nodeId,nodeName,expectedReactionState,currentReactionState,currentNode}`. `currentNode` is the complete reaction-capable row and supports direct recomposition; call `reaction_list` only if it is absent/incomplete or another concurrent edit produces a second mismatch.
- `REACTION_INDEX_OUT_OF_RANGE`: `{nodeId,op,reactionIndex?,actionIndex?,invalidField,validRange}`. `invalidField` is exactly `reactionIndex` or `actionIndex`; `validRange` is `{minInclusive,maxInclusive}` or `null` for an empty existing-element range. Validate reaction index before action index and report only the first. Omit a non-JSON-safe offending value.
- `REACTION_LAST_ACTION_REMOVAL`: `{nodeId,reactionIndex}`; recovery uses `REMOVE_REACTION`.
- `REACTION_STATE_NOT_WRITABLE`: the invalid-state details and recovery above.
- `REACTION_STATE_UNENCODABLE`: the D9 canonicalization details and recovery above.
- `REACTION_UPDATE_OUTCOME_UNKNOWN`: complete before/intended/current evidence where readable, normalized setter report, and read-back diagnostics; never permits a blind retry.

The `REACTION_INDEX_OUT_OF_RANGE` message names the same valid range carried in details and states that the value must be a non-negative finite safe integer.

#### Setter report, bound, and reconciliation

`setterReport` is exactly:

```ts
type SetterReport =
  | {status:"not_called"; reason:"NO_CHANGE"}
  | {status:"resolved"}
  | {
      status:"rejected";
      thrownType:"undefined"|"null"|"boolean"|"number"|"string"|"bigint"|"symbol"|"function"|"object";
      message:string;
      name?:string;
      code?:string;
    }
  | {status:"timed_out"; timeoutMs:number; lateMutationPossible:true};
```

Synchronous invocation throws and asynchronous rejections use the same guarded path. Snapshot the origin once; read `message`, `name`, and `code` at most once each behind separate guards; accept only non-empty strings for optional fields. A non-empty thrown string is the message. Otherwise perform at most one guarded `String(origin)` and fall back to `Figma setReactionsAsync rejected with an unreportable <thrownType> value.` Never return the raw thrown value or allow formatting failure to prevent read-back.

Race the setter against a plugin-side behavioral bound shorter than the transport's inactivity bound (initial behavior: 20 seconds; tunable without changing the public contract). Consume late settlement without a second result. A timeout always triggers immediate guarded authoritative read-back for evidence and then yields `REACTION_UPDATE_OUTCOME_UNKNOWN`, even if that read-back equals pre-state or intended state, because the uncancelled promise may mutate later. Return `outcomeUnknown:true`, `lateMutationPossible:true`, and available before/intended/current evidence. Recovery requires closing/reopening the plugin execution context and a fresh `reaction_list` before any new operation.

For a setter that settles before the bound, classify only by authoritative read-back:

| Setter report | Equivalent to intended | Exactly pre-state | Other readable state | Unreadable |
| :- | :- | :- | :- | :- |
| Resolves | Verified success | `FIGMA_API_ERROR` with `setterResolvedWithoutApplying:true` | `REACTION_UPDATE_OUTCOME_UNKNOWN` with `partialMutation:true` | `REACTION_UPDATE_OUTCOME_UNKNOWN` with `outcomeUnknown:true` |
| Rejects or throws | Verified success carrying rejected report | Clean `FIGMA_API_ERROR` carrying report | `REACTION_UPDATE_OUTCOME_UNKNOWN` with `partialMutation:true` | `REACTION_UPDATE_OUTCOME_UNKNOWN` with `outcomeUnknown:true` |

Unknown-outcome details include before/intended arrays and tokens, current array/token when readable, `whatChanged` when derivable, setter report, and read-back error. For a settled non-timeout unknown outcome, the message requires a fresh `reaction_list` before any retry. The stronger timeout recovery still requires restarting the plugin execution context and then calling `reaction_list`. A resolved setter is not proof of success; a rejected setter is not proof of failure.

### D11 — lossless reads, strict writes, and typings parity are separate contracts

Read-side reaction payloads stay open and pass supported JSON-observable values through verbatim. Write inputs are recursively strict against the declaration version selected by the prerequisite typings release. Use an outer `z.union`, not a falsely described single discriminated union, because multiple action variants share top-level `type`. Nested `UPDATE_MEDIA_RUNTIME` branches discriminate on `mediaAction`; recursive conditional actions use `z.lazy`.

The authoring schema includes:

- all `Action` variants, three distinct `UPDATE_MEDIA_RUNTIME` shapes, exact `Navigation`, required nullable `NODE.transition`, and recursive `CONDITIONAL` actions;
- all `Trigger` variants and their required fields (`timeout`, `delay`, `deprecatedVersion`, `device`/`keyCodes`, or `mediaHitTime`);
- both transition families, exact direction/easing enums, cubic-bezier/spring shapes, and `overlayRelativePosition`;
- recursive `VariableData`, `VariableDataType`, expressions/functions, variable aliases, and colors.

A declaration-parity test follows aliases/unions in `plugin-api-standalone.d.ts` and fails when any discriminant or required field drifts. It records the measured Reaction/Action/Trigger/Transition/VariableData delta across the prerequisite pin change. Tests cover every action/trigger variant and recursive conditional; reject unknown keys at every write depth; and assert precise issue paths plus recovery for wrong `NAVIGATE` fields, missing transitions, invalid media branches, and nested failures. Untouched raw entries never pass through the strict authoring schema or an allowlist.

## Implementation plan

1. **Taxonomy, declaration, and schema foundation.** Confirm the prerequisite typings release is merged. Review the exact cause, recovery, and details shape for all six reaction-specific codes plus `NODE_NOT_FOUND` and `FIGMA_API_ERROR`, adding missing factories/playbook entries to the existing registry before handler conversion. Split the schema into an open read projection and recursively strict write unions. Add declaration-parity tests before changing the handler; prove the current schema red on arbitrary/missing fields and record the declaration delta.
2. **Lossless reads.** Replace filtering and swallowed catches with D9 rows, exact counts/coverage, deterministic dedupe, document-relative depth, explicit empty-root rows, and the sandbox-safe token encoder.
3. **Localized writes.** Replace the old input with D10's six-operation union and state token. Return one resolved object from validation; perform final synchronous gate/token checks; clone raw state; migrate only the addressed legacy projection; enforce writable-state; patch one path; and resolve no-ops without a setter.
4. **Setter outcome classification.** Invoke the setter once through guarded arbitrary-throw handling and the behavioral bound. Apply the complete settlement/read-back matrix and verify the Phase 1 registry/playbook contracts through the registered boundary.
5. **Public contract sync.** Update tool descriptions, strict output schemas, contract-seam inventory, guides/resources, generated manifest, migration examples, version surfaces, and changelog. The old whole-array call must fail official-SDK validation and no dispatcher fallback may accept it.

## Verification requirements

### Repository and registered-boundary tests

- Prove `CHANGE_TO` and mixed multi-action reactions survive by deep structural equality and identical canonical representation/token.
- Cover exact paths, PAGE/detached rows, non-reaction-capable rows, explicit empty roots, missing/failed roots, both overlapping-root orders, deterministic row/failure ordering, request-order found/missing subsequences, and exact count semantics.
- Cover token stability/distinction across Unicode, isolated surrogates, key/array order, unknown fields, `-0`, unsupported values, and token-version changes.
- Cover all operations and index boundaries, invalid-field precedence and null ranges, and refuse fractional, non-finite, and unsafe integers with zero setter calls at every reachable layer.
- Cover action-only/conflicting-projection migration, same-value no-ops, invalid readable state, stale token, and injected rename/reparent/lock changes with zero setter calls.
- Prove untouched-field preservation by deep structural equality and identical canonical token.
- Cover synthesized `action`, atomic NODE normalization, their composition, recursive conditional paths, multiple deterministic paths, ascending compatibility indexes, and truthful empty/non-empty disclosures for both success kinds.
- Reject partial/broader normalizations, opposite booleans, modern-field collisions, extra defaults, `-0`/`0` primitive deltas, and every other difference.
- Cross settlement (`resolve`, async reject, sync throw) with intended, pre-state, other, and unreadable post-state. Cover arbitrary values and hostile accessors/stringification.
- Cover never-settling and late-resolving/rejecting setters across the internal timeout.
- Assert exact nested schema issue paths, strict public success/failure shapes, and absence of `idempotentHint`.
- Prove the old `reactions` input and attempts to submit multiple operations fail SDK validation.
- Red-proof every new invariant by breaking the exact production/contract line, recording the named failure and exact counts, restoring it, and rerunning green.

### Repository gates

- `bun run build:all`
- full focused and repository suites
- `check:plugin`, `check:versions`, `check:types:plugin`, `check:generated`, and `check:suppressions`
- generated tool-manifest and plugin-bundle review
- scoped and repository `git diff --check`

### Live verification

Use a dedicated Design file and fresh channel. Discover with `page_info` then `node_info`, pass names verbatim, record versions/tool inventory/opening state, and reconcile exact closing state.

The required matrix covers human-authored `NAVIGATE`, overlay, native `CHANGE_TO`, mixed multi-action state, one successful localized edit, and a human-edit-induced stale-token refusal that preserves the human change. Replay the exact actions-only `ON_CLICK` → `NODE/NAVIGATE` fixtures historically exercised on `mksu` and `b05y`, including `preserveScrollPosition:false`. Any one of the four permitted normalization combinations—none, projection only, NODE modernization only, or both—may occur live; whichever occurs must be classified by the same comparator and return raw authoritative state/token with truthful disclosures.

Record normalized setter reports and post-state for every invocation. For pre-setter refusals prove zero setter calls and unchanged authoritative state. If the exact fixture consistently rejects, stop and delta-reduce optional fields/runtime constraints; do not substitute another success. A transient rejection is acceptable only when the contract classifies it truthfully and a new, explicitly chosen attempt supplies success evidence. Media, conditional, variable, and unknown-field live probes run only when authorable fixtures exist; otherwise record fixture unavailability rather than fabricating evidence.

## Risks and mitigations

| Risk | Likelihood | Mitigation |
| :- | :- | :- |
| Human edit after comparison but before/during setter | Low | Keep comparison, derivation, and invocation in one synchronous segment; read back immediately; disclose the residual because no atomic CAS exists. |
| Large exact tokens increase payload size | Low–Med | Use one injective supported-domain token per returned node; measure worst-case fixtures; reject unsupported values; deduplicate descendants. |
| New runtime field is readable but not writable | Low | Patch raw clones without schema-normalizing untouched fields; use parity/live sentinels; classify setter outcomes through read-back. |
| Legacy `action` migration changes behavior | Low–Med | Migrate only the addressed reaction, remove conflicting projection in the candidate, disclose migration, and stop on any normalization beyond the two allowed classes. |
| Strict unions drift | Med | Pin declarations, parse them in parity tests, keep reads open, and adopt new authoring variants via a reviewed typings bump. |
| Identical valid payloads settle differently or reject arbitrary values | Med | Snapshot once, normalize diagnostics totally, and apply the same authoritative read-back matrix to every settlement. |
| Figma synthesizes/deprecates fields | High (observed for the two allowed classes) | Admit only the exact composable equivalence rules, disclose indexes/paths, and return raw state. |
| Setter never settles or mutates late | Low–Med | Use the behavioral bound, consume late settlement, always return unknown outcome on timeout, and require plugin restart plus a fresh read before retry. |

## Provenance

| Item | Historical evidence | Finding carried into this PRD |
| :- | :- | :- |
| Lossy read | `prototypingHandlers.ts` after v2.3.3 Phase 11 (2026-07-30) | A whole reaction is filtered when deprecated `action` or any `actions[]` member has `navigation === "CHANGE_TO"`; missing/thrown roots are progress-only. |
| Whole-array write | `reaction.ts` and `prototypingHandlers.ts` (2026-07-30) | Public input forwards a complete array to `setReactionsAsync` with no state token/read-back. |
| Schema drift | `reaction.ts` versus pinned Figma declarations (2026-07-30) | Arbitrary strings/`any` replace discriminated unions and required fields. |
| Native `CHANGE_TO` representation | Pinned `Action`/`Navigation` declarations (2026-07-30) | Component-state change is a valid NODE action, not connector-only metadata. |
| Read/write asymmetry | [Official Reaction API](https://developers.figma.com/docs/plugins/api/Reaction/) and [node reactions property](https://developers.figma.com/docs/plugins/api/properties/nodes-reactions/), checked 2026-07-30 | Readable `trigger:null`/deprecated state is not necessarily legal setter input. |
| Declaration delta | TypeScript-printer comparison of 1.125.0 and 1.131.0 (2026-07-30) | Reaction/Action/Trigger/Transition/VariableData declarations were measured unchanged; revalidate against the scheduled pin. |
| Deferral | v2.3.3 Q13 / Rev 73 | Native reaction tools remained after connector removal, with completeness/safe-update work deferred. |
| Setter ambiguity | Live `mksu` (2026-07-30) | One valid modern payload rejected with a collapsed diagnostic; an identical later payload resolved. The first attempt's outcome is unknown. |
| Missing-root coverage | Live `b05y` (2026-07-30) | A proven-missing root was counted but absent from result coverage. |
| Rejection with verified non-application | Live `b05y` nested frame (2026-07-30) | Immediate reads proved two intended changes absent; this does not establish a categorical nested-frame restriction. |
| Setter normalization | Live `mksu`, `b05y`, and the [official node-reactions example](https://developers.figma.com/docs/plugins/api/properties/nodes-reactions/) (2026-07-30) | Observed synthesized deprecated `action`; observed the exact atomic NODE flag modernization. No broader equivalence is evidenced. |

## Acceptance gate

This minor release is complete only when:

1. `reaction_list` returns exact deterministic rows, counts, coverage, and stable tokens without filtering valid native reactions.
2. The old full-array `reaction_update` contract is unreachable at both SDK and plugin boundaries.
3. All six localized operations, every pre-setter refusal, both permitted normalization classes, and the full settlement/read-back matrix match D10 exactly.
4. Every success returns raw authoritative state and a token suitable for the next operation; no result infers state from promise settlement alone.
5. Strict authoring schemas match the scheduled declaration pin while open reads preserve supported newer runtime fields.
6. Every contract regression is red-proofed, all repository/static/generated/bundle gates pass, and live evidence is recorded separately from repository/injected-fault evidence with exact cleanup reconciliation.
7. Guides, served resources, tool descriptions, generated manifest, version surfaces, and changelog all describe the hard cutover and safe recovery path.

> The historical umbrella revision ledger remains unchanged in [`planning/future/initiative/01 - Error-Code Burn-Down, Figma Typings Bump & Safe Prototype-Reaction Editing/release-changelog.md`](<../initiative/01 - Error-Code Burn-Down, Figma Typings Bump & Safe Prototype-Reaction Editing/release-changelog.md#change-1-prd-revision-history>).
