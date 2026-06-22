"use strict";
(() => {
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
    figma.ui.postMessage(update);
    await new Promise((r) => setTimeout(r, 0));
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

  // figma_plugin/handlers/nodeReaders.ts
  async function getPagesInfo(params) {
    var _a;
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
        pages: pages2
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
      const node = await figma.getNodeByIdAsync(id);
      if (node && node.type === "PAGE" && ((_a = node.parent) == null ? void 0 : _a.id) === figma.root.id) {
        await node.loadAsync();
        pages.push({
          pageId: node.id,
          pageName: node.name,
          descendantCount: countDescendants(node),
          // @ts-ignore
          children: node.children.map((child) => ({
            id: child.id,
            name: child.name,
            type: child.type
          }))
        });
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
      missingPageIds
    };
  }
  async function getNodesInfoParallel(uniqueIds, properties, filter, maxDepth, concurrencyLimit, commandId, exportCache, stats) {
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
        try {
          const node = await figma.getNodeByIdAsync(id);
          if (!node) {
            results[index] = { missing: true, id };
          } else {
            const mappedSubtree = await mapNodeRecursive(
              node,
              0,
              maxDepth,
              properties,
              filter,
              exportCache,
              stats
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
            entry.descendantCount = countDescendants(node);
            results[index] = entry;
          }
        } catch (error) {
          console.error(`[getNodesInfoParallel] Error processing node ${id}: ${error.message}`);
          results[index] = { missing: true, id };
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
    for (let i = 0; i < uniqueIds.length; i++) {
      const res = results[i];
      if (res && res.missing) {
        missingNodeIds.push(res.id);
      } else if (res) {
        nodes.push(res);
      }
    }
    return { nodes, missingNodeIds };
  }
  async function getNodesInfo(params) {
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
      const { nodes, missingNodeIds } = await getNodesInfoParallel(
        uniqueIds,
        properties,
        filter,
        maxDepth,
        limit,
        commandId,
        exportCache,
        stats
      );
      if (commandId) {
        await sendProgressUpdate(
          commandId,
          "get_nodes_info",
          "completed",
          100,
          uniqueIds.length,
          uniqueIds.length,
          `Successfully processed ${nodes.length} nodes (${missingNodeIds.length} missing)`
        );
      }
      return {
        nodes,
        missingNodeIds: missingNodeIds.length > 0 ? missingNodeIds : void 0
      };
    } catch (error) {
      console.error(`[getNodesInfo] Error: ${error.message}`);
      throw error;
    }
  }
  async function mapNodeRecursive(node, depth, maxDepth, requestedProps, filter, exportCache, progressTracker) {
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
        const mappedChild = await mapNodeRecursive(
          child,
          depth + 1,
          maxDepth,
          requestedProps,
          filter,
          exportCache,
          progressTracker
        );
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
    if (!shouldRecurse) {
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
  var setCharacters = async (node, characters, options) => {
    const fallbackFont = options && options.fallbackFont || {
      family: "Inter",
      style: "Regular"
    };
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
        } else if (options && options.smartStrategy === "strict") {
          return setCharactersWithStrictMatchFont(node, characters, fallbackFont);
        } else if (options && options.smartStrategy === "experimental") {
          return setCharactersWithSmartMatchFont(node, characters, fallbackFont);
        } else {
          const firstCharFont = node.getRangeFontName(0, 1);
          await figma.loadFontAsync(firstCharFont);
          node.fontName = firstCharFont;
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
    }
    try {
      node.characters = characters;
      return true;
    } catch (err) {
      console.warn(`Failed to set characters. Skipped.`, err);
      return false;
    }
  };
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

  // figma_plugin/handlers/nodeCreators.ts
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
    if (!parentId) {
      throw new Error("Missing parentId parameter");
    }
    const parent = await figma.getNodeByIdAsync(parentId);
    if (!parent) {
      throw new Error(`Parent node not found with ID: ${parentId}`);
    }
    if (!("appendChild" in parent)) {
      throw new Error(`Parent node does not support children: ${parentId}`);
    }
    let node;
    switch (upperType) {
      case "RECTANGLE":
        node = figma.createRectangle();
        break;
      case "ELLIPSE":
        node = figma.createEllipse();
        if (arcData) {
          node.arcData = {
            startingAngle: (_a = arcData.startingAngle) != null ? _a : 0,
            endingAngle: (_b = arcData.endingAngle) != null ? _b : Math.PI * 2,
            innerRadius: (_c = arcData.innerRadius) != null ? _c : 0
          };
        }
        break;
      case "POLYGON":
        node = figma.createPolygon();
        if (pointCount !== void 0) {
          if (pointCount < 3) {
            throw new Error("Polygons require pointCount >= 3");
          }
          node.pointCount = pointCount;
        }
        break;
      case "STAR":
        node = figma.createStar();
        if (pointCount !== void 0) {
          if (pointCount < 3) {
            throw new Error("Stars require pointCount >= 3");
          }
          node.pointCount = pointCount;
        }
        if (innerRadius !== void 0) {
          node.innerRadius = innerRadius;
        }
        break;
      default:
        throw new Error(`Unsupported shape type: ${type}`);
    }
    node.x = x;
    node.y = y;
    node.resize(width, height);
    if (name) {
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
    parent.appendChild(node);
    if (useAbsolutePosition && parentId) {
      if (parent && (parent.layoutMode === "HORIZONTAL" || parent.layoutMode === "VERTICAL")) {
        node.layoutPositioning = "ABSOLUTE";
        node.x = x;
        node.y = y;
      }
    }
    return {
      id: node.id,
      name: node.name,
      type: node.type,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      parentId: node.parent ? node.parent.id : void 0
    };
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
    const frame = figma.createFrame();
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
    if (!parentId) {
      throw new Error("Missing parentId parameter");
    }
    const parentNode = await figma.getNodeByIdAsync(parentId);
    if (!parentNode) {
      throw new Error(`Parent node not found with ID: ${parentId}`);
    }
    if (!("appendChild" in parentNode)) {
      throw new Error(`Parent node does not support children: ${parentId}`);
    }
    parentNode.appendChild(frame);
    return {
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
        return "Regular";
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
      name = "",
      parentId
    } = params || {};
    const textNode = figma.createText();
    textNode.x = x;
    textNode.y = y;
    textNode.name = name || text;
    try {
      await figma.loadFontAsync({
        family: "Inter",
        style: getFontStyle(fontWeight)
      });
      textNode.fontName = { family: "Inter", style: getFontStyle(fontWeight) };
      textNode.fontSize = parseInt(fontSize);
    } catch (error) {
      console.error("Error setting font size", error);
    }
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
    if (!parentId) {
      throw new Error("Missing parentId parameter");
    }
    const parentNode = await figma.getNodeByIdAsync(parentId);
    if (!parentNode) {
      throw new Error(`Parent node not found with ID: ${parentId}`);
    }
    if (!("appendChild" in parentNode)) {
      throw new Error(`Parent node does not support children: ${parentId}`);
    }
    parentNode.appendChild(textNode);
    return {
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
    const clone = node.clone();
    if (x !== void 0 && y !== void 0) {
      if (!("x" in clone) || !("y" in clone)) {
        throw new Error(`Cloned node does not support position: ${nodeId}`);
      }
      clone.x = x;
      clone.y = y;
    }
    if (node.parent) {
      node.parent.appendChild(clone);
    } else {
      throw new Error(`Cloned node ${nodeId} has no parent and cannot be cloned`);
    }
    return {
      id: clone.id,
      name: clone.name,
      x: "x" in clone ? clone.x : void 0,
      y: "y" in clone ? clone.y : void 0,
      width: "width" in clone ? clone.width : void 0,
      height: "height" in clone ? clone.height : void 0
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
      { totalNodes: nodeIds.length }
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
        totalNodes: nodeIds.length,
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
          successCount,
          failureCount
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
              error: `Node not found: ${nodeId}`
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
          console.error(`Error deleting node ${nodeId}: ${error.message}`);
          return {
            success: false,
            nodeId,
            error: error.message
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
          successCount,
          failureCount,
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
        totalNodes: nodeIds.length,
        nodesDeleted: successCount,
        nodesFailed: failureCount,
        completedInChunks: chunks.length,
        results
      }
    );
    return {
      success: successCount > 0,
      nodesDeleted: successCount,
      nodesFailed: failureCount,
      totalNodes: nodeIds.length,
      results,
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
    if (name) group.name = name;
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
    const flattened = figma.flatten([node]);
    return { id: flattened.id, name: flattened.name, type: flattened.type };
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
    let base64 = b64.replace(/^data:.*?;base64,/, "");
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
    const { nodeId, color, image } = params || {};
    if (!nodeId) {
      throw new Error("Missing nodeId parameter");
    }
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
      throw new Error(`Node not found with ID: ${nodeId}`);
    }
    if (!("fills" in node)) {
      throw new Error(`Node does not support fills: ${nodeId}`);
    }
    if (color && image) {
      throw new Error("node_set_fill: provide either a solid color (r,g,b[,a]) or an image, not both/neither.");
    }
    if (!color && !image) {
      throw new Error("node_set_fill: provide either a solid color (r,g,b[,a]) or an image, not both/neither.");
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
    const processedEffects = effects.map((effect) => {
      if (!effect.type) {
        throw new Error("Each effect must have a type (DROP_SHADOW, INNER_SHADOW, LAYER_BLUR, BACKGROUND_BLUR)");
      }
      const baseEffect = {
        type: effect.type,
        visible: effect.visible !== void 0 ? effect.visible : true
      };
      if (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW") {
        return Object.assign({}, baseEffect, {
          color: effect.color || { r: 0, g: 0, b: 0, a: 0.25 },
          offset: effect.offset || { x: 0, y: 4 },
          radius: effect.radius !== void 0 ? effect.radius : 4,
          spread: effect.spread !== void 0 ? effect.spread : 0,
          blendMode: effect.blendMode || "NORMAL",
          showShadowBehindNode: effect.showShadowBehindNode !== void 0 ? effect.showShadowBehindNode : false
        });
      } else if (effect.type === "LAYER_BLUR" || effect.type === "BACKGROUND_BLUR") {
        return Object.assign({}, baseEffect, {
          radius: effect.radius !== void 0 ? effect.radius : 4
        });
      }
      return effect;
    });
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
  async function getComponents(params) {
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
      const pageNode = await figma.getNodeByIdAsync(pageId);
      if (!pageNode) {
        throw new Error(`pageId with ID ${pageId} not found`);
      }
      if (pageNode.type !== "PAGE") {
        throw new Error("pageId does not resolve to a PAGE");
      }
      await pageNode.loadAsync();
      const components = pageNode.findAllWithCriteria({
        types: ["COMPONENT", "COMPONENT_SET"]
      });
      allComponents.push(...components);
    } else {
      const pages = figma.root.children;
      for (const [index, page] of pages.entries()) {
        await page.loadAsync();
        const components = page.findAllWithCriteria({
          types: ["COMPONENT", "COMPONENT_SET"]
        });
        allComponents.push(...components);
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
      components: mapped
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
  async function createComponentInstance(params) {
    const { componentId, x = 0, y = 0, parentId, componentKey } = params || {};
    if (!componentId && !componentKey) {
      throw new Error("Missing componentId or componentKey parameter");
    }
    try {
      let component;
      if (componentId) {
        const node = await figma.getNodeByIdAsync(componentId);
        if (!node) {
          throw new Error(`Component node not found with ID: ${componentId}`);
        }
        if (node.type !== "COMPONENT" && node.type !== "COMPONENT_SET") {
          throw new Error(`Node ${componentId} is not a COMPONENT (got ${node.type})`);
        }
        component = node;
      } else {
        component = await figma.importComponentByKeyAsync(componentKey);
      }
      const instance = component.createInstance();
      if (!parentId) {
        throw new Error("Missing parentId parameter");
      }
      const parent = await figma.getNodeByIdAsync(parentId);
      if (!parent) {
        throw new Error(`Parent node not found with ID: ${parentId}`);
      }
      if (!("appendChild" in parent)) {
        throw new Error(`Parent node does not support children: ${parentId}`);
      }
      parent.appendChild(instance);
      instance.x = x;
      instance.y = y;
      return {
        id: instance.id,
        name: instance.name,
        x: instance.x,
        y: instance.y,
        width: instance.width,
        height: instance.height,
        // @ts-ignore
        componentId: instance.componentId
      };
    } catch (error) {
      throw new Error(`Error creating component instance: ${(error == null ? void 0 : error.message) || String(error)}`);
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
  async function getValidTargetInstances(targetNodeIds) {
    let targetInstances = [];
    if (Array.isArray(targetNodeIds)) {
      if (targetNodeIds.length === 0) {
        return { success: false, message: "No instances provided" };
      }
      for (const targetNodeId of targetNodeIds) {
        const targetNode = await figma.getNodeByIdAsync(targetNodeId);
        if (targetNode && targetNode.type === "INSTANCE") {
          targetInstances.push(targetNode);
        }
      }
      if (targetInstances.length === 0) {
        return { success: false, message: "No valid instances provided" };
      }
    } else {
      return { success: false, message: "Invalid target node IDs provided" };
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
  async function setInstanceOverrides(targetInstances, sourceResult) {
    try {
      const { sourceInstance, mainComponent, overrides } = sourceResult;
      console.log(`Processing ${targetInstances.length} instances with ${overrides.length} overrides`);
      console.log(`Source instance: ${sourceInstance.id}, Main component: ${mainComponent.id}`);
      console.log(`Overrides:`, overrides);
      const results = [];
      let totalAppliedCount = 0;
      let successCount = 0;
      let failureCount = 0;
      for (const targetInstance of targetInstances) {
        let appliedCount = 0;
        let hasFailure = false;
        let failureMsg = "";
        try {
          try {
            targetInstance.swapComponent(mainComponent);
            console.log(`Swapped component for instance "${targetInstance.name}"`);
          } catch (error) {
            hasFailure = true;
            failureMsg = `Swap component error: ${error.message}`;
          }
          if (!hasFailure) {
            for (const override of overrides) {
              if (!override.id || !override.overriddenFields || override.overriddenFields.length === 0) {
                continue;
              }
              const overrideNodeId = override.id.replace(sourceInstance.id, targetInstance.id);
              const overrideNode = await figma.getNodeByIdAsync(overrideNodeId);
              if (!overrideNode) {
                continue;
              }
              const sourceNode = await figma.getNodeByIdAsync(override.id);
              if (!sourceNode) {
                continue;
              }
              for (const field of override.overriddenFields) {
                try {
                  if (field === "componentProperties") {
                    if (sourceNode.componentProperties && overrideNode.componentProperties) {
                      const properties = {};
                      for (const key in sourceNode.componentProperties) {
                        properties[key] = sourceNode.componentProperties[key].value;
                      }
                      overrideNode.setProperties(properties);
                    }
                  } else if (field === "characters" && overrideNode.type === "TEXT") {
                    await figma.loadFontAsync(overrideNode.fontName);
                    overrideNode.characters = sourceNode.characters;
                  } else if (field in overrideNode) {
                    overrideNode[field] = sourceNode[field];
                  }
                } catch (fieldError) {
                  hasFailure = true;
                  failureMsg = `Field ${field} error: ${fieldError.message}`;
                  break;
                }
              }
              if (hasFailure) {
                break;
              }
              appliedCount++;
            }
          }
        } catch (instanceError) {
          hasFailure = true;
          failureMsg = instanceError.message;
        }
        if (hasFailure) {
          failureCount++;
          results.push({
            success: false,
            instanceId: targetInstance.id,
            instanceName: targetInstance.name,
            message: `Error: ${failureMsg}`
          });
          break;
        } else {
          successCount++;
          totalAppliedCount += appliedCount;
          results.push({
            success: true,
            instanceId: targetInstance.id,
            instanceName: targetInstance.name,
            appliedCount
          });
        }
      }
      if (successCount > 0 && failureCount === 0) {
        const message = `Applied ${totalAppliedCount} overrides to ${successCount} instances`;
        figma.notify(message);
        return {
          success: true,
          message,
          totalCount: totalAppliedCount,
          results
        };
      } else {
        const message = failureCount > 0 ? `Failed to apply overrides: ${results[results.length - 1].message}` : "No overrides applied to any instance";
        figma.notify(message);
        return { success: false, message, results };
      }
    } catch (error) {
      console.error("Error in setInstanceOverrides:", error);
      const message = `Error: ${error.message}`;
      figma.notify(message);
      return { success: false, message };
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
    try {
      const component = figma.createComponent();
      component.name = node.name;
      component.resize(node.width, node.height);
      if (node.parent) {
        const index = node.parent.children.indexOf(node);
        node.parent.insertChild(index, component);
        component.x = node.x;
        component.y = node.y;
      }
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
      const childrenToMove = [...node.children];
      for (const child of childrenToMove) {
        component.appendChild(child);
      }
      node.remove();
      return {
        id: component.id,
        name: component.name,
        type: "COMPONENT"
      };
    } catch (error) {
      throw new Error(`Error creating component: ${error.message}`);
    }
  }
  async function createComponentSet(params) {
    const { components, properties, componentSetName, parentId } = params;
    if (!components || components.length === 0) {
      throw new Error("Components array is empty");
    }
    if (!properties || properties.length === 0) {
      throw new Error("Properties array is empty");
    }
    const figmaComponents = [];
    const seenVariants = /* @__PURE__ */ new Map();
    for (const compData of components) {
      const component = await figma.getNodeByIdAsync(compData.nodeId);
      if (!component || component.type !== "COMPONENT") {
        throw new Error(`Node ${compData.nodeId} is not a valid component`);
      }
      if (compData.propertyValues.length !== properties.length) {
        throw new Error(`Property values count mismatch for component ${component.name}`);
      }
      const nameParts = properties.map((prop, index) => `${prop}=${compData.propertyValues[index]}`);
      const variantName = nameParts.join(", ");
      if (seenVariants.has(variantName)) {
        throw new Error(`Operation Denied: Duplicate variant combination '${variantName}' across components '${seenVariants.get(variantName)}' and '${component.name}'. Each component in a set must have a unique property-value combination.`);
      }
      seenVariants.set(variantName, component.name);
      component.name = variantName;
      figmaComponents.push(component);
    }
    const containingPage = getContainingPageNode(figmaComponents[0]);
    if (!containingPage) {
      throw new Error("First component is not on a page (detached)");
    }
    const componentSet = figma.combineAsVariants(figmaComponents, containingPage);
    if (componentSetName) {
      componentSet.name = componentSetName;
    }
    if (parentId) {
      const parent = await figma.getNodeByIdAsync(parentId);
      if (parent) {
        parent.appendChild(componentSet);
      }
    }
    return {
      id: componentSet.id,
      name: componentSet.name,
      type: "COMPONENT_SET",
      childCount: componentSet.children.length,
      variantProperties: componentSet.variantGroupProperties
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
    if (!nodeId || !action || !propertyName) {
      throw new Error("Missing nodeId, action, or propertyName parameter");
    }
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

  // figma_plugin/handlers/connectorHandlers.ts
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
          filteredReactions = node.reactions.filter((r) => {
            if (r.action && r.action.navigation === "CHANGE_TO") return false;
            if (Array.isArray(r.actions)) {
              return !r.actions.some((a) => a.navigation === "CHANGE_TO");
            }
            return true;
          });
        }
        const hasFilteredReactions = filteredReactions.length > 0;
        if (hasFilteredReactions) {
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
            await findNodesWithReactions(child, processedNodes, depth + 1, results);
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
          const nodeResults = await findNodesWithReactions(node, processedNodes);
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
  async function activeSetDefaultConnector(params) {
    const { connectorId } = params || {};
    if (connectorId) {
      const node = await figma.getNodeByIdAsync(connectorId);
      if (!node) {
        throw new Error(`Connector node not found with ID: ${connectorId}`);
      }
      if (node.type !== "CONNECTOR") {
        throw new Error(`Node is not a connector: ${connectorId}`);
      }
      await figma.clientStorage.setAsync("defaultConnectorId", connectorId);
      return {
        success: true,
        message: `Default connector set to: ${connectorId}`,
        connectorId
      };
    } else {
      try {
        const existingConnectorId = await figma.clientStorage.getAsync("defaultConnectorId");
        if (existingConnectorId) {
          try {
            const existingConnector = await figma.getNodeByIdAsync(existingConnectorId);
            if (existingConnector && existingConnector.type === "CONNECTOR") {
              return {
                success: true,
                message: `Default connector is already set to: ${existingConnectorId}`,
                connectorId: existingConnectorId,
                exists: true
              };
            } else {
              console.log(`Stored connector ID ${existingConnectorId} is no longer valid, finding a new connector...`);
            }
          } catch (error) {
            console.log(`Error finding stored connector: ${error.message}. Will try to set a new one.`);
          }
        }
      } catch (error) {
        console.log(`Error checking for existing connector: ${error.message}`);
      }
      try {
        const currentPageConnectors = figma.currentPage.findAllWithCriteria({ types: ["CONNECTOR"] });
        if (currentPageConnectors && currentPageConnectors.length > 0) {
          const foundConnector = currentPageConnectors[0];
          const autoFoundId = foundConnector.id;
          await figma.clientStorage.setAsync("defaultConnectorId", autoFoundId);
          return {
            success: true,
            message: `Automatically found and set default connector to: ${autoFoundId}`,
            connectorId: autoFoundId,
            autoSelected: true
          };
        } else {
          return {
            success: false,
            message: "No default connector set and none found on current page.",
            exists: false
          };
        }
      } catch (error) {
        throw new Error(`Failed to find a connector: ${error.message}`);
      }
    }
  }
  async function createCursorNode(targetNodeId) {
    const svgString = `<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M16 8V35.2419L22 28.4315L27 39.7823C27 39.7823 28.3526 40.2722 29 39.7823C29.6474 39.2924 30.2913 38.3057 30 37.5121C28.6247 33.7654 25 26.1613 25 26.1613H32L16 8Z" fill="#202125" />
  </svg>`;
    try {
      const targetNode = await figma.getNodeByIdAsync(targetNodeId);
      if (!targetNode) throw new Error("Target node not found");
      let parentNodeId = targetNodeId.includes(";") ? targetNodeId.split(";")[0] : targetNodeId;
      if (!parentNodeId) throw new Error("Could not determine parent node ID");
      let parentNode = await figma.getNodeByIdAsync(parentNodeId);
      if (!parentNode) throw new Error("Parent node not found");
      if (parentNode.type === "INSTANCE" || parentNode.type === "COMPONENT" || parentNode.type === "COMPONENT_SET") {
        parentNode = parentNode.parent;
        if (!parentNode) throw new Error("Parent node not found");
      }
      const importedNode = await figma.createNodeFromSvg(svgString);
      if (!importedNode || !importedNode.id) {
        throw new Error("Failed to create imported cursor node");
      }
      importedNode.name = "TTF_Connector / Mouse Cursor";
      importedNode.resize(48, 48);
      const cursorNode = importedNode.findOne((node) => node.type === "VECTOR");
      if (cursorNode) {
        cursorNode.fills = [{
          type: "SOLID",
          color: { r: 0, g: 0, b: 0 },
          opacity: 1
        }];
        cursorNode.strokes = [{
          type: "SOLID",
          color: { r: 1, g: 1, b: 1 },
          opacity: 1
        }];
        cursorNode.strokeWeight = 2;
        cursorNode.strokeAlign = "OUTSIDE";
        cursorNode.effects = [{
          type: "DROP_SHADOW",
          color: { r: 0, g: 0, b: 0, a: 0.3 },
          offset: { x: 1, y: 1 },
          radius: 2,
          spread: 0,
          visible: true,
          blendMode: "NORMAL"
        }];
      }
      parentNode.appendChild(importedNode);
      if ("layoutMode" in parentNode && parentNode.layoutMode !== "NONE") {
        importedNode.layoutPositioning = "ABSOLUTE";
      }
      if (
        // @ts-ignore
        targetNode.absoluteBoundingBox && // @ts-ignore
        parentNode.absoluteBoundingBox
      ) {
        console.log("targetNode.absoluteBoundingBox", targetNode.absoluteBoundingBox);
        console.log("parentNode.absoluteBoundingBox", parentNode.absoluteBoundingBox);
        importedNode.x = targetNode.absoluteBoundingBox.x - parentNode.absoluteBoundingBox.x + targetNode.absoluteBoundingBox.width / 2 - 48 / 2;
        importedNode.y = targetNode.absoluteBoundingBox.y - parentNode.absoluteBoundingBox.y + targetNode.absoluteBoundingBox.height / 2 - 48 / 2;
      } else if ("x" in targetNode && "y" in targetNode && "width" in targetNode && "height" in targetNode) {
        console.log("targetNode.x/y/width/height", targetNode.x, targetNode.y, targetNode.width, targetNode.height);
        importedNode.x = targetNode.x + targetNode.width / 2 - 48 / 2;
        importedNode.y = targetNode.y + targetNode.height / 2 - 48 / 2;
      } else {
        if ("x" in targetNode && "y" in targetNode) {
          console.log("Fallback to targetNode x/y");
          importedNode.x = targetNode.x;
          importedNode.y = targetNode.y;
        } else {
          console.log("Fallback to (0,0)");
          importedNode.x = 0;
          importedNode.y = 0;
        }
      }
      console.log("importedNode", importedNode);
      return { id: importedNode.id, node: importedNode };
    } catch (error) {
      console.error("Error creating cursor from SVG:", error);
      return { id: null, node: null, error: error.message };
    }
  }
  async function createConnections(params) {
    if (!params) {
      throw new Error("Missing params");
    }
    const { connections, connectorId, checkDefault } = params;
    if (connectorId !== void 0 || checkDefault) {
      const result = await activeSetDefaultConnector({ connectorId });
      if (!connections || connections.length === 0) {
        return result;
      }
      if (connectorId && !result.success) {
        throw new Error(`Failed to set default connector: ${result.message}`);
      }
    }
    if (!connections || !Array.isArray(connections) || connections.length === 0) {
      if (connectorId === void 0 && !checkDefault) {
        throw new Error("No connections provided and no connectorId specified.");
      }
      return { success: true, count: 0, message: "No connections specified." };
    }
    const commandId = generateCommandId();
    await sendProgressUpdate(
      commandId,
      "create_connections",
      "started",
      0,
      connections.length,
      0,
      `Starting to create ${connections.length} connections`
    );
    const defaultConnectorId = await figma.clientStorage.getAsync("defaultConnectorId");
    if (!defaultConnectorId) {
      const autoResult = await activeSetDefaultConnector();
      if (!autoResult.success) {
        throw new Error('No default connector set. Please create a connector in FigJam/Figma and copy it to the current page, then run "create_connections" with "connectorId".');
      }
    }
    const currentDefaultId = await figma.clientStorage.getAsync("defaultConnectorId");
    const defaultConnector = await figma.getNodeByIdAsync(currentDefaultId);
    if (!defaultConnector) {
      throw new Error(`Default connector node not found (ID: ${currentDefaultId})`);
    }
    if (defaultConnector.type !== "CONNECTOR") {
      throw new Error(`Stored default node is not a connector: ${currentDefaultId}`);
    }
    const results = [];
    let processedCount = 0;
    const totalCount = connections.length;
    for (let i = 0; i < connections.length; i++) {
      try {
        const { startNodeId: originalStartId, endNodeId: originalEndId, text } = connections[i];
        let startId = originalStartId;
        let endId = originalEndId;
        if (startId.includes(";")) {
          console.log(`Nested start node detected: ${startId}. Creating cursor node.`);
          const cursorResult = await createCursorNode(startId);
          if (!cursorResult || !cursorResult.id) {
            throw new Error(`Failed to create cursor node for nested start node: ${startId}`);
          }
          startId = cursorResult.id;
        }
        const startNode = await figma.getNodeByIdAsync(startId);
        if (!startNode) throw new Error(`Start node not found with ID: ${startId}`);
        if (endId.includes(";")) {
          console.log(`Nested end node detected: ${endId}. Creating cursor node.`);
          const cursorResult = await createCursorNode(endId);
          if (!cursorResult || !cursorResult.id) {
            throw new Error(`Failed to create cursor node for nested end node: ${endId}`);
          }
          endId = cursorResult.id;
        }
        const endNode = await figma.getNodeByIdAsync(endId);
        if (!endNode) throw new Error(`End node not found with ID: ${endId}`);
        const clonedConnector = defaultConnector.clone();
        clonedConnector.name = `TTF_Connector/${startNode.id}/${endNode.id}`;
        clonedConnector.connectorStart = {
          endpointNodeId: startId,
          magnet: "AUTO"
        };
        clonedConnector.connectorEnd = {
          endpointNodeId: endId,
          magnet: "AUTO"
        };
        if (text) {
          try {
            try {
              if (defaultConnector.text && defaultConnector.text.fontName) {
                const fontName = defaultConnector.text.fontName;
                await figma.loadFontAsync(fontName);
                clonedConnector.text.fontName = fontName;
              } else {
                await figma.loadFontAsync({ family: "Inter", style: "Regular" });
              }
            } catch (fontError) {
              try {
                await figma.loadFontAsync({ family: "Inter", style: "Medium" });
              } catch (mediumFontError) {
                try {
                  await figma.loadFontAsync({ family: "System", style: "Regular" });
                } catch (systemFontError) {
                  throw new Error(`Failed to load any font: ${fontError.message}`);
                }
              }
            }
            clonedConnector.text.characters = text;
          } catch (textError) {
            console.error("Error setting text:", textError);
            results.push({
              id: clonedConnector.id,
              startNodeId: originalStartId,
              endNodeId: originalEndId,
              text: "",
              textError: textError.message
            });
            continue;
          }
        }
        results.push({
          id: clonedConnector.id,
          originalStartNodeId: originalStartId,
          originalEndNodeId: originalEndId,
          usedStartNodeId: startId,
          // ID actually used for connection
          usedEndNodeId: endId,
          // ID actually used for connection
          text: text || ""
        });
        processedCount++;
        await sendProgressUpdate(
          commandId,
          "create_connections",
          "in_progress",
          processedCount / totalCount,
          totalCount,
          processedCount,
          `Created connection ${processedCount}/${totalCount}`
        );
      } catch (error) {
        console.error("Error creating connection", error);
        processedCount++;
        await sendProgressUpdate(
          commandId,
          "create_connections",
          "in_progress",
          processedCount / totalCount,
          totalCount,
          processedCount,
          `Error creating connection: ${error.message}`
        );
        results.push({
          error: error.message,
          connectionInfo: connections[i]
        });
      }
    }
    await sendProgressUpdate(
      commandId,
      "create_connections",
      "completed",
      1,
      totalCount,
      totalCount,
      `Completed creating ${results.length} connections`
    );
    return {
      success: true,
      count: results.length,
      connections: results
    };
  }

  // figma_plugin/handlers/prototypingHandlers.ts
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
  async function setTextContent(params) {
    const { nodeId, text } = params || {};
    if (!nodeId) {
      throw new Error("Missing nodeId parameter");
    }
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node) {
      throw new Error(`Node not found with ID: ${nodeId}`);
    }
    if (node.type !== "TEXT") {
      throw new Error(`Node is not a text node: ${nodeId} (type: ${node.type})`);
    }
    const success = await setCharacters(node, text);
    if (!success) {
      throw new Error(`Failed to set characters on node ${nodeId}`);
    }
    return {
      success: true,
      nodeId,
      text
    };
  }
  async function setMultipleTextContents(params) {
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
      { totalReplacements: text.length }
    );
    const results = [];
    let successCount = 0;
    let failureCount = 0;
    for (let i = 0; i < text.length; i++) {
      const replacement = text[i];
      if (!replacement.nodeId || replacement.characters === void 0) {
        failureCount++;
        results.push({
          success: false,
          nodeId: replacement.nodeId || "unknown",
          error: "Missing nodeId or characters in replacement entry"
        });
        break;
      }
      try {
        console.log(`Attempting to replace text in node: ${replacement.nodeId}`);
        const textNode = await figma.getNodeByIdAsync(replacement.nodeId);
        if (!textNode) {
          failureCount++;
          results.push({
            success: false,
            nodeId: replacement.nodeId,
            error: `Node not found: ${replacement.nodeId}`
          });
          break;
        }
        if (textNode.type !== "TEXT") {
          failureCount++;
          results.push({
            success: false,
            nodeId: replacement.nodeId,
            error: `Node is not a text node: ${replacement.nodeId} (type: ${textNode.type})`
          });
          break;
        }
        const originalText = textNode.characters;
        await setTextContent({
          nodeId: replacement.nodeId,
          text: replacement.characters
        });
        successCount++;
        results.push({
          success: true,
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
          successCount + failureCount,
          `Processed ${i + 1}/${text.length} text replacements`
        );
        await new Promise((r) => setTimeout(r, 0));
      } catch (error) {
        console.error(`Error replacing text in node ${replacement.nodeId}: ${error.message}`);
        failureCount++;
        results.push({
          success: false,
          nodeId: replacement.nodeId,
          error: `Error applying replacement: ${error.message}`
        });
        break;
      }
    }
    await sendProgressUpdate(
      commandId,
      "set_multiple_text_contents",
      failureCount > 0 ? "error" : "completed",
      100,
      text.length,
      successCount + failureCount,
      `Text replacement complete: ${successCount} successful, ${failureCount} failed`,
      {
        totalReplacements: text.length,
        replacementsApplied: successCount,
        replacementsFailed: failureCount,
        results
      }
    );
    return {
      success: successCount > 0 && failureCount === 0,
      replacementsApplied: successCount,
      replacementsFailed: failureCount,
      totalReplacements: text.length,
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
  async function getAnnotations(params) {
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
        const page = await figma.getNodeByIdAsync(pageId);
        if (!page) {
          throw new Error(`pageId with ID ${pageId} not found`);
        }
        if (page.type !== "PAGE") {
          throw new Error("pageId does not resolve to a PAGE");
        }
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
        await processNode(page);
        const result = {
          annotatedNodes: annotations
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
        if (!("annotations" in node)) {
          throw new Error(`Node type ${node.type} does not support annotations`);
        }
        const mergedAnnotations = [];
        const collect = async (n) => {
          if ("annotations" in n && n.annotations && n.annotations.length > 0) {
            for (const a of n.annotations) {
              mergedAnnotations.push({ nodeId: n.id, annotation: a });
            }
          }
          if ("children" in n) {
            for (const child of n.children) {
              await collect(child);
            }
          }
        };
        await collect(node);
        const result = {
          nodeId: node.id,
          name: node.name,
          annotations: mergedAnnotations
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
  async function setAnnotation(params) {
    const { nodeId, labelMarkdown, categoryId, properties } = params || {};
    if (!nodeId) {
      return { success: false, error: "Missing nodeId parameter" };
    }
    if (!labelMarkdown) {
      return { success: false, error: "Missing labelMarkdown parameter" };
    }
    try {
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node) {
        return { success: false, error: `Node not found: ${nodeId}` };
      }
      if (!("annotations" in node)) {
        return { success: false, error: `Node type ${node.type} does not support annotations` };
      }
      const annotationObj = {
        label: {
          type: "MARKDOWN",
          content: labelMarkdown
        }
      };
      if (categoryId) {
        annotationObj.categoryId = categoryId;
      }
      if (properties && Array.isArray(properties)) {
        annotationObj.properties = properties;
      }
      const existingAnnotations = node.annotations || [];
      node.annotations = [...existingAnnotations, annotationObj];
      return {
        success: true,
        nodeId,
        annotationCount: node.annotations.length
      };
    } catch (error) {
      console.error("Error in setAnnotation:", error);
      return { success: false, error: error.message };
    }
  }
  async function setMultipleAnnotations(params) {
    console.log("=== setMultipleAnnotations Debug Start ===");
    console.log("Input params:", JSON.stringify(params, null, 2));
    const { nodeId, annotations } = params;
    if (!annotations || annotations.length === 0) {
      console.error("Validation failed: No annotations provided");
      return { success: false, error: "No annotations provided" };
    }
    console.log(
      `Processing ${annotations.length} annotations for node ${nodeId}`
    );
    const results = [];
    let successCount = 0;
    let failureCount = 0;
    for (let i = 0; i < annotations.length; i++) {
      const annotation = annotations[i];
      console.log(
        `
Processing annotation ${i + 1}/${annotations.length}:`,
        JSON.stringify(annotation, null, 2)
      );
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
        });
        console.log("setAnnotation result:", JSON.stringify(result, null, 2));
        if (result.success) {
          successCount++;
          results.push({ success: true, nodeId: annotation.nodeId });
          console.log(`\u2713 Annotation ${i + 1} applied successfully`);
        } else {
          failureCount++;
          results.push({
            success: false,
            nodeId: annotation.nodeId,
            error: result.error
          });
          console.error(`\u2717 Annotation ${i + 1} failed:`, result.error);
          break;
        }
      } catch (error) {
        failureCount++;
        const errorResult = {
          success: false,
          nodeId: annotation.nodeId,
          error: error.message
        };
        results.push(errorResult);
        console.error(`\u2717 Annotation ${i + 1} failed with error:`, error);
        break;
      }
    }
    const summary = {
      success: successCount > 0 && failureCount === 0,
      annotationsApplied: successCount,
      annotationsFailed: failureCount,
      totalAnnotations: annotations.length,
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
      if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
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
      if (node.type === "PAGE") {
        await node.loadAsync();
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
  async function getVariables(params) {
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
            const pageNode = await figma.getNodeByIdAsync(pageId);
            if (!pageNode) {
              throw new Error(`pageId with ID ${pageId} not found`);
            }
            if (pageNode.type !== "PAGE") {
              throw new Error("pageId does not resolve to a PAGE");
            }
            nodeConsumerMap = await findVariableConsumers(pageNode, idSet, commandId, "get_variables");
          } else {
            const pages = figma.root.children;
            for (const [index, page] of pages.entries()) {
              const pageConsumers = await findVariableConsumers(page, idSet, commandId, "get_variables");
              for (const [vid, entries] of pageConsumers) {
                const existing = nodeConsumerMap.get(vid) || [];
                nodeConsumerMap.set(vid, existing.concat(entries));
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
        return missingIds.length > 0 ? { variables: variables2, missingIds } : { variables: variables2 };
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
        }))
      };
    } catch (err) {
      throw new Error(`Error getting variables: ${err.message}`);
    }
  }
  async function deleteVariables(params) {
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
      if (idsToCheck.length === 0) {
        collection.remove();
        return { success: true, deleted: [], deletedCollection: collectionId };
      }
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
    const nodeMapsPromises = figma.root.children.map((page) => findVariableConsumers(page, idSet, commandId, "variable_delete"));
    const [styleConsumerMap, _aliasConsumerMap, ..._nodeMaps] = await Promise.all([
      stylePromise,
      aliasPromise,
      ...nodeMapsPromises
    ]);
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
      let errorMsg = collectionId ? `Cannot delete collection: variable(s) in collection are still in use.
` : `Cannot delete: variable(s) are still in use.
`;
      for (const [vid, consumers] of Object.entries(variablesInUse)) {
        const varName = ((_a = variables.find((v) => v && v.id === vid)) == null ? void 0 : _a.name) || vid;
        errorMsg += `- Variable '${varName}' is used by:
`;
        for (const n of consumers.nodeConsumers) {
          errorMsg += `  - Node '${n.nodeName}' (${n.nodeType}) on fields: ${n.fields.join(", ")}
`;
        }
        for (const s of consumers.styleConsumers) {
          const styleTypeName = s.styleType === "PAINT" ? "Paint" : s.styleType === "TEXT" ? "Text" : s.styleType === "EFFECT" ? "Effect" : s.styleType === "GRID" ? "Grid" : "Style";
          errorMsg += `  - ${styleTypeName} style '${s.styleName}' on fields: ${s.fields.join(", ")}
`;
        }
        for (const a of consumers.aliasConsumers) {
          errorMsg += `  - Aliased by variable '${a.variableName}' in modes: ${a.modes.join(", ")}
`;
        }
      }
      return {
        success: false,
        error: errorMsg.trim(),
        variablesInUse
      };
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
  function describeError(e) {
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
  async function setBoundVariable(params) {
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
          throw new Error(`Failed to set explicit variable mode for collection ${collectionId}: ${describeError(e)}`);
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
            const paints = JSON.parse(JSON.stringify(node[field]));
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
              results.push(`No SOLID paints found in ${field} to bind variable`);
            }
            continue;
          }
          node.setBoundVariable(field, variable);
          results.push(variable ? `Bound ${field} to variable ${variable.name}` : `Unbound variable from ${field}`);
        } catch (e) {
          throw new Error(`Failed to set bound variable for ${field}: ${describeError(e)}`);
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
        const { collectionId, name, type, value, scopes } = params;
        if (!collectionId || !name || !type) throw new Error("Missing required parameters for variable creation");
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
        const variable = await figma.variables.getVariableByIdAsync(variableId);
        if (!variable) throw new Error(`Variable ${variableId} not found`);
        if (currentVariableName && variable.name !== currentVariableName) {
          throw new Error(`Variable name verification failed. Expected "${variable.name}", got "${currentVariableName}"`);
        }
        if (variable.remote) {
          throw new Error(`Operation Denied: '${variable.name}' is a remote library asset (style/variable/component) and is read-only in this file. Edit it in its source library.`);
        }
        if (name) {
          variable.name = name;
        }
        if (description !== void 0) {
          variable.description = description;
        }
        if (scopes !== void 0) {
          variable.scopes = scopes;
        }
        if (value !== void 0) {
          if (!modeId) throw new Error("Missing modeId for setting variable value");
          if (typeof value === "object" && value.type === "VARIABLE_ALIAS") {
            variable.setValueForMode(modeId, {
              type: "VARIABLE_ALIAS",
              id: value.id
            });
          } else {
            variable.setValueForMode(modeId, value);
          }
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
    const { type, name, description, properties, styleId, bindVariables } = params;
    if (!type || !name) {
      throw new Error("Missing required parameters: type and name are required.");
    }
    let style;
    if (styleId) {
      style = await figma.getStyleByIdAsync(styleId);
      if (!style) {
        throw new Error(`Style with ID ${styleId} not found.`);
      }
      if (style.type !== type.toUpperCase()) {
        throw new Error(`Style parameter type ${type} does not match retrieved style type ${style.type}`);
      }
      if (style.remote) {
        throw new Error(`Operation Denied: '${style.name}' is a remote library asset (style/variable/component) and is read-only in this file. Edit it in its source library.`);
      }
    } else {
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
    try {
      style.name = name;
      if (description) style.description = description;
      if (properties) {
        switch (type.toUpperCase()) {
          case "TEXT": {
            const s = style;
            if (properties.fontName) {
              await figma.loadFontAsync(properties.fontName);
              s.fontName = properties.fontName;
            } else {
              await figma.loadFontAsync(s.fontName);
            }
            if (properties.fontSize) s.fontSize = properties.fontSize;
            if (properties.lineHeight) s.lineHeight = properties.lineHeight;
            if (properties.letterSpacing) s.letterSpacing = properties.letterSpacing;
            if (properties.paragraphIndent) s.paragraphIndent = properties.paragraphIndent;
            if (properties.paragraphSpacing) s.paragraphSpacing = properties.paragraphSpacing;
            if (properties.textCase) s.textCase = properties.textCase;
            if (properties.textDecoration) s.textDecoration = properties.textDecoration;
            break;
          }
          case "PAINT": {
            const s = style;
            if (properties.paints) s.paints = properties.paints;
            break;
          }
          case "EFFECT": {
            const s = style;
            if (properties.effects) s.effects = properties.effects;
            break;
          }
          case "GRID": {
            const s = style;
            if (properties.layoutGrids) s.layoutGrids = properties.layoutGrids;
            break;
          }
        }
      }
      if (bindVariables && typeof bindVariables === "object") {
        const entries = Object.entries(bindVariables);
        if (type.toUpperCase() === "PAINT") {
          const paintStyle = style;
          const paints = [...paintStyle.paints];
          if (paints.length === 0) {
            throw new Error("Cannot bind/unbind variables on a paint style with no paints. Set paints first via properties.");
          }
          for (const [field, variableId] of entries) {
            if (variableId === null) {
              paints[0] = figma.variables.setBoundVariableForPaint(paints[0], field, null);
            } else {
              const variable = await figma.variables.getVariableByIdAsync(variableId);
              if (!variable) {
                throw new Error(`Variable with ID "${variableId}" not found (for field "${field}").`);
              }
              paints[0] = figma.variables.setBoundVariableForPaint(paints[0], field, variable);
            }
          }
          paintStyle.paints = paints;
        } else {
          for (const [field, variableId] of entries) {
            if (variableId === null) {
              style.setBoundVariable(field, null);
            } else {
              const variable = await figma.variables.getVariableByIdAsync(variableId);
              if (!variable) {
                throw new Error(`Variable with ID "${variableId}" not found (for field "${field}").`);
              }
              style.setBoundVariable(field, variable);
            }
          }
        }
      }
    } catch (e) {
      if (!styleId) {
        try {
          style.remove();
        } catch (e2) {
        }
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
    const { parentId, svg, name, x = 0, y = 0 } = params;
    if (!params.svg) {
      throw new Error("Missing required parameter: svg string.");
    }
    const node = figma.createNodeFromSvg(params.svg);
    if (name) {
      node.name = name;
    }
    if (!parentId) {
      throw new Error("Missing parentId parameter");
    }
    const parent = await figma.getNodeByIdAsync(parentId);
    if (!parent) {
      throw new Error(`Parent node not found with ID: ${parentId}`);
    }
    if (!("appendChild" in parent)) {
      throw new Error(`Parent node does not support children: ${parentId}`);
    }
    parent.appendChild(node);
    node.x = x;
    node.y = y;
    return {
      id: node.id,
      name: node.name,
      type: node.type
    };
  }

  // figma_plugin/handlers/connectHandlers.ts
  async function getConnectPayload() {
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
          try {
            await scopeNode.loadAsync();
          } catch (e) {
            return {
              errorCode: "DOCUMENT_LOAD_FAILED",
              errorMessage: "Failed to load the Figma document's pages. The file may be too large or temporarily unavailable. Retry shortly."
            };
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
        errorCode: "UNKNOWN_ERROR",
        errorMessage: `An unexpected error occurred while joining the channel: ${e.message || String(e)}.`
      };
    }
  }

  // figma_plugin/src/main.ts
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
    PARENT_NAME_MISMATCH: "Operation Denied: parentNodeName does not match name of parentId. Refresh context & recheck to ensure correct parentId is passed in.",
    // Parameter Errors
    MISSING_NODE_IDS: "Missing or Invalid nodeIds parameter",
    MISSING_TARGET_NODE_IDS: "Missing targetNodeIds parameter",
    MISSING_SOURCE_INSTANCE_ID: "Missing sourceInstanceId parameter",
    INVALID_TARGET_NODE_IDS: "targetNodeIds must be an array"
  };
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
  function formatScopeError(errorMessage) {
    return `${errorMessage} (Current Editable Scope Node ID: ${state.scopeRootId || "None"})`;
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
  function assertNotScopeRoot(nodeId) {
    if (nodeId === state.scopeRootId) {
      throw new Error(`Operation Denied: This node is the current Editable Scope root; deleting/flattening/ungrouping/converting it would invalidate the scope for the rest of the session. Re-scope to a parent first, or ask the user to select a different Editable Scope.`);
    }
  }
  async function validateSingleNodeWrite(params, options) {
    if (!state.allowEditNode) throw new Error(ERRORS.READ_ONLY_MODE);
    if (!await checkScopeAccess(params ? params.nodeId : null)) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
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
    if (!await checkScopeAccess(params ? params.parentId : null)) throw new Error(formatScopeError(ERRORS.PARENT_OUTSIDE_SCOPE));
    if (!await verifyParentName(params ? params.parentId : null, params ? params.parentNodeName : null)) throw new Error(ERRORS.PARENT_NAME_MISMATCH);
    const parent = await figma.getNodeByIdAsync(params == null ? void 0 : params.parentId);
    if (parent) {
      if (options.checkLocked) assertNotLocked(parent);
      if (options.instanceCheckVerb) assertNotInstanceInterior(parent, options.instanceCheckVerb);
    }
  }
  async function verifyParentName(parentId, expectedParentName) {
    const node = await figma.getNodeByIdAsync(parentId);
    if (!node) return false;
    return node.name === expectedParentName;
  }
  function describeError2(e) {
    if (e == null) return "Error executing command";
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
    return e.name || "Error executing command";
  }
  function parseNodeIdFromUrl(url) {
    try {
      const urlObj = new URL(url);
      const nodeId = urlObj.searchParams.get("node-id");
      return nodeId ? nodeId.replace(/-/g, ":") : null;
    } catch (e) {
      const match = url.match(/node-id=([^&]+)/);
      if (match) return match[1].replace(/-/g, ":");
      return null;
    }
  }
  figma.showUI(__html__, { width: 350, height: 450 });
  figma.ui.onmessage = async (msg) => {
    switch (msg.type) {
      case "update-settings":
        updateSettings(msg);
        break;
      case "notify":
        figma.notify(msg.message);
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
          figma.notify(`Scope locked to node: ${msg.scopeNodeId}`);
        } else {
          state.scopeRootId = null;
          state.allowEditNode = false;
          state.allowEditVariable = !!msg.allowEditVariable;
          state.allowEditStyle = !!msg.allowEditStyle;
          figma.notify("Connected in Read-Only Mode for nodes");
        }
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
              error: describeError2(error)
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
            if (!await checkScopeAccess(item.nodeId)) throw new Error(formatScopeError(`Operation denied: Node ${item.nodeId} outside editable scope`));
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
        if (!await checkScopeAccess(params ? params.childId : null)) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
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
        if (!state.allowEditNode) throw new Error(ERRORS.READ_ONLY_MODE);
        if (!await checkScopeAccess(params ? params.nodeId : null)) throw new Error(formatScopeError(ERRORS.CLONING_SOURCE_NODE_OUTSIDE_SCOPE));
        if (!await verifyNodeName(params ? params.nodeId : null, params ? params.nodeName : null)) throw new Error(ERRORS.NAME_MISMATCH);
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
      case "create_connection":
        if (!state.allowEditNode) throw new Error(ERRORS.READ_ONLY_MODE);
        if (params && params.connectorId) {
          if (!await checkScopeAccess(params.connectorId)) throw new Error(formatScopeError(`Operation denied: Connector node ${params.connectorId} outside editable scope`));
        }
        if (params && params.connections && Array.isArray(params.connections)) {
          for (const conn of params.connections) {
            if (!await checkScopeAccess(conn.startNodeId)) throw new Error(formatScopeError(`Operation denied: Start node ${conn.startNodeId} outside editable scope`));
            if (!await verifyNodeName(conn.startNodeId, conn.startNodeName)) throw new Error(ERRORS.NAME_MISMATCH);
            const startNode = await figma.getNodeByIdAsync(conn.startNodeId);
            if (startNode) assertNotLocked(startNode);
            if (!await checkScopeAccess(conn.endNodeId)) throw new Error(formatScopeError(`Operation denied: End node ${conn.endNodeId} outside editable scope`));
            if (!await verifyNodeName(conn.endNodeId, conn.endNodeName)) throw new Error(ERRORS.NAME_MISMATCH);
            const endNode = await figma.getNodeByIdAsync(conn.endNodeId);
            if (endNode) assertNotLocked(endNode);
          }
        }
        return await createConnections(params);
      case "text_set_content":
        if (!state.allowEditNode) throw new Error(ERRORS.READ_ONLY_MODE);
        if (!params || !params.text || !Array.isArray(params.text)) throw new Error("Missing or Invalid text parameter");
        if (!state.scopeRootId) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
        const textScopeRoot = await figma.getNodeByIdAsync(state.scopeRootId);
        if (!textScopeRoot) {
          throw new Error(`${ERRORS.SCOPE_DELETED} (Missing Scope Node ID: ${state.scopeRootId})`);
        }
        for (const item of params.text) {
          const node = await figma.getNodeByIdAsync(item.nodeId);
          if (!node) {
            throw new Error(`Node ${item.nodeId} not found`);
          }
          if (!checkScopeAccessRef(node, textScopeRoot)) {
            throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
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
        if (!state.scopeRootId) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
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
            throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
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
        if (!state.scopeRootId) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
        const deleteScopeRoot = await figma.getNodeByIdAsync(state.scopeRootId);
        if (!deleteScopeRoot) {
          throw new Error(`${ERRORS.SCOPE_DELETED} (Missing Scope Node ID: ${state.scopeRootId})`);
        }
        const nodeIdsToDelete = [];
        for (const item of params.nodes) {
          const node = await figma.getNodeByIdAsync(item.nodeId);
          if (!node) {
            throw new Error(`Node ${item.nodeId} not found`);
          }
          if (!checkScopeAccessRef(node, deleteScopeRoot)) {
            throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
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
          if (!state.scopeRootId) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
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
          const targetNodeIds = [];
          for (const item of params.targetNodes) {
            const node = await figma.getNodeByIdAsync(item.nodeId);
            if (!node) {
              throw new Error(`Node ${item.nodeId} not found`);
            }
            if (!checkScopeAccessRef(node, instScopeRoot)) {
              throw new Error(formatScopeError(`Operation denied: Target instance ${item.nodeId} outside editable scope`));
            }
            if (node.name !== item.nodeName) {
              throw new Error(ERRORS.NAME_MISMATCH);
            }
            assertNotLocked(node);
            if (node.type !== "INSTANCE") {
              throw new Error(`Target is not an instance node: ${node.id} (type: ${node.type})`);
            }
            targetNodeIds.push(item.nodeId);
          }
          const targetNodesResult = await getValidTargetInstances(targetNodeIds);
          if (!targetNodesResult.success) {
            figma.notify(targetNodesResult.message);
            return { success: false, message: targetNodesResult.message };
          }
          let sourceInstanceData = await getSourceInstanceData(params.sourceInstanceId);
          if (!sourceInstanceData.success) {
            figma.notify(sourceInstanceData.message);
            return { success: false, message: sourceInstanceData.message };
          }
          return await setInstanceOverrides(targetNodesResult.targetInstances, sourceInstanceData);
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
        await validateSingleNodeWrite(params, { checkScopeRoot: true, checkLocked: true });
        return await createComponent(params);
      case "create_component_set":
        if (!state.allowEditNode) throw new Error(ERRORS.READ_ONLY_MODE);
        if (!state.scopeRootId) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
        const compSetScopeRoot = await figma.getNodeByIdAsync(state.scopeRootId);
        if (!compSetScopeRoot) {
          throw new Error(`${ERRORS.SCOPE_DELETED} (Missing Scope Node ID: ${state.scopeRootId})`);
        }
        const props = params.properties || [];
        if (params.components) {
          if (!Array.isArray(params.components)) throw new Error("components must be an array");
          for (const comp of params.components) {
            const node = await figma.getNodeByIdAsync(comp.nodeId);
            if (!node) {
              throw new Error(`Node ${comp.nodeId} not found`);
            }
            if (!checkScopeAccessRef(node, compSetScopeRoot)) {
              throw new Error(formatScopeError(`Operation denied: Component ${comp.nodeId} outside editable scope`));
            }
            if (node.name !== comp.nodeName) {
              throw new Error(ERRORS.NAME_MISMATCH);
            }
            if (!comp.propertyValues || comp.propertyValues.length !== props.length) {
              throw new Error(`Property values count for component ${comp.nodeName} does not match properties count`);
            }
          }
        }
        if (params.parentId) {
          const parentNode = await figma.getNodeByIdAsync(params.parentId);
          if (!parentNode) {
            throw new Error(`Node ${params.parentId} not found`);
          }
          if (!checkScopeAccessRef(parentNode, compSetScopeRoot)) {
            throw new Error(formatScopeError(ERRORS.PARENT_OUTSIDE_SCOPE));
          }
          if (parentNode.name !== params.parentNodeName) {
            throw new Error(ERRORS.PARENT_NAME_MISMATCH);
          }
        }
        return await createComponentSet(params);
      case "create_svg":
        if (!state.allowEditNode) throw new Error(ERRORS.READ_ONLY_MODE);
        if (!await checkScopeAccess(params ? params.parentId : null)) throw new Error(formatScopeError(ERRORS.PARENT_OUTSIDE_SCOPE));
        if (!await verifyParentName(params ? params.parentId : null, params ? params.parentNodeName : null)) throw new Error(ERRORS.PARENT_NAME_MISMATCH);
        return await createNodeFromSvg(params);
      case "node_set_effects":
        if (!state.allowEditNode) throw new Error(ERRORS.READ_ONLY_MODE);
        if (!await checkScopeAccess(params ? params.nodeId : null)) throw new Error(formatScopeError(ERRORS.OUTSIDE_SCOPE));
        if (!await verifyNodeName(params ? params.nodeId : null, params ? params.nodeName : null)) throw new Error(ERRORS.NAME_MISMATCH);
        return await setEffects(params);
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  }
})();
