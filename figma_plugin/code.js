"use strict";
(() => {
  // figma_plugin/utils/errors.ts
  var UNKNOWN_ERROR = "UNKNOWN_ERROR";
  var ERRORS = {
    // Editable Scope Errors
    READ_ONLY_MODE: "Operation Denied: Figma Plugin in Read-Only Mode. Verify if user intends for changes to be made. If so, advise user to disconnect plugin, paste a link to the page/layer to be edited into Link to Selection field, then reconnect plugin.",
    OUTSIDE_SCOPE: "Operation Denied: Node outside editable scope. Verify if user intends for changes to be made to this particular node. If so, advise user to disconnect plugin, paste a link to this page/layer into Link to Selection field, then reconnect plugin.",
    PARENT_OUTSIDE_SCOPE: "Operation Denied: Parent outside editable scope. Verify if user intends for changes to be made to the parent node. If so, advise user to disconnect plugin, paste a link to the parent page/layer into Link to Selection field, then reconnect plugin.",
    CLONING_SOURCE_NODE_OUTSIDE_SCOPE: "Operation Denied: Node to be cloned is outside editable scope. Verify if user intends for this node to be cloned. If so, advise user to disconnect plugin, paste a link to this page/layer into Link to Selection field, then reconnect plugin.",
    SCOPE_DELETED: "Operation Denied: The specific Node set as the Editable Scope no longer exists/cannot be found. Advise user to disconnect the plugin and Select a new Editable Scope.",
    VARIABLE_EDITS_DISABLED: "Operation Denied: Variable editing is disabled. Ask the user to tick 'Allow AI Agent to modify Variables' in the Figma plugin and reconnect.",
    STYLE_EDITS_DISABLED: "Operation Denied: Style editing is disabled. Ask the user to tick 'Allow AI Agent to modify Styles' in the Figma plugin and reconnect.",
    // Node ID Errors
    NAME_MISMATCH: "Operation Denied: nodeName does not match name of nodeId. Refresh context & recheck to ensure correct nodeId is passed in.",
    // PARENT_NAME_MISSING / PARENT_NAME_MISMATCH moved to the REFUSALS factory
    // registry below (Q22, Rev 31 — distinct-cause coded pair). The merged
    // string that was here is superseded.
    // Parameter Errors
    MISSING_NODE_IDS: "Missing or Invalid nodeIds parameter",
    MISSING_TARGET_NODE_IDS: "Missing targetNodeIds parameter",
    MISSING_SOURCE_INSTANCE_ID: "Missing sourceInstanceId parameter",
    INVALID_TARGET_NODE_IDS: "targetNodeIds must be an array"
  };
  function formatFailedPageOperand(pageErrors) {
    if (!Array.isArray(pageErrors) || pageErrors.length === 0) {
      return "one or more pages";
    }
    const ids = [];
    for (const entry of pageErrors) {
      try {
        const id = entry && typeof entry === "object" ? entry.pageId : void 0;
        if (typeof id === "string" && id.length > 0) ids.push(id);
      } catch (e) {
      }
    }
    if (ids.length === 0) return `${pageErrors.length} page(s)`;
    return `page(s) ${ids.map((id) => `"${id}"`).join(", ")}`;
  }
  var REFUSALS = {
    // Phase 9's four D13 codes are NOT here by design (Change 5, P9-F3). They
    // are channel-admission refusals decided by the socket bridge before any
    // frame reaches Figma, so the plugin has no throw site for them and a
    // bundle-side copy would be dead weight in `code.js`. They live only in
    // `src/shared/channelProtocol.ts`; a regression asserts their absence here.
    // Phase 10's page-load entries are raised through pageLoad.ts and belong in
    // this plugin-origin registry.
    //
    // Page codes are operational failures, not safety refusals — no "Operation
    // Denied:" prefix (D9 reserves the prefix for policy/verification refusals).
    PAGE_LOAD_FAILED: (pageId, cause) => ({
      code: "PAGE_LOAD_FAILED",
      message: `Failed to load Figma page${pageId ? ` "${pageId}"` : ""} \u2014 it may be too large or temporarily unavailable. Retry the call; if the page keeps failing, list pages with page_info and continue with the pages that load.`,
      ...pageId || cause ? { details: { ...pageId ? { pageId } : {}, ...cause ? { cause } : {} } } : {}
    }),
    PAGE_NOT_FOUND: (pageId) => ({
      code: "PAGE_NOT_FOUND",
      message: `Page not found${pageId ? `: "${pageId}"` : ""} does not exist in this document. List pages with page_info and pass a page ID back verbatim.`,
      ...pageId ? { details: { pageId } } : {}
    }),
    TARGET_NOT_PAGE: (pageId, actualType) => ({
      code: "TARGET_NOT_PAGE",
      message: `Target${pageId ? ` "${pageId}"` : ""} is not a PAGE${actualType ? ` (resolved type: ${actualType})` : ""}. List pages with page_info and pass a page ID, not a node ID.`,
      ...pageId || actualType ? { details: { ...pageId ? { pageId } : {}, ...actualType ? { actualType } : {} } } : {}
    }),
    PAGE_LOAD_TIMEOUT: (pageId, timeoutMs) => ({
      code: "PAGE_LOAD_TIMEOUT",
      message: `Figma page${pageId ? ` "${pageId}"` : ""} did not load within the bounded per-page timeout. Retry the call; if the page keeps timing out, continue with the other pages and report the failing page to the user.`,
      ...pageId || timeoutMs ? { details: { ...pageId ? { pageId } : {}, ...timeoutMs ? { timeoutMs } : {} } } : {}
    }),
    // Change 8 (F2): a page that LOADED and then failed while being read is a
    // different cause from a page that would not load, and D9 requires distinct
    // causes to carry distinct codes and distinct recovery (the rule that split
    // PARENT_NAME_MISSING from PARENT_NAME_MISMATCH). Reusing PAGE_LOAD_FAILED
    // here told the agent to retry a page that had already loaded fine, which
    // is the wrong retry for a deterministic read failure.
    PAGE_SCAN_FAILED: (pageId, cause) => ({
      code: "PAGE_SCAN_FAILED",
      message: `Figma page${pageId ? ` "${pageId}"` : ""} loaded but could not be read to completion${cause ? ` (${cause})` : ""}. This is a read failure, not a load failure: retrying the identical call usually reproduces it. Narrow the request (a single page, a specific nodeId, or fewer properties) and report the failing page to the user if it persists.`,
      ...pageId || cause ? { details: { ...pageId ? { pageId } : {}, ...cause ? { cause } : {} } } : {}
    }),
    // The failing page IDs belong in the MESSAGE, not only in `details`: the
    // message is what an agent reads first, and "resolve the failing page in
    // Figma" is unfollowable without knowing which page. Retry is named first
    // because a page load can fail transiently — live on channel `gf32`
    // (2026-08-02) this refusal fired twice on a document whose pages all read
    // cleanly, and the third identical call succeeded.
    DOCUMENT_SCAN_INCOMPLETE: (pageErrors) => ({
      code: "DOCUMENT_SCAN_INCOMPLETE",
      message: `Operation Denied: Document scan incomplete because ${formatFailedPageOperand(pageErrors)} could not be loaded and read \u2014 a page error can never mean zero consumers, so the destructive operation was aborted. Nothing was deleted. Retry the same call: a page load can fail transiently. If it keeps failing, open ${Array.isArray(pageErrors) && pageErrors.length > 0 ? "that page" : "the failing page"} in Figma and retry once it loads; details.coverage.pageErrors carries each page's structured reason.`,
      ...Array.isArray(pageErrors) && pageErrors.length > 0 ? {
        details: {
          coverage: {
            complete: false,
            pageErrors
          }
        }
      } : {}
    }),
    // Change 8 (C1): the sibling outcome of the DOCUMENT_SCAN_INCOMPLETE gate.
    // "The scan completed and found consumers" was the one refusal on this tool
    // that returned a NON-error result carrying a bare `error` string, so the
    // model had to key on two different shapes for `error` and parse prose to
    // learn which nodes to unbind. It is a policy refusal like every other
    // "Operation Denied", so it is coded, thrown, and carries its consumer
    // evidence in `details` where the model can read it structurally.
    // The summary is a multi-line consumer listing that does not end in
    // punctuation, so the recovery gets its own line — live output on channel
    // 8mvc read "...on fields: fills Nothing was deleted."
    VARIABLE_IN_USE: (summary, variablesInUse) => ({
      code: "VARIABLE_IN_USE",
      message: `Operation Denied: ${summary}

Nothing was deleted. Read each listed consumer's current state with node_info (nodes), style_list (styles), or variable_list (aliasing variables), clear or rebind that reference, then retry this exact call. details.variablesInUse lists every consumer by variable ID.`,
      details: { variablesInUse }
    }),
    VARIABLE_NAME_MISSING: () => ({
      code: "VARIABLE_NAME_MISSING",
      message: "Operation Denied: currentVariableName is missing. Read the variable's current exact name with variable_list and pass it back verbatim."
    }),
    VARIABLE_NAME_MISMATCH: (storedName, received) => ({
      code: "VARIABLE_NAME_MISMATCH",
      message: `Operation Denied: currentVariableName does not match the variable's stored name \u2014 stored name "${storedName}", received currentVariableName "${received}". Read the current name with variable_list and pass it back verbatim.`
    }),
    COLLECTION_NAME_MISSING: () => ({
      code: "COLLECTION_NAME_MISSING",
      message: "Operation Denied: collectionName is missing. Read the collection's current exact name with variable_list and pass it back verbatim."
    }),
    COLLECTION_NAME_MISMATCH: (storedName, received) => ({
      code: "COLLECTION_NAME_MISMATCH",
      message: `Operation Denied: collectionName does not match the resolved collection's stored name \u2014 stored name "${storedName}", received collectionName "${received}". Read the current name with variable_list and pass it back verbatim.`
    }),
    STYLE_NAME_MISSING: () => ({
      code: "STYLE_NAME_MISSING",
      message: "Operation Denied: currentStyleName is missing. Read the style's current exact name with style_list and pass it back verbatim."
    }),
    STYLE_NAME_MISMATCH: (storedName, received) => ({
      code: "STYLE_NAME_MISMATCH",
      message: `Operation Denied: currentStyleName does not match the resolved style's stored name \u2014 stored name "${storedName}", received currentStyleName "${received}". Read the current name with style_list and pass it back verbatim.`
    }),
    VARIABLE_SCOPES_MISSING: () => ({
      code: "VARIABLE_SCOPES_MISSING",
      message: "Operation Denied: scopes is missing for CREATE_VARIABLE. Pass the allowed scopes explicitly \u2014 supply an empty array to deliberately set none; omission is rejected."
    }),
    // D6 parent verification (Q22, Rev 31) — distinct causes, so an agent that
    // omits the name is not steered into swapping a correct parentId.
    PARENT_NAME_MISSING: () => ({
      code: "PARENT_NAME_MISSING",
      message: "Operation Denied: parentNodeName is missing. Read the parent node's current exact name with node_info and pass it back verbatim."
    }),
    PARENT_NAME_MISMATCH: (storedName, received) => ({
      code: "PARENT_NAME_MISMATCH",
      message: `Operation Denied: parentNodeName does not match the parent's stored name \u2014 stored name "${storedName}", received parentNodeName "${received}". Read the parent's current name with node_info and pass it back verbatim.`
    }),
    // D10 annotation-category verification (Q30, Rev 46). A category ID can only
    // be checked against the document, so — unlike a duplicate target (Q23) —
    // this is a coded execution refusal, not a Layer 1 payload rejection.
    ANNOTATION_CATEGORY_NOT_FOUND: (received) => ({
      code: "ANNOTATION_CATEGORY_NOT_FOUND",
      message: `Operation Denied: categoryId does not resolve to an annotation category in this document \u2014 received categoryId "${received}". List the file's categories with annotation_list (includeCategories: true) and pass a returned category ID back verbatim, or omit categoryId entirely.`
    })
  };
  function withPartialDisclosure(e, whatChanged, before) {
    const base = getStructuredError(e);
    return {
      code: base.code,
      message: `${base.message} Partial mutation: ${whatChanged}`,
      details: { ...base.details || {}, partialMutation: true, whatChanged, before }
    };
  }
  function formatScopeError(errorMessage, scopeRootId) {
    return `${errorMessage} (Current Editable Scope Node ID: ${scopeRootId || "None"})`;
  }
  function describeError(e) {
    const fallback = "Error executing command";
    if (e == null) return fallback;
    if (typeof e === "string") {
      const message = e.trim();
      return message || fallback;
    }
    let rawMessage;
    let rawName;
    try {
      rawMessage = e.message;
      rawName = e.name;
    } catch (e2) {
    }
    if (typeof rawMessage === "string") {
      const message = rawMessage.trim();
      if (!message) return fallback;
      const name2 = typeof rawName === "string" ? rawName.trim() : "";
      return name2 && name2 !== "Error" ? `${name2}: ${message}` : message;
    }
    try {
      if (typeof e.toString === "function") {
        const rendered = e.toString();
        if (typeof rendered === "string") {
          const message = rendered.trim();
          if (message && message !== "[object Object]") return message;
        }
      }
    } catch (e2) {
    }
    try {
      const json = JSON.stringify(e);
      if (json && json !== "{}") return json;
    } catch (e2) {
    }
    const name = typeof rawName === "string" ? rawName.trim() : "";
    return name || fallback;
  }
  function notifyBestEffort(message) {
    try {
      figma.notify(message);
    } catch (error) {
      console.warn(`Notification delivery failed (ignored): ${describeError(error)}`);
    }
  }
  function readErrorProperty(value, property) {
    try {
      return {
        readable: true,
        value: value[property]
      };
    } catch (e) {
      return { readable: false };
    }
  }
  function copyReadableErrorDetails(value) {
    if (value === void 0) return void 0;
    if (value === null || typeof value !== "object") return value;
    try {
      if (Array.isArray(value)) return [...value];
      return { ...value };
    } catch (e) {
      return void 0;
    }
  }
  function structuredErrorFromObject(value) {
    if (value === null || typeof value !== "object") return null;
    const codeRead = readErrorProperty(value, "code");
    if (!codeRead.readable || typeof codeRead.value !== "string") return null;
    const messageRead = readErrorProperty(value, "message");
    const detailsRead = readErrorProperty(value, "details");
    const result = {
      code: codeRead.value,
      message: messageRead.readable && typeof messageRead.value === "string" && messageRead.value.length > 0 ? messageRead.value : "Error executing command"
    };
    if (detailsRead.readable) {
      const details = copyReadableErrorDetails(detailsRead.value);
      if (details !== void 0) result.details = details;
    }
    return result;
  }
  function getStructuredError(e) {
    const direct = structuredErrorFromObject(e);
    if (direct) return direct;
    if (e !== null && typeof e === "object") {
      const nestedRead = readErrorProperty(e, "error");
      if (nestedRead.readable) {
        const nested = structuredErrorFromObject(nestedRead.value);
        if (nested) return nested;
      }
    }
    return { code: UNKNOWN_ERROR, message: describeError(e) };
  }

  // figma_plugin/utils/progressUtils.ts
  function generateCommandId() {
    return "cmd_" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
  async function sendProgressUpdate(commandId, commandType, status, progress, totalItems, processedItems, message, payload = null) {
    const update = {
      type: "command_progress",
      commandId,
      commandType,
      status,
      progress,
      totalItems,
      processedItems,
      message,
      timestamp: Date.now()
    };
    if (payload) {
      if (payload.currentChunk !== void 0 && payload.totalChunks !== void 0) {
        update.currentChunk = payload.currentChunk;
        update.totalChunks = payload.totalChunks;
        update.chunkSize = payload.chunkSize;
      }
      update.payload = payload;
    }
    try {
      figma.ui.postMessage(update);
      await new Promise((r) => setTimeout(r, 0));
    } catch (err) {
      console.warn(`Progress update delivery failed (ignored): ${describeError(err)}`);
    }
    console.log(`Progress update: ${status} - ${progress}% - ${message}`);
    return update;
  }

  // figma_plugin/utils/sanitize.ts
  function sanitizeForPostMessage(value, seen = /* @__PURE__ */ new WeakSet()) {
    if (typeof value === "symbol") return "mixed";
    if (typeof value === "function") return void 0;
    if (value === null || typeof value !== "object") return value;
    if (seen.has(value)) return void 0;
    seen.add(value);
    if (Array.isArray(value)) {
      return value.map((v) => sanitizeForPostMessage(v, seen));
    }
    const out = {};
    for (const key of Object.keys(value)) {
      out[key] = sanitizeForPostMessage(value[key], seen);
    }
    return out;
  }

  // figma_plugin/utils/nodeFields.generated.ts
  var NODE_DATA_FIELDS = [
    "absoluteBoundingBox",
    "absoluteRenderBounds",
    "absoluteTransform",
    "annotations",
    "arcData",
    "authorName",
    "authorVisible",
    "autoRename",
    "backgroundStyleId",
    "backgrounds",
    "blendMode",
    "booleanOperation",
    "bottomLeftRadius",
    "bottomRightRadius",
    "boundVariables",
    "characters",
    "clipsContent",
    "code",
    "codeLanguage",
    "complexStrokeProperties",
    "componentProperties",
    "componentPropertyDefinitions",
    "componentPropertyReferences",
    "connectorEnd",
    "connectorEndStrokeCap",
    "connectorLineType",
    "connectorStart",
    "connectorStartStrokeCap",
    "constrainProportions",
    "constraints",
    "cornerRadius",
    "cornerSmoothing",
    "counterAxisAlignContent",
    "counterAxisAlignItems",
    "counterAxisSizingMode",
    "counterAxisSpacing",
    "dashPattern",
    "description",
    "descriptionMarkdown",
    "detachedInfo",
    "devStatus",
    "documentationLinks",
    "effectStyleId",
    "effects",
    "embedData",
    "expanded",
    "explicitVariableModes",
    "exportSettings",
    "fillGeometry",
    "fillStyleId",
    "fills",
    "fontName",
    "fontSize",
    "fontWeight",
    "gridChildHorizontalAlign",
    "gridChildVerticalAlign",
    "gridColumnAnchorIndex",
    "gridColumnCount",
    "gridColumnGap",
    "gridColumnSizes",
    "gridColumnSpan",
    "gridRowAnchorIndex",
    "gridRowCount",
    "gridRowGap",
    "gridRowSizes",
    "gridRowSpan",
    "gridStyleId",
    "guides",
    "handleMirroring",
    "hangingList",
    "hangingPunctuation",
    "hasMissingFont",
    "height",
    "horizontalPadding",
    "hyperlink",
    "inferredAutoLayout",
    "inferredVariables",
    "innerRadius",
    "interactiveSlideElementType",
    "isAsset",
    "isExposedInstance",
    "isMask",
    "isSkippedSlide",
    "isWideWidth",
    "itemReverseZIndex",
    "itemSpacing",
    "key",
    "layoutAlign",
    "layoutGrids",
    "layoutGrow",
    "layoutMode",
    "layoutPositioning",
    "layoutSizingHorizontal",
    "layoutSizingVertical",
    "layoutWrap",
    "leadingTrim",
    "letterSpacing",
    "lineHeight",
    "linkUnfurlData",
    "listSpacing",
    "locked",
    "maskType",
    "maxHeight",
    "maxLines",
    "maxWidth",
    "mediaData",
    "minHeight",
    "minWidth",
    "numColumns",
    "numRows",
    "numberOfFixedChildren",
    "opacity",
    "openTypeFeatures",
    "overflowDirection",
    "overlayBackground",
    "overlayBackgroundInteraction",
    "overlayPositionType",
    "overrides",
    "paddingBottom",
    "paddingLeft",
    "paddingRight",
    "paddingTop",
    "paragraphIndent",
    "paragraphSpacing",
    "pointCount",
    "primaryAxisAlignItems",
    "primaryAxisSizingMode",
    "reactions",
    "relativeTransform",
    "remote",
    "removed",
    "resolvedVariableModes",
    "rotation",
    "scaleFactor",
    "sectionContentsHidden",
    "shapeType",
    "strokeAlign",
    "strokeBottomWeight",
    "strokeCap",
    "strokeGeometry",
    "strokeJoin",
    "strokeLeftWeight",
    "strokeMiterLimit",
    "strokeRightWeight",
    "strokeStyleId",
    "strokeTopWeight",
    "strokeWeight",
    "strokes",
    "strokesIncludedInLayout",
    "targetAspectRatio",
    "textAlignHorizontal",
    "textAlignVertical",
    "textAutoResize",
    "textCase",
    "textDecoration",
    "textDecorationColor",
    "textDecorationOffset",
    "textDecorationSkipInk",
    "textDecorationStyle",
    "textDecorationThickness",
    "textPathStartData",
    "textStyleId",
    "textTruncation",
    "topLeftRadius",
    "topRightRadius",
    "transformModifiers",
    "variableWidthStrokeProperties",
    "variantGroupProperties",
    "variantProperties",
    "vectorNetwork",
    "vectorPaths",
    "verticalPadding",
    "visible",
    "widgetId",
    "widgetSyncedState",
    "width",
    "x",
    "y"
  ];

  // figma_plugin/utils/nodeUtils.ts
  var RESOLVED_NODE_REFS = [
    "parent",
    "mainComponent",
    "instances",
    "exposedInstances",
    "stuckNodes",
    "attachedConnectors"
  ];
  var SAFE_LIST_PROPERTIES = /* @__PURE__ */ new Set([
    "id",
    "name",
    "type",
    "children",
    ...NODE_DATA_FIELDS,
    ...RESOLVED_NODE_REFS
  ]);
  function buildPathArray(node) {
    const path = [];
    let current = node.parent;
    while (current && current.type !== "DOCUMENT") {
      path.unshift([current.type, current.id, current.name]);
      if (current.type === "PAGE") break;
      current = current.parent;
    }
    return path;
  }
  function getContainingPageNode(node) {
    let current = node;
    while (current) {
      if (current.type === "PAGE") {
        return current;
      }
      if (current.type === "DOCUMENT") {
        return null;
      }
      current = current.parent;
    }
    return null;
  }
  function countDescendants(node) {
    let count = 0;
    if (node && "children" in node && Array.isArray(node.children)) {
      for (const child of node.children) {
        count += 1 + countDescendants(child);
      }
    }
    return count;
  }
  function findLockedAncestor(node) {
    let current = node;
    while (current && current.type !== "DOCUMENT") {
      if (current.locked === true) {
        return current;
      }
      current = current.parent;
    }
    return null;
  }
  function findInstanceAncestor(node) {
    let current = node == null ? void 0 : node.parent;
    while (current && current.type !== "DOCUMENT") {
      if (current.type === "INSTANCE") {
        return current;
      }
      current = current.parent;
    }
    return null;
  }
  function assertNotLocked(node) {
    const lockedAncestor = findLockedAncestor(node);
    if (lockedAncestor) {
      throw new Error(`Operation Denied: Node '${node.name}' (or one of its ancestors, '${lockedAncestor.name}') is locked. Unlock the layer in Figma, or ask the user to unlock it, before editing.`);
    }
  }
  function assertNotInstanceInterior(node, verb) {
    const instanceAncestor = findInstanceAncestor(node);
    if (instanceAncestor) {
      throw new Error(`Operation Denied: Node '${node.name}' is inside a component instance ('${instanceAncestor.name}') and cannot be ${verb} directly. Edit the main component, or use instance overrides.`);
    }
  }
  function assertNotInstanceParent(parent, verb) {
    if (parent.type === "INSTANCE") {
      throw new Error(`Operation Denied: Node '${parent.name}' is a component instance and cannot be ${verb} directly. Edit the main component, or use instance overrides.`);
    }
    assertNotInstanceInterior(parent, verb);
  }
  function isAncestorOf(maybeAncestor, node) {
    if (!maybeAncestor || !node) return false;
    let current = node == null ? void 0 : node.parent;
    while (current && current.type !== "DOCUMENT") {
      if (current.id === maybeAncestor.id) {
        return true;
      }
      current = current.parent;
    }
    return false;
  }
  function readDuringRecovery(reader, fallback) {
    try {
      return reader();
    } catch (e) {
      return fallback;
    }
  }
  function reportRecoveryError(...args) {
    try {
      console.error(...args);
    } catch (e) {
    }
  }
  function removeUncommitted(node, context) {
    if (!node) return true;
    if (readDuringRecovery(() => node.removed === true, false)) return true;
    const remove = readDuringRecovery(
      () => typeof node.remove === "function" ? node.remove : null,
      null
    );
    if (!remove) {
      reportRecoveryError(`${context}: the uncommitted node has no readable remove() method; cleanup could not be confirmed`);
      return false;
    }
    try {
      remove.call(node);
    } catch (cleanupError) {
      reportRecoveryError(`${context}: failed to remove the uncommitted node during cleanup`, cleanupError);
      return false;
    }
    if (readDuringRecovery(() => node.removed === true, false)) return true;
    reportRecoveryError(`${context}: remove() returned but the uncommitted node still survives`);
    return false;
  }
  function getCreatorSurvivorEvidence(node, verifiedParentId) {
    const unreadableParent = {};
    const parent = readDuringRecovery(
      () => node.parent,
      unreadableParent
    );
    let survivingParentState;
    let survivingParentId;
    if (parent === unreadableParent || parent === void 0) {
      survivingParentState = "unknown";
      survivingParentId = null;
    } else if (parent === null) {
      survivingParentState = "detached";
      survivingParentId = null;
    } else {
      const unreadableParentId = {};
      const parentId = readDuringRecovery(
        () => typeof parent.id === "string" ? parent.id : unreadableParentId,
        unreadableParentId
      );
      if (parentId === unreadableParentId) {
        survivingParentState = "unknown";
        survivingParentId = null;
      } else {
        survivingParentState = "located";
        survivingParentId = parentId;
      }
    }
    return {
      survivingNodeId: readDuringRecovery(
        () => typeof node.id === "string" ? node.id : "unknown",
        "unknown"
      ),
      survivingNodeName: readDuringRecovery(
        () => typeof node.name === "string" ? node.name : "unknown",
        "unknown"
      ),
      survivingNodeType: readDuringRecovery(
        () => typeof node.type === "string" ? node.type : "unknown",
        "unknown"
      ),
      survivingParentState,
      survivingParentId,
      verifiedParentId
    };
  }
  function describeCreatorSurvivorParent(evidence) {
    if (evidence.survivingParentState === "located") {
      return `'${evidence.survivingParentId}'`;
    }
    if (evidence.survivingParentState === "detached") {
      return "detached/null";
    }
    return "unknown (the parent could not be read safely)";
  }
  function rethrowAfterCreatorCleanup(error, node, context, verifiedParentId) {
    if (removeUncommitted(node, context)) {
      throw error;
    }
    const evidence = getCreatorSurvivorEvidence(node, verifiedParentId);
    throw withPartialDisclosure(
      error,
      `${context} created node '${evidence.survivingNodeName}' (${evidence.survivingNodeId}) survives because cleanup could not remove it; its current parent is ${describeCreatorSurvivorParent(evidence)}.`,
      evidence
    );
  }

  // figma_plugin/utils/pageLoad.ts
  var PAGE_LOAD_TIMEOUT_MS = 1e4;
  function toConnectPayloadError(error) {
    return {
      errorCode: error.code,
      errorMessage: error.message,
      ...error.details !== void 0 ? { details: error.details } : {}
    };
  }
  function createPageLoadCoordinator(timeoutMs = PAGE_LOAD_TIMEOUT_MS) {
    const boundedTimeoutMs = Math.max(1, timeoutMs);
    const pageLoads = /* @__PURE__ */ new Map();
    const pageResolutions = /* @__PURE__ */ new Map();
    const pageErrors = /* @__PURE__ */ new Map();
    const attemptedPages = /* @__PURE__ */ new Set();
    const recordError = (pageId, error, reason) => {
      attemptedPages.add(pageId);
      if (!pageErrors.has(pageId)) {
        pageErrors.set(pageId, { pageId, error });
      }
      return { ok: false, error, reason };
    };
    const load = (page) => {
      attemptedPages.add(page.id);
      const cached = pageLoads.get(page.id);
      if (cached) return cached;
      const attempt = new Promise((resolve) => {
        let acceptingSettlement = true;
        const finish = (result) => {
          if (!acceptingSettlement) return;
          acceptingSettlement = false;
          clearTimeout(timer);
          resolve(result);
        };
        const timer = setTimeout(() => {
          if (!acceptingSettlement) return;
          acceptingSettlement = false;
          resolve(recordError(
            page.id,
            REFUSALS.PAGE_LOAD_TIMEOUT(page.id, boundedTimeoutMs),
            "timeout"
          ));
        }, boundedTimeoutMs);
        Promise.resolve().then(() => page.loadAsync()).then(
          () => finish({ ok: true, page }),
          (error) => finish(recordError(
            page.id,
            REFUSALS.PAGE_LOAD_FAILED(page.id, describeError(error)),
            "load_failed"
          ))
        );
      });
      pageLoads.set(page.id, attempt);
      return attempt;
    };
    const resolvePage = (pageId) => {
      const cached = pageResolutions.get(pageId);
      if (cached) return cached;
      const resolution = (async () => {
        var _a;
        attemptedPages.add(pageId);
        let node;
        try {
          node = await figma.getNodeByIdAsync(pageId);
        } catch (error) {
          return recordError(
            pageId,
            REFUSALS.PAGE_LOAD_FAILED(pageId, describeError(error)),
            "load_failed"
          );
        }
        if (!node) {
          return recordError(
            pageId,
            REFUSALS.PAGE_NOT_FOUND(pageId),
            "not_found"
          );
        }
        if (node.type !== "PAGE") {
          return recordError(
            pageId,
            REFUSALS.TARGET_NOT_PAGE(pageId, node.type),
            "not_page"
          );
        }
        let documentRootId;
        try {
          documentRootId = figma.root.id;
        } catch (error) {
          return recordError(
            pageId,
            REFUSALS.PAGE_LOAD_FAILED(
              pageId,
              `document root identity could not be verified: ${describeError(error)}`
            ),
            "load_failed"
          );
        }
        let parentId;
        try {
          parentId = (_a = node.parent) == null ? void 0 : _a.id;
        } catch (error) {
          return recordError(
            pageId,
            REFUSALS.PAGE_LOAD_FAILED(
              pageId,
              `direct document parent could not be verified: ${describeError(error)}`
            ),
            "load_failed"
          );
        }
        if (parentId !== documentRootId) {
          return recordError(
            pageId,
            REFUSALS.TARGET_NOT_PAGE(
              pageId,
              "PAGE, but not a direct child of the document root"
            ),
            "not_page"
          );
        }
        return load(node);
      })();
      pageResolutions.set(pageId, resolution);
      return resolution;
    };
    return {
      load,
      resolve: resolvePage,
      async require(pageId) {
        const result = await resolvePage(pageId);
        if (!result.ok) {
          throw result.error;
        }
        return result.page;
      },
      // Every caller of `fail` has already loaded the page successfully and
      // then failed while READING it, so this is PAGE_SCAN_FAILED, not
      // PAGE_LOAD_FAILED (Change 8, F2). The originating cause is preserved
      // in `details.cause` either way.
      fail(pageId, cause) {
        return recordError(
          pageId,
          REFUSALS.PAGE_SCAN_FAILED(pageId, describeError(cause)),
          "scan_failed"
        );
      },
      coverage() {
        const errors = Array.from(pageErrors.values());
        return {
          complete: errors.length === 0,
          pagesAttempted: attemptedPages.size,
          pageErrors: errors
        };
      }
    };
  }

  // figma_plugin/handlers/nodeReaders.ts
  async function getPagesInfo(params, pageLoads = createPageLoadCoordinator()) {
    const { pageIds, commandId } = params || {};
    const documentId = figma.root.id;
    const documentName = figma.root.name;
    const pageCount = figma.root.children.length;
    if (!pageIds || !Array.isArray(pageIds) || pageIds.length === 0) {
      const pages2 = figma.root.children.map((p) => ({
        pageId: p.id,
        pageName: p.name
      }));
      return {
        documentId,
        documentName,
        pageCount,
        pages: pages2,
        coverage: pageLoads.coverage()
      };
    }
    const seen = /* @__PURE__ */ new Set();
    const orderedIds = pageIds.filter((id) => !seen.has(id) && (seen.add(id), true));
    const pages = [];
    const missingPageIds = [];
    if (commandId) {
      await sendProgressUpdate(
        commandId,
        "get_pages_info",
        "started",
        0,
        orderedIds.length,
        0,
        `Starting page info retrieval for ${orderedIds.length} pages`
      );
    }
    let processedItems = 0;
    for (const id of orderedIds) {
      const loaded = await pageLoads.resolve(id);
      if (loaded.ok) {
        const node = loaded.page;
        try {
          pages.push({
            pageId: node.id,
            pageName: node.name,
            descendantCount: countDescendants(node),
            children: node.children.map((child) => ({
              id: child.id,
              name: child.name,
              type: child.type
            }))
          });
        } catch (error) {
          pageLoads.fail(node.id, error);
          missingPageIds.push(id);
        }
      } else {
        missingPageIds.push(id);
      }
      processedItems++;
      if (commandId) {
        await sendProgressUpdate(
          commandId,
          "get_pages_info",
          "in_progress",
          Math.round(processedItems / orderedIds.length * 100),
          orderedIds.length,
          processedItems,
          `Processed ${processedItems}/${orderedIds.length} pages`
        );
      }
    }
    if (commandId) {
      await sendProgressUpdate(
        commandId,
        "get_pages_info",
        "completed",
        100,
        orderedIds.length,
        processedItems,
        `Completed retrieving page info`
      );
    }
    return {
      documentId,
      documentName,
      pageCount,
      pages,
      missingPageIds,
      coverage: pageLoads.coverage()
    };
  }
  async function getNodesInfoParallel(uniqueIds, properties, filter, maxDepth, concurrencyLimit, commandId, exportCache, stats, pageLoads) {
    const results = new Array(uniqueIds.length);
    let nextIndex = 0;
    let completedCount = 0;
    let lastEmittedPercentage = 0;
    const runWorker = async () => {
      while (true) {
        const index = nextIndex++;
        if (index >= uniqueIds.length) {
          break;
        }
        const id = uniqueIds[index];
        let containingPage = null;
        try {
          const node = await figma.getNodeByIdAsync(id);
          if (!node) {
            results[index] = { missing: true, id };
          } else {
            containingPage = getContainingPageNode(node);
            if (containingPage) {
              const loaded = await pageLoads.load(containingPage);
              if (!loaded.ok) {
                results[index] = {
                  pageFailed: true,
                  id,
                  pageId: containingPage.id
                };
                continue;
              }
            }
            const mappedSubtree = await mapNodeRecursive(
              node,
              0,
              maxDepth,
              properties,
              filter,
              exportCache,
              stats,
              pageLoads
            );
            let entry = mappedSubtree;
            if (!entry) {
              entry = {
                id: node.id,
                name: node.name,
                type: node.type
              };
              if (Array.isArray(properties) && properties.length > 0) {
                const props = await extractProperties(node, properties, exportCache);
                if (Object.keys(props).length > 0) {
                  entry.properties = props;
                }
              }
            }
            entry.path = buildPathArray(node);
            if (node.type !== "DOCUMENT") {
              entry.descendantCount = countDescendants(node);
            }
            results[index] = entry;
          }
        } catch (error) {
          console.error(`[getNodesInfoParallel] Error processing node ${id}: ${describeError(error)}`);
          if (containingPage) {
            pageLoads.fail(containingPage.id, error);
            results[index] = {
              pageFailed: true,
              id,
              pageId: containingPage.id
            };
          } else {
            results[index] = { missing: true, id };
          }
        } finally {
          completedCount++;
          if (commandId && uniqueIds.length > 1) {
            const rawPercentage = Math.round(completedCount / uniqueIds.length * 100);
            const progressPercent = Math.max(lastEmittedPercentage, rawPercentage);
            lastEmittedPercentage = progressPercent;
            await sendProgressUpdate(
              commandId,
              "get_nodes_info",
              "in_progress",
              progressPercent,
              uniqueIds.length,
              completedCount,
              `Processed ${completedCount}/${uniqueIds.length} top-level nodes`
            );
            await new Promise((r) => setTimeout(r, 0));
          }
        }
      }
    };
    const poolLimit = Math.min(concurrencyLimit, uniqueIds.length);
    const workers = [];
    for (let i = 0; i < poolLimit; i++) {
      workers.push(runWorker());
    }
    await Promise.all(workers);
    const nodes = [];
    const missingNodeIds = [];
    const pageFailedNodes = [];
    for (let i = 0; i < uniqueIds.length; i++) {
      const res = results[i];
      if (res && res.missing) {
        missingNodeIds.push(res.id);
      } else if (res && res.pageFailed) {
        pageFailedNodes.push({ nodeId: res.id, pageId: res.pageId });
      } else if (res) {
        nodes.push(res);
      }
    }
    return { nodes, missingNodeIds, pageFailedNodes };
  }
  async function getNodesInfo(params, pageLoads = createPageLoadCoordinator()) {
    const {
      nodeIds = [],
      properties = [],
      filter = {},
      maxDepth,
      concurrencyLimit = 4,
      commandId
    } = params || {};
    try {
      const seen = /* @__PURE__ */ new Set();
      const uniqueIds = (Array.isArray(nodeIds) ? nodeIds : []).filter(
        (id) => id && typeof id === "string" && !seen.has(id) && (seen.add(id), true)
      );
      if (commandId) {
        await sendProgressUpdate(
          commandId,
          "get_nodes_info",
          "started",
          0,
          uniqueIds.length,
          0,
          `Starting node info retrieval for ${uniqueIds.length} nodes`
        );
      }
      const exportCache = /* @__PURE__ */ new Map();
      const stats = { processed: 0, commandId };
      const limit = Math.max(1, typeof concurrencyLimit === "number" ? concurrencyLimit : 4);
      const { nodes, missingNodeIds, pageFailedNodes } = await getNodesInfoParallel(
        uniqueIds,
        properties,
        filter,
        maxDepth,
        limit,
        commandId,
        exportCache,
        stats,
        pageLoads
      );
      if (commandId) {
        await sendProgressUpdate(
          commandId,
          "get_nodes_info",
          "completed",
          100,
          uniqueIds.length,
          uniqueIds.length,
          `Successfully processed ${nodes.length} nodes (${missingNodeIds.length} missing, ${pageFailedNodes.length} unreadable)`
        );
      }
      return {
        nodes,
        missingNodeIds: missingNodeIds.length > 0 ? missingNodeIds : void 0,
        pageFailedNodes: pageFailedNodes.length > 0 ? pageFailedNodes : void 0,
        coverage: pageLoads.coverage()
      };
    } catch (error) {
      console.error(`[getNodesInfo] Error: ${describeError(error)}`);
      throw error;
    }
  }
  async function mapNodeRecursive(node, depth, maxDepth, requestedProps, filter, exportCache, progressTracker, pageLoads) {
    if (node.type === "PAGE") {
      const loaded = await pageLoads.load(node);
      if (!loaded.ok) {
        return null;
      }
    }
    progressTracker.processed++;
    if (progressTracker.processed % 25 === 0) {
      if (progressTracker.commandId) {
        await sendProgressUpdate(
          progressTracker.commandId,
          "get_nodes_info",
          "in_progress",
          0,
          // Global percentage is hard to calculate for recursive walk
          0,
          progressTracker.processed,
          `Traversed ${progressTracker.processed} total nodes...`
        );
      }
      await new Promise((r) => setTimeout(r, 0));
    }
    const matchesFilter = checkFilterMatch(node, filter);
    const hasChildren = "children" in node && node.children.length > 0;
    const shouldRecurse = maxDepth === void 0 || depth < maxDepth;
    const children = [];
    let hasMatchingDescendant = false;
    if (hasChildren && shouldRecurse) {
      for (const child of node.children) {
        let mappedChild;
        try {
          mappedChild = await mapNodeRecursive(
            child,
            depth + 1,
            maxDepth,
            requestedProps,
            filter,
            exportCache,
            progressTracker,
            pageLoads
          );
        } catch (error) {
          if (child.type === "PAGE") {
            pageLoads.fail(child.id, error);
            mappedChild = null;
          } else {
            throw error;
          }
        }
        if (mappedChild) {
          children.push(mappedChild);
          hasMatchingDescendant = true;
        }
      }
    }
    if (!matchesFilter && !hasMatchingDescendant) {
      return null;
    }
    let properties;
    if (matchesFilter && requestedProps.length > 0) {
      properties = await extractProperties(node, requestedProps, exportCache);
    }
    const entry = {
      id: node.id,
      name: node.name,
      type: node.type
    };
    if (children.length > 0) {
      entry.children = children;
    }
    if (properties && Object.keys(properties).length > 0) {
      entry.properties = properties;
    }
    if (!shouldRecurse && node.type !== "DOCUMENT") {
      entry.descendantCount = hasChildren ? countDescendants(node) : 0;
    }
    return entry;
  }
  function checkFilterMatch(node, filter) {
    if (!filter || Object.keys(filter).length === 0) return true;
    if (filter.type && Array.isArray(filter.type) && filter.type.length > 0) {
      if (!filter.type.includes(node.type)) return false;
    }
    if (filter.layoutMode && Array.isArray(filter.layoutMode) && filter.layoutMode.length > 0) {
      const nodeLayoutMode = node.layoutMode || "NONE";
      if (!filter.layoutMode.includes(nodeLayoutMode)) return false;
    }
    return true;
  }
  async function resolveVariableAliases(obj) {
    if (obj === null || obj === void 0) {
      return obj;
    }
    if (Array.isArray(obj)) {
      return Promise.all(obj.map((item) => resolveVariableAliases(item)));
    }
    if (typeof obj === "object") {
      if (obj.type === "VARIABLE_ALIAS" && typeof obj.id === "string") {
        try {
          const variable = await figma.variables.getVariableByIdAsync(obj.id);
          return {
            id: obj.id,
            name: variable ? variable.name : "Unknown Variable"
          };
        } catch (e) {
          return { id: obj.id, name: "Unknown Variable" };
        }
      }
      const resolved = {};
      for (const [key, value] of Object.entries(obj)) {
        resolved[key] = await resolveVariableAliases(value);
      }
      return resolved;
    }
    return obj;
  }
  async function extractProperties(node, requestedProps, exportCache) {
    const props = {};
    const needsExport = requestedProps.some((p) => !SAFE_LIST_PROPERTIES.has(p));
    let exportedData = null;
    if (needsExport) {
      if (!exportCache.has(node.id)) {
        const promise = node.exportAsync({
          format: "JSON_REST_V1"
        }).then((r) => r.document);
        exportCache.set(node.id, promise);
      }
      exportedData = await exportCache.get(node.id);
    }
    const STRUCTURAL_KEYS = /* @__PURE__ */ new Set(["id", "name", "type", "children", "path"]);
    for (const key of requestedProps) {
      if (STRUCTURAL_KEYS.has(key)) continue;
      if (key === "parent") {
        props["parent"] = node.parent ? node.parent.id : null;
      } else if (key === "mainComponent") {
        if ("getMainComponentAsync" in node && typeof node.getMainComponentAsync === "function") {
          const mainComp = await node.getMainComponentAsync();
          props["mainComponent"] = mainComp ? mainComp.id : null;
        } else {
          props["mainComponent"] = null;
        }
      } else if (key === "instances") {
        if ("getInstancesAsync" in node && typeof node.getInstancesAsync === "function") {
          const instances = await node.getInstancesAsync();
          props["instances"] = instances ? instances.map((inst) => inst.id) : [];
        } else {
          props["instances"] = [];
        }
      } else if (key === "exposedInstances") {
        const expInst = node.exposedInstances;
        props["exposedInstances"] = expInst ? expInst.map((inst) => inst.id) : [];
      } else if (key === "stuckNodes") {
        const stuck = node.stuckNodes;
        props["stuckNodes"] = stuck ? stuck.map((n) => n.id) : [];
      } else if (key === "attachedConnectors") {
        const conn = node.attachedConnectors;
        props["attachedConnectors"] = conn ? conn.map((c) => c.id) : [];
      } else if (key.endsWith("StyleId")) {
        const styleId = node[key];
        if (styleId && typeof styleId === "string" && styleId !== "") {
          try {
            const style = await figma.getStyleByIdAsync(styleId);
            props[key] = {
              id: styleId,
              name: style ? style.name : "Unknown Style"
            };
          } catch (e) {
            props[key] = { id: styleId, name: "Unknown Style" };
          }
        } else {
          props[key] = null;
        }
      } else if (key === "boundVariables") {
        const boundVars = node.boundVariables;
        if (boundVars && Object.keys(boundVars).length > 0) {
          props["boundVariables"] = await resolveVariableAliases(boundVars);
        } else {
          props["boundVariables"] = {};
        }
      } else if (key === "explicitVariableModes") {
        const modes = node.explicitVariableModes;
        if (modes && Object.keys(modes).length > 0) {
          const resolvedModes = {};
          for (const [colId, modeId] of Object.entries(modes)) {
            try {
              const col = await figma.variables.getVariableCollectionByIdAsync(colId);
              const m = col ? col.modes.find((mode) => mode.modeId === modeId) : null;
              resolvedModes[colId] = {
                id: modeId,
                name: m ? `${col.name}: ${m.name}` : "Unknown Mode"
              };
            } catch (e) {
              resolvedModes[colId] = { id: modeId, name: "Unknown Mode" };
            }
          }
          props["explicitVariableModes"] = resolvedModes;
        } else {
          props["explicitVariableModes"] = {};
        }
      } else if (SAFE_LIST_PROPERTIES.has(key)) {
        const val = node[key];
        if (val !== void 0 && val !== null) {
          props[key] = typeof val === "symbol" ? "mixed" : val;
        }
      } else if (exportedData && exportedData[key] !== void 0) {
        props[key] = exportedData[key];
      }
    }
    return props;
  }

  // figma_plugin/utils/helpers.ts
  function uniqBy(arr, predicate) {
    const cb = typeof predicate === "function" ? predicate : (o) => o[predicate];
    return [
      ...arr.reduce((map, item) => {
        const key = item === null || item === void 0 ? item : cb(item);
        map.has(key) || map.set(key, item);
        return map;
      }, /* @__PURE__ */ new Map()).values()
    ];
  }
  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // figma_plugin/utils/textUtils.ts
  var getDelimiterPos = (str, delimiter, startIdx = 0, endIdx = str.length) => {
    const indices = [];
    let temp = startIdx;
    for (let i = startIdx; i < endIdx; i++) {
      if (str[i] === delimiter && i + startIdx !== endIdx && temp !== i + startIdx) {
        indices.push([temp, i + startIdx]);
        temp = i + startIdx + 1;
      }
    }
    temp !== endIdx && indices.push([temp, endIdx]);
    return indices.filter(Boolean);
  };
  var buildLinearOrder = (node) => {
    const fontTree = [];
    const newLinesPos = getDelimiterPos(node.characters, "\n");
    newLinesPos.forEach(([newLinesRangeStart, newLinesRangeEnd], n) => {
      const newLinesRangeFont = node.getRangeFontName(
        newLinesRangeStart,
        newLinesRangeEnd
      );
      if (newLinesRangeFont === figma.mixed) {
        const spacesPos = getDelimiterPos(
          node.characters,
          " ",
          newLinesRangeStart,
          newLinesRangeEnd
        );
        spacesPos.forEach(([spacesRangeStart, spacesRangeEnd], s) => {
          const spacesRangeFont = node.getRangeFontName(
            spacesRangeStart,
            spacesRangeEnd
          );
          if (spacesRangeFont === figma.mixed) {
            const spacesRangeFont2 = node.getRangeFontName(
              spacesRangeStart,
              spacesRangeStart[0]
            );
            fontTree.push({
              start: spacesRangeStart,
              delimiter: " ",
              family: spacesRangeFont2.family,
              style: spacesRangeFont2.style
            });
          } else {
            fontTree.push({
              start: spacesRangeStart,
              delimiter: " ",
              family: spacesRangeFont.family,
              style: spacesRangeFont.style
            });
          }
        });
      } else {
        fontTree.push({
          start: newLinesRangeStart,
          delimiter: "\n",
          family: newLinesRangeFont.family,
          style: newLinesRangeFont.style
        });
      }
    });
    return fontTree.sort((a, b) => +a.start - +b.start).map(({ family, style, delimiter }) => ({ family, style, delimiter }));
  };
  var setCharacters = async (node, characters, options, report) => {
    const fallbackFont = options && options.fallbackFont || {
      family: "Inter",
      style: "Regular"
    };
    if (report) report.beforeFont = captureFontSnapshot(node);
    try {
      if (node.fontName === figma.mixed) {
        if (options && options.smartStrategy === "prevail") {
          const fontHashTree = {};
          for (let i = 1; i < node.characters.length; i++) {
            const charFont = node.getRangeFontName(i - 1, i);
            const key = `${charFont.family}::${charFont.style}`;
            fontHashTree[key] = fontHashTree[key] ? fontHashTree[key] + 1 : 1;
          }
          const prevailedTreeItem = Object.entries(fontHashTree).sort(
            (a, b) => b[1] - a[1]
          )[0];
          const [family, style] = prevailedTreeItem[0].split("::");
          const prevailedFont = {
            family,
            style
          };
          await figma.loadFontAsync(prevailedFont);
          node.fontName = prevailedFont;
          if (report) report.fontMutated = true;
        } else if (options && options.smartStrategy === "strict") {
          return setCharactersWithStrictMatchFont(node, characters, fallbackFont);
        } else if (options && options.smartStrategy === "experimental") {
          return setCharactersWithSmartMatchFont(node, characters, fallbackFont);
        } else {
          const firstCharFont = node.getRangeFontName(0, 1);
          await figma.loadFontAsync(firstCharFont);
          node.fontName = firstCharFont;
          if (report) report.fontMutated = true;
        }
      } else {
        await figma.loadFontAsync({
          family: node.fontName.family,
          style: node.fontName.style
        });
      }
    } catch (err) {
      console.warn(
        `Failed to load "${node.fontName["family"]} ${node.fontName["style"]}" font and replaced with fallback "${fallbackFont.family} ${fallbackFont.style}"`,
        err
      );
      await figma.loadFontAsync(fallbackFont);
      node.fontName = fallbackFont;
      if (report) report.fontMutated = true;
    }
    try {
      node.characters = characters;
      return true;
    } catch (err) {
      console.warn(`Failed to set characters. Skipped.`, err);
      return false;
    }
  };
  function captureFontSnapshot(node) {
    const fn = node.fontName;
    if (fn && typeof fn === "object" && "family" in fn) {
      return { family: fn.family, style: fn.style };
    }
    try {
      if (typeof node.getStyledTextSegments === "function") {
        const segments = node.getStyledTextSegments(["fontName"]).map((s) => ({
          start: s.start,
          end: s.end,
          fontName: s.fontName
        }));
        return { mixed: true, segments };
      }
    } catch (e) {
    }
    return { mixed: true };
  }
  var setCharactersWithStrictMatchFont = async (node, characters, fallbackFont) => {
    const fontHashTree = {};
    for (let i = 1; i < node.characters.length; i++) {
      const startIdx = i - 1;
      const startCharFont = node.getRangeFontName(startIdx, i);
      const startCharFontVal = `${startCharFont.family}::${startCharFont.style}`;
      while (i < node.characters.length) {
        i++;
        const charFont = node.getRangeFontName(i - 1, i);
        if (startCharFontVal !== `${charFont.family}::${charFont.style}`) {
          break;
        }
      }
      fontHashTree[`${startIdx}_${i}`] = startCharFontVal;
    }
    await figma.loadFontAsync(fallbackFont);
    node.fontName = fallbackFont;
    node.characters = characters;
    console.log(fontHashTree);
    await Promise.all(
      Object.keys(fontHashTree).map(async (range) => {
        console.log(range, fontHashTree[range]);
        const [start, end] = range.split("_");
        const [family, style] = fontHashTree[range].split("::");
        const matchedFont = {
          family,
          style
        };
        await figma.loadFontAsync(matchedFont);
        return node.setRangeFontName(Number(start), Number(end), matchedFont);
      })
    );
    return true;
  };
  var setCharactersWithSmartMatchFont = async (node, characters, fallbackFont) => {
    const rangeTree = buildLinearOrder(node);
    const fontsToLoad = uniqBy(
      rangeTree,
      ({ family, style }) => `${family}::${style}`
    ).map(({ family, style }) => ({
      family,
      style
    }));
    await Promise.all([...fontsToLoad, fallbackFont].map(figma.loadFontAsync));
    node.fontName = fallbackFont;
    node.characters = characters;
    let prevPos = 0;
    rangeTree.forEach(({ family, style, delimiter }) => {
      if (prevPos < node.characters.length) {
        const delimeterPos = node.characters.indexOf(delimiter, prevPos);
        const endPos = delimeterPos > prevPos ? delimeterPos : node.characters.length;
        const matchedFont = {
          family,
          style
        };
        node.setRangeFontName(prevPos, endPos, matchedFont);
        prevPos = endPos + 1;
      }
    });
    return true;
  };

  // figma_plugin/utils/creatorValidation.ts
  function assertNonEmptyExplicitName(value, parameterName, command, recovery) {
    if (value === "") {
      throw new Error(
        `${command}: ${parameterName} must not be empty. ${recovery}`
      );
    }
  }

  // figma_plugin/handlers/nodeCreators.ts
  async function resolveAppendableParent(parentId, command) {
    if (!parentId) throw new Error(`${command}: missing parentId parameter.`);
    const parent = await figma.getNodeByIdAsync(parentId);
    if (!parent) throw new Error(`${command}: parent node not found with ID: ${parentId}.`);
    if (!("appendChild" in parent)) {
      throw new Error(`${command}: parent '${parent.name}' (type ${parent.type}) cannot contain children.`);
    }
    return parent;
  }
  async function createShape(params) {
    var _a, _b, _c;
    const {
      type,
      x = 0,
      y = 0,
      width = 100,
      height = 100,
      name,
      parentId,
      useAbsolutePosition = false,
      fillColor,
      strokeColor,
      arcData,
      pointCount,
      innerRadius
    } = params || {};
    if (!type) {
      throw new Error("Missing shape type parameter");
    }
    assertNonEmptyExplicitName(
      name,
      "name",
      "create_shape",
      "Omit name to use the default name."
    );
    const upperType = type.toUpperCase();
    if (arcData !== void 0 && upperType !== "ELLIPSE") {
      throw new Error(`arcData is only supported for shape type ELLIPSE, got ${type}`);
    }
    if ((upperType === "POLYGON" || upperType === "STAR") && pointCount === void 0) {
      throw new Error(`pointCount is required for shape type ${type}`);
    }
    if (innerRadius !== void 0 && upperType !== "STAR") {
      throw new Error(`innerRadius is only supported for shape type STAR, got ${type}`);
    }
    const parent = await resolveAppendableParent(parentId, "create_shape");
    if ((upperType === "POLYGON" || upperType === "STAR") && pointCount < 3) {
      throw new Error(`${upperType === "POLYGON" ? "Polygons" : "Stars"} require pointCount >= 3`);
    }
    let createNode;
    switch (upperType) {
      case "RECTANGLE":
        createNode = () => figma.createRectangle();
        break;
      case "ELLIPSE":
        createNode = () => figma.createEllipse();
        break;
      case "POLYGON":
        createNode = () => figma.createPolygon();
        break;
      case "STAR":
        createNode = () => figma.createStar();
        break;
      default:
        throw new Error(`Unsupported shape type: ${type}`);
    }
    const node = createNode();
    try {
      parent.appendChild(node);
      if (upperType === "ELLIPSE" && arcData) {
        node.arcData = {
          startingAngle: (_a = arcData.startingAngle) != null ? _a : 0,
          endingAngle: (_b = arcData.endingAngle) != null ? _b : Math.PI * 2,
          innerRadius: (_c = arcData.innerRadius) != null ? _c : 0
        };
      }
      if ((upperType === "POLYGON" || upperType === "STAR") && pointCount !== void 0) {
        node.pointCount = pointCount;
      }
      if (upperType === "STAR" && innerRadius !== void 0) {
        node.innerRadius = innerRadius;
      }
      node.x = x;
      node.y = y;
      node.resize(width, height);
      if (name !== void 0) {
        node.name = name;
      } else {
        node.name = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
      }
      if (fillColor) {
        node.fills = [{
          type: "SOLID",
          color: {
            r: parseFloat(fillColor.r) || 0,
            g: parseFloat(fillColor.g) || 0,
            b: parseFloat(fillColor.b) || 0
          },
          opacity: typeof fillColor.a === "number" ? fillColor.a : 1
        }];
      }
      if (strokeColor) {
        node.strokes = [{
          type: "SOLID",
          color: {
            r: parseFloat(strokeColor.r) || 0,
            g: parseFloat(strokeColor.g) || 0,
            b: parseFloat(strokeColor.b) || 0
          },
          opacity: typeof strokeColor.a === "number" ? strokeColor.a : 1
        }];
      }
      if (useAbsolutePosition && parentId) {
        if (parent && (parent.layoutMode === "HORIZONTAL" || parent.layoutMode === "VERTICAL")) {
          node.layoutPositioning = "ABSOLUTE";
          node.x = x;
          node.y = y;
        }
      }
      const result = {
        id: node.id,
        name: node.name,
        type: node.type,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        parentId: node.parent ? node.parent.id : void 0
      };
      return result;
    } catch (error) {
      rethrowAfterCreatorCleanup(error, node, "create_shape", parentId);
    }
  }
  async function createFrame(params) {
    const {
      x = 0,
      y = 0,
      width = 100,
      height = 100,
      name = "Frame",
      parentId,
      fillColor,
      strokeColor,
      strokeWeight,
      layoutMode = "NONE",
      layoutWrap = "NO_WRAP",
      paddingTop = 10,
      paddingRight = 10,
      paddingBottom = 10,
      paddingLeft = 10,
      primaryAxisAlignItems = "MIN",
      counterAxisAlignItems = "MIN",
      layoutSizingHorizontal = "FIXED",
      layoutSizingVertical = "FIXED",
      itemSpacing = 0
    } = params || {};
    assertNonEmptyExplicitName(
      name,
      "name",
      "create_frame",
      "Omit name to use the default name."
    );
    const parentNode = await resolveAppendableParent(parentId, "create_frame");
    const frame = figma.createFrame();
    try {
      parentNode.appendChild(frame);
      frame.x = x;
      frame.y = y;
      frame.resize(width, height);
      frame.name = name;
      if (layoutMode !== "NONE") {
        frame.layoutMode = layoutMode;
        frame.layoutWrap = layoutWrap;
        frame.paddingTop = paddingTop;
        frame.paddingRight = paddingRight;
        frame.paddingBottom = paddingBottom;
        frame.paddingLeft = paddingLeft;
        frame.primaryAxisAlignItems = primaryAxisAlignItems;
        frame.counterAxisAlignItems = counterAxisAlignItems;
        frame.layoutSizingHorizontal = layoutSizingHorizontal;
        frame.layoutSizingVertical = layoutSizingVertical;
        frame.itemSpacing = itemSpacing;
      }
      if (fillColor) {
        const paintStyle = {
          type: "SOLID",
          color: {
            r: parseFloat(fillColor.r) || 0,
            g: parseFloat(fillColor.g) || 0,
            b: parseFloat(fillColor.b) || 0
          },
          opacity: typeof fillColor.a === "number" ? fillColor.a : 1
        };
        frame.fills = [paintStyle];
      }
      if (strokeColor) {
        const strokeStyle = {
          type: "SOLID",
          color: {
            r: parseFloat(strokeColor.r) || 0,
            g: parseFloat(strokeColor.g) || 0,
            b: parseFloat(strokeColor.b) || 0
          },
          opacity: typeof strokeColor.a === "number" ? strokeColor.a : 1
        };
        frame.strokes = [strokeStyle];
      }
      if (strokeWeight !== void 0) {
        frame.strokeWeight = strokeWeight;
      }
      const result = {
        id: frame.id,
        name: frame.name,
        x: frame.x,
        y: frame.y,
        width: frame.width,
        height: frame.height,
        fills: frame.fills,
        strokes: frame.strokes,
        strokeWeight: frame.strokeWeight,
        layoutMode: frame.layoutMode,
        layoutWrap: frame.layoutWrap,
        parentId: frame.parent ? frame.parent.id : void 0
      };
      return result;
    } catch (error) {
      rethrowAfterCreatorCleanup(error, frame, "create_frame", parentId);
    }
  }
  function getFontStyle(weight) {
    switch (weight) {
      case 100:
        return "Thin";
      case 200:
        return "Extra Light";
      case 300:
        return "Light";
      case 400:
        return "Regular";
      case 500:
        return "Medium";
      case 600:
        return "Semi Bold";
      case 700:
        return "Bold";
      case 800:
        return "Extra Bold";
      case 900:
        return "Black";
      default:
        throw new Error(`Unsupported fontWeight ${weight}; expected one of 100, 200, 300, 400, 500, 600, 700, 800, or 900.`);
    }
  }
  async function createText(params) {
    const {
      x = 0,
      y = 0,
      text = "Text",
      fontSize = 14,
      fontWeight = 400,
      fontColor = { r: 0, g: 0, b: 0, a: 1 },
      // Default to black
      name,
      parentId
    } = params || {};
    assertNonEmptyExplicitName(
      name,
      "name",
      "create_text",
      "Omit name to use the default name."
    );
    const fontStyle = getFontStyle(fontWeight);
    const parentNode = await resolveAppendableParent(parentId, "create_text");
    const textNode = figma.createText();
    try {
      parentNode.appendChild(textNode);
      textNode.x = x;
      textNode.y = y;
      textNode.name = name !== void 0 ? name : text;
      await figma.loadFontAsync({
        family: "Inter",
        style: fontStyle
      });
      textNode.fontName = { family: "Inter", style: fontStyle };
      textNode.fontSize = fontSize;
      await setCharacters(textNode, text);
      const paintStyle = {
        type: "SOLID",
        color: {
          r: parseFloat(fontColor.r) || 0,
          g: parseFloat(fontColor.g) || 0,
          b: parseFloat(fontColor.b) || 0
        },
        opacity: typeof fontColor.a === "number" ? fontColor.a : 1
      };
      textNode.fills = [paintStyle];
      const result = {
        id: textNode.id,
        name: textNode.name,
        x: textNode.x,
        y: textNode.y,
        width: textNode.width,
        height: textNode.height,
        characters: textNode.characters,
        fontSize: textNode.fontSize,
        fontWeight,
        fontColor,
        fontName: textNode.fontName,
        fills: textNode.fills,
        parentId: textNode.parent ? textNode.parent.id : void 0
      };
      return result;
    } catch (error) {
      rethrowAfterCreatorCleanup(error, textNode, "create_text", parentId);
    }
  }
  async function cloneNode(params) {
    const { nodeId, x, y } = params || {};
    if (!nodeId) {
      throw new Error("Missing nodeId parameter");
    }
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
      throw new Error(`Node not found with ID: ${nodeId}`);
    }
    const parent = node.parent;
    if (!parent) {
      throw new Error(`node_clone: '${node.name}' has no parent and cannot be cloned.`);
    }
    if (!("appendChild" in parent)) {
      throw new Error(`node_clone: parent '${parent.name}' (type ${parent.type}) cannot accept cloned children.`);
    }
    const verifiedParentId = parent.id;
    const clone = node.clone();
    try {
      parent.appendChild(clone);
      if (x !== void 0 && y !== void 0) {
        clone.x = x;
        clone.y = y;
      }
      const result = {
        id: clone.id,
        name: clone.name,
        x: "x" in clone ? clone.x : void 0,
        y: "y" in clone ? clone.y : void 0,
        width: "width" in clone ? clone.width : void 0,
        height: "height" in clone ? clone.height : void 0,
        // D11: report where the node actually landed, so the caller can
        // confirm containment from the response instead of re-reading.
        parentId: clone.parent ? clone.parent.id : void 0
      };
      return result;
    } catch (error) {
      rethrowAfterCreatorCleanup(error, clone, "node_clone", verifiedParentId);
    }
  }

  // figma_plugin/utils/batchResult.ts
  function deriveBatchStatus(succeeded, failed, skipped) {
    if (succeeded > 0 && failed === 0 && skipped === 0) return "success";
    if (succeeded > 0) return "partial_success";
    return "failed";
  }
  function batchEnvelope(requested, succeeded, failed, skipped) {
    const status = deriveBatchStatus(succeeded, failed, skipped);
    return {
      success: status === "success",
      status,
      requestedCount: requested,
      succeededCount: succeeded,
      failedCount: failed,
      skippedCount: skipped
    };
  }

  // figma_plugin/handlers/nodeModifiers.ts
  async function transformNode(params) {
    const { nodeId, x, y, width, height } = params || {};
    if (!nodeId) {
      throw new Error("Missing nodeId parameter");
    }
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
      throw new Error(`Node not found with ID: ${nodeId}`);
    }
    const warnings = [];
    if (x !== void 0 || y !== void 0) {
      if (!("x" in node) || !("y" in node)) {
        throw new Error(`Node does not support position: ${nodeId}`);
      }
      const parent = node.parent;
      if (parent && "layoutMode" in parent && parent.layoutMode !== "NONE") {
        const isAbsolute = "layoutPositioning" in node && node.layoutPositioning === "ABSOLUTE";
        if (!isAbsolute) {
          throw new Error(`Operation Denied: Cannot set x/y on node '${node.name}' because its parent ('${parent.name}') has Auto-layout applied and the node is not absolutely positioned. To reposition this node, either change its order in the parent's children array, set its layoutPositioning to "ABSOLUTE", or remove Auto-layout from the parent.`);
        }
      }
      if (x !== void 0) node.x = x;
      if (y !== void 0) node.y = y;
    }
    if (width !== void 0 || height !== void 0) {
      if (!("resize" in node)) {
        throw new Error(`Node does not support resizing: ${nodeId}`);
      }
      let newWidth = width !== void 0 ? width : node.width;
      let newHeight = height !== void 0 ? height : node.height;
      const parent = node.parent;
      if (parent && "layoutMode" in parent && parent.layoutMode !== "NONE") {
        const isAbsolute = "layoutPositioning" in node && node.layoutPositioning === "ABSOLUTE";
        if (!isAbsolute) {
          if (width !== void 0 && "layoutSizingHorizontal" in node && node.layoutSizingHorizontal !== "FIXED") {
            warnings.push(`Horizontal resize applied to '${node.name}', which reverted its layoutSizingHorizontal from ${node.layoutSizingHorizontal} to FIXED.`);
          }
          if (height !== void 0 && "layoutSizingVertical" in node && node.layoutSizingVertical !== "FIXED") {
            warnings.push(`Vertical resize applied to '${node.name}', which reverted its layoutSizingVertical from ${node.layoutSizingVertical} to FIXED.`);
          }
        }
      } else if (!parent || "layoutMode" in parent && parent.layoutMode === "NONE") {
        if (width !== void 0 && "layoutSizingHorizontal" in node && node.layoutSizingHorizontal !== "FIXED") {
          warnings.push(`Horizontal resize applied to '${node.name}', which reverted its layoutSizingHorizontal from ${node.layoutSizingHorizontal} to FIXED.`);
        }
        if (height !== void 0 && "layoutSizingVertical" in node && node.layoutSizingVertical !== "FIXED") {
          warnings.push(`Vertical resize applied to '${node.name}', which reverted its layoutSizingVertical from ${node.layoutSizingVertical} to FIXED.`);
        }
      }
      node.resize(newWidth, newHeight);
    }
    const result = {
      id: node.id,
      name: node.name,
      x: "x" in node ? node.x : void 0,
      y: "y" in node ? node.y : void 0,
      width: "width" in node ? node.width : void 0,
      height: "height" in node ? node.height : void 0
    };
    if (warnings.length > 0) result.warnings = warnings;
    return result;
  }
  function alreadyGoneRecovery(nodeId) {
    return `Node ${nodeId} no longer exists, so the deletion you asked for is already in effect. The usual cause is that this batch also named one of its ancestors, and removing the ancestor removed this node too. Do NOT retry this row \u2014 dispatcher prevalidation refuses the whole command for an unresolvable node. Confirm with node_info (an absent node comes back in missingNodeIds) and treat this target as deleted.`;
  }
  function alreadyGoneReason(nodeId) {
    return `Node not found: ${nodeId}. ${alreadyGoneRecovery(nodeId)}`;
  }
  async function deleteMultipleNodes(params) {
    const { nodeIds } = params || {};
    const commandId = generateCommandId();
    if (!nodeIds || !Array.isArray(nodeIds) || nodeIds.length === 0) {
      const errorMsg = "Missing or invalid nodeIds parameter";
      await sendProgressUpdate(
        commandId,
        "node_delete",
        "error",
        0,
        0,
        0,
        errorMsg,
        { error: errorMsg }
      );
      throw new Error(errorMsg);
    }
    console.log(`Starting deletion of ${nodeIds.length} nodes`);
    await sendProgressUpdate(
      commandId,
      "node_delete",
      "started",
      0,
      nodeIds.length,
      0,
      `Starting deletion of ${nodeIds.length} nodes`,
      { requestedCount: nodeIds.length }
    );
    const results = [];
    let successCount = 0;
    let failureCount = 0;
    const CHUNK_SIZE = 50;
    const chunks = [];
    for (let i = 0; i < nodeIds.length; i += CHUNK_SIZE) {
      chunks.push(nodeIds.slice(i, i + CHUNK_SIZE));
    }
    console.log(`Split ${nodeIds.length} deletions into ${chunks.length} chunks`);
    await sendProgressUpdate(
      commandId,
      "node_delete",
      "in_progress",
      5,
      nodeIds.length,
      0,
      `Preparing to delete ${nodeIds.length} nodes using ${chunks.length} chunks`,
      {
        requestedCount: nodeIds.length,
        chunks: chunks.length,
        chunkSize: CHUNK_SIZE
      }
    );
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      console.log(
        `Processing chunk ${chunkIndex + 1}/${chunks.length} with ${chunk.length} nodes`
      );
      await sendProgressUpdate(
        commandId,
        "node_delete",
        "in_progress",
        Math.round(5 + chunkIndex / chunks.length * 90),
        nodeIds.length,
        successCount + failureCount,
        `Processing deletion chunk ${chunkIndex + 1}/${chunks.length}`,
        {
          currentChunk: chunkIndex + 1,
          totalChunks: chunks.length,
          // Q26/R9: progress uses the shared envelope count names — no second
          // count vocabulary. Local vars stay `successCount`/`failureCount`.
          succeededCount: successCount,
          failedCount: failureCount
        }
      );
      const chunkPromises = chunk.map(async (nodeId) => {
        try {
          const node = await figma.getNodeByIdAsync(nodeId);
          if (!node) {
            console.error(`Node not found: ${nodeId}`);
            return {
              success: false,
              nodeId,
              error: alreadyGoneReason(nodeId)
            };
          }
          const nodeInfo = {
            id: node.id,
            name: node.name,
            type: node.type
          };
          node.remove();
          console.log(`Successfully deleted node: ${nodeId}`);
          return {
            success: true,
            nodeId,
            nodeInfo
          };
        } catch (error) {
          const errorMessage = describeError(error);
          console.error(`Error deleting node ${nodeId}: ${errorMessage}`);
          return {
            success: false,
            nodeId,
            error: /does not exist|already (been )?removed/i.test(errorMessage) ? `${errorMessage}. ${alreadyGoneRecovery(nodeId)}` : errorMessage
          };
        }
      });
      const chunkResults = await Promise.all(chunkPromises);
      chunkResults.forEach((result) => {
        if (result.success) {
          successCount++;
        } else {
          failureCount++;
        }
        results.push(result);
      });
      await sendProgressUpdate(
        commandId,
        "node_delete",
        "in_progress",
        Math.round(5 + (chunkIndex + 1) / chunks.length * 90),
        nodeIds.length,
        successCount + failureCount,
        `Completed chunk ${chunkIndex + 1}/${chunks.length}. ${successCount} successful, ${failureCount} failed so far.`,
        {
          currentChunk: chunkIndex + 1,
          totalChunks: chunks.length,
          // Q26/R9: shared envelope count names in progress, not a second vocabulary.
          succeededCount: successCount,
          failedCount: failureCount,
          chunkResults
        }
      );
      if (chunkIndex < chunks.length - 1) {
        console.log("Pausing between chunks...");
        await delay(20);
      }
    }
    console.log(
      `Deletion complete: ${successCount} successful, ${failureCount} failed`
    );
    await sendProgressUpdate(
      commandId,
      "node_delete",
      "completed",
      100,
      nodeIds.length,
      successCount + failureCount,
      `Node deletion complete: ${successCount} successful, ${failureCount} failed`,
      {
        // Q26: only the shared envelope counts in the progress payload.
        requestedCount: nodeIds.length,
        succeededCount: successCount,
        failedCount: failureCount,
        completedInChunks: chunks.length,
        results
      }
    );
    const formattedResults = results.map((r) => ({
      success: r.success,
      status: r.success ? "success" : "failed",
      nodeId: r.nodeId,
      error: r.error,
      nodeInfo: r.nodeInfo
    }));
    return {
      ...batchEnvelope(nodeIds.length, successCount, failureCount, 0),
      results: formattedResults,
      completedInChunks: chunks.length,
      commandId
    };
  }
  async function viewNavigate(params) {
    if (!params || !params.ids || !Array.isArray(params.ids)) {
      throw new Error("Missing or invalid ids parameter");
    }
    if (params.ids.length === 0) {
      throw new Error("ids array cannot be empty");
    }
    const resolvedNodes = [];
    const pageNodes = [];
    for (const id of params.ids) {
      const node = await figma.getNodeByIdAsync(id);
      if (!node) {
        throw new Error(`Node not found with ID: ${id}`);
      }
      if (node.type === "DOCUMENT") {
        throw new Error("Cannot navigate to DOCUMENT root");
      }
      if (node.type === "PAGE") {
        pageNodes.push(node);
      } else {
        resolvedNodes.push(node);
      }
    }
    if (pageNodes.length > 0) {
      if (pageNodes.length > 1 || resolvedNodes.length > 0) {
        throw new Error("Cannot navigate to mixed targets or multiple pages");
      }
      const page = pageNodes[0];
      await figma.setCurrentPageAsync(page);
      return {
        pageId: page.id,
        pageName: page.name
      };
    } else {
      const pages = resolvedNodes.map((node) => {
        const page = getContainingPageNode(node);
        if (!page) {
          throw new Error(`Node ${node.id} is detached and not on a page`);
        }
        return page;
      });
      const firstPage = pages[0];
      for (const page of pages) {
        if (page.id !== firstPage.id) {
          throw new Error("Selected nodes must belong to the same page");
        }
      }
      await figma.setCurrentPageAsync(firstPage);
      figma.currentPage.selection = resolvedNodes;
      figma.viewport.scrollAndZoomIntoView(resolvedNodes);
      const selectedNodes = resolvedNodes.map((node) => ({
        name: node.name,
        id: node.id
      }));
      return {
        success: true,
        count: resolvedNodes.length,
        selectedNodes,
        message: `Selected ${resolvedNodes.length} nodes`
      };
    }
  }
  async function setNodeName(params) {
    const { nodeId, name } = params || {};
    if (!nodeId) {
      throw new Error("Missing nodeId parameter");
    }
    if (name === void 0) {
      throw new Error("Missing name parameter");
    }
    assertNonEmptyExplicitName(
      name,
      "name",
      "node_rename",
      "Supply a non-empty name."
    );
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
      throw new Error(`Node not found with ID: ${nodeId}`);
    }
    const oldName = node.name;
    node.name = name;
    return {
      id: node.id,
      name: node.name,
      oldName
    };
  }
  async function groupNodes(params) {
    const { nodes, name } = params;
    if (!nodes || nodes.length < 2) {
      throw new Error("At least 2 nodes are required to create a group");
    }
    assertNonEmptyExplicitName(
      name,
      "name",
      "node_group",
      "Omit name to use Figma's default group name."
    );
    const resolvedNodes = [];
    for (const { nodeId } of nodes) {
      const node = await figma.getNodeByIdAsync(nodeId);
      if (node) resolvedNodes.push(node);
    }
    if (resolvedNodes.length < 2) {
      throw new Error("Could not resolve enough nodes to group");
    }
    const parent = resolvedNodes[0].parent;
    if (!parent) {
      throw new Error("Nodes must have a parent to be grouped");
    }
    for (const node of resolvedNodes) {
      if (node.parent !== parent) {
        throw new Error("All nodes must have the same parent to be grouped");
      }
    }
    const group = figma.group(resolvedNodes, parent);
    if (name !== void 0) group.name = name;
    return { id: group.id, name: group.name, childCount: group.children.length };
  }
  async function ungroupNodes(params) {
    const { nodeId } = params;
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) throw new Error(`Node not found with ID: ${nodeId}`);
    if (node.type !== "GROUP") {
      throw new Error(`Node is not a group (got ${node.type})`);
    }
    const parent = node.parent;
    const children = [...node.children];
    const childIds = children.map((c) => ({ id: c.id, name: c.name }));
    figma.ungroup(node);
    return { ungroupedChildren: childIds, parentId: parent ? parent.id : null };
  }
  async function flattenNode(params) {
    const { nodeId } = params;
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) throw new Error(`Node not found with ID: ${nodeId}`);
    const parent = node.parent;
    if (!parent || !("children" in parent) || !("insertChild" in parent)) {
      throw new Error(`node_flatten: '${node.name}' has no valid parent container.`);
    }
    const index = parent.children.indexOf(node);
    if (index < 0) {
      throw new Error(`node_flatten: '${node.name}' is no longer a child of its resolved parent.`);
    }
    const flattened = figma.flatten([node], parent, index);
    return {
      id: flattened.id,
      name: flattened.name,
      type: flattened.type,
      parentId: flattened.parent ? flattened.parent.id : null
    };
  }
  async function insertChild(params) {
    const { parentId, childId, index } = params;
    const parent = await figma.getNodeByIdAsync(parentId);
    if (!parent) throw new Error(`Parent not found: ${parentId}`);
    if (!("children" in parent)) {
      throw new Error(`Parent node cannot have children (type: ${parent.type})`);
    }
    const child = await figma.getNodeByIdAsync(childId);
    if (!child) throw new Error(`Child not found: ${childId}`);
    if (parentId === childId) {
      throw new Error(`Operation Denied: A node cannot be inserted into itself.`);
    }
    if (isAncestorOf(child, parent)) {
      throw new Error(`Operation Denied: Cannot insert node '${child.name}' into '${parent.name}' \u2014 the parent is a descendant of the node (cyclic hierarchy).`);
    }
    if (child.type === "PAGE" && parent.type !== "DOCUMENT") {
      throw new Error(`Operation Denied: A PAGE node can only be inserted into a DOCUMENT.`);
    }
    if (child.type !== "PAGE" && parent.type === "DOCUMENT") {
      throw new Error(`Operation Denied: Only PAGE nodes can be inserted directly into a DOCUMENT.`);
    }
    if (index !== void 0) {
      const length = parent.children.length;
      if (index < 0 || index > length) {
        throw new Error(`Operation Denied: index ${index} is out of range for parent '${parent.name}' (valid: 0\u2013${length}). Omit 'index' to append.`);
      }
      parent.insertChild(index, child);
    } else {
      parent.appendChild(child);
    }
    return { childId: child.id, newParentId: parent.id, index: parent.children.indexOf(child) };
  }

  // figma_plugin/utils/exportUtils.ts
  function customBase64Encode(bytes) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let base64 = "";
    const byteLength = bytes.byteLength;
    const byteRemainder = byteLength % 3;
    const mainLength = byteLength - byteRemainder;
    let a, b, c, d;
    let chunk;
    for (let i = 0; i < mainLength; i = i + 3) {
      chunk = bytes[i] << 16 | bytes[i + 1] << 8 | bytes[i + 2];
      a = (chunk & 16515072) >> 18;
      b = (chunk & 258048) >> 12;
      c = (chunk & 4032) >> 6;
      d = chunk & 63;
      base64 += chars[a] + chars[b] + chars[c] + chars[d];
    }
    if (byteRemainder === 1) {
      chunk = bytes[mainLength];
      a = (chunk & 252) >> 2;
      b = (chunk & 3) << 4;
      base64 += chars[a] + chars[b] + "==";
    } else if (byteRemainder === 2) {
      chunk = bytes[mainLength] << 8 | bytes[mainLength + 1];
      a = (chunk & 64512) >> 10;
      b = (chunk & 1008) >> 4;
      c = (chunk & 15) << 2;
      base64 += chars[a] + chars[b] + chars[c] + "=";
    }
    return base64;
  }
  function base64ToBytes(b64) {
    let base64 = b64.replace(/\s/g, "").replace(/^data:.*?;base64,/, "");
    while (base64.length % 4 !== 0) {
      base64 += "=";
    }
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
      throw new Error("Invalid base64 string");
    }
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const lookup = new Uint8Array(256);
    for (let i = 0; i < chars.length; i++) {
      lookup[chars.charCodeAt(i)] = i;
    }
    let bufferLength = base64.length * 0.75;
    if (base64[base64.length - 1] === "=") bufferLength--;
    if (base64[base64.length - 2] === "=") bufferLength--;
    const bytes = new Uint8Array(bufferLength);
    let p = 0;
    for (let i = 0; i < base64.length; i += 4) {
      const encoded1 = lookup[base64.charCodeAt(i)];
      const encoded2 = lookup[base64.charCodeAt(i + 1)];
      const encoded3 = lookup[base64.charCodeAt(i + 2)];
      const encoded4 = lookup[base64.charCodeAt(i + 3)];
      bytes[p++] = encoded1 << 2 | encoded2 >> 4;
      if (base64[i + 2] !== "=") {
        bytes[p++] = (encoded2 & 15) << 4 | encoded3 >> 2;
        if (base64[i + 3] !== "=") {
          bytes[p++] = (encoded3 & 3) << 6 | encoded4 & 63;
        }
      }
    }
    return bytes;
  }
  function bytesToUtf8(bytes) {
    if (typeof TextDecoder !== "undefined") {
      return new TextDecoder("utf-8").decode(bytes);
    }
    let out = "";
    let i = 0;
    const len = bytes.length;
    while (i < len) {
      const b1 = bytes[i++];
      if (b1 < 128) {
        out += String.fromCharCode(b1);
      } else if (b1 >= 192 && b1 < 224) {
        const b2 = bytes[i++];
        out += String.fromCharCode((b1 & 31) << 6 | b2 & 63);
      } else if (b1 >= 224 && b1 < 240) {
        const b2 = bytes[i++];
        const b3 = bytes[i++];
        out += String.fromCharCode((b1 & 15) << 12 | (b2 & 63) << 6 | b3 & 63);
      } else {
        const b2 = bytes[i++];
        const b3 = bytes[i++];
        const b4 = bytes[i++];
        let cp = (b1 & 7) << 18 | (b2 & 63) << 12 | (b3 & 63) << 6 | b4 & 63;
        cp -= 65536;
        out += String.fromCharCode(55296 + (cp >> 10), 56320 + (cp & 1023));
      }
    }
    return out;
  }

  // figma_plugin/handlers/stylingHandlers.ts
  async function setFillColor(params) {
    console.log("setFillColor", params);
    const { nodeId, color, image, clear } = params || {};
    if (!nodeId) {
      throw new Error("Missing nodeId parameter");
    }
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
      throw new Error(`Node not found with ID: ${nodeId}`);
    }
    if (clear) {
      if (!("fills" in node)) {
        throw new Error(`node_set_fill: '${node.name}' (type ${node.type}) has no 'fills' property to clear.`);
      }
      node.fills = [];
      return {
        id: node.id,
        name: node.name,
        fills: []
      };
    }
    if (!("fills" in node)) {
      throw new Error(`node_set_fill: '${node.name}' (type ${node.type}) has no 'fills' property to set a fill on.`);
    }
    if (color && image) {
      throw new Error("node_set_fill: provide exactly one of: a solid color (r,g,b[,a]), an image, or clear:true.");
    }
    if (!color && !image) {
      throw new Error("node_set_fill: provide exactly one of: a solid color (r,g,b[,a]), an image, or clear:true.");
    }
    let paintStyle;
    if (color) {
      const { r, g, b, a } = color;
      const rgbColor = {
        r: parseFloat(r) || 0,
        g: parseFloat(g) || 0,
        b: parseFloat(b) || 0,
        a: a !== void 0 ? parseFloat(a) : 1
      };
      paintStyle = {
        type: "SOLID",
        color: {
          r: parseFloat(rgbColor.r),
          g: parseFloat(rgbColor.g),
          b: parseFloat(rgbColor.b)
        },
        opacity: parseFloat(rgbColor.a)
      };
    } else {
      const { url, bytesBase64, scaleMode, opacity } = image;
      if (url && bytesBase64) {
        throw new Error("node_set_fill: image requires exactly one of 'url' or 'bytesBase64'.");
      }
      if (!url && !bytesBase64) {
        throw new Error("node_set_fill: image requires exactly one of 'url' or 'bytesBase64'.");
      }
      let figmaImage;
      try {
        if (url) {
          try {
            figmaImage = await figma.createImageAsync(url);
          } catch (e) {
            if (e.message && (e.message.includes("is too large") || e.message.includes("type is unsupported") || e.message.includes("is too small"))) {
              throw e;
            }
            throw new Error(`node_set_fill: could not fetch image from URL '${url}' (network/CORS). createImageAsync needs a directly fetchable, public URL to a PNG/JPEG/GIF.`);
          }
        } else {
          let bytes;
          try {
            bytes = base64ToBytes(bytesBase64);
          } catch (e) {
            throw new Error("node_set_fill: 'bytesBase64' is not valid base64. Provide base64-encoded raw PNG/JPEG/GIF bytes.");
          }
          figmaImage = figma.createImage(bytes);
        }
      } catch (e) {
        let msg = e.message || String(e);
        if (msg.startsWith("node_set_fill:")) {
          throw e;
        }
        throw new Error(`node_set_fill: Figma rejected the image \u2014 '${msg}'. Images must be PNG/JPEG/GIF, \u22644096px per side. PNG/JPEG bytes are auto-resized; this typically means an oversized 'url' image, an oversized GIF, or an unsupported/too-small image \u2014 pre-resize or convert it.`);
      }
      paintStyle = {
        type: "IMAGE",
        imageHash: figmaImage.hash,
        scaleMode: scaleMode || "FILL"
      };
      if (opacity !== void 0) {
        paintStyle.opacity = opacity;
      }
    }
    console.log("paintStyle", paintStyle);
    node.fills = [paintStyle];
    return {
      id: node.id,
      name: node.name,
      fills: [paintStyle]
    };
  }
  async function setStroke(params) {
    const {
      nodeId,
      color: { r, g, b, a },
      weight = 1,
      strokeTopWeight,
      strokeBottomWeight,
      strokeLeftWeight,
      strokeRightWeight
    } = params || {};
    if (!nodeId) {
      throw new Error("Missing nodeId parameter");
    }
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
      throw new Error(`Node not found with ID: ${nodeId}`);
    }
    if (!("strokes" in node)) {
      throw new Error(`Node does not support strokes: ${nodeId}`);
    }
    const rgbColor = {
      r: r !== void 0 ? r : 0,
      g: g !== void 0 ? g : 0,
      b: b !== void 0 ? b : 0,
      a: a !== void 0 ? a : 1
    };
    const paintStyle = {
      type: "SOLID",
      color: {
        r: rgbColor.r,
        g: rgbColor.g,
        b: rgbColor.b
      },
      opacity: rgbColor.a
    };
    node.strokes = [paintStyle];
    const hasIndividualWeights = strokeTopWeight !== void 0 || strokeBottomWeight !== void 0 || strokeLeftWeight !== void 0 || strokeRightWeight !== void 0;
    if (hasIndividualWeights) {
      if ("strokeTopWeight" in node) {
        node.strokeTopWeight = strokeTopWeight !== void 0 ? strokeTopWeight : 0;
        node.strokeBottomWeight = strokeBottomWeight !== void 0 ? strokeBottomWeight : 0;
        node.strokeLeftWeight = strokeLeftWeight !== void 0 ? strokeLeftWeight : 0;
        node.strokeRightWeight = strokeRightWeight !== void 0 ? strokeRightWeight : 0;
      } else {
        throw new Error(`Node does not support individual stroke weights: ${nodeId}`);
      }
    } else if ("strokeWeight" in node) {
      node.strokeWeight = weight;
    }
    const strokeWeightValue = "strokeWeight" in node ? node.strokeWeight === figma.mixed ? "mixed" : node.strokeWeight : void 0;
    return {
      id: node.id,
      name: node.name,
      strokes: node.strokes,
      strokeWeight: strokeWeightValue,
      strokeTopWeight: "strokeTopWeight" in node ? node.strokeTopWeight : void 0,
      strokeBottomWeight: "strokeBottomWeight" in node ? node.strokeBottomWeight : void 0,
      strokeLeftWeight: "strokeLeftWeight" in node ? node.strokeLeftWeight : void 0,
      strokeRightWeight: "strokeRightWeight" in node ? node.strokeRightWeight : void 0
    };
  }
  async function setCornerRadius(params) {
    const { nodeId, radius, corners } = params || {};
    if (!nodeId) {
      throw new Error("Missing nodeId parameter");
    }
    if (radius === void 0) {
      throw new Error("Missing radius parameter");
    }
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
      throw new Error(`Node not found with ID: ${nodeId}`);
    }
    if (!("cornerRadius" in node)) {
      throw new Error(`Node does not support corner radius: ${nodeId}`);
    }
    if (corners && Array.isArray(corners) && corners.length === 4) {
      if ("topLeftRadius" in node) {
        if (corners[0]) node.topLeftRadius = radius;
        if (corners[1]) node.topRightRadius = radius;
        if (corners[2]) node.bottomRightRadius = radius;
        if (corners[3]) node.bottomLeftRadius = radius;
      } else {
        node.cornerRadius = radius;
      }
    } else {
      node.cornerRadius = radius;
    }
    return {
      id: node.id,
      name: node.name,
      cornerRadius: "cornerRadius" in node ? node.cornerRadius : void 0,
      topLeftRadius: "topLeftRadius" in node ? node.topLeftRadius : void 0,
      topRightRadius: "topRightRadius" in node ? node.topRightRadius : void 0,
      bottomRightRadius: "bottomRightRadius" in node ? node.bottomRightRadius : void 0,
      bottomLeftRadius: "bottomLeftRadius" in node ? node.bottomLeftRadius : void 0
    };
  }
  var KNOWN_EFFECT_TYPES = [
    "DROP_SHADOW",
    "INNER_SHADOW",
    "LAYER_BLUR",
    "BACKGROUND_BLUR",
    "NOISE",
    "TEXTURE",
    "GLASS"
  ];
  function normalizeEffects(effects) {
    return effects.map((effect) => {
      if (!effect.type) {
        throw new Error("Each effect must have a type (DROP_SHADOW, INNER_SHADOW, LAYER_BLUR, BACKGROUND_BLUR, NOISE, TEXTURE, GLASS)");
      }
      if (!KNOWN_EFFECT_TYPES.includes(effect.type)) {
        return effect;
      }
      const normalized = Object.assign({}, effect, {
        visible: effect.visible !== void 0 ? effect.visible : true
      });
      if (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW") {
        normalized.color = effect.color || { r: 0, g: 0, b: 0, a: 0.25 };
        normalized.offset = effect.offset || { x: 0, y: 4 };
        normalized.radius = effect.radius !== void 0 ? effect.radius : 4;
        normalized.spread = effect.spread !== void 0 ? effect.spread : 0;
        normalized.blendMode = effect.blendMode || "NORMAL";
        if (effect.type === "DROP_SHADOW") {
          normalized.showShadowBehindNode = effect.showShadowBehindNode !== void 0 ? effect.showShadowBehindNode : false;
        } else {
          delete normalized.showShadowBehindNode;
        }
      } else if (effect.type === "LAYER_BLUR" || effect.type === "BACKGROUND_BLUR") {
        normalized.radius = effect.radius !== void 0 ? effect.radius : 4;
      }
      return normalized;
    });
  }
  async function setEffects(params) {
    const { nodeId, effects } = params || {};
    if (!nodeId) {
      throw new Error("Missing nodeId parameter");
    }
    if (!effects || !Array.isArray(effects)) {
      throw new Error("Missing effects parameter or it is not an array");
    }
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
      throw new Error(`Node not found with ID: ${nodeId}`);
    }
    if (!("effects" in node)) {
      throw new Error(`Node does not support effects: ${nodeId}`);
    }
    const processedEffects = normalizeEffects(effects);
    node.effects = processedEffects;
    return {
      id: node.id,
      name: node.name,
      effects: node.effects
    };
  }

  // figma_plugin/handlers/layoutHandlers.ts
  async function setAutoLayout(params) {
    const {
      nodeId,
      layoutMode,
      layoutWrap,
      paddingTop,
      paddingRight,
      paddingBottom,
      paddingLeft,
      primaryAxisAlignItems,
      counterAxisAlignItems,
      layoutSizingHorizontal,
      layoutSizingVertical,
      itemSpacing,
      counterAxisSpacing
    } = params || {};
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
      throw new Error(`Node with ID ${nodeId} not found`);
    }
    if (node.type !== "FRAME" && node.type !== "COMPONENT" && node.type !== "COMPONENT_SET" && node.type !== "INSTANCE") {
      throw new Error(`Node type ${node.type} does not support auto-layout properties`);
    }
    if (layoutMode !== void 0) {
      node.layoutMode = layoutMode;
    }
    if (layoutWrap !== void 0) {
      if (node.layoutMode === "NONE") {
      } else {
        node.layoutWrap = layoutWrap;
      }
    }
    const isNone = node.layoutMode === "NONE";
    const internalProps = [paddingTop, paddingRight, paddingBottom, paddingLeft, primaryAxisAlignItems, counterAxisAlignItems, itemSpacing, counterAxisSpacing, layoutWrap];
    if (isNone && internalProps.some((p) => p !== void 0)) {
      throw new Error(`Operation Denied: Cannot apply padding, alignment, wrap, or spacing to '${node.name}' because its layoutMode is NONE (it is not an Auto-layout frame).`);
    }
    if (!isNone) {
      if (paddingTop !== void 0) node.paddingTop = paddingTop;
      if (paddingRight !== void 0) node.paddingRight = paddingRight;
      if (paddingBottom !== void 0) node.paddingBottom = paddingBottom;
      if (paddingLeft !== void 0) node.paddingLeft = paddingLeft;
    }
    if (!isNone) {
      if (primaryAxisAlignItems !== void 0) {
        if (!["MIN", "MAX", "CENTER", "SPACE_BETWEEN"].includes(primaryAxisAlignItems)) {
          throw new Error("Invalid primaryAxisAlignItems value");
        }
        node.primaryAxisAlignItems = primaryAxisAlignItems;
      }
      if (counterAxisAlignItems !== void 0) {
        if (!["MIN", "MAX", "CENTER", "BASELINE"].includes(counterAxisAlignItems)) {
          throw new Error("Invalid counterAxisAlignItems value");
        }
        if (counterAxisAlignItems === "BASELINE" && node.layoutMode !== "HORIZONTAL") {
          throw new Error("BASELINE alignment is only valid for horizontal auto-layout frames");
        }
        node.counterAxisAlignItems = counterAxisAlignItems;
      }
    }
    if (layoutSizingHorizontal !== void 0) {
      if (!["FIXED", "HUG", "FILL"].includes(layoutSizingHorizontal)) {
        throw new Error("Invalid layoutSizingHorizontal value");
      }
      if (layoutSizingHorizontal === "FILL") {
        const parent = node.parent;
        if (!parent || !("layoutMode" in parent) || parent.layoutMode === "NONE") {
          const parentMode = parent && "layoutMode" in parent ? parent.layoutMode : "NONE";
          const parentName = parent ? parent.name : "(none)";
          throw new Error(`Operation Denied: Sizing 'FILL' requires the parent to be an Auto-Layout frame (layoutMode HORIZONTAL or VERTICAL). Parent '${parentName}' has layoutMode '${parentMode}'.`);
        }
      }
      node.layoutSizingHorizontal = layoutSizingHorizontal;
    }
    if (layoutSizingVertical !== void 0) {
      if (!["FIXED", "HUG", "FILL"].includes(layoutSizingVertical)) {
        throw new Error("Invalid layoutSizingVertical value");
      }
      if (layoutSizingVertical === "FILL") {
        const parent = node.parent;
        if (!parent || !("layoutMode" in parent) || parent.layoutMode === "NONE") {
          const parentMode = parent && "layoutMode" in parent ? parent.layoutMode : "NONE";
          const parentName = parent ? parent.name : "(none)";
          throw new Error(`Operation Denied: Sizing 'FILL' requires the parent to be an Auto-Layout frame (layoutMode HORIZONTAL or VERTICAL). Parent '${parentName}' has layoutMode '${parentMode}'.`);
        }
      }
      node.layoutSizingVertical = layoutSizingVertical;
    }
    if (!isNone) {
      if (itemSpacing !== void 0) {
        node.itemSpacing = itemSpacing;
      }
      if (counterAxisSpacing !== void 0) {
        if (node.layoutWrap === "WRAP") {
          node.counterAxisSpacing = counterAxisSpacing;
        } else {
          throw new Error("Counter axis spacing can only be set on frames with layoutWrap set to WRAP");
        }
      }
    }
    return {
      id: node.id,
      name: node.name,
      layoutMode: node.layoutMode,
      layoutWrap: node.layoutWrap
      // Return other properties? Maybe just name/id/mode is enough. 
      // Let's return what we have in the original implementation sort of.
    };
  }

  // figma_plugin/handlers/componentHandlers.ts
  async function getStyles() {
    const styles = {
      colors: await figma.getLocalPaintStylesAsync(),
      texts: await figma.getLocalTextStylesAsync(),
      effects: await figma.getLocalEffectStylesAsync(),
      grids: await figma.getLocalGridStylesAsync()
    };
    return {
      colors: styles.colors.map((style) => ({
        id: style.id,
        name: style.name,
        key: style.key,
        paint: style.paints[0]
      })),
      texts: styles.texts.map((style) => ({
        id: style.id,
        name: style.name,
        key: style.key,
        fontSize: style.fontSize,
        fontName: style.fontName
      })),
      effects: styles.effects.map((style) => ({
        id: style.id,
        name: style.name,
        key: style.key
      })),
      grids: styles.grids.map((style) => ({
        id: style.id,
        name: style.name,
        key: style.key
      }))
    };
  }
  async function getComponents(params, pageLoads = createPageLoadCoordinator()) {
    const { filter, scope = "document", pageId, commandId } = params || {};
    const isStreaming = scope === "document";
    if (commandId && isStreaming) {
      await sendProgressUpdate(
        commandId,
        "get_components",
        "started",
        0,
        0,
        0,
        `Starting get_components in ${scope} scope`
      );
    }
    const allComponents = [];
    if (scope === "page") {
      if (!pageId) {
        throw new Error("pageId is required when scope is 'page'");
      }
      const pageNode = await pageLoads.require(pageId);
      try {
        const components = pageNode.findAllWithCriteria({
          types: ["COMPONENT", "COMPONENT_SET"]
        });
        allComponents.push(...components);
      } catch (error) {
        throw pageLoads.fail(pageNode.id, error).error;
      }
    } else {
      const pages = figma.root.children;
      for (const [index, page] of pages.entries()) {
        const loaded = await pageLoads.load(page);
        if (loaded.ok) {
          try {
            const components = page.findAllWithCriteria({
              types: ["COMPONENT", "COMPONENT_SET"]
            });
            allComponents.push(...components);
          } catch (error) {
            pageLoads.fail(page.id, error);
          }
        }
        if (commandId) {
          await sendProgressUpdate(
            commandId,
            "get_components",
            "in_progress",
            Math.round((index + 1) / pages.length * 100),
            pages.length,
            index + 1,
            `Searching page ${index + 1}/${pages.length}: ${page.name}`
          );
        }
      }
    }
    let filtered = allComponents;
    if (filter === "local") {
      filtered = allComponents.filter((c) => !c.remote);
    } else if (filter === "remote") {
      filtered = allComponents.filter((c) => c.remote);
    }
    const mapped = filtered.map((component) => ({
      id: component.id,
      name: component.name,
      key: component.key,
      remote: component.remote,
      type: component.type,
      pageId: getContainingPageId(component)
    }));
    if (commandId && isStreaming) {
      await sendProgressUpdate(
        commandId,
        "get_components",
        "completed",
        100,
        1,
        1,
        `Found ${mapped.length} components/sets`
      );
    }
    return {
      count: mapped.length,
      scope,
      components: mapped,
      coverage: pageLoads.coverage()
    };
  }
  function getContainingPageId(node) {
    var _a, _b;
    return (_b = (_a = getContainingPageNode(node)) == null ? void 0 : _a.id) != null ? _b : "unknown";
  }
  async function validateComponentPropertyValue(node, propertyName, propertyType, value) {
    var _a;
    if (propertyType === "BOOLEAN") {
      if (typeof value === "string") {
        const lower = value.toLowerCase();
        if (lower === "true") return true;
        if (lower === "false") return false;
      }
      if (typeof value === "boolean") return value;
      throw new Error(`Operation Denied: BOOLEAN property '${propertyName}' requires true or false.`);
    }
    if (propertyType === "TEXT") {
      if (typeof value !== "string") throw new Error(`Operation Denied: TEXT property '${propertyName}' requires a string.`);
      return value;
    }
    if (propertyType === "VARIANT") {
      let componentSet = null;
      if (node.type === "INSTANCE") {
        const mainComponent = await node.getMainComponentAsync();
        if (mainComponent && mainComponent.parent && mainComponent.parent.type === "COMPONENT_SET") {
          componentSet = mainComponent.parent;
        }
      } else if (node.type === "COMPONENT" && node.parent && node.parent.type === "COMPONENT_SET") {
        componentSet = node.parent;
      } else if (node.type === "COMPONENT_SET") {
        componentSet = node;
      }
      if (componentSet) {
        const options = (_a = componentSet.variantGroupProperties[propertyName]) == null ? void 0 : _a.values;
        if (options && !options.includes(String(value))) {
          throw new Error(`Operation Denied: '${value}' is not a valid value for variant property '${propertyName}'. Valid values: ${options.join(", ")}.`);
        }
      }
      return value;
    }
    if (propertyType === "INSTANCE_SWAP") {
      if (typeof value !== "string" || value.trim() === "") {
        throw new Error(`Operation Denied: INSTANCE_SWAP property '${propertyName}' requires a non-empty string.`);
      }
      let target = null;
      try {
        target = await figma.getNodeByIdAsync(value);
      } catch (e) {
      }
      if (target && target.type !== "COMPONENT" && target.type !== "COMPONENT_SET") {
        throw new Error(`Operation Denied: INSTANCE_SWAP value must refer to a component, got ${target.type}`);
      }
      return value;
    }
    return value;
  }
  var IMPORT_TIMEOUT_MS = 15e3;
  async function createComponentInstance(params) {
    const { componentId, x = 0, y = 0, parentId, componentKey } = params || {};
    if (!componentId && !componentKey) {
      throw new Error("create_instance: missing componentId or componentKey parameter.");
    }
    let component;
    if (componentId) {
      const node = await figma.getNodeByIdAsync(componentId);
      if (!node) {
        throw new Error(`create_instance: component node not found with ID: ${componentId}.`);
      }
      if (node.type === "COMPONENT_SET") {
        const defaultVariant = node.defaultVariant;
        throw new Error(`create_instance: '${node.name}' is a COMPONENT_SET; pass one of its variant COMPONENTs \u2014 e.g. its default variant '${defaultVariant.name}' (${defaultVariant.id}).`);
      }
      if (node.type !== "COMPONENT") {
        throw new Error(`create_instance: '${node.name}' (${componentId}) is not a COMPONENT (got ${node.type}).`);
      }
      component = node;
    } else {
      let timeoutId;
      try {
        const importPromise = figma.importComponentByKeyAsync(componentKey);
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error(`import timed out after ${IMPORT_TIMEOUT_MS}ms`));
          }, IMPORT_TIMEOUT_MS);
        });
        component = await Promise.race([importPromise, timeoutPromise]);
      } catch (error) {
        const raw = (error == null ? void 0 : error.message) || String(error);
        throw new Error(`create_instance: failed to import remote component with key '${componentKey}': ${raw}. Read the key from an existing instance's mainComponent (component_list does not list remote library keys); confirm the source library is enabled for this file; a component-set key needs a variant's key.`);
      } finally {
        clearTimeout(timeoutId);
      }
    }
    const parentNode = await resolveAppendableParent(parentId, "create_instance");
    const instance = component.createInstance();
    try {
      parentNode.appendChild(instance);
      instance.x = x;
      instance.y = y;
      const result = {
        id: instance.id,
        name: instance.name,
        x: instance.x,
        y: instance.y,
        width: instance.width,
        height: instance.height,
        componentId: component.id,
        // D11: report where the node actually landed, so the caller can
        // confirm containment from the response instead of re-reading.
        parentId: instance.parent ? instance.parent.id : void 0
      };
      return result;
    } catch (error) {
      rethrowAfterCreatorCleanup(error, instance, "create_instance", parentId);
    }
  }
  async function exportNodeAsImage(params) {
    const { nodeId, scale = 1 } = params || {};
    const format = (params == null ? void 0 : params.format) ? String(params.format).toUpperCase() : "PNG";
    if (!nodeId) {
      throw new Error("Missing nodeId parameter");
    }
    if (!["PNG", "JPG", "SVG", "PDF"].includes(format)) {
      throw new Error(`Unsupported export format: ${format}. Use PNG, JPG, SVG, or PDF.`);
    }
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
      throw new Error(`Node not found with ID: ${nodeId}`);
    }
    if (!("exportAsync" in node)) {
      throw new Error(`Node does not support exporting: ${nodeId}`);
    }
    try {
      const isRaster = format === "PNG" || format === "JPG";
      const settings = isRaster ? { format, constraint: { type: "SCALE", value: scale } } : { format };
      const bytes = await node.exportAsync(settings);
      let mimeType;
      switch (format) {
        case "PNG":
          mimeType = "image/png";
          break;
        case "JPG":
          mimeType = "image/jpeg";
          break;
        case "SVG":
          mimeType = "image/svg+xml";
          break;
        case "PDF":
          mimeType = "application/pdf";
          break;
        default:
          mimeType = "application/octet-stream";
      }
      if (format === "SVG") {
        return {
          nodeId,
          format,
          mimeType,
          svg: bytesToUtf8(bytes)
        };
      }
      return {
        nodeId,
        format,
        scale: isRaster ? scale : void 0,
        mimeType,
        imageData: customBase64Encode(bytes)
      };
    } catch (error) {
      throw new Error(`Error exporting node as image: ${error.message}`);
    }
  }
  async function getInstanceOverrides(instanceNode) {
    console.log("=== getInstanceOverrides called ===");
    if (!instanceNode) {
      throw new Error("Missing instance node parameter");
    }
    if (instanceNode.type !== "INSTANCE") {
      console.error("Provided node is not an instance");
      figma.notify("Provided node is not a component instance");
      return { success: false, message: "Provided node is not a component instance" };
    }
    const sourceInstance = instanceNode;
    try {
      console.log(`Getting instance information:`);
      console.log(sourceInstance);
      const overrides = sourceInstance.overrides || [];
      console.log(`  Raw Overrides:`, overrides);
      const mainComponent = await sourceInstance.getMainComponentAsync();
      if (!mainComponent) {
        console.error("Failed to get main component");
        figma.notify("Failed to get main component");
        return { success: false, message: "Failed to get main component" };
      }
      const returnData = {
        success: true,
        message: `Got component information from "${sourceInstance.name}" for overrides.length: ${overrides.length}`,
        sourceInstanceId: sourceInstance.id,
        mainComponentId: mainComponent.id,
        overridesCount: overrides.length
      };
      console.log("Data to return to MCP server:", returnData);
      figma.notify(`Got component information from "${sourceInstance.name}"`);
      return returnData;
    } catch (error) {
      console.error("Error in getInstanceOverrides:", error);
      figma.notify(`Error: ${error.message}`);
      return {
        success: false,
        message: `Error: ${error.message}`
      };
    }
  }
  function checkTargetPredicates(node, requestedId, expectedName, scopeRoot) {
    if (!node) {
      return `Target instance ${requestedId} is no longer available or is not an instance (it may have changed since validation). Re-read the instances with node_info and resend.`;
    }
    if (node.removed === true) {
      return `Target instance ${requestedId} was removed since validation. Re-read the instances with node_info and resend.`;
    }
    if (scopeRoot && scopeRoot.removed === true) {
      return `The editable scope root ${scopeRoot.id} was removed since validation. Reconnect with a valid editable scope, then re-read the instances with node_info and resend.`;
    }
    if (node.id !== requestedId) {
      return `Target instance ${requestedId} resolved to a different node (${node.id}) since validation. Re-read it with node_info and resend.`;
    }
    if (node.type !== "INSTANCE") {
      return `Target instance ${requestedId} is no longer available or is not an instance (it may have changed since validation). Re-read the instances with node_info and resend.`;
    }
    if (expectedName !== void 0 && node.name !== expectedName) {
      return `Target instance ${requestedId} was renamed to "${node.name}" (expected "${expectedName}") since validation. Re-read it with node_info and resend.`;
    }
    if (scopeRoot && !(node.id === scopeRoot.id || isAncestorOf(scopeRoot, node))) {
      return `Target instance ${requestedId} moved outside the editable scope since validation. Re-read it with node_info and resend.`;
    }
    try {
      assertNotLocked(node);
    } catch (lockErr) {
      return `${describeError(lockErr)} (locked since validation \u2014 re-read with node_info and resend.)`;
    }
    return null;
  }
  async function captureOriginalMainComponentId(targetInstance, requestedId) {
    let originalMain;
    try {
      originalMain = await targetInstance.getMainComponentAsync();
    } catch (error) {
      throw new Error(
        `Failed to capture the original main component for target instance ${requestedId}: ${describeError(error)}. No swap was attempted. Re-read the instance with node_info and resend.`
      );
    }
    if (!originalMain || typeof originalMain.id !== "string" || originalMain.id.length === 0) {
      throw new Error(
        `Failed to capture the original main component for target instance ${requestedId}: no main component was returned. No swap was attempted. Re-read the instance with node_info and resend.`
      );
    }
    return originalMain.id;
  }
  async function getValidTargetInstances(targetItems, scopeRoot) {
    if (!Array.isArray(targetItems)) {
      return { success: false, message: "Invalid target node IDs provided" };
    }
    if (targetItems.length === 0) {
      return { success: false, message: "No instances provided" };
    }
    const targetInstances = [];
    for (const item of targetItems) {
      const nodeId = typeof item === "string" ? item : item && item.nodeId;
      const expectedName = typeof item === "string" ? void 0 : item && item.nodeName;
      const targetNode = await figma.getNodeByIdAsync(nodeId);
      const drift = checkTargetPredicates(targetNode, nodeId, expectedName, scopeRoot);
      if (drift) {
        return { success: false, message: drift };
      }
      targetInstances.push(targetNode);
    }
    return { success: true, message: "Valid target instances provided", targetInstances };
  }
  async function getSourceInstanceData(sourceInstanceId) {
    if (!sourceInstanceId) {
      return { success: false, message: "Missing source instance ID" };
    }
    const sourceInstance = await figma.getNodeByIdAsync(sourceInstanceId);
    if (!sourceInstance) {
      return {
        success: false,
        message: "Source instance not found. The original instance may have been deleted."
      };
    }
    if (sourceInstance.type !== "INSTANCE") {
      return {
        success: false,
        message: "Source node is not a component instance."
      };
    }
    const mainComponent = await sourceInstance.getMainComponentAsync();
    if (!mainComponent) {
      return {
        success: false,
        message: "Failed to get main component from source instance."
      };
    }
    return {
      success: true,
      sourceInstance,
      mainComponent,
      overrides: sourceInstance.overrides || []
    };
  }
  async function setInstanceOverrides(targetInstances, sourceResult, guard) {
    var _a, _b, _c;
    const expectationFor = (idx) => {
      const item = guard && guard.items ? guard.items[idx] : void 0;
      if (!item) return null;
      const requestedId = typeof item === "string" ? item : item.nodeId;
      const expectedName = typeof item === "string" ? void 0 : item.nodeName;
      return { requestedId, expectedName };
    };
    const assertNoDrift = () => {
      if (!guard) return;
      for (let i = 0; i < targetInstances.length; i++) {
        const exp = expectationFor(i);
        if (!exp) continue;
        const drift = checkTargetPredicates(targetInstances[i], exp.requestedId, exp.expectedName, guard.scopeRoot);
        if (drift) throw new Error(drift);
      }
    };
    assertNoDrift();
    for (let targetIdx = 0; targetIdx < targetInstances.length; targetIdx++) {
      const exp = expectationFor(targetIdx);
      await captureOriginalMainComponentId(
        targetInstances[targetIdx],
        exp ? exp.requestedId : (_a = targetInstances[targetIdx]) == null ? void 0 : _a.id
      );
    }
    assertNoDrift();
    let firstTargetOriginalMainComponentId = null;
    if (targetInstances.length > 0) {
      const firstExp = expectationFor(0);
      firstTargetOriginalMainComponentId = await captureOriginalMainComponentId(
        targetInstances[0],
        firstExp ? firstExp.requestedId : (_b = targetInstances[0]) == null ? void 0 : _b.id
      );
      assertNoDrift();
    }
    try {
      const { sourceInstance, mainComponent, overrides } = sourceResult;
      console.log(`Processing ${targetInstances.length} instances with ${overrides.length} overrides`);
      console.log(`Source instance: ${sourceInstance.id}, Main component: ${mainComponent.id}`);
      console.log(`Overrides:`, overrides);
      const results = [];
      let totalAppliedCount = 0;
      let successCount = 0;
      let failureCount = 0;
      let skippedCount = 0;
      let hasFailed = false;
      for (let targetIdx = 0; targetIdx < targetInstances.length; targetIdx++) {
        const targetInstance = targetInstances[targetIdx];
        if (hasFailed) {
          skippedCount++;
          results.push({
            success: false,
            status: "skipped",
            nodeId: targetInstance.id,
            instanceName: targetInstance.name,
            error: "Skipped due to previous failure in batch"
          });
          continue;
        }
        let appliedCount = 0;
        let hasFailure = false;
        let failureMsg = "";
        let swapped = false;
        const appliedFields = [];
        let originalMainComponentId = null;
        try {
          const exp = expectationFor(targetIdx);
          originalMainComponentId = targetIdx === 0 ? firstTargetOriginalMainComponentId : await captureOriginalMainComponentId(
            targetInstance,
            exp ? exp.requestedId : targetInstance == null ? void 0 : targetInstance.id
          );
          const lateDrift = guard && exp ? checkTargetPredicates(targetInstance, exp.requestedId, exp.expectedName, guard.scopeRoot) : null;
          if (lateDrift) {
            throw new Error(lateDrift);
          }
          try {
            targetInstance.swapComponent(mainComponent);
            swapped = true;
            console.log(`Swapped component for instance "${targetInstance.name}"`);
          } catch (error) {
            hasFailure = true;
            failureMsg = `Swap component error: ${describeError(error)}`;
          }
          if (!hasFailure) {
            for (const override of overrides) {
              if (!override.id || !override.overriddenFields || override.overriddenFields.length === 0) {
                continue;
              }
              const overrideNodeId = override.id.replace(sourceInstance.id, targetInstance.id);
              const overrideNode = await figma.getNodeByIdAsync(overrideNodeId);
              if (!overrideNode) {
                hasFailure = true;
                failureMsg = `Override target node not found: ${overrideNodeId}`;
                break;
              }
              const sourceNode = await figma.getNodeByIdAsync(override.id);
              if (!sourceNode) {
                hasFailure = true;
                failureMsg = `Override source node not found: ${override.id}`;
                break;
              }
              for (const field of override.overriddenFields) {
                let fieldApplied = false;
                let beforeValue = void 0;
                try {
                  if (field === "componentProperties") {
                    if (sourceNode.componentProperties && overrideNode.componentProperties) {
                      const properties = {};
                      for (const key in sourceNode.componentProperties) {
                        properties[key] = sourceNode.componentProperties[key].value;
                      }
                      overrideNode.setProperties(properties);
                      fieldApplied = true;
                    }
                  } else if (field === "characters" && overrideNode.type === "TEXT") {
                    beforeValue = overrideNode.characters;
                    await figma.loadFontAsync(overrideNode.fontName);
                    overrideNode.characters = sourceNode.characters;
                    fieldApplied = true;
                  } else if (field in overrideNode) {
                    beforeValue = overrideNode[field];
                    overrideNode[field] = sourceNode[field];
                    fieldApplied = true;
                  }
                } catch (fieldError) {
                  hasFailure = true;
                  failureMsg = `Field ${field} error: ${describeError(fieldError)}`;
                  break;
                }
                if (!fieldApplied) {
                  hasFailure = true;
                  failureMsg = `Requested override field '${field}' could not be applied on ${overrideNodeId}`;
                  break;
                }
                appliedFields.push({ nodeId: overrideNodeId, field, before: beforeValue });
              }
              if (hasFailure) {
                break;
              }
              appliedCount++;
            }
          }
        } catch (instanceError) {
          hasFailure = true;
          failureMsg = describeError(instanceError);
        }
        if (hasFailure) {
          hasFailed = true;
          failureCount++;
          const rowResult = {
            success: false,
            status: "failed",
            nodeId: targetInstance.id,
            instanceName: targetInstance.name,
            error: `Error: ${failureMsg}`
          };
          if (swapped || appliedFields.length > 0) {
            rowResult.partialMutation = true;
            const changes = [];
            if (swapped) changes.push(`main component swapped to ${mainComponent.id}`);
            if (appliedFields.length > 0) changes.push(`${appliedFields.length} override field(s) applied`);
            rowResult.whatChanged = `${changes.join(" and ")} before the operation failed`;
            rowResult.before = {
              ...swapped ? { mainComponentId: originalMainComponentId } : {},
              ...appliedFields.length > 0 ? { appliedFields } : {}
            };
          }
          results.push(rowResult);
        } else {
          successCount++;
          totalAppliedCount += appliedCount;
          results.push({
            success: true,
            status: "success",
            nodeId: targetInstance.id,
            instanceName: targetInstance.name,
            appliedCount
          });
        }
      }
      const envelope = batchEnvelope(targetInstances.length, successCount, failureCount, skippedCount);
      const message = envelope.status === "success" ? `Applied ${totalAppliedCount} overrides to ${successCount} instances` : failureCount > 0 ? `Failed to apply overrides: ${(_c = results.find((r) => r.status === "failed")) == null ? void 0 : _c.error}` : "No overrides applied to any instance";
      notifyBestEffort(message);
      return {
        ...envelope,
        totalAppliedCount,
        message,
        results
      };
    } catch (error) {
      console.error("Error in setInstanceOverrides:", error);
      const message = `Error: ${describeError(error)}`;
      notifyBestEffort(message);
      const targets = Array.isArray(targetInstances) ? targetInstances : [];
      const rows = targets.map((t) => ({
        success: false,
        status: "failed",
        nodeId: t ? t.id : "unknown",
        instanceName: t ? t.name : void 0,
        error: message
      }));
      return {
        ...batchEnvelope(targets.length, 0, targets.length, 0),
        totalAppliedCount: 0,
        message,
        results: rows
      };
    }
  }
  async function createComponent(params) {
    const { nodeId } = params || {};
    if (!nodeId) {
      throw new Error("Missing nodeId parameter");
    }
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
      throw new Error(`Node not found with ID: ${nodeId}`);
    }
    if (node.type !== "FRAME") {
      throw new Error(`Target node must be a FRAME, got ${node.type}`);
    }
    assertNotInstanceInterior(node, "converted to a component");
    const parentNode = node.parent;
    if (!parentNode) {
      throw new Error("create_component: parent node not found.");
    }
    if (!("appendChild" in parentNode)) {
      throw new Error(`create_component: parent '${parentNode.name}' (type ${parentNode.type}) cannot contain children.`);
    }
    if (!("insertChild" in parentNode)) {
      throw new Error(`create_component: parent '${parentNode.name}' (type ${parentNode.type}) cannot preserve the source frame's child index.`);
    }
    const verifiedParentId = parentNode.id;
    const index = parentNode.children.indexOf(node);
    if (index < 0) {
      throw new Error(`create_component: source frame '${node.name}' is no longer a child of its resolved parent.`);
    }
    const childrenToMove = [...node.children];
    const component = figma.createComponent();
    try {
      parentNode.insertChild(index, component);
      component.name = node.name;
      component.resize(node.width, node.height);
      component.x = node.x;
      component.y = node.y;
      component.fills = node.fills;
      component.strokes = node.strokes;
      component.strokeWeight = node.strokeWeight;
      component.strokeAlign = node.strokeAlign;
      component.strokeCap = node.strokeCap;
      component.strokeJoin = node.strokeJoin;
      component.dashPattern = node.dashPattern;
      component.effects = node.effects;
      component.layoutGrids = node.layoutGrids;
      component.opacity = node.opacity;
      component.blendMode = node.blendMode;
      component.isMask = node.isMask;
      if (node.cornerRadius !== figma.mixed) {
        component.cornerRadius = node.cornerRadius;
      } else {
        component.topLeftRadius = node.topLeftRadius;
        component.topRightRadius = node.topRightRadius;
        component.bottomLeftRadius = node.bottomLeftRadius;
        component.bottomRightRadius = node.bottomRightRadius;
      }
      if (node.layoutMode !== "NONE") {
        component.layoutMode = node.layoutMode;
        component.primaryAxisSizingMode = node.primaryAxisSizingMode;
        component.counterAxisSizingMode = node.counterAxisSizingMode;
        component.primaryAxisAlignItems = node.primaryAxisAlignItems;
        component.counterAxisAlignItems = node.counterAxisAlignItems;
        component.paddingLeft = node.paddingLeft;
        component.paddingRight = node.paddingRight;
        component.paddingTop = node.paddingTop;
        component.paddingBottom = node.paddingBottom;
        component.itemSpacing = node.itemSpacing;
      }
      for (const child of childrenToMove) {
        component.appendChild(child);
      }
      const result = {
        id: component.id,
        name: component.name,
        type: "COMPONENT",
        // D11: report where the node actually landed, so the caller can
        // confirm containment from the response instead of re-reading.
        parentId: component.parent ? component.parent.id : void 0
      };
      node.remove();
      return result;
    } catch (error) {
      const inspectChildParent = (child) => {
        try {
          const currentParent = child.parent;
          if (currentParent === node) return { kind: "source" };
          if (currentParent === component) return { kind: "component" };
          return {
            kind: "relocated",
            currentParentId: readDuringRecovery(
              () => typeof (currentParent == null ? void 0 : currentParent.id) === "string" ? currentParent.id : null,
              null
            )
          };
        } catch (e) {
          return { kind: "unknown" };
        }
      };
      const childId = (child) => readDuringRecovery(
        () => typeof child.id === "string" ? child.id : "unknown",
        "unknown"
      );
      const sourceFrameRemovalState = readDuringRecovery(
        () => {
          const removed = node.removed;
          if (removed === false) return "live";
          if (removed === true) return "removed";
          return "unknown";
        },
        "unknown"
      );
      const sourceFrameRemoved = sourceFrameRemovalState === "removed" ? true : sourceFrameRemovalState === "live" ? false : null;
      const restorationFailures = [];
      if (sourceFrameRemovalState === "live") {
        for (let childIndex = 0; childIndex < childrenToMove.length; childIndex++) {
          const child = childrenToMove[childIndex];
          if (inspectChildParent(child).kind !== "component") continue;
          const currentSourceChildren = readDuringRecovery(
            () => Array.isArray(node.children) ? [...node.children] : null,
            null
          );
          if (currentSourceChildren === null) {
            restorationFailures.push({
              childId: childId(child),
              attemptedIndex: null
            });
            reportRecoveryError(
              "create_component: source children were unreadable; skipped a child restore rather than guessing an insertion index"
            );
            continue;
          }
          let safeInsertionIndex = currentSourceChildren.length;
          for (let laterIndex = childIndex + 1; laterIndex < childrenToMove.length; laterIndex++) {
            const siblingIndex = currentSourceChildren.indexOf(
              childrenToMove[laterIndex]
            );
            if (siblingIndex >= 0) {
              safeInsertionIndex = siblingIndex;
              break;
            }
          }
          try {
            node.insertChild(safeInsertionIndex, child);
          } catch (restoreError) {
            restorationFailures.push({
              childId: childId(child),
              attemptedIndex: safeInsertionIndex
            });
            reportRecoveryError("create_component: failed to restore a moved child after conversion failure", restoreError);
          }
        }
      }
      const restoredChildIds = [];
      const survivingChildIds = [];
      const unknownParentChildIds = [];
      const relocatedChildren = [];
      for (const child of childrenToMove) {
        const id = childId(child);
        const parentState = inspectChildParent(child);
        if (parentState.kind === "source") {
          restoredChildIds.push(id);
        } else if (parentState.kind === "component") {
          survivingChildIds.push(id);
        } else if (parentState.kind === "relocated") {
          relocatedChildren.push({
            childId: id,
            currentParentId: parentState.currentParentId
          });
        } else {
          unknownParentChildIds.push(id);
        }
      }
      const componentChildCount = readDuringRecovery(
        () => Array.isArray(component.children) ? component.children.length : null,
        null
      );
      const everyOriginalChildConfirmedRestored = restoredChildIds.length === childrenToMove.length && survivingChildIds.length === 0 && unknownParentChildIds.length === 0 && relocatedChildren.length === 0;
      const componentConfirmedEmpty = componentChildCount === 0;
      const cleanupIsSafe = sourceFrameRemovalState === "live" && everyOriginalChildConfirmedRestored && componentConfirmedEmpty;
      if (cleanupIsSafe) {
        const componentRemoved = removeUncommitted(component, "create_component");
        if (componentRemoved) {
          throw error;
        }
        const survivor2 = getCreatorSurvivorEvidence(component, verifiedParentId);
        const sourceFrameId2 = readDuringRecovery(() => node.id, "unknown");
        const sourceFrameName2 = readDuringRecovery(() => node.name, "unknown");
        throw withPartialDisclosure(
          error,
          `component '${survivor2.survivingNodeName}' (${survivor2.survivingNodeId}) survives because cleanup could not remove it; its current parent is ${describeCreatorSurvivorParent(survivor2)}.`,
          {
            sourceFrameId: sourceFrameId2,
            sourceFrameName: sourceFrameName2,
            sourceFrameRemoved,
            survivingComponentId: survivor2.survivingNodeId,
            survivingComponentParentState: survivor2.survivingParentState,
            survivingComponentParentId: survivor2.survivingParentId,
            verifiedParentId: survivor2.verifiedParentId,
            sourceFrameRemovalState,
            restoredChildIds,
            movedChildIds: survivingChildIds,
            unknownParentChildIds,
            relocatedChildren,
            restorationFailures,
            componentChildCount
          }
        );
      }
      const survivor = getCreatorSurvivorEvidence(component, verifiedParentId);
      const sourceFrameId = readDuringRecovery(() => node.id, "unknown");
      const sourceFrameName = readDuringRecovery(() => node.name, "unknown");
      throw withPartialDisclosure(
        error,
        sourceFrameRemovalState === "removed" ? `the source frame '${sourceFrameName}' was already removed and component '${survivor.survivingNodeName}' (${survivor.survivingNodeId}) survives in its place.` : sourceFrameRemovalState === "unknown" ? `the source frame '${sourceFrameName}' removal state could not be read, so component '${survivor.survivingNodeName}' (${survivor.survivingNodeId}) was not removed.` : `component '${survivor.survivingNodeName}' (${survivor.survivingNodeId}) was not removed because one or more children could not be restored or confirmed on the source, or component emptiness could not be confirmed.`,
        {
          sourceFrameId,
          sourceFrameName,
          sourceFrameRemoved,
          survivingComponentId: survivor.survivingNodeId,
          survivingComponentParentState: survivor.survivingParentState,
          survivingComponentParentId: survivor.survivingParentId,
          verifiedParentId: survivor.verifiedParentId,
          sourceFrameRemovalState,
          restoredChildIds,
          movedChildIds: survivingChildIds,
          unknownParentChildIds,
          relocatedChildren,
          restorationFailures,
          componentChildCount
        }
      );
    }
  }
  async function validateCreateComponentSetPlan(params, scopeRoot) {
    const { components, properties, componentSetName, parentId } = params;
    assertNonEmptyExplicitName(
      componentSetName,
      "componentSetName",
      "create_component_set",
      "Omit componentSetName to use Figma's default component-set name."
    );
    if (!components || !Array.isArray(components) || components.length === 0) {
      throw new Error("components must be a non-empty array");
    }
    if (!properties || !Array.isArray(properties) || properties.length === 0) {
      throw new Error("properties must be a non-empty array");
    }
    const propNamesSeen = /* @__PURE__ */ new Set();
    for (const prop of properties) {
      if (typeof prop !== "string" || prop.trim() === "") {
        throw new Error("Property names must be non-empty strings");
      }
      if (propNamesSeen.has(prop)) {
        throw new Error(`Duplicate property name found: '${prop}'`);
      }
      propNamesSeen.add(prop);
    }
    const resolvedComponents = [];
    const seenIds = /* @__PURE__ */ new Set();
    let firstContainingPage = null;
    for (const comp of components) {
      if (!comp || !comp.nodeId) {
        throw new Error("Missing component nodeId");
      }
      const node = await figma.getNodeByIdAsync(comp.nodeId);
      if (!node) {
        throw new Error(`Node ${comp.nodeId} not found`);
      }
      if (seenIds.has(node.id)) {
        throw new Error(`create_component_set: component '${node.name}' (${node.id}) is listed more than once in components.`);
      }
      seenIds.add(node.id);
      const inScope = node.id === scopeRoot.id || isAncestorOf(scopeRoot, node);
      if (!inScope) {
        throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE, scopeRoot.id));
      }
      if (node.name !== comp.nodeName) {
        throw new Error(ERRORS.NAME_MISMATCH);
      }
      if (node.type !== "COMPONENT") {
        throw new Error(`create_component_set: '${node.name}' (${node.id}) must be a COMPONENT, got ${node.type}.`);
      }
      assertNotLocked(node);
      assertNotInstanceInterior(node, "combined");
      if ("remote" in node && node.remote === true) {
        throw new Error(`create_component_set: '${node.name}' is a remote shared-library component and cannot be combined into a local component set.`);
      }
      if (!comp.propertyValues || comp.propertyValues.length !== properties.length) {
        throw new Error(`Property values count mismatch for component ${node.name}`);
      }
      for (const val of comp.propertyValues) {
        if (typeof val !== "string" || val.trim() === "" || val.includes("=") || val.includes(",")) {
          throw new Error(`create_component_set: property value '${val}' for '${node.name}' must be non-empty and must not contain '=' or ','.`);
        }
      }
      if (node.parent && node.parent.type === "COMPONENT_SET") {
        throw new Error(`create_component_set: '${node.name}' is already a variant in component set '${node.parent.name}'. Combining it would break that set.`);
      }
      const page = getContainingPageNode(node);
      if (!page) {
        throw new Error(`create_component_set: component '${node.name}' (${node.id}) is not on a page (detached).`);
      }
      if (!firstContainingPage) {
        firstContainingPage = page;
      } else if (page.id !== firstContainingPage.id) {
        throw new Error("create_component_set: all components must be on the same page before combining variants.");
      }
      resolvedComponents.push(node);
    }
    const seenVariants = /* @__PURE__ */ new Map();
    const computedVariantNames = [];
    for (let i = 0; i < resolvedComponents.length; i++) {
      const node = resolvedComponents[i];
      const compData = components[i];
      const nameParts = properties.map((prop, idx) => `${prop}=${compData.propertyValues[idx]}`);
      const variantName = nameParts.join(", ");
      if (seenVariants.has(variantName)) {
        throw new Error(`Operation Denied: Duplicate variant combination '${variantName}' across components '${seenVariants.get(variantName)}' and '${node.name}'. Each component in a set must have a unique property-value combination.`);
      }
      seenVariants.set(variantName, node.name);
      computedVariantNames.push(variantName);
    }
    if (parentId == null) {
      throw new Error("create_component_set: parentId is missing. Read the target with node_info and supply the appendable parent container's ID as parentId and its exact current name as parentNodeName (both passed back verbatim from node_info).");
    }
    if (params.parentNodeName == null) {
      throw REFUSALS.PARENT_NAME_MISSING();
    }
    const parent = await figma.getNodeByIdAsync(parentId);
    if (!parent) {
      throw new Error(`Node ${parentId} not found`);
    }
    const parentInScope = parent.id === scopeRoot.id || isAncestorOf(scopeRoot, parent);
    if (!parentInScope) {
      throw new Error(formatScopeError(ERRORS.PARENT_OUTSIDE_SCOPE, scopeRoot.id));
    }
    if (parent.name !== params.parentNodeName) {
      throw REFUSALS.PARENT_NAME_MISMATCH(parent.name, params.parentNodeName);
    }
    if (!("appendChild" in parent)) {
      throw new Error(`create_component_set: parent '${parent.name}' (type ${parent.type}) cannot contain a component set.`);
    }
    assertNotLocked(parent);
    assertNotInstanceParent(parent, "appended to");
    for (const node of resolvedComponents) {
      if (parent.id === node.id || isAncestorOf(node, parent)) {
        throw new Error(`create_component_set: parent '${parent.name}' is one of the components being combined (or is inside one) and cannot receive the component set.`);
      }
    }
    const resolvedParent = parent;
    return {
      components: resolvedComponents.map((node, idx) => ({
        node,
        originalName: node.name,
        variantName: computedVariantNames[idx],
        propertyValues: components[idx].propertyValues
      })),
      properties,
      parent: resolvedParent,
      componentSetName
    };
  }
  async function createComponentSet(plan) {
    var _a;
    assertNonEmptyExplicitName(
      plan.componentSetName,
      "componentSetName",
      "create_component_set",
      "Omit componentSetName to use Figma's default component-set name."
    );
    let componentSet;
    const successfullyRenamed = /* @__PURE__ */ new Set();
    const verifiedParentId = readDuringRecovery(
      () => plan.parent && typeof plan.parent.id === "string" ? plan.parent.id : "unknown",
      "unknown"
    );
    const originalPlacementByNode = /* @__PURE__ */ new Map();
    for (const c of plan.components) {
      const unreadableParent = {};
      const originalParent = readDuringRecovery(
        () => {
          var _a2;
          return c.node ? (_a2 = c.node.parent) != null ? _a2 : null : null;
        },
        unreadableParent
      );
      if (originalParent === unreadableParent) {
        originalPlacementByNode.set(c.node, {
          readable: false,
          parentId: null
        });
      } else {
        const unreadableParentId = {};
        const originalParentId = originalParent ? readDuringRecovery(
          () => typeof originalParent.id === "string" ? originalParent.id : null,
          unreadableParentId
        ) : null;
        originalPlacementByNode.set(c.node, {
          readable: originalParentId !== unreadableParentId,
          parentId: originalParentId === unreadableParentId ? null : originalParentId
        });
      }
    }
    try {
      for (const c of plan.components) {
        c.node.name = c.variantName;
        successfullyRenamed.add(c.node);
      }
      componentSet = figma.combineAsVariants(plan.components.map((c) => c.node), plan.parent);
    } catch (error) {
      const appliedComponents = [];
      const restoredComponents = [];
      const unrestoredComponents = [];
      const removedComponents = [];
      const unknownRemovalComponents = [];
      const reparentedComponents = [];
      const unverifiedPlacementComponents = [];
      const retainedVariantComponents = [];
      const unconfirmedVariantComponents = [];
      const survivingSetByNode = /* @__PURE__ */ new Map();
      for (const c of plan.components) {
        if (c.node) {
          const componentId = readDuringRecovery(() => c.node.id, "unknown");
          const componentRemovalState = readDuringRecovery(
            () => {
              const removed = c.node.removed;
              if (removed === false) return "live";
              if (removed === true) return "removed";
              return "unknown";
            },
            "unknown"
          );
          const observedNameBeforeRestore = readDuringRecovery(
            () => typeof c.node.name === "string" ? c.node.name : null,
            null
          );
          const wasApplied = successfullyRenamed.has(c.node) || observedNameBeforeRestore !== null && observedNameBeforeRestore !== c.originalName;
          const appliedEvidence = {
            componentId,
            originalName: c.originalName,
            variantName: c.variantName,
            observedNameBeforeRestore
          };
          if (wasApplied) {
            appliedComponents.push(appliedEvidence);
          }
          if (componentRemovalState === "removed") {
            removedComponents.push({
              componentId,
              originalName: c.originalName,
              variantName: c.variantName
            });
            continue;
          }
          if (componentRemovalState === "unknown") {
            unknownRemovalComponents.push({
              componentId,
              originalName: c.originalName,
              variantName: c.variantName
            });
          }
          const originalPlacement = (_a = originalPlacementByNode.get(c.node)) != null ? _a : {
            readable: false,
            parentId: null
          };
          const originalParentId = originalPlacement.parentId;
          const unreadableParent = {};
          const currentParent = readDuringRecovery(
            () => {
              var _a2;
              return (_a2 = c.node.parent) != null ? _a2 : null;
            },
            unreadableParent
          );
          if (currentParent === unreadableParent || !originalPlacement.readable) {
            unverifiedPlacementComponents.push({
              componentId,
              originalParentId
            });
            continue;
          }
          const unreadableParentId = {};
          const currentParentId = currentParent ? readDuringRecovery(
            () => typeof currentParent.id === "string" ? currentParent.id : null,
            unreadableParentId
          ) : null;
          if (currentParentId === unreadableParentId) {
            unverifiedPlacementComponents.push({
              componentId,
              originalParentId
            });
            continue;
          }
          const currentParentName = readDuringRecovery(
            () => typeof (currentParent == null ? void 0 : currentParent.name) === "string" ? currentParent.name : "unknown",
            "unknown"
          );
          const currentParentType = readDuringRecovery(
            () => currentParent === null ? "DETACHED" : typeof (currentParent == null ? void 0 : currentParent.type) === "string" ? currentParent.type : "unknown",
            "unknown"
          );
          const placementChanged = currentParentId !== originalParentId;
          if (placementChanged) {
            reparentedComponents.push({
              componentId,
              originalParentId,
              currentParentId,
              currentParentName,
              currentParentType
            });
          }
          if (placementChanged && currentParentType === "unknown") {
            unverifiedPlacementComponents.push({
              componentId,
              originalParentId
            });
            continue;
          }
          if (placementChanged && currentParentType === "COMPONENT_SET") {
            const componentSetId2 = currentParentId != null ? currentParentId : "unknown";
            let setEvidence = survivingSetByNode.get(currentParent);
            if (!setEvidence) {
              setEvidence = {
                componentSetId: componentSetId2,
                componentSetName: currentParentName,
                parentId: readDuringRecovery(
                  () => {
                    var _a2;
                    return typeof ((_a2 = currentParent == null ? void 0 : currentParent.parent) == null ? void 0 : _a2.id) === "string" ? currentParent.parent.id : null;
                  },
                  null
                ),
                memberIds: []
              };
              survivingSetByNode.set(currentParent, setEvidence);
            }
            setEvidence.memberIds.push(componentId);
            if (observedNameBeforeRestore !== c.variantName) {
              try {
                c.node.name = c.variantName;
              } catch (confirmError) {
                reportRecoveryError(
                  `create_component_set: failed to confirm variant name for surviving set member '${componentId}'`,
                  confirmError
                );
              }
            }
            const currentName2 = readDuringRecovery(
              () => typeof c.node.name === "string" ? c.node.name : null,
              null
            );
            const setMemberEvidence = {
              componentId,
              componentSetId: componentSetId2,
              originalName: c.originalName,
              variantName: c.variantName,
              observedNameBeforeConfirmation: observedNameBeforeRestore,
              currentName: currentName2
            };
            if (currentName2 === c.variantName) {
              retainedVariantComponents.push(setMemberEvidence);
            } else {
              unconfirmedVariantComponents.push(setMemberEvidence);
            }
            continue;
          }
          let restoreError = null;
          try {
            c.node.name = c.originalName;
          } catch (caught) {
            restoreError = caught;
            reportRecoveryError(
              `create_component_set: failed to restore component '${componentId}' to its original name`,
              caught
            );
          }
          const currentName = readDuringRecovery(
            () => typeof c.node.name === "string" ? c.node.name : null,
            null
          );
          if (currentName !== c.originalName) {
            unrestoredComponents.push({
              ...appliedEvidence,
              currentName
            });
          } else if (wasApplied) {
            restoredComponents.push({
              ...appliedEvidence,
              currentName
            });
          }
          if (restoreError && currentName === c.originalName) {
            reportRecoveryError(
              `create_component_set: component '${componentId}' restored despite its setter reporting an error`,
              restoreError
            );
          }
        }
      }
      const survivingComponentSets = Array.from(survivingSetByNode.values());
      if (unrestoredComponents.length > 0 || removedComponents.length > 0 || unknownRemovalComponents.length > 0 || reparentedComponents.length > 0 || unverifiedPlacementComponents.length > 0 || survivingComponentSets.length > 0 || unconfirmedVariantComponents.length > 0) {
        throw withPartialDisclosure(
          error,
          `${appliedComponents.length} component variant name(s) were applied before create_component_set failed; ${retainedVariantComponents.length} remain valid members of ${survivingComponentSets.length} surviving set(s), ${unconfirmedVariantComponents.length} surviving-set member name(s) could not be confirmed, ${restoredComponents.length} ordinary member name(s) were restored, ${unrestoredComponents.length} could not be restored, ${removedComponents.length} component(s) were removed, ${unknownRemovalComponents.length} have unreadable removal state, ${reparentedComponents.length} remain under a different parent, and ${unverifiedPlacementComponents.length} have unreadable placement.`,
          {
            appliedComponents,
            restoredComponents,
            unrestoredComponents,
            removedComponents,
            unknownRemovalComponents,
            reparentedComponents,
            unverifiedPlacementComponents,
            survivingComponentSets,
            retainedVariantComponents,
            unconfirmedVariantComponents
          }
        );
      }
      throw error;
    }
    const unreadableSetValue = {};
    const componentSetId = readDuringRecovery(
      () => typeof componentSet.id === "string" ? componentSet.id : unreadableSetValue,
      unreadableSetValue
    );
    const initialComponentSetName = readDuringRecovery(
      () => typeof componentSet.name === "string" ? componentSet.name : unreadableSetValue,
      unreadableSetValue
    );
    const componentSetParentId = readDuringRecovery(
      () => {
        var _a2;
        return typeof ((_a2 = componentSet.parent) == null ? void 0 : _a2.id) === "string" ? componentSet.parent.id : null;
      },
      unreadableSetValue
    );
    if (componentSetId === unreadableSetValue || initialComponentSetName === unreadableSetValue || componentSetParentId === unreadableSetValue || componentSetParentId !== verifiedParentId) {
      throw withPartialDisclosure(
        new Error(
          componentSetParentId !== unreadableSetValue && componentSetParentId !== verifiedParentId ? `create_component_set: Figma created the set under parent '${componentSetParentId != null ? componentSetParentId : "detached/null"}' instead of verified parent '${verifiedParentId}'.` : "create_component_set: the created set's identity or parent could not be read safely."
        ),
        "the component set was already created and its members already carry their variant names, but the set's identity/location could not be confirmed for a normal success response.",
        {
          componentSetId: componentSetId === unreadableSetValue ? "unknown" : componentSetId,
          componentSetName: initialComponentSetName === unreadableSetValue ? "unknown" : initialComponentSetName,
          componentSetParentId: componentSetParentId === unreadableSetValue ? null : componentSetParentId,
          verifiedParentId,
          variantNames: plan.components.map((c) => c.variantName),
          originalComponentNames: plan.components.map((c) => c.originalName)
        }
      );
    }
    let finalComponentSetName = initialComponentSetName;
    if (plan.componentSetName !== void 0) {
      try {
        componentSet.name = plan.componentSetName;
      } catch (error) {
        const observedName2 = readDuringRecovery(
          () => typeof componentSet.name === "string" ? componentSet.name : "unknown",
          "unknown"
        );
        throw withPartialDisclosure(
          error,
          `component set '${observedName2}' (${componentSetId}) was already created from the listed components and their names were changed to variant names; only the set's own rename failed.`,
          {
            componentSetId,
            componentSetName: observedName2,
            componentSetParentId,
            verifiedParentId,
            variantNames: plan.components.map((c) => c.variantName),
            originalComponentNames: plan.components.map((c) => c.originalName)
          }
        );
      }
      const observedName = readDuringRecovery(
        () => typeof componentSet.name === "string" ? componentSet.name : unreadableSetValue,
        unreadableSetValue
      );
      if (observedName === unreadableSetValue || observedName !== plan.componentSetName) {
        throw withPartialDisclosure(
          new Error(
            observedName === unreadableSetValue ? "create_component_set: the set rename completed but its resulting name could not be read safely." : `create_component_set: the requested set name '${plan.componentSetName}' did not persist; observed '${observedName}'.`
          ),
          "the component set was already created and its members already carry their variant names, but the requested set name could not be confirmed.",
          {
            componentSetId,
            componentSetName: observedName === unreadableSetValue ? "unknown" : observedName,
            componentSetParentId,
            verifiedParentId,
            requestedComponentSetName: plan.componentSetName,
            variantNames: plan.components.map((c) => c.variantName),
            originalComponentNames: plan.components.map((c) => c.originalName)
          }
        );
      }
      finalComponentSetName = observedName;
    }
    let variantGroupProperties = void 0;
    let childCount = void 0;
    const warnings = [];
    try {
      variantGroupProperties = componentSet.variantGroupProperties;
    } catch (err) {
      warnings.push(`Failed to read variant properties: ${describeError(err)}`);
    }
    try {
      childCount = componentSet.children.length;
    } catch (err) {
      warnings.push(`Failed to read component-set child count: ${describeError(err)}`);
    }
    return {
      id: componentSetId,
      name: finalComponentSetName,
      type: "COMPONENT_SET",
      // D11: report where the set actually landed, so the caller can confirm
      // containment from the response instead of re-reading.
      parentId: componentSetParentId,
      childCount,
      variantProperties: variantGroupProperties,
      warning: warnings.length > 0 ? warnings.join(" ") : void 0
    };
  }
  async function setComponentInstanceProperty(params) {
    const { nodeId, propertyName, value } = params || {};
    if (!nodeId || !propertyName || value === void 0) {
      throw new Error("Missing nodeId, propertyName, or value parameter");
    }
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
      throw new Error(`Node not found with ID: ${nodeId}`);
    }
    if (node.type !== "INSTANCE") {
      throw new Error(`Target node must be an INSTANCE, got ${node.type}`);
    }
    const instance = node;
    const properties = instance.componentProperties;
    let qualifiedName = null;
    let propType = null;
    const validNames = [];
    for (const key in properties) {
      const parts = key.split("#");
      const readableName = parts[0];
      validNames.push(readableName);
      if (readableName === propertyName) {
        qualifiedName = key;
        propType = properties[key].type;
        break;
      }
    }
    if (!qualifiedName || !propType) {
      throw new Error(`Property "${propertyName}" not found. Available properties: ${validNames.join(", ")}`);
    }
    try {
      const validatedValue = await validateComponentPropertyValue(instance, propertyName, propType, value);
      instance.setProperties({ [qualifiedName]: validatedValue });
      return {
        id: instance.id,
        name: instance.name,
        type: instance.type,
        updatedProperty: propertyName,
        value: validatedValue
      };
    } catch (error) {
      throw new Error(`Error setting component instance property: ${error.message}`);
    }
  }
  async function manageComponentProperty(params) {
    var _a;
    const {
      nodeId,
      action,
      propertyName,
      newPropertyName,
      propertyType,
      defaultValue,
      newDefaultValue,
      preferredValues
    } = params || {};
    if (!nodeId || !action || propertyName == null) {
      throw new Error("Missing nodeId, action, or propertyName parameter");
    }
    if (action === "ADD") {
      assertNonEmptyExplicitName(
        propertyName,
        "propertyName",
        "component_manage_property ADD",
        "Supply a non-empty propertyName."
      );
    }
    assertNonEmptyExplicitName(
      newPropertyName,
      "newPropertyName",
      "component_manage_property EDIT",
      "Omit newPropertyName to leave the component property's name unchanged."
    );
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
      throw new Error(`Node not found with ID: ${nodeId}`);
    }
    if (node.type !== "COMPONENT" && node.type !== "COMPONENT_SET") {
      throw new Error(`Target node must be a COMPONENT or COMPONENT_SET, got ${node.type}`);
    }
    if (node.type === "COMPONENT" && ((_a = node.parent) == null ? void 0 : _a.type) === "COMPONENT_SET") {
      throw new Error(`Operation Denied: '${node.name}' is a variant inside a component set; manage properties on the set ('${node.parent.name}'), not the individual variant.`);
    }
    const targetNode = node;
    const properties = targetNode.componentPropertyDefinitions;
    let qualifiedName = null;
    let existingPropType = null;
    const validNames = [];
    for (const key in properties) {
      const parts = key.split("#");
      const readableName = parts[0];
      validNames.push(readableName);
      if (readableName === propertyName) {
        qualifiedName = key;
        existingPropType = properties[key].type;
      }
    }
    try {
      if (action === "ADD") {
        if (validNames.includes(propertyName)) {
          throw new Error(`Property "${propertyName}" already exists. Available properties: ${validNames.join(", ")}`);
        }
        if (!propertyType || defaultValue === void 0) {
          throw new Error("propertyType and defaultValue are required for ADD action");
        }
        if (propertyType === "VARIANT") {
          throw new Error("VARIANT properties cannot be added manually. Use create_component_set instead.");
        }
        const validatedDefault = await validateComponentPropertyValue(targetNode, propertyName, propertyType, defaultValue);
        const options = {};
        if (preferredValues) options.preferredValues = preferredValues;
        targetNode.addComponentProperty(propertyName, propertyType, validatedDefault, options);
        return {
          id: targetNode.id,
          name: targetNode.name,
          action: "ADD",
          propertyName,
          propertyType,
          defaultValue: validatedDefault
        };
      } else if (action === "EDIT") {
        if (!qualifiedName || !existingPropType) {
          throw new Error(`Property "${propertyName}" not found. Available properties: ${validNames.join(", ")}`);
        }
        const options = {};
        if (newPropertyName !== void 0) options.name = newPropertyName;
        if (newDefaultValue !== void 0) {
          options.defaultValue = await validateComponentPropertyValue(targetNode, propertyName, existingPropType, newDefaultValue);
        }
        if (preferredValues !== void 0) options.preferredValues = preferredValues;
        targetNode.editComponentProperty(qualifiedName, options);
        return {
          id: targetNode.id,
          name: targetNode.name,
          action: "EDIT",
          propertyName: newPropertyName || propertyName,
          updated: true
        };
      } else {
        throw new Error(`Invalid action: ${action}. Use delete_property tool for deletion.`);
      }
    } catch (error) {
      throw new Error(`Error managing component property: ${error.message}`);
    }
  }
  async function deleteComponentProperty(params) {
    const { nodeId, propertyName } = params || {};
    if (!nodeId || !propertyName) {
      throw new Error("Missing nodeId or propertyName parameter");
    }
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
      throw new Error(`Node not found with ID: ${nodeId}`);
    }
    if (node.type !== "COMPONENT" && node.type !== "COMPONENT_SET") {
      throw new Error(`Target node must be a COMPONENT or COMPONENT_SET, got ${node.type}`);
    }
    const targetNode = node;
    const properties = targetNode.componentPropertyDefinitions;
    let qualifiedName = null;
    const validNames = [];
    for (const key in properties) {
      const parts = key.split("#");
      const readableName = parts[0];
      validNames.push(readableName);
      if (readableName === propertyName) {
        qualifiedName = key;
      }
    }
    if (!qualifiedName) {
      throw new Error(`Property "${propertyName}" not found. Available properties: ${validNames.join(", ")}`);
    }
    try {
      targetNode.deleteComponentProperty(qualifiedName);
      return {
        id: targetNode.id,
        name: targetNode.name,
        propertyName
      };
    } catch (error) {
      throw new Error(`Error deleting component property: ${error.message}`);
    }
  }

  // figma_plugin/handlers/prototypingHandlers.ts
  async function getReactions(nodeIds) {
    try {
      let getNodePath2 = function(node) {
        const path = [];
        let current = node;
        while (current && current.parent) {
          path.unshift(current.name);
          current = current.parent;
        }
        return path.join(" > ");
      };
      var getNodePath = getNodePath2;
      const commandId = generateCommandId();
      await sendProgressUpdate(
        commandId,
        "get_reactions",
        "started",
        0,
        nodeIds.length,
        0,
        `Starting deep search for reactions in ${nodeIds.length} nodes and their children`
      );
      async function findNodesWithReactions(node, processedNodes = /* @__PURE__ */ new Set(), depth = 0, results = []) {
        if (processedNodes.has(node.id)) {
          return results;
        }
        processedNodes.add(node.id);
        let filteredReactions = [];
        if (node.reactions && node.reactions.length > 0) {
          filteredReactions = node.reactions.filter((reaction) => {
            if (reaction.action && reaction.action.navigation === "CHANGE_TO") {
              return false;
            }
            if (Array.isArray(reaction.actions)) {
              return !reaction.actions.some(
                (action) => action.navigation === "CHANGE_TO"
              );
            }
            return true;
          });
        }
        if (filteredReactions.length > 0) {
          results.push({
            id: node.id,
            name: node.name,
            type: node.type,
            depth,
            hasReactions: true,
            reactions: filteredReactions,
            path: getNodePath2(node)
          });
        }
        if (node.children) {
          for (const child of node.children) {
            await findNodesWithReactions(
              child,
              processedNodes,
              depth + 1,
              results
            );
          }
        }
        return results;
      }
      let allResults = [];
      let processedCount = 0;
      const totalCount = nodeIds.length;
      for (let i = 0; i < nodeIds.length; i++) {
        try {
          const nodeId = nodeIds[i];
          const node = await figma.getNodeByIdAsync(nodeId);
          if (!node) {
            processedCount++;
            await sendProgressUpdate(
              commandId,
              "get_reactions",
              "in_progress",
              processedCount / totalCount,
              totalCount,
              processedCount,
              `Node not found: ${nodeId}`
            );
            continue;
          }
          const processedNodes = /* @__PURE__ */ new Set();
          const nodeResults = await findNodesWithReactions(
            node,
            processedNodes
          );
          allResults = allResults.concat(nodeResults);
          processedCount++;
          await sendProgressUpdate(
            commandId,
            "get_reactions",
            "in_progress",
            processedCount / totalCount,
            totalCount,
            processedCount,
            `Processed node ${processedCount}/${totalCount}, found ${nodeResults.length} nodes with reactions`
          );
        } catch (error) {
          processedCount++;
          await sendProgressUpdate(
            commandId,
            "get_reactions",
            "in_progress",
            processedCount / totalCount,
            totalCount,
            processedCount,
            `Error processing node: ${error.message}`
          );
        }
      }
      await sendProgressUpdate(
        commandId,
        "get_reactions",
        "completed",
        1,
        totalCount,
        totalCount,
        `Completed deep search: found ${allResults.length} nodes with reactions.`
      );
      return {
        nodesCount: nodeIds.length,
        nodesWithReactions: allResults.length,
        nodes: allResults
      };
    } catch (error) {
      throw new Error(`Failed to get reactions: ${error.message}`);
    }
  }
  async function updateReactions(params) {
    const { nodeId, reactions } = params || {};
    if (!nodeId) {
      throw new Error("Missing nodeId parameter");
    }
    if (!reactions || !Array.isArray(reactions)) {
      throw new Error("Missing or invalid reactions parameter");
    }
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
      throw new Error(`Node not found with ID: ${nodeId}`);
    }
    if (!("reactions" in node)) {
      throw new Error(`Node with ID ${nodeId} does not support reactions`);
    }
    try {
      await node.setReactionsAsync(reactions);
      return { success: true, message: `Successfully updated reactions for node ${nodeId}` };
    } catch (e) {
      throw new Error(`Failed to update reactions: ${e.message}`);
    }
  }

  // figma_plugin/handlers/textHandlers.ts
  async function setMultipleTextContents(params, deps = {}) {
    const applyChars = deps.setCharacters || setCharacters;
    const { text } = params || {};
    const commandId = params.commandId || generateCommandId();
    if (!text || !Array.isArray(text)) {
      const errorMsg = "Missing required parameters: text array";
      await sendProgressUpdate(
        commandId,
        "set_multiple_text_contents",
        "error",
        0,
        0,
        0,
        errorMsg,
        { error: errorMsg }
      );
      throw new Error(errorMsg);
    }
    console.log(
      `Starting text replacement with ${text.length} text replacements`
    );
    await sendProgressUpdate(
      commandId,
      "set_multiple_text_contents",
      "started",
      0,
      text.length,
      0,
      `Starting text replacement for ${text.length} nodes`,
      { requestedCount: text.length }
    );
    const results = [];
    let successCount = 0;
    let failureCount = 0;
    let skippedCount = 0;
    let hasFailed = false;
    for (let i = 0; i < text.length; i++) {
      const replacement = text[i];
      if (hasFailed) {
        skippedCount++;
        results.push({
          success: false,
          status: "skipped",
          nodeId: replacement.nodeId || "unknown",
          error: "Skipped due to previous failure in batch"
        });
        continue;
      }
      if (!replacement.nodeId || replacement.characters === void 0) {
        hasFailed = true;
        failureCount++;
        results.push({
          success: false,
          status: "failed",
          nodeId: replacement.nodeId || "unknown",
          error: "Missing nodeId or characters in replacement entry"
        });
        continue;
      }
      let originalText = "";
      const report = {};
      try {
        console.log(`Attempting to replace text in node: ${replacement.nodeId}`);
        const textNode = await figma.getNodeByIdAsync(replacement.nodeId);
        if (!textNode) {
          hasFailed = true;
          failureCount++;
          results.push({
            success: false,
            status: "failed",
            nodeId: replacement.nodeId,
            error: `Node not found: ${replacement.nodeId}`
          });
          continue;
        }
        if (textNode.type !== "TEXT") {
          hasFailed = true;
          failureCount++;
          results.push({
            success: false,
            status: "failed",
            nodeId: replacement.nodeId,
            error: `Node is not a text node: ${replacement.nodeId} (type: ${textNode.type})`
          });
          continue;
        }
        originalText = textNode.characters;
        const ok = await applyChars(textNode, replacement.characters, void 0, report);
        if (!ok) {
          throw new Error(`Failed to set characters on node ${replacement.nodeId}`);
        }
        successCount++;
        results.push({
          success: true,
          status: "success",
          nodeId: replacement.nodeId,
          originalText,
          translatedText: replacement.characters
        });
        await sendProgressUpdate(
          commandId,
          "set_multiple_text_contents",
          "in_progress",
          Math.round((i + 1) / text.length * 100),
          text.length,
          successCount + failureCount + skippedCount,
          `Processed ${i + 1}/${text.length} text replacements`
        );
        await new Promise((r) => setTimeout(r, 0));
      } catch (error) {
        const errorMessage = describeError(error);
        console.error(`Error replacing text in node ${replacement.nodeId}: ${errorMessage}`);
        hasFailed = true;
        failureCount++;
        const row = {
          success: false,
          status: "failed",
          nodeId: replacement.nodeId,
          error: `Error applying replacement: ${errorMessage}`
        };
        if (report.fontMutated) {
          row.partialMutation = true;
          row.whatChanged = "the node's font was changed to satisfy the text edit before the character assignment failed";
          row.before = { fontName: report.beforeFont };
        }
        results.push(row);
        continue;
      }
    }
    await sendProgressUpdate(
      commandId,
      "set_multiple_text_contents",
      failureCount > 0 ? "error" : "completed",
      100,
      text.length,
      successCount + failureCount + skippedCount,
      `Text replacement complete: ${successCount} successful, ${failureCount} failed, ${skippedCount} skipped`,
      {
        // Q26: only the shared envelope counts — the legacy `totalReplacements`
        // / `replacementsApplied` progress copies are dropped.
        requestedCount: text.length,
        succeededCount: successCount,
        failedCount: failureCount,
        skippedCount,
        results
      }
    );
    return {
      ...batchEnvelope(text.length, successCount, failureCount, skippedCount),
      results,
      commandId
    };
  }
  async function loadAllFontsForNode(node) {
    if (node.fontName !== figma.mixed) return;
    const segments = node.getStyledTextSegments(["fontName"]);
    const uniqueFonts = [];
    const seen = /* @__PURE__ */ new Set();
    for (const segment of segments) {
      const font = segment.fontName;
      const key = `${font.family}-${font.style}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueFonts.push(font);
      }
    }
    for (const font of uniqueFonts) {
      try {
        await figma.loadFontAsync(font);
      } catch (error) {
        throw new Error(`Failed to load font ${font.family} ${font.style}: ${error.message}`);
      }
    }
  }
  async function setTextStyle(params) {
    const {
      nodeId,
      fontName,
      fontSize,
      letterSpacing,
      lineHeight,
      paragraphSpacing,
      textCase,
      textDecoration,
      textAlignHorizontal,
      textAlignVertical,
      paragraphIndent
    } = params;
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
      throw new Error(`Node with ID ${nodeId} not found`);
    }
    if (node.type !== "TEXT") {
      throw new Error(`Node is not a text node (got ${node.type})`);
    }
    if (fontName) {
      const targetFamily = fontName.family;
      const targetStyle = fontName.style;
      try {
        await figma.loadFontAsync({ family: targetFamily, style: targetStyle });
      } catch (error) {
        throw new Error(`Failed to load requested font ${targetFamily} ${targetStyle}: ${error.message}`);
      }
      node.fontName = { family: targetFamily, style: targetStyle };
    } else {
      if (node.fontName !== figma.mixed) {
        try {
          await figma.loadFontAsync(node.fontName);
        } catch (error) {
          throw new Error(`Failed to load current font ${node.fontName.family} ${node.fontName.style}: ${error.message}`);
        }
      } else {
        await loadAllFontsForNode(node);
      }
    }
    if (fontSize !== void 0) node.fontSize = fontSize;
    if (letterSpacing !== void 0) node.letterSpacing = letterSpacing;
    if (lineHeight !== void 0) node.lineHeight = lineHeight;
    if (paragraphSpacing !== void 0) node.paragraphSpacing = paragraphSpacing;
    if (paragraphIndent !== void 0) node.paragraphIndent = paragraphIndent;
    if (textCase !== void 0) node.textCase = textCase;
    if (textDecoration !== void 0) node.textDecoration = textDecoration;
    if (textAlignHorizontal !== void 0) node.textAlignHorizontal = textAlignHorizontal;
    if (textAlignVertical !== void 0) node.textAlignVertical = textAlignVertical;
    return {
      id: node.id,
      name: node.name,
      type: node.type,
      fontName: node.fontName !== figma.mixed ? node.fontName : "Mixed",
      fontSize: node.fontSize !== figma.mixed ? node.fontSize : "Mixed"
    };
  }

  // figma_plugin/handlers/annotationHandlers.ts
  function withAnnotationPropertyRecovery(message) {
    if (typeof message !== "string") return message;
    if (!/Invalid property\s+"[^"]*"\s+for a\b/.test(message)) return message;
    return `${message}. Annotation property validity is decided by Figma per node type, and this tool's enum is the full catalogue rather than the subset valid for this node \u2014 drop that entry from 'properties' (or annotate a node that has it) and resend only the non-success rows.`;
  }
  function normalizeExistingAnnotation(annotation) {
    if (annotation === null || typeof annotation !== "object") return annotation;
    if (!("label" in annotation) || !("labelMarkdown" in annotation)) return annotation;
    if (annotation.labelMarkdown === void 0 || annotation.labelMarkdown === null) {
      return annotation;
    }
    const { label: _label, ...rest } = annotation;
    return rest;
  }
  function annotationDisclosure(beforeCount, beforeCountVerified, after, appendAttempted) {
    if (!appendAttempted) return {};
    if (!after.verified || after.count === null || !beforeCountVerified || beforeCount === null) {
      return {
        // Fail safe: the write crossed the setter boundary and mutation
        // cannot be ruled out. `outcomeUnknown` distinguishes this from a
        // confirmed count delta while retaining the shared Q9 recovery flag.
        partialMutation: true,
        outcomeUnknown: true,
        whatChanged: "the annotation append was attempted, but the post-attempt annotation count could not be verified; the append may have committed.",
        ...beforeCountVerified && beforeCount !== null ? { before: { annotationCount: beforeCount } } : {},
        ...after.error ? { postStateError: after.error } : {}
      };
    }
    if (after.count === beforeCount) return {};
    return {
      partialMutation: true,
      whatChanged: `the annotation was appended before the failure occurred \u2014 the node's annotation count went from ${beforeCount} to ${after.count}.`,
      before: { annotationCount: beforeCount }
    };
  }
  function observeAnnotationCount(node) {
    try {
      if (!node || !("annotations" in node)) {
        return {
          count: null,
          verified: false,
          error: "the target does not expose a readable annotations collection"
        };
      }
      const annotations = node.annotations;
      if (!annotations || typeof annotations.length !== "number") {
        return {
          count: null,
          verified: false,
          error: "the target's annotations collection has no readable length"
        };
      }
      return { count: annotations.length, verified: true };
    } catch (error) {
      return {
        count: null,
        verified: false,
        error: `post-attempt annotation count read failed: ${describeError(error)}`
      };
    }
  }
  async function getAnnotations(params, pageLoads = createPageLoadCoordinator()) {
    try {
      const { nodeId, pageId, includeCategories = true } = params || {};
      if (nodeId && pageId || !nodeId && !pageId) {
        throw new Error("Exactly one of pageId or nodeId is required");
      }
      let categoriesMap = {};
      if (includeCategories) {
        const categories = await figma.annotations.getAnnotationCategoriesAsync();
        categoriesMap = categories.reduce((map, category) => {
          map[category.id] = {
            id: category.id,
            label: category.label,
            color: category.color,
            isPreset: category.isPreset
          };
          return map;
        }, {});
      }
      if (pageId) {
        const page = await pageLoads.require(pageId);
        const annotations = [];
        const processNode = async (node) => {
          if ("annotations" in node && node.annotations && node.annotations.length > 0) {
            annotations.push({
              nodeId: node.id,
              name: node.name,
              annotations: node.annotations
            });
          }
          if ("children" in node) {
            for (const child of node.children) {
              await processNode(child);
            }
          }
        };
        try {
          await processNode(page);
        } catch (error) {
          throw pageLoads.fail(page.id, error).error;
        }
        const result = {
          annotatedNodes: annotations,
          coverage: pageLoads.coverage()
        };
        if (includeCategories) {
          result.categories = Object.values(categoriesMap);
        }
        return result;
      } else {
        const node = await figma.getNodeByIdAsync(nodeId);
        if (!node) {
          throw new Error(`Node not found: ${nodeId}`);
        }
        const containingPage = getContainingPageNode(node);
        if (containingPage) {
          const loaded = await pageLoads.load(containingPage);
          if (!loaded.ok) throw loaded.error;
        }
        const annotatedNodes = [];
        const collect = async (n) => {
          if ("annotations" in n && n.annotations && n.annotations.length > 0) {
            annotatedNodes.push({
              nodeId: n.id,
              name: n.name,
              annotations: n.annotations
            });
          }
          if ("children" in n) {
            for (const child of n.children) {
              await collect(child);
            }
          }
        };
        try {
          await collect(node);
        } catch (error) {
          if (containingPage) {
            throw pageLoads.fail(containingPage.id, error).error;
          }
          throw error;
        }
        const result = {
          annotatedNodes,
          coverage: pageLoads.coverage()
        };
        if (includeCategories) {
          result.categories = Object.values(categoriesMap);
        }
        return result;
      }
    } catch (error) {
      console.error("Error in getAnnotations:", error);
      throw error;
    }
  }
  async function setAnnotation(params, report = {}) {
    const { nodeId, labelMarkdown, categoryId, properties } = params || {};
    let node = null;
    let beforeCount = null;
    let beforeCountVerified = false;
    let afterCount = null;
    let afterCountVerified = false;
    let appendAttempted = false;
    if (!nodeId) {
      return {
        success: false,
        error: "Missing nodeId parameter",
        beforeCount,
        afterCount,
        beforeCountVerified,
        afterCountVerified
      };
    }
    if (typeof labelMarkdown !== "string" || labelMarkdown.trim().length === 0) {
      return {
        success: false,
        error: "Missing or blank labelMarkdown parameter",
        beforeCount,
        afterCount,
        beforeCountVerified,
        afterCountVerified
      };
    }
    try {
      node = await figma.getNodeByIdAsync(nodeId);
      if (!node) {
        return {
          success: false,
          error: `Node not found: ${nodeId}`,
          beforeCount,
          afterCount,
          beforeCountVerified,
          afterCountVerified
        };
      }
      if (!("annotations" in node)) {
        return {
          success: false,
          error: `Node type ${node.type} does not support annotations`,
          beforeCount,
          afterCount,
          beforeCountVerified,
          afterCountVerified
        };
      }
      const existingAnnotations = node.annotations || [];
      const verifiedBeforeCount = existingAnnotations.length;
      beforeCount = verifiedBeforeCount;
      beforeCountVerified = true;
      afterCount = verifiedBeforeCount;
      afterCountVerified = true;
      report.beforeCount = verifiedBeforeCount;
      const annotationObj = {
        labelMarkdown
      };
      if (categoryId) {
        annotationObj.categoryId = categoryId;
      }
      if (properties && Array.isArray(properties)) {
        annotationObj.properties = properties;
      }
      appendAttempted = true;
      report.appendAttempted = true;
      node.annotations = [
        ...existingAnnotations.map(normalizeExistingAnnotation),
        annotationObj
      ];
      afterCount = node.annotations.length;
      afterCountVerified = true;
      return {
        success: true,
        nodeId,
        beforeCount,
        afterCount,
        beforeCountVerified,
        afterCountVerified
      };
    } catch (error) {
      const initiatingError = withAnnotationPropertyRecovery(describeError(error));
      try {
        console.error("Error in setAnnotation:", error);
      } catch (e) {
      }
      const observedAfter = observeAnnotationCount(node);
      afterCount = observedAfter.count;
      afterCountVerified = observedAfter.verified;
      return {
        success: false,
        error: initiatingError,
        beforeCount,
        afterCount,
        beforeCountVerified,
        afterCountVerified,
        ...annotationDisclosure(
          beforeCount,
          beforeCountVerified,
          observedAfter,
          appendAttempted
        )
      };
    }
  }
  async function readAnnotationCount(nodeId) {
    try {
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node) {
        return {
          count: null,
          verified: false,
          error: `annotation target '${nodeId}' could not be resolved during count verification`
        };
      }
      return observeAnnotationCount(node);
    } catch (error) {
      return {
        count: null,
        verified: false,
        error: `annotation count verification failed: ${describeError(error)}`
      };
    }
  }
  async function verifyAnnotationCategories(annotations) {
    const verified = /* @__PURE__ */ new Set();
    for (const annotation of annotations) {
      if (annotation.categoryId === void 0 || verified.has(annotation.categoryId)) {
        continue;
      }
      const category = await figma.annotations.getAnnotationCategoryByIdAsync(annotation.categoryId);
      if (!category || category.id !== annotation.categoryId) {
        throw REFUSALS.ANNOTATION_CATEGORY_NOT_FOUND(String(annotation.categoryId));
      }
      verified.add(annotation.categoryId);
    }
  }
  async function setMultipleAnnotations(params) {
    var _a;
    console.log("=== setMultipleAnnotations Debug Start ===");
    console.log("Input params:", JSON.stringify(params, null, 2));
    const { nodeId, annotations } = params;
    if (!annotations || !Array.isArray(annotations) || annotations.length === 0) {
      throw new Error("Missing or invalid annotations parameter: annotation_set requires at least one annotation entry.");
    }
    console.log(
      `Processing ${annotations.length} annotations for node ${nodeId}`
    );
    await verifyAnnotationCategories(annotations);
    const results = [];
    let successCount = 0;
    let failureCount = 0;
    let skippedCount = 0;
    let hasFailed = false;
    for (let i = 0; i < annotations.length; i++) {
      const annotation = annotations[i];
      if (hasFailed) {
        const annotationCount = await readAnnotationCount(annotation.nodeId);
        skippedCount++;
        results.push({
          success: false,
          status: "skipped",
          nodeId: annotation.nodeId || "unknown",
          error: "Skipped due to previous failure in batch",
          beforeCount: annotationCount.count,
          afterCount: annotationCount.count,
          beforeCountVerified: annotationCount.verified,
          afterCountVerified: annotationCount.verified,
          ...!annotationCount.verified && annotationCount.error ? { postStateError: annotationCount.error } : {}
        });
        continue;
      }
      console.log(
        `
Processing annotation ${i + 1}/${annotations.length}:`,
        JSON.stringify(annotation, null, 2)
      );
      const report = {};
      try {
        console.log("Calling setAnnotation with params:", {
          nodeId: annotation.nodeId,
          labelMarkdown: annotation.labelMarkdown,
          categoryId: annotation.categoryId,
          properties: annotation.properties
        });
        const result = await setAnnotation({
          nodeId: annotation.nodeId,
          labelMarkdown: annotation.labelMarkdown,
          categoryId: annotation.categoryId,
          properties: annotation.properties
        }, report);
        console.log("setAnnotation result:", JSON.stringify(result, null, 2));
        if (result.success) {
          results.push({
            success: true,
            status: "success",
            nodeId: annotation.nodeId,
            beforeCount: result.beforeCount,
            afterCount: result.afterCount,
            beforeCountVerified: result.beforeCountVerified,
            afterCountVerified: result.afterCountVerified
          });
          successCount++;
          console.log(`\u2713 Annotation ${i + 1} applied successfully`);
        } else {
          results.push({
            success: false,
            status: "failed",
            // Q25 identity is a required row key; an item that never
            // supplied one still gets a schema-valid, honest placeholder
            // (the same guard `text_set_content` applies).
            nodeId: annotation.nodeId || "unknown",
            error: result.error,
            beforeCount: result.beforeCount,
            afterCount: result.afterCount,
            beforeCountVerified: result.beforeCountVerified,
            afterCountVerified: result.afterCountVerified,
            ...result.partialMutation ? { partialMutation: true } : {},
            ...result.outcomeUnknown ? { outcomeUnknown: true } : {},
            ...result.whatChanged ? { whatChanged: result.whatChanged } : {},
            ...result.before ? { before: result.before } : {},
            ...result.postStateError ? { postStateError: result.postStateError } : {}
          });
          hasFailed = true;
          failureCount++;
          console.error(`\u2717 Annotation ${i + 1} failed:`, result.error);
        }
      } catch (error) {
        const observedCount = await readAnnotationCount(annotation.nodeId);
        const beforeCount = (_a = report.beforeCount) != null ? _a : null;
        const beforeCountVerified = report.beforeCount !== void 0;
        hasFailed = true;
        failureCount++;
        results.push({
          success: false,
          status: "failed",
          nodeId: annotation.nodeId || "unknown",
          error: describeError(error),
          beforeCount,
          afterCount: observedCount.count,
          beforeCountVerified,
          afterCountVerified: observedCount.verified,
          ...annotationDisclosure(
            beforeCount,
            beforeCountVerified,
            observedCount,
            report.appendAttempted === true
          )
        });
        console.error(`\u2717 Annotation ${i + 1} failed with error:`, error);
      }
    }
    const summary = {
      ...batchEnvelope(annotations.length, successCount, failureCount, skippedCount),
      results
    };
    console.log("\n=== setMultipleAnnotations Summary ===");
    console.log(JSON.stringify(summary, null, 2));
    console.log("=== setMultipleAnnotations Debug End ===");
    return summary;
  }

  // figma_plugin/handlers/variableHandlers.ts
  async function findStyleConsumers(variableIds) {
    const consumerMap = /* @__PURE__ */ new Map();
    const [paintStyles, textStyles, effectStyles, gridStyles] = await Promise.all([
      figma.getLocalPaintStylesAsync(),
      figma.getLocalTextStylesAsync(),
      figma.getLocalEffectStylesAsync(),
      figma.getLocalGridStylesAsync()
    ]);
    function processStyles(styles, type) {
      for (const style of styles) {
        const boundVars = style.boundVariables;
        if (boundVars) {
          const matchesByVarId = /* @__PURE__ */ new Map();
          for (const [field, binding] of Object.entries(boundVars)) {
            if (binding && binding.id && variableIds.has(binding.id)) {
              const vid = binding.id;
              if (!matchesByVarId.has(vid)) matchesByVarId.set(vid, []);
              matchesByVarId.get(vid).push(field);
            }
            if (Array.isArray(binding)) {
              for (const item of binding) {
                if (item && item.id && variableIds.has(item.id)) {
                  if (!matchesByVarId.has(item.id)) matchesByVarId.set(item.id, []);
                  matchesByVarId.get(item.id).push(field);
                  break;
                }
              }
            }
          }
          for (const [vid, fields] of matchesByVarId.entries()) {
            if (!consumerMap.has(vid)) consumerMap.set(vid, []);
            consumerMap.get(vid).push({
              styleId: style.id,
              styleName: style.name,
              styleType: type,
              fields
            });
          }
        }
      }
    }
    processStyles(paintStyles, "PAINT");
    processStyles(textStyles, "TEXT");
    processStyles(effectStyles, "EFFECT");
    processStyles(gridStyles, "GRID");
    return consumerMap;
  }
  async function findAliasConsumers(variableIds) {
    const consumerMap = /* @__PURE__ */ new Map();
    const variables = await figma.variables.getLocalVariablesAsync();
    for (const variable of variables) {
      const matchesByVarId = /* @__PURE__ */ new Map();
      for (const [modeId, value] of Object.entries(variable.valuesByMode)) {
        if (value && typeof value === "object" && value.type === "VARIABLE_ALIAS") {
          const targetId = value.id;
          if (variableIds.has(targetId)) {
            if (!matchesByVarId.has(targetId)) matchesByVarId.set(targetId, []);
            matchesByVarId.get(targetId).push(modeId);
          }
        }
      }
      for (const [targetId, modes] of matchesByVarId.entries()) {
        if (!consumerMap.has(targetId)) consumerMap.set(targetId, []);
        consumerMap.get(targetId).push({
          variableId: variable.id,
          variableName: variable.name,
          variableType: variable.resolvedType,
          modes
        });
      }
    }
    return consumerMap;
  }
  async function findVariableConsumers(rootNode, variableIds, commandId, commandType = "variable_delete") {
    const consumerMap = /* @__PURE__ */ new Map();
    let walkCount = 0;
    let lastYield = Date.now();
    let lastHeartbeat = Date.now();
    async function walk(node) {
      var _a;
      walkCount++;
      const now = Date.now();
      if (now - lastYield >= 50 || walkCount % 500 === 0) {
        await new Promise((r) => setTimeout(r, 0));
        lastYield = Date.now();
        if (commandId && Date.now() - lastHeartbeat >= 1e3) {
          await sendProgressUpdate(
            commandId,
            commandType,
            "in_progress",
            50,
            1,
            0,
            `Scanning nodes for consumers (checked ${walkCount} so far)...`
          );
          lastHeartbeat = Date.now();
        }
      }
      const boundVars = node.boundVariables;
      if (boundVars) {
        const matchesByVarId = /* @__PURE__ */ new Map();
        for (const [field, binding] of Object.entries(boundVars)) {
          if (binding && binding.id && variableIds.has(binding.id)) {
            const vid = binding.id;
            if (!matchesByVarId.has(vid)) matchesByVarId.set(vid, []);
            matchesByVarId.get(vid).push(field);
          }
          if (Array.isArray(binding)) {
            for (const item of binding) {
              if (item && item.id && variableIds.has(item.id)) {
                if (!matchesByVarId.has(item.id)) matchesByVarId.set(item.id, []);
                matchesByVarId.get(item.id).push(field);
                break;
              }
            }
          }
        }
        for (const [vid, fields] of matchesByVarId.entries()) {
          if (!consumerMap.has(vid)) consumerMap.set(vid, []);
          consumerMap.get(vid).push({
            nodeId: node.id,
            nodeName: node.name,
            nodeType: node.type,
            fields
          });
        }
      }
      if (node.type === "COMPONENT_SET" || node.type === "COMPONENT" && ((_a = node.parent) == null ? void 0 : _a.type) !== "COMPONENT_SET") {
        const defs = node.componentPropertyDefinitions;
        if (defs) {
          const matchesByVarId = /* @__PURE__ */ new Map();
          for (const [propName, def] of Object.entries(defs)) {
            const boundVars2 = def.boundVariables;
            if (boundVars2) {
              for (const [field, binding] of Object.entries(boundVars2)) {
                if (binding && binding.id && variableIds.has(binding.id)) {
                  const vid = binding.id;
                  if (!matchesByVarId.has(vid)) matchesByVarId.set(vid, []);
                  matchesByVarId.get(vid).push(`componentProperty:${propName}`);
                }
                if (Array.isArray(binding)) {
                  for (const item of binding) {
                    if (item && item.id && variableIds.has(item.id)) {
                      if (!matchesByVarId.has(item.id)) matchesByVarId.set(item.id, []);
                      matchesByVarId.get(item.id).push(`componentProperty:${propName}`);
                      break;
                    }
                  }
                }
              }
            }
          }
          for (const [vid, fields] of matchesByVarId.entries()) {
            if (!consumerMap.has(vid)) consumerMap.set(vid, []);
            consumerMap.get(vid).push({
              nodeId: node.id,
              nodeName: node.name,
              nodeType: node.type,
              fields
            });
          }
        }
      }
      if (node.type === "INSTANCE") {
        const props = node.componentProperties;
        if (props) {
          const matchesByVarId = /* @__PURE__ */ new Map();
          for (const [propName, propVal] of Object.entries(props)) {
            const boundVars2 = propVal.boundVariables;
            if (boundVars2) {
              for (const [field, binding] of Object.entries(boundVars2)) {
                if (binding && binding.id && variableIds.has(binding.id)) {
                  const vid = binding.id;
                  if (!matchesByVarId.has(vid)) matchesByVarId.set(vid, []);
                  matchesByVarId.get(vid).push(`componentProperty:${propName}`);
                }
                if (Array.isArray(binding)) {
                  for (const item of binding) {
                    if (item && item.id && variableIds.has(item.id)) {
                      if (!matchesByVarId.has(item.id)) matchesByVarId.set(item.id, []);
                      matchesByVarId.get(item.id).push(`componentProperty:${propName}`);
                      break;
                    }
                  }
                }
              }
            }
          }
          for (const [vid, fields] of matchesByVarId.entries()) {
            if (!consumerMap.has(vid)) consumerMap.set(vid, []);
            consumerMap.get(vid).push({
              nodeId: node.id,
              nodeName: node.name,
              nodeType: node.type,
              fields
            });
          }
        }
      }
      if ("reactions" in node) {
        const reactions = node.reactions;
        if (Array.isArray(reactions)) {
          let walkExpression2 = function(expr) {
            if (!expr) return;
            if (expr.type === "VARIABLE_ALIAS" && expr.id && variableIds.has(expr.id)) {
              if (!matchesByVarId.has(expr.id)) matchesByVarId.set(expr.id, []);
              matchesByVarId.get(expr.id).push("reactions:expression");
            }
            if (expr.type === "EXPRESSION" && Array.isArray(expr.expressionArguments)) {
              for (const arg of expr.expressionArguments) {
                walkExpression2(arg);
              }
            }
          }, walkAction2 = function(action) {
            if (!action) return;
            if (action.type === "SET_VARIABLE") {
              if (action.variableId && variableIds.has(action.variableId)) {
                if (!matchesByVarId.has(action.variableId)) matchesByVarId.set(action.variableId, []);
                matchesByVarId.get(action.variableId).push("reactions:SET_VARIABLE");
              }
              if (action.variableValue) {
                if (action.variableValue.type === "VARIABLE_ALIAS" && action.variableValue.id && variableIds.has(action.variableValue.id)) {
                  if (!matchesByVarId.has(action.variableValue.id)) matchesByVarId.set(action.variableValue.id, []);
                  matchesByVarId.get(action.variableValue.id).push("reactions:SET_VARIABLE:value");
                } else if (action.variableValue.type === "EXPRESSION") {
                  walkExpression2(action.variableValue);
                }
              }
            } else if (action.type === "CONDITIONAL" && Array.isArray(action.conditionalBlocks)) {
              for (const block of action.conditionalBlocks) {
                if (block.condition) {
                  if (block.condition.type === "VARIABLE_ALIAS" && block.condition.id && variableIds.has(block.condition.id)) {
                    if (!matchesByVarId.has(block.condition.id)) matchesByVarId.set(block.condition.id, []);
                    matchesByVarId.get(block.condition.id).push("reactions:CONDITIONAL:condition");
                  } else if (block.condition.type === "EXPRESSION") {
                    walkExpression2(block.condition);
                  }
                }
                if (Array.isArray(block.actions)) {
                  for (const a of block.actions) {
                    walkAction2(a);
                  }
                }
              }
            }
          };
          var walkExpression = walkExpression2, walkAction = walkAction2;
          const matchesByVarId = /* @__PURE__ */ new Map();
          for (const reaction of reactions) {
            if (reaction.action) {
              walkAction2(reaction.action);
            }
            if (Array.isArray(reaction.actions)) {
              for (const a of reaction.actions) {
                walkAction2(a);
              }
            }
          }
          for (const [vid, fields] of matchesByVarId.entries()) {
            if (!consumerMap.has(vid)) consumerMap.set(vid, []);
            consumerMap.get(vid).push({
              nodeId: node.id,
              nodeName: node.name,
              nodeType: node.type,
              fields: [...new Set(fields)]
            });
          }
        }
      }
      if ("children" in node) {
        for (const child of node.children) {
          await walk(child);
        }
      }
    }
    await walk(rootNode);
    return consumerMap;
  }
  async function getVariables(params, pageLoads = createPageLoadCoordinator()) {
    const { variableId, includeConsumers, pageId, commandId } = params || {};
    try {
      if (variableId && variableId.length > 0) {
        const variables2 = [];
        const missingIds = [];
        const idSet = new Set(variableId);
        const isStreaming = includeConsumers === "document";
        if (commandId && isStreaming) {
          await sendProgressUpdate(
            commandId,
            "get_variables",
            "started",
            0,
            variableId.length,
            0,
            `Fetching details for ${variableId.length} variables`
          );
        }
        for (const [index, id] of variableId.entries()) {
          const variable = await figma.variables.getVariableByIdAsync(id);
          if (!variable) {
            missingIds.push(id);
            continue;
          }
          const collection = await figma.variables.getVariableCollectionByIdAsync(
            variable.variableCollectionId
          );
          variables2.push({
            id: variable.id,
            name: variable.name,
            key: variable.key,
            type: variable.resolvedType,
            description: variable.description,
            collectionId: variable.variableCollectionId,
            collectionName: collection ? collection.name : "Unknown",
            remote: variable.remote,
            scopes: variable.scopes,
            valuesByMode: variable.valuesByMode
          });
        }
        if (includeConsumers) {
          const stylePromise = findStyleConsumers(idSet);
          const aliasPromise = findAliasConsumers(idSet);
          let nodeConsumerMap = /* @__PURE__ */ new Map();
          if (includeConsumers === "page") {
            if (!pageId) {
              throw new Error("pageId is required when includeConsumers is 'page'");
            }
            const pageNode = await pageLoads.require(pageId);
            try {
              nodeConsumerMap = await findVariableConsumers(pageNode, idSet, commandId, "get_variables");
            } catch (error) {
              throw pageLoads.fail(pageNode.id, error).error;
            }
          } else {
            const pages = figma.root.children;
            for (const [index, page] of pages.entries()) {
              const loaded = await pageLoads.load(page);
              if (loaded.ok) {
                try {
                  const pageConsumers = await findVariableConsumers(page, idSet, commandId, "get_variables");
                  for (const [vid, entries] of pageConsumers) {
                    const existing = nodeConsumerMap.get(vid) || [];
                    nodeConsumerMap.set(vid, existing.concat(entries));
                  }
                } catch (error) {
                  pageLoads.fail(page.id, error);
                }
              }
              if (commandId) {
                await sendProgressUpdate(
                  commandId,
                  "get_variables",
                  "in_progress",
                  Math.round((index + 1) / pages.length * 100),
                  pages.length,
                  index + 1,
                  `Scanning page ${index + 1}/${pages.length} for consumers: ${page.name}`
                );
              }
            }
          }
          const styleConsumerMap = await stylePromise;
          const aliasConsumerMap = await aliasPromise;
          for (const v of variables2) {
            v.nodeConsumers = nodeConsumerMap.get(v.id) || [];
            v.styleConsumers = styleConsumerMap.get(v.id) || [];
            v.aliasConsumers = aliasConsumerMap.get(v.id) || [];
          }
        }
        if (commandId && isStreaming) {
          await sendProgressUpdate(
            commandId,
            "get_variables",
            "completed",
            100,
            1,
            1,
            `Completed fetching variable information`
          );
        }
        return missingIds.length > 0 ? { variables: variables2, missingIds, coverage: pageLoads.coverage() } : { variables: variables2, coverage: pageLoads.coverage() };
      }
      const collections = await figma.variables.getLocalVariableCollectionsAsync();
      const variables = await figma.variables.getLocalVariablesAsync();
      return {
        collections: collections.map((c) => ({
          id: c.id,
          name: c.name,
          key: c.key,
          modes: c.modes,
          defaultModeId: c.defaultModeId,
          remote: c.remote,
          variableIds: c.variableIds
        })),
        variables: variables.map((v) => ({
          id: v.id,
          name: v.name,
          key: v.key,
          type: v.resolvedType,
          collectionId: v.variableCollectionId,
          valuesByMode: v.valuesByMode,
          description: v.description
        })),
        coverage: pageLoads.coverage()
      };
    } catch (err) {
      let isStructured = false;
      try {
        isStructured = err !== null && typeof err === "object" && typeof err.code === "string";
      } catch (e) {
      }
      if (isStructured) throw err;
      throw new Error(`Error getting variables: ${describeError(err)}`);
    }
  }
  async function deleteVariables(params, pageLoads = createPageLoadCoordinator()) {
    var _a;
    const { variableIds, variableNames, collectionId, collectionName, commandId } = params || {};
    if (variableIds && collectionId) {
      throw new Error("Provide either variableIds or collectionId, not both");
    }
    if (!variableIds && !collectionId) {
      throw new Error("Must provide either variableIds or collectionId");
    }
    let idsToCheck;
    let collection = null;
    if (collectionId) {
      if (!collectionName) {
        throw new Error("collectionName is required when deleting a collection by collectionId");
      }
      collection = await figma.variables.getVariableCollectionByIdAsync(collectionId);
      if (!collection) throw new Error(`Collection not found: ${collectionId}`);
      if (collection.name !== collectionName) {
        throw new Error(`Operation Denied: collectionName '${collectionName}' does not match name of collectionId '${collection.name}'`);
      }
      if (collection.remote) {
        throw new Error(`Operation Denied: '${collection.name}' is a remote library asset (style/variable/component) and is read-only in this file. Edit it in its source library.`);
      }
      idsToCheck = collection.variableIds || [];
    } else {
      if (!Array.isArray(variableIds) || variableIds.length === 0) {
        throw new Error("variableIds must be a non-empty array");
      }
      if (!Array.isArray(variableNames) || variableNames.length !== variableIds.length) {
        throw new Error("variableNames must be provided as a parallel array of the same length as variableIds");
      }
      idsToCheck = variableIds;
    }
    const variables = await Promise.all(
      idsToCheck.map((id) => figma.variables.getVariableByIdAsync(id))
    );
    for (let i = 0; i < idsToCheck.length; i++) {
      const v = variables[i];
      if (!v) throw new Error(`Variable not found: ${idsToCheck[i]}`);
      if (variableIds && v.name !== variableNames[i]) {
        throw new Error(`Operation Denied: variableName '${variableNames[i]}' does not match name of variableId '${v.name}'`);
      }
      if (v.remote) {
        throw new Error(`Operation Denied: '${v.name}' is a remote library asset (style/variable/component) and is read-only in this file. Edit it in its source library.`);
      }
    }
    const idSet = new Set(idsToCheck);
    const stylePromise = findStyleConsumers(idSet);
    const aliasPromise = findAliasConsumers(idSet);
    const nodeMapsResults = [];
    for (const page of figma.root.children) {
      const loaded = await pageLoads.load(page);
      if (!loaded.ok) {
        nodeMapsResults.push(/* @__PURE__ */ new Map());
        continue;
      }
      if (idSet.size === 0) {
        nodeMapsResults.push(/* @__PURE__ */ new Map());
        continue;
      }
      try {
        nodeMapsResults.push(await findVariableConsumers(page, idSet, commandId, "variable_delete"));
      } catch (error) {
        pageLoads.fail(page.id, error);
        nodeMapsResults.push(/* @__PURE__ */ new Map());
      }
    }
    const [styleConsumerMap, _aliasConsumerMap] = await Promise.all([
      stylePromise,
      aliasPromise
    ]);
    const _nodeMaps = nodeMapsResults;
    const coverage = pageLoads.coverage();
    if (!coverage.complete) {
      throw REFUSALS.DOCUMENT_SCAN_INCOMPLETE(coverage.pageErrors);
    }
    const nodeConsumerMap = /* @__PURE__ */ new Map();
    for (const pageResults of _nodeMaps) {
      for (const [vid, entries] of pageResults) {
        const existing = nodeConsumerMap.get(vid) || [];
        nodeConsumerMap.set(vid, existing.concat(entries));
      }
    }
    let aliasConsumerMap = _aliasConsumerMap;
    if (collectionId) {
      aliasConsumerMap = /* @__PURE__ */ new Map();
      for (const [targetVid, consumers] of _aliasConsumerMap) {
        const filteredConsumers = consumers.filter((c) => !idSet.has(c.variableId));
        if (filteredConsumers.length > 0) {
          aliasConsumerMap.set(targetVid, filteredConsumers);
        }
      }
    }
    let hasConsumers = false;
    for (const vid of idsToCheck) {
      if ((nodeConsumerMap.get(vid) || []).length > 0 || (styleConsumerMap.get(vid) || []).length > 0 || (aliasConsumerMap.get(vid) || []).length > 0) {
        hasConsumers = true;
        break;
      }
    }
    if (hasConsumers) {
      const variablesInUse = {};
      for (const vid of idsToCheck) {
        const nodeConsumers = nodeConsumerMap.get(vid) || [];
        const styleConsumers = styleConsumerMap.get(vid) || [];
        const aliasConsumers = aliasConsumerMap.get(vid) || [];
        if (nodeConsumers.length > 0 || styleConsumers.length > 0 || aliasConsumers.length > 0) {
          variablesInUse[vid] = {
            nodeConsumers,
            styleConsumers,
            aliasConsumers
          };
        }
      }
      let errorMsg = collectionId ? `Cannot delete collection '${collection.name}': variable(s) in it are still in use.
` : `Cannot delete: variable(s) are still in use.
`;
      for (const [vid, consumers] of Object.entries(variablesInUse)) {
        const varName = ((_a = variables.find((v) => v && v.id === vid)) == null ? void 0 : _a.name) || vid;
        errorMsg += `- Variable '${varName}' (${vid}) is used by:
`;
        for (const n of consumers.nodeConsumers) {
          errorMsg += `  - Node '${n.nodeName}' (${n.nodeType}, ${n.nodeId}) on fields: ${n.fields.join(", ")}
`;
        }
        for (const s of consumers.styleConsumers) {
          const styleTypeName = s.styleType === "PAINT" ? "Paint" : s.styleType === "TEXT" ? "Text" : s.styleType === "EFFECT" ? "Effect" : s.styleType === "GRID" ? "Grid" : "Style";
          errorMsg += `  - ${styleTypeName} style '${s.styleName}' (${s.styleId}) on fields: ${s.fields.join(", ")}
`;
        }
        for (const a of consumers.aliasConsumers) {
          errorMsg += `  - Aliased by variable '${a.variableName}' (${a.variableId}) in modes: ${a.modes.join(", ")}
`;
        }
      }
      throw REFUSALS.VARIABLE_IN_USE(errorMsg.trim(), variablesInUse);
    }
    if (collectionId) {
      collection.remove();
      return { success: true, deleted: idsToCheck, deletedCollection: collectionId };
    } else {
      for (const variable of variables) {
        variable.remove();
      }
      return { success: true, deleted: idsToCheck };
    }
  }
  function describeError2(e) {
    if (e == null) return String(e);
    if (typeof e === "string") return e;
    if (typeof e.message === "string" && e.message.length > 0) {
      return e.name && e.name !== "Error" ? `${e.name}: ${e.message}` : e.message;
    }
    if (typeof e.toString === "function") {
      const s = e.toString();
      if (s && s !== "[object Object]") return s;
    }
    try {
      const json = JSON.stringify(e);
      if (json && json !== "{}") return json;
    } catch (e2) {
    }
    if (e.name) return e.name;
    return "unknown error (no message)";
  }
  var AUTOLAYOUT_FIELDS = /* @__PURE__ */ new Set([
    "paddingLeft",
    "paddingRight",
    "paddingTop",
    "paddingBottom",
    "itemSpacing",
    "counterAxisSpacing"
  ]);
  async function setBoundVariable(params) {
    var _a;
    const { nodeId, bindVariables, explicitVariableModes } = params || {};
    if (!nodeId) {
      throw new Error("Missing nodeId parameter");
    }
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
      throw new Error(`Node not found with ID: ${nodeId}`);
    }
    const hasBindings = bindVariables && Object.keys(bindVariables).length > 0;
    const hasModes = explicitVariableModes && Object.keys(explicitVariableModes).length > 0;
    if (!hasBindings && !hasModes) {
      throw new Error("Must provide bindVariables (property \u2192 variableId) or explicitVariableModes (collectionId \u2192 modeId)");
    }
    const results = [];
    if (hasModes) {
      for (const [collectionId, modeId] of Object.entries(explicitVariableModes)) {
        try {
          const collection = await figma.variables.getVariableCollectionByIdAsync(collectionId);
          if (!collection) throw new Error(`Collection ${collectionId} not found`);
          await node.setExplicitVariableModeForCollection(collection, modeId);
          results.push(`Set mode ${modeId} for collection ${collectionId}`);
        } catch (e) {
          throw new Error(`Failed to set explicit variable mode for collection ${collectionId}: ${describeError2(e)}`);
        }
      }
    }
    if (hasBindings) {
      for (const [field, variableId] of Object.entries(bindVariables)) {
        try {
          let variable = null;
          if (variableId) {
            variable = await figma.variables.getVariableByIdAsync(variableId);
            if (!variable) throw new Error(`Variable ${variableId} not found`);
          }
          if (field === "fills" || field === "strokes") {
            if (!(field in node)) {
              throw new Error(`node_bind_variable: '${node.name}' (type ${node.type}) has no '${field}' property to bind.`);
            }
            if (node[field] === figma.mixed) {
              throw new Error(`node_bind_variable: '${field}' on '${node.name}' is mixed (multiple values); bind on a node with a single ${field} value.`);
            }
            if (variable && variable.resolvedType !== "COLOR") {
              throw new Error(`node_bind_variable: cannot bind a non-color variable ('${variable.name}', ${variable.resolvedType}) to ${field}; ${field} requires a COLOR variable.`);
            }
            const rawPaints = node[field];
            if (rawPaints.length === 0) {
              if (variable) {
                const bound = figma.variables.setBoundVariableForPaint(
                  { type: "SOLID", color: { r: 0, g: 0, b: 0 } },
                  "color",
                  variable
                );
                node[field] = [bound];
                results.push(`Bound ${field} to variable ${variable.name} (created solid paint)`);
              } else {
                results.push(`nothing to unbind in ${field}`);
              }
              continue;
            }
            const paints = JSON.parse(JSON.stringify(rawPaints));
            let modified = false;
            for (let i = 0; i < paints.length; i++) {
              if (paints[i].type === "SOLID") {
                paints[i] = figma.variables.setBoundVariableForPaint(paints[i], "color", variable);
                modified = true;
              }
            }
            if (modified) {
              node[field] = paints;
              results.push(variable ? `Bound ${field} to variable ${variable.name}` : `Unbound variable from ${field}`);
            } else {
              if (variable) {
                throw new Error(`node_bind_variable: '${node.name}' has a non-solid ${field} (image/gradient) and no SOLID paint to bind a color token to. Set a solid fill first, or unbind the existing paint.`);
              } else {
                results.push(`nothing to unbind in ${field}`);
              }
            }
            continue;
          }
          if (AUTOLAYOUT_FIELDS.has(field)) {
            if (!("layoutMode" in node)) {
              throw new Error(
                `node_bind_variable: cannot bind '${field}' on '${node.name}' \u2014 '${field}' is an auto-layout property that only exists on auto-layout frames, and a ${node.type} cannot have auto-layout. Bind '${field}' on an auto-layout frame instead.`
              );
            }
            if (node.layoutMode === "NONE") {
              throw new Error(
                `node_bind_variable: cannot bind '${field}' on '${node.name}' \u2014 auto-layout is off (layoutMode is NONE). Turn it on first with node_set_auto_layout (layoutMode HORIZONTAL or VERTICAL), then bind '${field}'.`
              );
            }
          }
          node.setBoundVariable(field, variable);
          results.push(variable ? `Bound ${field} to variable ${variable.name}` : `Unbound variable from ${field}`);
        } catch (e) {
          if ((_a = e == null ? void 0 : e.message) == null ? void 0 : _a.startsWith("node_bind_variable:")) throw e;
          throw new Error(`Failed to set bound variable for ${field}: ${describeError2(e)}`);
        }
      }
    }
    return { success: true, name: node.name, message: results.join("; ") };
  }
  async function handleVariableRequest(params) {
    const { action } = params || {};
    if (!action) {
      throw new Error("Missing action parameter");
    }
    switch (action) {
      case "CREATE_COLLECTION": {
        const { name, modeName } = params;
        if (!name) throw new Error("Missing name for collection");
        assertNonEmptyExplicitName(
          modeName,
          "modeName",
          "variable_manage CREATE_COLLECTION",
          "Omit modeName to keep the collection's default mode name."
        );
        const collection = figma.variables.createVariableCollection(name);
        if (modeName) {
          collection.renameMode(collection.modes[0].modeId, modeName);
        }
        return {
          id: collection.id,
          name: collection.name,
          defaultModeId: collection.defaultModeId,
          modes: collection.modes
        };
      }
      case "CREATE_VARIABLE": {
        const { collectionId, collectionName, name, type, value, scopes } = params;
        if (!collectionId || !name || !type) throw new Error("Missing required parameters for variable creation");
        if (scopes === void 0) {
          throw REFUSALS.VARIABLE_SCOPES_MISSING();
        }
        if (!collectionName) {
          throw REFUSALS.COLLECTION_NAME_MISSING();
        }
        let resolvedType;
        if (type === "FLOAT") resolvedType = "FLOAT";
        else if (type === "COLOR") resolvedType = "COLOR";
        else if (type === "STRING") resolvedType = "STRING";
        else if (type === "BOOLEAN") resolvedType = "BOOLEAN";
        else throw new Error(`Invalid variable type: ${type}`);
        const collection = await figma.variables.getVariableCollectionByIdAsync(collectionId);
        if (!collection) {
          throw new Error(`Collection not found: ${collectionId}`);
        }
        if (collection.name !== collectionName) {
          throw REFUSALS.COLLECTION_NAME_MISMATCH(collection.name, collectionName);
        }
        const variable = figma.variables.createVariable(name, collection, resolvedType);
        try {
          if (scopes !== void 0) {
            variable.scopes = scopes;
          }
          if (value !== void 0) {
            const defaultModeId = collection.defaultModeId;
            let parsedValue = value;
            if (resolvedType === "COLOR" && typeof value === "object") {
              parsedValue = {
                r: value.r || 0,
                g: value.g || 0,
                b: value.b || 0,
                a: value.a !== void 0 ? value.a : 1
              };
            }
            variable.setValueForMode(defaultModeId, parsedValue);
          }
        } catch (e) {
          try {
            variable.remove();
          } catch (e2) {
          }
          throw e;
        }
        return {
          id: variable.id,
          name: variable.name,
          key: variable.key,
          type: variable.resolvedType
        };
      }
      case "UPDATE_VARIABLE": {
        const { variableId, name, value, modeId, description, currentVariableName, scopes } = params;
        if (!variableId) throw new Error("Missing variableId for update");
        assertNonEmptyExplicitName(
          name,
          "name",
          "variable_manage UPDATE_VARIABLE",
          "Omit name to leave the variable's name unchanged."
        );
        if (!currentVariableName) {
          throw REFUSALS.VARIABLE_NAME_MISSING();
        }
        const variable = await figma.variables.getVariableByIdAsync(variableId);
        if (!variable) throw new Error(`Variable ${variableId} not found`);
        if (variable.name !== currentVariableName) {
          throw REFUSALS.VARIABLE_NAME_MISMATCH(variable.name, currentVariableName);
        }
        if (variable.remote) {
          throw new Error(`Operation Denied: '${variable.name}' is a remote library asset (style/variable/component) and is read-only in this file. Edit it in its source library.`);
        }
        if (value !== void 0) {
          if (!modeId) throw new Error("Missing modeId for setting variable value");
          const collection = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
          if (!collection) {
            throw new Error(`Collection not found for variable: ${variable.variableCollectionId}`);
          }
          const isValidMode = collection.modes.some((m) => m.modeId === modeId);
          if (!isValidMode) {
            throw new Error(`Invalid modeId: "${modeId}" is not a valid mode in collection "${collection.name}"`);
          }
          if (typeof value === "object" && value !== null && value.type === "VARIABLE_ALIAS") {
            const aliasTarget = await figma.variables.getVariableByIdAsync(value.id);
            if (!aliasTarget) {
              throw new Error(`Alias target variable not found: "${value.id}". Read a valid variable ID with variable_list and pass it back verbatim.`);
            }
          }
        }
        const before = { name: variable.name, description: variable.description };
        const applied = [];
        try {
          if (name) {
            variable.name = name;
            applied.push(`name (was "${before.name}")`);
          }
          if (description !== void 0) {
            variable.description = description;
            applied.push("description");
          }
          if (scopes !== void 0) {
            variable.scopes = scopes;
            applied.push("scopes");
          }
          if (value !== void 0) {
            if (typeof value === "object" && value.type === "VARIABLE_ALIAS") {
              variable.setValueForMode(modeId, {
                type: "VARIABLE_ALIAS",
                id: value.id
              });
            } else {
              variable.setValueForMode(modeId, value);
            }
          }
        } catch (e) {
          if (applied.length > 0) {
            throw withPartialDisclosure(e, `the variable's ${applied.join(", ")} had already been updated when the failure occurred.`, before);
          }
          throw e;
        }
        return {
          success: true,
          id: variable.id,
          name: variable.name,
          key: variable.key,
          type: variable.resolvedType,
          description: variable.description,
          updatedValue: value !== void 0
        };
      }
      default:
        throw new Error(`Unknown variable action: ${action}`);
    }
  }

  // figma_plugin/handlers/styleHandlers.ts
  async function createStyle(params) {
    const { type, name, description, properties, styleId, currentStyleName, bindVariables } = params;
    if (!type) {
      throw new Error("Missing required parameter: type is required.");
    }
    if (name === "") {
      const recovery = styleId === void 0 ? "Supply a non-empty name for the new style." : "Omit name to leave the style's name unchanged.";
      throw new Error(`Style name must not be empty. ${recovery}`);
    }
    if (styleId !== void 0) {
      if (!currentStyleName) {
        throw REFUSALS.STYLE_NAME_MISSING();
      }
    } else {
      if (!name) {
        throw new Error("Missing required parameter: name is required to create a style.");
      }
    }
    const resolvedVariables = {};
    if (bindVariables && typeof bindVariables === "object") {
      const entries = Object.entries(bindVariables);
      for (const [field, variableId] of entries) {
        if (variableId !== null) {
          const variable = await figma.variables.getVariableByIdAsync(variableId);
          if (!variable) {
            throw new Error(`Variable with ID "${variableId}" not found (for field "${field}").`);
          }
          resolvedVariables[field] = variable;
        } else {
          resolvedVariables[field] = null;
        }
      }
    }
    let style = null;
    if (styleId !== void 0) {
      style = await figma.getStyleByIdAsync(styleId);
      if (!style) {
        throw new Error(`Style with ID ${styleId} not found.`);
      }
      if (style.name !== currentStyleName) {
        throw REFUSALS.STYLE_NAME_MISMATCH(style.name, currentStyleName);
      }
      if (style.type !== type.toUpperCase()) {
        throw new Error(`Style parameter type ${type} does not match retrieved style type ${style.type}`);
      }
      if (style.remote) {
        throw new Error(`Operation Denied: '${style.name}' is a remote library asset (style/variable/component) and is read-only in this file. Edit it in its source library.`);
      }
    }
    if (style && type.toUpperCase() === "PAINT" && bindVariables && typeof bindVariables === "object" && Object.keys(bindVariables).length > 0) {
      const effectivePaints = properties && properties.paints !== void 0 ? properties.paints : style.paints;
      if (!effectivePaints || effectivePaints.length === 0) {
        throw new Error("Cannot bind/unbind variables on a paint style with no paints. Set paints first via properties.");
      }
    }
    if (type.toUpperCase() === "TEXT" && properties && style) {
      await figma.loadFontAsync(properties.fontName ? properties.fontName : style.fontName);
    }
    let isNew = false;
    if (!style) {
      isNew = true;
      switch (type.toUpperCase()) {
        case "TEXT":
          style = figma.createTextStyle();
          break;
        case "PAINT":
          style = figma.createPaintStyle();
          break;
        case "EFFECT":
          style = figma.createEffectStyle();
          break;
        case "GRID":
          style = figma.createGridStyle();
          break;
        default:
          throw new Error(`Unsupported style type: ${type}`);
      }
    }
    const before = isNew ? {} : { name: style.name, description: style.description };
    const applied = [];
    try {
      if (isNew && type.toUpperCase() === "TEXT" && properties) {
        await figma.loadFontAsync(properties.fontName ? properties.fontName : style.fontName);
      }
      if (isNew) {
        style.name = name;
      } else if (name !== void 0) {
        style.name = name;
        applied.push(`name (was "${before.name}")`);
      }
      if (description) {
        style.description = description;
        applied.push("description");
      }
      if (properties) {
        switch (type.toUpperCase()) {
          case "TEXT": {
            const s = style;
            if (properties.fontName) {
              s.fontName = properties.fontName;
              applied.push("fontName");
            }
            if (properties.fontSize) {
              s.fontSize = properties.fontSize;
              applied.push("fontSize");
            }
            if (properties.lineHeight) {
              s.lineHeight = properties.lineHeight;
              applied.push("lineHeight");
            }
            if (properties.letterSpacing) {
              s.letterSpacing = properties.letterSpacing;
              applied.push("letterSpacing");
            }
            if (properties.paragraphIndent) {
              s.paragraphIndent = properties.paragraphIndent;
              applied.push("paragraphIndent");
            }
            if (properties.paragraphSpacing) {
              s.paragraphSpacing = properties.paragraphSpacing;
              applied.push("paragraphSpacing");
            }
            if (properties.textCase) {
              s.textCase = properties.textCase;
              applied.push("textCase");
            }
            if (properties.textDecoration) {
              s.textDecoration = properties.textDecoration;
              applied.push("textDecoration");
            }
            break;
          }
          case "PAINT": {
            const s = style;
            if (properties.paints) {
              s.paints = properties.paints;
              applied.push("paints");
            }
            break;
          }
          case "EFFECT": {
            const s = style;
            if (properties.effects) {
              s.effects = normalizeEffects(properties.effects);
              applied.push("effects");
            }
            break;
          }
          case "GRID": {
            const s = style;
            if (properties.layoutGrids) {
              s.layoutGrids = properties.layoutGrids;
              applied.push("layoutGrids");
            }
            break;
          }
        }
      }
      const bindingEntries = Object.entries(resolvedVariables);
      if (bindingEntries.length > 0) {
        if (type.toUpperCase() === "PAINT") {
          const paintStyle = style;
          const paints = [...paintStyle.paints];
          if (paints.length === 0) {
            throw new Error("Cannot bind/unbind variables on a paint style with no paints. Set paints first via properties.");
          }
          for (const [field, variable] of bindingEntries) {
            paints[0] = figma.variables.setBoundVariableForPaint(paints[0], field, variable);
          }
          paintStyle.paints = paints;
          applied.push("variable bindings");
        } else {
          for (const [field, variable] of bindingEntries) {
            style.setBoundVariable(field, variable);
            applied.push(`variable binding "${field}"`);
          }
        }
      }
    } catch (e) {
      if (isNew) {
        try {
          style.remove();
        } catch (e2) {
        }
        throw e;
      }
      if (applied.length > 0) {
        throw withPartialDisclosure(e, `the style's ${applied.join(", ")} had already been updated when the failure occurred.`, before);
      }
      throw e;
    }
    return {
      id: style.id,
      name: style.name,
      type: style.type
    };
  }
  async function applyStyle(params) {
    const { nodeId, styleId, styleType } = params;
    if (!nodeId || !styleId || !styleType) {
      throw new Error("Missing required parameters: nodeId, styleId, and styleType are required.");
    }
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
      throw new Error(`Node with ID ${nodeId} not found.`);
    }
    switch (styleType.toUpperCase()) {
      case "TEXT":
        if (node.type !== "TEXT") throw new Error("Target node must be a Text node to apply specific text styles.");
        await node.setTextStyleIdAsync(styleId);
        break;
      case "FILL":
        if (!("fillStyleId" in node)) throw new Error("Target node does not support fill styles.");
        await node.setFillStyleIdAsync(styleId);
        break;
      case "STROKE":
        if (!("strokeStyleId" in node)) throw new Error("Target node does not support stroke styles.");
        await node.setStrokeStyleIdAsync(styleId);
        break;
      case "EFFECT":
        if (!("effectStyleId" in node)) throw new Error("Target node does not support effect styles.");
        await node.setEffectStyleIdAsync(styleId);
        break;
      case "GRID":
        if (!("gridStyleId" in node)) throw new Error("Target node does not support grid styles.");
        await node.setGridStyleIdAsync(styleId);
        break;
      default:
        throw new Error(`Unsupported style type target: ${styleType}`);
    }
    return {
      success: true,
      message: `Style ${styleId} applied to node ${nodeId}`
    };
  }
  async function deleteStyle(params) {
    const { styleId, styleName } = params || {};
    if (!styleId) {
      throw new Error("Missing styleId parameter");
    }
    const style = await figma.getStyleByIdAsync(styleId);
    if (!style) {
      throw new Error(`Style with ID ${styleId} not found.`);
    }
    if (!styleName || style.name !== styleName) {
      throw new Error("Operation Denied: styleName does not match name of styleId. Refresh context & recheck to ensure correct styleId is passed in.");
    }
    if (style.remote) {
      throw new Error(`Operation Denied: '${style.name}' is a remote library asset (style/variable/component) and is read-only in this file. Edit it in its source library.`);
    }
    style.remove();
    return {
      success: true,
      message: `Style ${styleId} ("${styleName}") successfully deleted.`
    };
  }

  // figma_plugin/handlers/vectorHandlers.ts
  async function createNodeFromSvg(params) {
    const { parentId, svg, name, x = 0, y = 0 } = params || {};
    if (!svg) {
      throw new Error("Missing required parameter: svg string.");
    }
    assertNonEmptyExplicitName(
      name,
      "name",
      "create_svg",
      "Omit name to use the default name."
    );
    const parentNode = await resolveAppendableParent(parentId, "create_svg");
    const node = figma.createNodeFromSvg(svg);
    try {
      parentNode.appendChild(node);
      if (name !== void 0) {
        node.name = name;
      }
      node.x = x;
      node.y = y;
      const result = {
        id: node.id,
        name: node.name,
        type: node.type,
        // D11: report where the node actually landed, so the caller can
        // confirm containment from the response instead of re-reading.
        parentId: node.parent ? node.parent.id : void 0
      };
      return result;
    } catch (error) {
      rethrowAfterCreatorCleanup(error, node, "create_svg", parentId);
    }
  }

  // figma_plugin/handlers/connectHandlers.ts
  async function getConnectPayload(pageLoads = createPageLoadCoordinator()) {
    try {
      const state2 = getPluginState();
      const basePayload = {
        allowEditNode: state2.allowEditNode,
        allowEditVariable: state2.allowEditVariable,
        allowEditStyle: state2.allowEditStyle,
        editableScopeType: state2.allowEditNode || "readonly",
        documentId: figma.root.id,
        documentName: figma.root.name
      };
      if (!state2.allowEditNode) {
        const pages = figma.root.children.map((page) => ({
          pageId: page.id,
          pageName: page.name
        }));
        return Object.assign({}, basePayload, {
          pageCount: figma.root.children.length,
          pages
        });
      }
      if (state2.scopeRootId) {
        const scopeNode = await figma.getNodeByIdAsync(state2.scopeRootId);
        if (!scopeNode) {
          return {
            errorCode: "SCOPE_DELETED",
            errorMessage: "The node previously set as the editable scope no longer exists. Disconnect the plugin and select a new editable scope via the 'Link to Selection' field."
          };
        }
        if (state2.allowEditNode === "page") {
          const loaded = await pageLoads.load(scopeNode);
          if (!loaded.ok) {
            return toConnectPayloadError(loaded.error);
          }
          const children = ("children" in scopeNode ? scopeNode.children : []).map((child) => ({
            id: child.id,
            name: child.name,
            type: child.type
          }));
          return Object.assign({}, basePayload, {
            pageCount: figma.root.children.length,
            pages: [{
              pageId: scopeNode.id,
              pageName: scopeNode.name,
              descendantCount: countDescendants(scopeNode),
              children
            }]
          });
        } else if (state2.allowEditNode === "node") {
          let children = [];
          if ("children" in scopeNode) {
            children = scopeNode.children.map((child) => ({
              id: child.id,
              name: child.name,
              type: child.type
            }));
          }
          return Object.assign({}, basePayload, {
            node: {
              nodeId: scopeNode.id,
              nodeName: scopeNode.name,
              type: scopeNode.type,
              path: buildPathArray(scopeNode),
              descendantCount: countDescendants(scopeNode),
              children
            }
          });
        }
      }
      return {
        errorCode: "SCOPE_INVALID",
        errorMessage: "The plugin reported an unrecognized editable scope state. Disconnect and reconnect the plugin to reset its scope."
      };
    } catch (e) {
      return {
        errorCode: UNKNOWN_ERROR,
        errorMessage: `An unexpected error occurred while joining the channel: ${e.message || String(e)}.`
      };
    }
  }

  // figma_plugin/utils/scopeLink.ts
  function parseNodeIdFromUrl(url) {
    if (typeof url !== "string") return null;
    const match = url.match(/node-id=([^&#]+)/);
    if (!match) return null;
    const raw = match[1];
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw.replace(/\+/g, " "));
    } catch (e) {
      decoded = raw;
    }
    const nodeId = decoded.trim();
    if (!nodeId) return null;
    return nodeId.replace(/-/g, ":");
  }

  // figma_plugin/src/main.ts
  var state = {
    serverPort: 3055,
    // Default port
    scopeRootId: null,
    allowEditNode: false,
    // false | "page" | "node"
    allowEditVariable: false,
    allowEditStyle: false
  };
  function getPluginState() {
    return state;
  }
  function formatScopeError2(errorMessage) {
    return formatScopeError(errorMessage, state.scopeRootId);
  }
  async function checkScopeAccess(nodeId) {
    if (!state.allowEditNode) return false;
    if (!state.scopeRootId) return false;
    const scopeNode = await figma.getNodeByIdAsync(state.scopeRootId);
    if (!scopeNode) {
      throw new Error(`${ERRORS.SCOPE_DELETED} (Missing Scope Node ID: ${state.scopeRootId})`);
    }
    let node = await figma.getNodeByIdAsync(nodeId);
    if (!node) return false;
    while (node) {
      if (node.id === state.scopeRootId) return true;
      node = node.parent;
    }
    return false;
  }
  function checkScopeAccessRef(node, scopeRootNode) {
    if (!state.allowEditNode) return false;
    let curr = node;
    while (curr) {
      if (curr.id === scopeRootNode.id) return true;
      curr = curr.parent;
    }
    return false;
  }
  async function verifyNodeName(nodeId, expectedName) {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) return false;
    if (expectedName === void 0 || expectedName === null) {
      return false;
    }
    return node.name === expectedName;
  }
  function assertNotScopeRoot(nodeId) {
    if (nodeId === state.scopeRootId) {
      throw new Error(`Operation Denied: This node is the current Editable Scope root; deleting/flattening/ungrouping/converting it would invalidate the scope for the rest of the session. Re-scope to a parent first, or ask the user to select a different Editable Scope.`);
    }
  }
  async function validateSingleNodeWrite(params, options) {
    if (!state.allowEditNode) throw new Error(ERRORS.READ_ONLY_MODE);
    if (!await checkScopeAccess(params ? params.nodeId : null)) throw new Error(formatScopeError2(ERRORS.OUTSIDE_SCOPE));
    if (!await verifyNodeName(params ? params.nodeId : null, params ? params.nodeName : null)) throw new Error(ERRORS.NAME_MISMATCH);
    const node = await figma.getNodeByIdAsync(params == null ? void 0 : params.nodeId);
    if (node) {
      if (options.checkScopeRoot) assertNotScopeRoot(node.id);
      if (options.checkLocked) assertNotLocked(node);
      if (options.instanceCheckVerb) assertNotInstanceInterior(node, options.instanceCheckVerb);
      if (options.checkRemoteAsset && "remote" in node && node.remote === true) {
        throw new Error(`Operation Denied: '${node.name}' is a remote library asset (style/variable/component) and is read-only in this file. Edit it in its source library.`);
      }
    }
  }
  async function validateParentWrite(params, options) {
    if (!state.allowEditNode) throw new Error(ERRORS.READ_ONLY_MODE);
    if (!await checkScopeAccess(params ? params.parentId : null)) throw new Error(formatScopeError2(ERRORS.PARENT_OUTSIDE_SCOPE));
    await verifyParentNameOrThrow(params ? params.parentId : null, params ? params.parentNodeName : null);
    const parent = await figma.getNodeByIdAsync(params == null ? void 0 : params.parentId);
    if (parent) {
      if (options.checkLocked) assertNotLocked(parent);
      if (options.instanceCheckVerb) assertNotInstanceParent(parent, options.instanceCheckVerb);
    }
  }
  async function verifyParentNameOrThrow(parentId, expectedParentName) {
    if (expectedParentName == null) throw REFUSALS.PARENT_NAME_MISSING();
    const node = await figma.getNodeByIdAsync(parentId);
    if (!node || node.name !== expectedParentName) {
      throw REFUSALS.PARENT_NAME_MISMATCH(node ? node.name : "(parent not found)", expectedParentName);
    }
  }
  function assertNoDuplicateTargets(items) {
    const seen = /* @__PURE__ */ new Set();
    for (const item of items) {
      if (!item || !item.nodeId) throw new Error("Missing nodeId parameter");
      const normalizedId = String(item.nodeId).replace(/-/g, ":");
      if (seen.has(normalizedId)) {
        throw new Error(`Operation Denied: Duplicate node ID detected: ${item.nodeId}. Batches must not contain duplicate targets.`);
      }
      seen.add(normalizedId);
    }
  }
  async function validateCloneWrite(params) {
    if (!state.allowEditNode) throw new Error(ERRORS.READ_ONLY_MODE);
    if (!params || !params.nodeId) throw new Error("Missing nodeId parameter");
    const source = await figma.getNodeByIdAsync(params.nodeId);
    if (!source) {
      throw new Error(`Node not found with ID: ${params.nodeId}`);
    }
    if (!await checkScopeAccess(source.id)) {
      throw new Error(formatScopeError2(ERRORS.CLONING_SOURCE_NODE_OUTSIDE_SCOPE));
    }
    if (!await verifyNodeName(source.id, params.nodeName)) {
      throw new Error(ERRORS.NAME_MISMATCH);
    }
    assertNotLocked(source);
    const sourceInstanceAncestor = findInstanceAncestor(source);
    if (sourceInstanceAncestor) {
      throw new Error(`Operation Denied: Cannot clone '${source.name}' because it is inside a component instance.`);
    }
    const parent = source.parent;
    if (!parent) {
      throw new Error(`node_clone: '${source.name}' has no parent and cannot be cloned.`);
    }
    if (!("appendChild" in parent)) {
      throw new Error(`node_clone: parent '${parent.name}' (type ${parent.type}) cannot accept cloned children.`);
    }
    if (!await checkScopeAccess(parent.id)) {
      throw new Error(formatScopeError2(ERRORS.PARENT_OUTSIDE_SCOPE));
    }
    assertNotLocked(parent);
    assertNotInstanceParent(parent, "appended to");
  }
  var PLUGIN_VERSION = true ? "2.3.3" : "unknown";
  figma.showUI(__html__, { width: 350, height: 450 });
  figma.ui.postMessage({ type: "plugin-version", version: PLUGIN_VERSION });
  figma.ui.onmessage = async (msg) => {
    switch (msg.type) {
      case "update-settings":
        updateSettings(msg);
        break;
      case "notify":
        notifyBestEffort(msg.message);
        break;
      case "close-plugin":
        figma.closePlugin();
        break;
      case "validate-scope-link":
        const nodeId = parseNodeIdFromUrl(msg.link);
        if (!nodeId) {
          figma.ui.postMessage({ type: "scope-validation-result", valid: false, reason: "Invalid Figma URL" });
          return;
        }
        const node = await figma.getNodeByIdAsync(nodeId);
        if (node) {
          figma.ui.postMessage({
            type: "scope-validation-result",
            valid: true,
            nodeName: node.name,
            nodeId: node.id,
            nodeType: node.type
          });
        } else {
          figma.ui.postMessage({ type: "scope-validation-result", valid: false, reason: "Node not found in current document" });
        }
        break;
      case "set-scope":
        if (msg.scopeNodeId) {
          state.scopeRootId = msg.scopeNodeId;
          state.allowEditNode = msg.scopeNodeType === "PAGE" ? "page" : "node";
          state.allowEditVariable = !!msg.allowEditVariable;
          state.allowEditStyle = !!msg.allowEditStyle;
          notifyBestEffort(`Scope locked to node: ${msg.scopeNodeId}`);
        } else {
          state.scopeRootId = null;
          state.allowEditNode = false;
          state.allowEditVariable = !!msg.allowEditVariable;
          state.allowEditStyle = !!msg.allowEditStyle;
          notifyBestEffort("Connected in Read-Only Mode for nodes");
        }
        figma.ui.postMessage({
          type: "scope-ready",
          requestId: msg.requestId,
          pluginVersion: PLUGIN_VERSION
        });
        break;
      case "execute-command":
        state.commandQueue = (state.commandQueue || Promise.resolve()).then(async () => {
          try {
            const result = await handleCommand(msg.command, msg.params);
            figma.ui.postMessage({
              type: "command-result",
              id: msg.id,
              result: sanitizeForPostMessage(result)
            });
          } catch (error) {
            figma.ui.postMessage({
              type: "command-error",
              id: msg.id,
              error: getStructuredError(error)
            });
          }
        });
        break;
    }
  };
  figma.on("run", ({ command }) => {
  });
  function updateSettings(settings) {
    if (settings.serverPort) {
      state.serverPort = settings.serverPort;
    }
    figma.clientStorage.setAsync("settings", {
      serverPort: state.serverPort
    });
  }
  async function handleCommand(command, params) {
    var _a, _b;
    switch (command) {
      case "get_connect_payload":
        return await getConnectPayload();
      case "node_set_fill":
        await validateSingleNodeWrite(params, { checkLocked: true });
        return await setFillColor(params);
      case "node_set_stroke":
        await validateSingleNodeWrite(params, { checkLocked: true });
        return await setStroke(params);
      case "node_set_corner_radius":
        await validateSingleNodeWrite(params, { checkLocked: true });
        return await setCornerRadius(params);
      case "node_set_auto_layout":
        await validateSingleNodeWrite(params, { checkLocked: true });
        return await setAutoLayout(params);
      case "node_bind_variable":
        await validateSingleNodeWrite(params, { checkLocked: true });
        return await setBoundVariable(params);
      case "node_rename":
        await validateSingleNodeWrite(params, { checkLocked: true });
        return await setNodeName(params);
      case "node_group":
        if (!state.allowEditNode) throw new Error(ERRORS.READ_ONLY_MODE);
        if (!params || !params.nodes || !Array.isArray(params.nodes)) throw new Error("Missing or Invalid nodes parameter");
        if (params.nodes.length > 0) {
          const firstNode = await figma.getNodeByIdAsync(params.nodes[0].nodeId);
          if (!firstNode) throw new Error(`Node ${params.nodes[0].nodeId} not found`);
          const parentId = (_a = firstNode.parent) == null ? void 0 : _a.id;
          for (const item of params.nodes) {
            if (!await checkScopeAccess(item.nodeId)) throw new Error(formatScopeError2(`Operation denied: Node ${item.nodeId} outside editable scope`));
            if (!await verifyNodeName(item.nodeId, item.nodeName)) throw new Error(ERRORS.NAME_MISMATCH);
            const node = await figma.getNodeByIdAsync(item.nodeId);
            if (node) {
              assertNotLocked(node);
              assertNotInstanceInterior(node, "grouped");
            }
            if (((_b = node.parent) == null ? void 0 : _b.id) !== parentId) {
              throw new Error(`Invalid Grouping: All nodes must share the same parent. Node "${node.name}" is under a different parent than "${firstNode.name}". Use 'insert_child' to reparent them first.`);
            }
          }
        }
        return await groupNodes(params);
      case "node_ungroup":
        await validateSingleNodeWrite(params, { checkScopeRoot: true, checkLocked: true, instanceCheckVerb: "ungrouped" });
        return await ungroupNodes(params);
      case "node_flatten":
        await validateSingleNodeWrite(params, { checkScopeRoot: true, checkLocked: true, instanceCheckVerb: "flattened" });
        return await flattenNode(params);
      case "node_insert_child":
        if (!state.allowEditNode) throw new Error(ERRORS.READ_ONLY_MODE);
        await validateParentWrite(params, { checkLocked: true, instanceCheckVerb: "inserted into" });
        if (!await checkScopeAccess(params ? params.childId : null)) throw new Error(formatScopeError2(ERRORS.OUTSIDE_SCOPE));
        if (!await verifyNodeName(params ? params.childId : null, params ? params.childNodeName : null)) throw new Error(ERRORS.NAME_MISMATCH);
        const childNode = await figma.getNodeByIdAsync(params == null ? void 0 : params.childId);
        if (childNode) {
          assertNotLocked(childNode);
          assertNotInstanceInterior(childNode, "reparented");
        }
        return await insertChild(params);
      case "node_transform":
        await validateSingleNodeWrite(params, { checkLocked: true });
        return await transformNode(params);
      case "node_clone":
        await validateCloneWrite(params);
        return await cloneNode(params);
      case "create_shape":
        await validateParentWrite(params, { checkLocked: true, instanceCheckVerb: "appended to" });
        return await createShape(params);
      case "create_frame":
        await validateParentWrite(params, { checkLocked: true, instanceCheckVerb: "appended to" });
        return await createFrame(params);
      case "create_text":
        await validateParentWrite(params, { checkLocked: true, instanceCheckVerb: "appended to" });
        return await createText(params);
      case "create_instance":
        await validateParentWrite(params, { checkLocked: true, instanceCheckVerb: "appended to" });
        return await createComponentInstance(params);
      case "text_set_content":
        if (!state.allowEditNode) throw new Error(ERRORS.READ_ONLY_MODE);
        if (!params || !params.text || !Array.isArray(params.text)) throw new Error("Missing or Invalid text parameter");
        if (!state.scopeRootId) throw new Error(formatScopeError2(ERRORS.OUTSIDE_SCOPE));
        const textScopeRoot = await figma.getNodeByIdAsync(state.scopeRootId);
        if (!textScopeRoot) {
          throw new Error(`${ERRORS.SCOPE_DELETED} (Missing Scope Node ID: ${state.scopeRootId})`);
        }
        assertNoDuplicateTargets(params.text);
        for (const item of params.text) {
          const node = await figma.getNodeByIdAsync(item.nodeId);
          if (!node) {
            throw new Error(`Node ${item.nodeId} not found`);
          }
          if (!checkScopeAccessRef(node, textScopeRoot)) {
            throw new Error(formatScopeError2(ERRORS.OUTSIDE_SCOPE));
          }
          if (node.name !== item.nodeName) {
            throw new Error(ERRORS.NAME_MISMATCH);
          }
          assertNotLocked(node);
          if (node.type !== "TEXT") {
            throw new Error(`Node is not a text node: ${node.id} (type: ${node.type})`);
          }
        }
        return await setMultipleTextContents(params);
      case "text_set_style":
        await validateSingleNodeWrite(params, { checkLocked: true });
        return await setTextStyle(params);
      case "annotation_set":
        if (!state.allowEditNode) throw new Error(ERRORS.READ_ONLY_MODE);
        if (!params || !params.annotations || !Array.isArray(params.annotations)) throw new Error("Missing or Invalid annotations parameter");
        if (!state.scopeRootId) throw new Error(formatScopeError2(ERRORS.OUTSIDE_SCOPE));
        const annScopeRoot = await figma.getNodeByIdAsync(state.scopeRootId);
        if (!annScopeRoot) {
          throw new Error(`${ERRORS.SCOPE_DELETED} (Missing Scope Node ID: ${state.scopeRootId})`);
        }
        for (const item of params.annotations) {
          const node = await figma.getNodeByIdAsync(item.nodeId);
          if (!node) {
            throw new Error(`Node ${item.nodeId} not found`);
          }
          if (!checkScopeAccessRef(node, annScopeRoot)) {
            throw new Error(formatScopeError2(ERRORS.OUTSIDE_SCOPE));
          }
          if (node.name !== item.nodeName) {
            throw new Error(ERRORS.NAME_MISMATCH);
          }
          assertNotLocked(node);
          if (!("annotations" in node)) {
            throw new Error(`Node type ${node.type} does not support annotations`);
          }
        }
        return await setMultipleAnnotations(params);
      case "node_delete":
        if (!state.allowEditNode) throw new Error(ERRORS.READ_ONLY_MODE);
        if (!params || !params.nodes || !Array.isArray(params.nodes)) throw new Error("Missing or Invalid nodes parameter");
        if (!state.scopeRootId) throw new Error(formatScopeError2(ERRORS.OUTSIDE_SCOPE));
        const deleteScopeRoot = await figma.getNodeByIdAsync(state.scopeRootId);
        if (!deleteScopeRoot) {
          throw new Error(`${ERRORS.SCOPE_DELETED} (Missing Scope Node ID: ${state.scopeRootId})`);
        }
        assertNoDuplicateTargets(params.nodes);
        const nodeIdsToDelete = [];
        for (const item of params.nodes) {
          const node = await figma.getNodeByIdAsync(item.nodeId);
          if (!node) {
            throw new Error(`Node ${item.nodeId} not found`);
          }
          if (!checkScopeAccessRef(node, deleteScopeRoot)) {
            throw new Error(formatScopeError2(ERRORS.OUTSIDE_SCOPE));
          }
          if (node.name !== item.nodeName) {
            throw new Error(ERRORS.NAME_MISMATCH);
          }
          assertNotScopeRoot(node.id);
          assertNotLocked(node);
          assertNotInstanceInterior(node, "deleted");
          nodeIdsToDelete.push(item.nodeId);
        }
        return await deleteMultipleNodes({ nodeIds: nodeIdsToDelete });
      case "instance_set_overrides":
        if (!state.allowEditNode) throw new Error(ERRORS.READ_ONLY_MODE);
        if (params && params.targetNodes) {
          if (!Array.isArray(params.targetNodes)) {
            throw new Error("targetNodes must be an array");
          }
          if (!state.scopeRootId) throw new Error(formatScopeError2(ERRORS.OUTSIDE_SCOPE));
          const instScopeRoot = await figma.getNodeByIdAsync(state.scopeRootId);
          if (!instScopeRoot) {
            throw new Error(`${ERRORS.SCOPE_DELETED} (Missing Scope Node ID: ${state.scopeRootId})`);
          }
          if (!params.sourceInstanceId) {
            throw new Error(ERRORS.MISSING_SOURCE_INSTANCE_ID);
          }
          const sourceNode = await figma.getNodeByIdAsync(params.sourceInstanceId);
          if (!sourceNode) {
            throw new Error(`Node ${params.sourceInstanceId} not found`);
          }
          if (sourceNode.type !== "INSTANCE") {
            throw new Error(`Source node is not an instance: ${sourceNode.id} (type: ${sourceNode.type})`);
          }
          assertNoDuplicateTargets(params.targetNodes);
          for (const item of params.targetNodes) {
            const node = await figma.getNodeByIdAsync(item.nodeId);
            if (!node) {
              throw new Error(`Node ${item.nodeId} not found`);
            }
            if (!checkScopeAccessRef(node, instScopeRoot)) {
              throw new Error(formatScopeError2(`Operation denied: Target instance ${item.nodeId} outside editable scope`));
            }
            if (node.name !== item.nodeName) {
              throw new Error(ERRORS.NAME_MISMATCH);
            }
            assertNotLocked(node);
            if (node.type !== "INSTANCE") {
              throw new Error(`Target is not an instance node: ${node.id} (type: ${node.type})`);
            }
          }
          let sourceInstanceData = await getSourceInstanceData(params.sourceInstanceId);
          if (!sourceInstanceData.success) {
            notifyBestEffort(sourceInstanceData.message || "Failed to resolve source instance");
            throw new Error(sourceInstanceData.message || "Failed to resolve source instance");
          }
          const targetNodesResult = await getValidTargetInstances(params.targetNodes, instScopeRoot);
          if (!targetNodesResult.success) {
            notifyBestEffort(targetNodesResult.message);
            throw new Error(targetNodesResult.message);
          }
          return await setInstanceOverrides(
            targetNodesResult.targetInstances,
            sourceInstanceData,
            { items: params.targetNodes, scopeRoot: instScopeRoot }
          );
        }
        throw new Error(ERRORS.MISSING_TARGET_NODE_IDS);
      case "instance_set_property":
        await validateSingleNodeWrite(params, { checkLocked: true });
        return await setComponentInstanceProperty(params);
      case "component_manage_property":
        await validateSingleNodeWrite(params, { checkLocked: true, checkRemoteAsset: true });
        return await manageComponentProperty(params);
      case "component_delete_property":
        await validateSingleNodeWrite(params, { checkLocked: true, checkRemoteAsset: true });
        return await deleteComponentProperty(params);
      case "page_info":
        return await getPagesInfo(params);
      case "node_info":
        const effectiveNodeIds = params && params.nodeIds && Array.isArray(params.nodeIds) && params.nodeIds.length > 0 ? params.nodeIds : state.scopeRootId ? [state.scopeRootId] : [];
        if (effectiveNodeIds.length === 0 && !state.allowEditNode) {
          return { nodes: [] };
        }
        return await getNodesInfo(Object.assign({}, params, {
          nodeIds: effectiveNodeIds,
          commandId: params && params.commandId ? params.commandId : generateCommandId()
        }));
      case "style_list":
        return await getStyles();
      case "component_list":
        return await getComponents(params);
      case "node_export_visual":
        return await exportNodeAsImage(params);
      case "annotation_list":
        return await getAnnotations(params);
      case "instance_get_overrides":
        if (!params || !params.instanceNodeId) {
          throw new Error("Missing instanceNodeId parameter");
        }
        const instanceNode = await figma.getNodeByIdAsync(params.instanceNodeId);
        if (!instanceNode) {
          throw new Error(`Instance node not found with ID: ${params.instanceNodeId}`);
        }
        return await getInstanceOverrides(instanceNode);
      case "reaction_list":
        if (!params || !params.nodeIds || !Array.isArray(params.nodeIds)) {
          throw new Error(ERRORS.MISSING_NODE_IDS);
        }
        return await getReactions(params.nodeIds);
      case "reaction_update":
        await validateSingleNodeWrite(params, { checkLocked: true });
        return await updateReactions(params);
      case "view_navigate":
        return await viewNavigate(params);
      case "variable_list":
        return await getVariables(params);
      case "variable_manage":
        if (!state.allowEditVariable) throw new Error(ERRORS.VARIABLE_EDITS_DISABLED);
        return await handleVariableRequest(params);
      case "variable_delete":
        if (!state.allowEditVariable) throw new Error(ERRORS.VARIABLE_EDITS_DISABLED);
        return await deleteVariables(params);
      case "style_manage":
        if (!state.allowEditStyle) throw new Error(ERRORS.STYLE_EDITS_DISABLED);
        return await createStyle(params);
      case "style_delete":
        if (!state.allowEditStyle) throw new Error(ERRORS.STYLE_EDITS_DISABLED);
        return await deleteStyle(params);
      case "node_apply_style":
        await validateSingleNodeWrite(params, { checkLocked: true });
        return await applyStyle(params);
      case "create_component":
        await validateSingleNodeWrite(params, {
          checkScopeRoot: true,
          checkLocked: true,
          instanceCheckVerb: "converted to a component"
        });
        return await createComponent(params);
      case "create_component_set": {
        if (!state.allowEditNode) throw new Error(ERRORS.READ_ONLY_MODE);
        if (!state.scopeRootId) throw new Error(formatScopeError2(ERRORS.OUTSIDE_SCOPE));
        const compSetScopeRoot = await figma.getNodeByIdAsync(state.scopeRootId);
        if (!compSetScopeRoot) {
          throw new Error(`${ERRORS.SCOPE_DELETED} (Missing Scope Node ID: ${state.scopeRootId})`);
        }
        const plan = await validateCreateComponentSetPlan(params, compSetScopeRoot);
        return await createComponentSet(plan);
      }
      case "create_svg":
        await validateParentWrite(params, { checkLocked: true, instanceCheckVerb: "appended to" });
        return await createNodeFromSvg(params);
      case "node_set_effects":
        await validateSingleNodeWrite(params, { checkLocked: true });
        return await setEffects(params);
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  }
})();
