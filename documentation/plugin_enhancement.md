# Plugin Enhancement Recommendations

This document tracks suggested enhancements to the Figma Edit MCP plugin, based on the comparative analysis with the [arinspunk/claude-talk-to-figma-mcp](https://github.com/arinspunk/claude-talk-to-figma-mcp) fork.

---

## Enhancement #1: Expand `get_document_info` to Include All Pages

### Current Behavior

The current `get_document_info` implementation in [nodeReaders.js:12-36](../src/figma_plugin/handlers/nodeReaders.js#L12-L36) only returns information about the **current page**:

```javascript
export async function getDocumentInfo() {
    await figma.currentPage.loadAsync();
    const page = figma.currentPage;
    return {
        name: page.name,
        id: page.id,
        type: page.type,
        children: page.children.map((node) => ({...})),
        currentPage: {
            id: page.id,
            name: page.name,
            childCount: page.children.length,
        },
        pages: [
            {
                id: page.id,          // Only current page!
                name: page.name,
                childCount: page.children.length,
            },
        ],
    };
}
```

### Problem

The `pages` array only contains a single element (the current page), which:
- Prevents users from discovering other pages in the document
- Makes multi-page workflows impossible without a separate `get_pages` tool
- Doesn't match user expectations of "document info" including all pages

### Proposed Enhancements

#### 1A. Update `get_document_info` (Metadata Only)

Modify `get_document_info` to return high-level document structure (all pages) but **remove** the `children` array to keep the payload light.

```javascript
export async function getDocumentInfo() {
    await figma.currentPage.loadAsync();
    const page = figma.currentPage;

    // Get all pages from document root
    const allPages = figma.root.children.map((p) => ({
        id: p.id,
        name: p.name,
        childCount: p.children.length,
        isCurrent: p.id === page.id,
    }));

    return {
        name: figma.root.name,
        id: figma.root.id,
        type: "DOCUMENT",
        currentPageId: page.id,
        currentPageName: page.name,
        pages: allPages,
        pageCount: allPages.length,
    };
}
```

#### 1B. New Tool: `get_page_info` (Page Content)

Add a dedicated tool to fetch the content (layer hierarchy) of a specific page.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pageId` | string | ❌ | ID of the page to inspect (default: current page) |

```javascript
export async function getPageInfo(params) {
    const { pageId } = params || {};
    
    let targetPage = figma.currentPage;
    
    if (pageId && pageId !== figma.currentPage.id) {
        // Find the requested page
        targetPage = figma.root.children.find(p => p.id === pageId);
        if (!targetPage) {
            throw new Error(`Page with ID ${pageId} not found`);
        }
        await targetPage.loadAsync();
    } else {
        await figma.currentPage.loadAsync();
    }

    return {
        id: targetPage.id,
        name: targetPage.name,
        type: "PAGE",
        isCurrent: targetPage.id === figma.currentPage.id,
        children: targetPage.children.map((node) => ({
            id: node.id,
            name: node.name,
            type: node.type,
            // Add other summary props as needed
        })),
    };
}
```

### Benefits

| Aspect | Before | After |
|--------|--------|-------|
| **Role Separation** | Mixed (Current page content + some metadata) | Clean (Doc Info = Metadata, Page Info = Content) |
| **Payload Size** | Medium (Includes current page children) | Tiny (Metadata only) |
| **Multi-page Access** | ❌ (Cannot see other page content) | ✅ (Can call `get_page_info` on any page ID) |
| **Performance** | Fast (Current page only) | Fast (On-demand loading) |

### Impact on MCP Server

- **Breaking Change**: `get_document_info` no longer returns `children`.
- **New Tool**: `get_page_info` must be added to the server definition.


<br>

---

## Enhancement #2: Add Text Styling Tool

### Overview

The fork has comprehensive text styling that this repo lacks. Instead of 9 separate tools, we use a unified `set_text_style` tool with optional parameters for each style property.

### Proposed Tool

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `set_text_style` | Set any combination of text styles | `nodeId, fontFamily?, fontSize?, ...` |

### `set_text_style` Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `nodeId` | string | ✅ | Target text node |
| `nodeName` | string | ✅ | Name of the node (for verification) |
| `fontFamily` | string | ❌ | Font family (e.g., "Inter", "Roboto") |
| `fontStyle` | string | ❌ | Font style including weight (e.g., "Regular", "Bold", "Light Italic") |
| `fontSize` | number | ❌ | Font size in pixels |
| `letterSpacing` | object | ❌ | `{ value: number, unit: "PIXELS" \| "PERCENT" }` |
| `lineHeight` | object | ❌ | `{ value: number, unit: "PIXELS" \| "PERCENT" }` or `{ unit: "AUTO" }` |
| `paragraphSpacing` | number | ❌ | Space between paragraphs in pixels |
| `textCase` | enum | ❌ | `ORIGINAL`, `UPPER`, `LOWER`, `TITLE` |
| `textDecoration` | enum | ❌ | `NONE`, `UNDERLINE`, `STRIKETHROUGH` |
| `textAlignHorizontal` | enum | ❌ | `LEFT`, `CENTER`, `RIGHT`, `JUSTIFIED` |
| `textAlignVertical` | enum | ❌ | `TOP`, `CENTER`, `BOTTOM` |

**Why unified?** All these are individual properties on Figma's TextNode. A unified tool:
- Reduces tool count from 9 → 1
- Allows setting multiple styles in a single call
- Handles font loading internally (no separate `load_font_async` needed)

### Usage Examples

```javascript
// Set just the font size
set_text_style({ nodeId: "123:456", fontSize: 24 })

// Set multiple properties at once
set_text_style({
    nodeId: "123:456",
    fontFamily: "Inter",
    fontStyle: "Bold",
    fontSize: 18,
    textCase: "UPPER",
    letterSpacing: { value: 5, unit: "PERCENT" }
})

// Change alignment only
set_text_style({
    nodeId: "123:456",
    textAlignHorizontal: "CENTER",
    textAlignVertical: "CENTER"
})
```

### Implementation Notes

> [!IMPORTANT]
> **Strict Handler Behavior**: This tool must rigorously treat missing parameters as "do not change" (noop). If a parameter is `undefined`, the corresponding property on the node MUST remain untouched.

**main.js — Add to `handleCommand` switch:**

```javascript
case "set_text_style":
    if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
    if (!(await checkScopeAccess(params ? params.nodeId : null))) throw new Error(ERRORS.OUTSIDE_SCOPE);
    if (!(await verifyNodeName(params ? params.nodeId : null, params ? params.nodeName : null))) throw new Error(ERRORS.NAME_MISMATCH);
    return await setTextStyle(params);
```

**textHandlers.js — Handler implementation:**

```javascript
export async function setTextStyle(params) {
    const { nodeId, fontFamily, fontStyle = "Regular", fontSize,
            letterSpacing, lineHeight, paragraphSpacing, textCase,
            textDecoration, textAlignHorizontal, textAlignVertical } = params;

    const node = await figma.getNodeByIdAsync(nodeId);

    // Type check
    if (node.type !== "TEXT") {
        throw new Error(`Node is not a text node (got ${node.type})`);
    }

    // Optimization: Conditional Font Loading
    // Only load and apply font if it's different from the current one
    if (fontFamily || fontStyle) {
        const currentFont = node.fontName; // { family, style }
        const targetFamily = fontFamily || currentFont.family;
        const targetStyle = fontStyle || currentFont.style;

        if (targetFamily !== currentFont.family || targetStyle !== currentFont.style) {
            await figma.loadFontAsync({ family: targetFamily, style: targetStyle });
            node.fontName = { family: targetFamily, style: targetStyle };
        }
    } else {
        // Ensure current font is loaded before modifying other properties
        // (Safeguard for Figma API requirements)
        await figma.loadFontAsync(node.fontName);
    }

    // Apply only provided properties
    if (fontSize !== undefined) node.fontSize = fontSize;
    if (letterSpacing !== undefined) node.letterSpacing = letterSpacing;
    if (lineHeight !== undefined) node.lineHeight = lineHeight;
    if (paragraphSpacing !== undefined) node.paragraphSpacing = paragraphSpacing;
    if (textCase !== undefined) node.textCase = textCase;
    if (textDecoration !== undefined) node.textDecoration = textDecoration;
    if (textAlignHorizontal !== undefined) node.textAlignHorizontal = textAlignHorizontal;
    if (textAlignVertical !== undefined) node.textAlignVertical = textAlignVertical;

    return { id: node.id, name: node.name, /* applied properties */ };
}
```

- **Scope validation** (🔒): Performed in `handleCommand` via `checkScopeAccess()`
- **Name verification**: Performed in `handleCommand` via `verifyNodeName()`
- Font loading handled internally via `figma.loadFontAsync()`
- Add handler to `textHandlers.js`, import in `main.js`

### Future Consideration: Range-Based Styling

Figma supports styling specific character ranges via `setRangeFontSize()`, `setRangeTextCase()`, etc. If needed, a separate `set_text_range_style` tool could be added:

```javascript
set_text_range_style({
    nodeId: "123:456",
    start: 0,
    end: 5,
    fontSize: 24,
    fontStyle: "Bold"
})
```

This is lower priority since most use cases involve styling entire text nodes.

---

## Enhancement #3: Add Shape Creation Tools

### Overview

Add ellipse and polygon/star creation to complete the shape toolkit. Instead of separate `create_polygon` and `create_star` tools, we use a unified `create_polygon_star` tool since stars are geometrically polygons with an inner radius.

### Proposed Tools

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `create_ellipse` | Create circle, ellipse, arc, or donut | `x, y, width, height, arcData?` |
| `create_polygon_star` | Create polygon or star | `x, y, width, height, pointCount, innerRadius?` |

### `create_ellipse` Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `x` | number | ✅ | X position |
| `y` | number | ✅ | Y position |
| `width` | number | ✅ | Width (equal to height for circle) |
| `height` | number | ✅ | Height |
| `arcData.startingAngle` | number | ❌ | Arc start in radians (0 = right/x-axis, default: 0) |
| `arcData.endingAngle` | number | ❌ | Arc end in radians, clockwise (default: 2π for full ellipse) |
| `arcData.innerRadius` | number | ❌ | 0.0–1.0, creates donut hole (default: 0) |
| `name` | string | ❌ | Node name |
| `parentId` | string | ❌ | Parent node to append to |
| `parentNodeName` | string | ❌ | Name of parent node (required if parentId provided, for verification) |
| `fillColor` | RGBA | ❌ | Fill color |
| `strokeColor` | RGBA | ❌ | Stroke color |

**arcData Examples:**
```
Full circle:     startingAngle: 0, endingAngle: 6.28 (2π), innerRadius: 0
Semi-circle:     startingAngle: 0, endingAngle: 3.14 (π),  innerRadius: 0
Donut:           startingAngle: 0, endingAngle: 6.28,      innerRadius: 0.5
Pac-Man:         startingAngle: 0.5, endingAngle: 5.8,     innerRadius: 0
```

### `create_polygon_star` Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `x` | number | ✅ | X position |
| `y` | number | ✅ | Y position |
| `width` | number | ✅ | Width |
| `height` | number | ✅ | Height |
| `pointCount` | number | ✅ | Total vertex count (≥3) |
| `innerRadius` | number | ❌ | 0.0–1.0, star sharpness (default: 1.0 = polygon) |
| `name` | string | ❌ | Node name |
| `parentId` | string | ❌ | Parent node to append to |
| `parentNodeName` | string | ❌ | Name of parent node (required if parentId provided, for verification) |
| `fillColor` | RGBA | ❌ | Fill color |
| `strokeColor` | RGBA | ❌ | Stroke color |

**Why unified?** A star with `innerRadius=1.0` is geometrically a polygon. The tool implementation routes to the appropriate Figma API:

| pointCount | innerRadius | Implementation | Result |
|------------|-------------|----------------|--------|
| 3 | 1.0 | `figma.createPolygon(3)` | Triangle |
| 5 | 1.0 | `figma.createPolygon(5)` | Pentagon |
| 6 | 1.0 | `figma.createPolygon(6)` | Hexagon |
| 10 | 0.5 | `figma.createStar(5, 0.5)` | 5-pointed star |
| 6 | 0.3 | `figma.createStar(3, 0.3)` | 3-pointed star |

**Constraint:** When `innerRadius < 1.0`, `pointCount` must be **even** (stars have equal inner/outer vertices).

### Implementation Notes

**main.js — Add to `handleCommand` switch:**

```javascript
case "create_ellipse":
    if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
    if (!(await checkScopeAccess(params ? params.parentId : null))) throw new Error(ERRORS.PARENT_OUTSIDE_SCOPE);
    if (!(await verifyParentName(params ? params.parentId : null, params ? params.parentNodeName : null))) throw new Error(ERRORS.PARENT_NAME_MISMATCH);
    return await createEllipse(params);

case "create_polygon_star":
    if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
    if (!(await checkScopeAccess(params ? params.parentId : null))) throw new Error(ERRORS.PARENT_OUTSIDE_SCOPE);
    if (!(await verifyParentName(params ? params.parentId : null, params ? params.parentNodeName : null))) throw new Error(ERRORS.PARENT_NAME_MISMATCH);
    return await createPolygonStar(params);
```

**nodeCreators.js — Handler implementations:**

```javascript
export async function createEllipse(params) {
    const { x, y, width, height, arcData, name, parentId, fillColor, strokeColor } = params;

    let parent = figma.currentPage;
    if (parentId) {
        parent = await figma.getNodeByIdAsync(parentId);
    }

    const node = figma.createEllipse();
    node.x = x;
    node.y = y;
    node.resize(width, height);

    // Apply arc data if provided
    if (arcData) {
        node.arcData = {
            startingAngle: arcData.startingAngle ?? 0,
            endingAngle: arcData.endingAngle ?? Math.PI * 2,
            innerRadius: arcData.innerRadius ?? 0
        };
    }

    if (name) node.name = name;
    if (fillColor) node.fills = [{ type: 'SOLID', color: { r: fillColor.r, g: fillColor.g, b: fillColor.b }, opacity: fillColor.a ?? 1 }];
    if (strokeColor) node.strokes = [{ type: 'SOLID', color: { r: strokeColor.r, g: strokeColor.g, b: strokeColor.b }, opacity: strokeColor.a ?? 1 }];

    parent.appendChild(node);
    return { id: node.id, name: node.name, type: node.type };
}

export async function createPolygonStar(params) {
    const { x, y, width, height, pointCount, innerRadius = 1.0, name,
            parentId, fillColor, strokeColor } = params;

    let parent = figma.currentPage;
    if (parentId) {
        parent = await figma.getNodeByIdAsync(parentId);
    }

    let node;
    if (innerRadius === 1.0) {
        // Regular polygon
        node = figma.createPolygon();
        node.pointCount = pointCount;
    } else {
        // Star shape - pointCount must be even
        if (pointCount % 2 !== 0) {
            throw new Error("Stars require even pointCount (equal inner/outer vertices)");
        }
        node = figma.createStar();
        node.pointCount = pointCount / 2;  // Figma's pointCount = spike count
        node.innerRadius = innerRadius;
    }

    node.x = x;
    node.y = y;
    node.resize(width, height);
    if (name) node.name = name;
    if (fillColor) node.fills = [{ type: 'SOLID', color: { r: fillColor.r, g: fillColor.g, b: fillColor.b }, opacity: fillColor.a ?? 1 }];
    if (strokeColor) node.strokes = [{ type: 'SOLID', color: { r: strokeColor.r, g: strokeColor.g, b: strokeColor.b }, opacity: strokeColor.a ?? 1 }];

    parent.appendChild(node);
    return { id: node.id, name: node.name, type: node.type };
}
```

- **Scope validation** (🔒): Performed in `handleCommand` via `checkScopeAccess()` on parent
- **Parent name verification**: Performed in `handleCommand` via `verifyParentName()`
- Follow existing pattern from `create_rectangle`
- Add handlers to `nodeCreators.js`, import in `main.js`

---

## Enhancement #4: Add Node Organization Tools

### Overview

Add grouping, ungrouping, flattening, and reparenting capabilities.

### Proposed Tools

| Tool | Description |
|------|-------------|
| `group_nodes` | Group multiple nodes into a group |
| `ungroup_nodes` | Ungroup a group node |
| `flatten_node` | Flatten node to vector |
| `insert_child` | Reparent a node to a new parent |

### `group_nodes` Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `nodes` | array | ✅ | Array of `{ nodeId, nodeName }` objects to group |
| `name` | string | ❌ | Name for the new group |

### `ungroup_nodes` Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `nodeId` | string | ✅ | ID of the group to ungroup |
| `nodeName` | string | ✅ | Name of the group (for verification) |

### `flatten_node` Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `nodeId` | string | ✅ | ID of the node to flatten |
| `nodeName` | string | ✅ | Name of the node (for verification) |

### `insert_child` Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `parentId` | string | ✅ | ID of the new parent node |
| `parentNodeName` | string | ✅ | Name of the parent node (for verification) |
| `childId` | string | ✅ | ID of the child node to reparent |
| `childNodeName` | string | ✅ | Name of the child node (for verification) |
| `index` | number | ❌ | Position in parent's children array (default: append) |

### Implementation Notes

**main.js — Add to `handleCommand` switch:**

```javascript
case "group_nodes":
    if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
    if (!params || !params.nodes || !Array.isArray(params.nodes)) throw new Error("Missing or Invalid nodes parameter");
    
    // Explicitly validate all nodes share the same parent
    if (params.nodes.length > 0) {
        const firstNode = await figma.getNodeByIdAsync(params.nodes[0].nodeId);
        if (!firstNode) throw new Error(`Node ${params.nodes[0].nodeId} not found`);
        const parentId = firstNode.parent?.id;

        for (const item of params.nodes) {
            if (!(await checkScopeAccess(item.nodeId))) throw new Error(`Operation denied: Node ${item.nodeId} outside editable scope`);
            if (!(await verifyNodeName(item.nodeId, item.nodeName))) throw new Error(ERRORS.NAME_MISMATCH);
            
            // Check parent consistency
            const node = await figma.getNodeByIdAsync(item.nodeId);
            if (node.parent?.id !== parentId) {
                throw new Error(`Invalid Grouping: All nodes must share the same parent. Node "${node.name}" is under a different parent than "${firstNode.name}". Use 'insert_child' to reparent them first.`);
            }
        }
    }
    return await groupNodes(params);

case "ungroup_nodes":
    if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
    if (!(await checkScopeAccess(params ? params.nodeId : null))) throw new Error(ERRORS.OUTSIDE_SCOPE);
    if (!(await verifyNodeName(params ? params.nodeId : null, params ? params.nodeName : null))) throw new Error(ERRORS.NAME_MISMATCH);
    return await ungroupNodes(params);

case "flatten_node":
    if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
    if (!(await checkScopeAccess(params ? params.nodeId : null))) throw new Error(ERRORS.OUTSIDE_SCOPE);
    if (!(await verifyNodeName(params ? params.nodeId : null, params ? params.nodeName : null))) throw new Error(ERRORS.NAME_MISMATCH);
    return await flattenNode(params);

case "insert_child":
    if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
    // Validate parent
    if (!(await checkScopeAccess(params ? params.parentId : null))) throw new Error(ERRORS.PARENT_OUTSIDE_SCOPE);
    if (!(await verifyParentName(params ? params.parentId : null, params ? params.parentNodeName : null))) throw new Error(ERRORS.PARENT_NAME_MISMATCH);
    // Validate child
    if (!(await checkScopeAccess(params ? params.childId : null))) throw new Error(ERRORS.OUTSIDE_SCOPE);
    if (!(await verifyNodeName(params ? params.childId : null, params ? params.childNodeName : null))) throw new Error(ERRORS.NAME_MISMATCH);
    return await insertChild(params);
```

**nodeModifiers.js — Handler implementations:**

```javascript
export async function groupNodes(params) {
    const { nodes, name } = params;

    if (!nodes || nodes.length < 2) {
        throw new Error("At least 2 nodes are required to create a group");
    }

    // Collect all nodes (validation already done in handleCommand)
    const resolvedNodes = [];
    for (const { nodeId } of nodes) {
        const node = await figma.getNodeByIdAsync(nodeId);
        resolvedNodes.push(node);
    }

    // Verify all nodes have the same parent
    const parent = resolvedNodes[0].parent;
    for (const node of resolvedNodes) {
        if (node.parent !== parent) {
            throw new Error("All nodes must have the same parent to be grouped");
        }
    }

    const group = figma.group(resolvedNodes, parent);
    if (name) group.name = name;

    return { id: group.id, name: group.name, childCount: group.children.length };
}

export async function ungroupNodes(params) {
    const { nodeId } = params;

    const node = await figma.getNodeByIdAsync(nodeId);
    if (node.type !== "GROUP") {
        throw new Error(`Node is not a group (got ${node.type})`);
    }

    const parent = node.parent;
    const children = [...node.children];
    const childIds = children.map(c => ({ id: c.id, name: c.name }));

    figma.ungroup(node);

    return { ungroupedChildren: childIds, parentId: parent.id };
}

export async function flattenNode(params) {
    const { nodeId } = params;

    const node = await figma.getNodeByIdAsync(nodeId);

    // Note: flatten() is destructive and replaces the node
    const flattened = figma.flatten([node]);

    return { id: flattened.id, name: flattened.name, type: flattened.type };
}

export async function insertChild(params) {
    const { parentId, childId, index } = params;

    const parent = await figma.getNodeByIdAsync(parentId);
    if (!('children' in parent)) {
        throw new Error(`Parent node cannot have children (type: ${parent.type})`);
    }

    const child = await figma.getNodeByIdAsync(childId);

    // Perform reparenting
    if (index !== undefined) {
        parent.insertChild(index, child);
    } else {
        parent.appendChild(child);
    }

    return { childId: child.id, newParentId: parent.id, index: parent.children.indexOf(child) };
}
```

- **Scope validation** (🔒): Performed in `handleCommand` via `checkScopeAccess()`
- **Name verification**: Performed in `handleCommand` via `verifyNodeName()` / `verifyParentName()`
- `flatten_node` is destructive — original node is replaced with a vector
- Add handlers to `nodeModifiers.js`, import in `main.js`

<br>

---

## Enhancement #5: Rename `get_local_components` to `get_components`

### Current Behavior

The current `get_local_components` implementation in [componentHandlers.js:51-66](../src/figma_plugin/handlers/componentHandlers.js#L51-L66) returns ALL components without distinguishing local vs library components:

```javascript
export async function getLocalComponents() {
    await figma.loadAllPagesAsync();

    const components = figma.root.findAllWithCriteria({
        types: ["COMPONENT"],
    });

    return {
        count: components.length,
        components: components.map((component) => ({
            id: component.id,
            name: component.name,
            key: "key" in component ? component.key : null,
        })),
    };
}
```

### Problem

According to the [Figma Plugin API](https://developers.figma.com/docs/plugins/api/ComponentNode/), components have a `remote` property:

| `remote` Value | Meaning |
|----------------|---------|
| `false` | Local component (editable, created in this file) |
| `true` | Library component (read-only, from team library) |

The current implementation:
- Returns ALL components (local + library) but calls itself "get_local_components"
- Doesn't include the `remote` property, so AI cannot distinguish between them
- A separate `get_remote_components` tool would be pointless since you cannot enumerate team library components—only import them by key

### Proposed Enhancement

Rename `get_local_components` to `get_components` and add optional filtering and scoping:

```javascript
export async function getComponents(params) {
    const { filter, scope = 'current_page' } = params || {};
    // scope: 'current_page' (default) or 'document' (slow)

    let searchRoot = figma.currentPage;

    if (scope === 'document') {
        await figma.loadAllPagesAsync();
        searchRoot = figma.root;
    }

    let components = searchRoot.findAllWithCriteria({
        types: ["COMPONENT"],
    });

    if (filter === 'local') {
        components = components.filter(c => !c.remote);
    } else if (filter === 'remote') {
        components = components.filter(c => c.remote);
    }

    return {
        count: components.length,
        scope: scope,
        components: components.map((component) => ({
            id: component.id,
            name: component.name,
            key: component.key,
            remote: component.remote,
            pageId: component.parent?.type === 'PAGE' ? component.parent.id : 'nested',
        })),
    };
}
```

### Benefits

| Aspect | Before | After |
|--------|--------|-------|
| Distinguishes local vs library | ❌ | ✅ |
| Accurate tool naming | ❌ (returns all) | ✅ |
| Supports filtering | ❌ | ✅ |
| Performance control | ❌ (Always loads all pages) | ✅ (Default: current page only) |
| Eliminates need for `get_remote_components` | N/A | ✅ |

---

## Enhancement #6: Add Component Set (Variants) Tool

### Overview

Add support for creating component sets (variant containers) to enable design system workflows with component variants.

### Background

In Figma, a **ComponentSet** is a container that groups related component **variants** together:

```
ComponentSet "Button"
├── Component "Size=Small, State=Default"
├── Component "Size=Small, State=Hover"
├── Component "Size=Medium, State=Default"
├── Component "Size=Medium, State=Hover"
└── ...
```

This enables designers to create components with multiple properties (size, state, theme) that users can switch between via the properties panel.

### Proposed Tool

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `create_component_set` | Combine components into a variant set | `componentIds, name?` |

### `create_component_set` Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `components` | array | ✅ | Array of component objects (see below) |
| `properties` | array | ✅ | Array of property names (e.g. `["Size", "State"]`) |
| `componentSetName` | string | ❌ | Name for the component set |
| `parentId` | string | ❌ | Parent frame to place the set in |
| `parentNodeName` | string | ❌ | Name of parent node (required if parentId provided, for verification) |

**Component object structure:**
| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `nodeId` | string | ✅ | ID of the component |
| `nodeName` | string | ✅ | Current name (for verification) |
| `propertyValues`| array | ✅ | Values corresponding to `properties` array (e.g. `["Small", "Default"]`) |

### Usage Example

```javascript
// Combine components into a valid variant set
create_component_set({
    properties: ["Size", "State"],
    components: [
        { 
            nodeId: "1:1", 
            nodeName: "Btn 1", 
            propertyValues: ["Small", "Default"] 
        },
        { 
            nodeId: "1:2", 
            nodeName: "Btn 2", 
            propertyValues: ["Small", "Hover"] 
        }
    ],
    componentSetName: "Button"
})
// Result: 
// - Component 1: renamed to "Size=Small, State=Default"
// - Component 2: renamed to "Size=Small, State=Hover"
// - Component Set: named "Button" with "Size" and "State" properties
```

### Key Behaviors

- **Auto-renaming**: The tool will rename each component node to `Prop1=Value1, Prop2=Value2` format BEFORE combining them.
- **Validation**: `propertyValues.length` for every component MUST match `properties.length`.

### Implementation Notes

**main.js — Add to `handleCommand` switch:**

```javascript
case "create_component_set":
    // ... scope validation ...
    const params = params || {};
    const props = params.properties || [];
    
    // Validate property count match
    if (params.components) {
        for (const comp of params.components) {
            if (!comp.propertyValues || !Array.isArray(comp.propertyValues)) {
                throw new Error(`Component ${comp.nodeId} missing propertyValues array`);
            }
            if (comp.propertyValues.length !== props.length) {
                throw new Error(`Component ${comp.nodeId} has ${comp.propertyValues.length} values, expected ${props.length} (to match properties argument)`);
            }
        }
    }
    return await createComponentSet(params);
```

**componentHandlers.js — Handler implementation:**

```javascript
export async function createComponentSet(params) {
    const { components, properties, componentSetName, parentId } = params || {};

    if (!components || components.length < 2) {
        throw new Error("At least 2 components required to create a component set");
    }

    const resolvedComponents = [];
    
    for (const item of components) {
        const comp = await figma.getNodeByIdAsync(item.nodeId);
        if (comp.type !== "COMPONENT") throw new Error(`Node ${item.nodeId} is not a component`);
        
        // Rename component to "Key=Value, Key=Value" format
        const nameParts = [];
        for (let i = 0; i < properties.length; i++) {
            nameParts.push(`${properties[i]}=${item.propertyValues[i]}`);
        }
        comp.name = nameParts.join(", ");
        
        resolvedComponents.push(comp);
    }

    // ... combine logic ...
    // Get parent (validation already done in handleCommand)
    let parent = figma.currentPage;
    if (parentId) {
        parent = await figma.getNodeByIdAsync(parentId);
    }

    // Combine into variant set
    const componentSet = figma.combineAsVariants(resolvedComponents, parent);

    if (componentSetName) {
        componentSet.name = componentSetName;
    }

    return {
        id: componentSet.id,
        name: componentSet.name,
        type: componentSet.type,
        variantCount: componentSet.children.length,
        defaultVariant: componentSet.defaultVariant?.id,
    };
}
```

- **Scope validation** (🔒): Performed in `handleCommand` via `checkScopeAccess()` on all components and parent
- **Name verification**: Performed in `handleCommand` via `verifyNodeName()` / `verifyParentName()`
- Add handler to `componentHandlers.js`, import in `main.js`

---

## Enhancement #7: Consolidate Connector Tools

### Current Behavior

The current implementation uses two separate tools for creating connectors:

1. **`set_default_connector`** ([connectorHandlers.js:174-259](../src/figma_plugin/handlers/connectorHandlers.js#L174-L259)) — Sets a connector node as the template, storing its ID in `figma.clientStorage`
2. **`create_connections`** ([connectorHandlers.js:378-572](../src/figma_plugin/handlers/connectorHandlers.js#L378-L572)) — Retrieves the stored template, clones it for each connection

This two-step workflow exists because Figma has no `createConnector()` API — connectors must be cloned from an existing template to preserve styling (stroke, endpoints, text style, etc.).

### Problem

- Requires two tool calls for a single logical operation
- Users must remember to set the default before creating connections
- Error-prone if the default connector is deleted or invalid

### Proposed Enhancement

Merge `set_default_connector` into `create_connections` by adding an optional `connectorId` parameter:

```javascript
// Current: Two separate calls
set_default_connector({ connectorId: "123:456" })
create_connections({ connections: [...] })

// Proposed: Single call with optional template
create_connections({
    connections: [...],
    connectorId: "123:456"  // Optional: use as template and set as new default
})
```

### Updated `create_connections` Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `connections` | array | ✅ | Array of connection objects (see below) |
| `connectorId` | string | ❌ | Connector to use as template (also sets as new default) |
| `connectorNodeName` | string | ❌ | Name of connector node (required if connectorId provided, for verification) |

**Connection object properties:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `startNodeId` | string | ✅ | ID of the starting node |
| `startNodeName` | string | ✅ | Name of the starting node (for verification) |
| `endNodeId` | string | ✅ | ID of the ending node |
| `endNodeName` | string | ✅ | Name of the ending node (for verification) |
| `text` | string | ❌ | Optional text label on the connector |

### Behavior

| `connectorId` provided? | Behavior |
|-------------------------|----------|
| Yes | Use specified connector as template, save as new default |
| No | Use existing default from storage |
| No + no stored default | Auto-discover from current page (existing fallback) |

### Implementation Changes

**main.js — Update existing `create_connections` case in `handleCommand`:**

```javascript
case "create_connections":
    if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
    if (params && params.connections && Array.isArray(params.connections)) {
        for (const conn of params.connections) {
            if (!(await checkScopeAccess(conn.startNodeId))) throw new Error(`Operation denied: Start node ${conn.startNodeId} outside editable scope`);
            if (!(await verifyNodeName(conn.startNodeId, conn.startNodeName))) throw new Error(ERRORS.NAME_MISMATCH);

            if (!(await checkScopeAccess(conn.endNodeId))) throw new Error(`Operation denied: End node ${conn.endNodeId} outside editable scope`);
            if (!(await verifyNodeName(conn.endNodeId, conn.endNodeName))) throw new Error(ERRORS.NAME_MISMATCH);
        }
    }
    // NEW: Validate connector template if provided
    if (params && params.connectorId) {
        if (!(await checkScopeAccess(params.connectorId))) throw new Error(`Operation denied: Connector ${params.connectorId} outside editable scope`);
        if (!(await verifyNodeName(params.connectorId, params.connectorNodeName))) throw new Error(ERRORS.NAME_MISMATCH);
    }
    return await createConnections(params);
```

**connectorHandlers.js — Handler implementation:**

```javascript
export async function createConnections(params) {
    const { connections, connectorId } = params;

    // Validate connections array
    if (!connections || !Array.isArray(connections) || connections.length === 0) {
        throw new Error("At least one connection is required");
    }

    // If connectorId provided, set as new default (validation done in handleCommand)
    if (connectorId) {
        const connector = await figma.getNodeByIdAsync(connectorId);
        if (connector.type !== 'CONNECTOR') {
            throw new Error(`Node is not a connector (got ${connector.type})`);
        }
        await figma.clientStorage.setAsync('defaultConnectorId', connectorId);
    }

    // Get default connector (now guaranteed to exist if connectorId was provided)
    const defaultConnectorId = await figma.clientStorage.getAsync('defaultConnectorId');
    if (!defaultConnectorId) {
        // Existing auto-discovery fallback...
    }

    // ... rest of existing implementation
}
```

**MCP server side** ([src/mcp_server/tools/prototyping.ts](../src/mcp_server/tools/prototyping.ts)):

Add `connectorId` and `connectorNodeName` parameters to the `create_connections` tool schema, then **deprecate** `set_default_connector` (can be removed in a future version).

**Validation notes:**
- **Scope validation** (🔒): Performed in `handleCommand` via `checkScopeAccess()` on start nodes, end nodes, and connector template
- **Name verification**: Performed in `handleCommand` via `verifyNodeName()` for all nodes

### Benefits

| Aspect | Before | After |
|--------|--------|-------|
| Tool count | 2 | 1 |
| Calls to create connections | 2 (set + create) | 1 |
| Template specified inline | ❌ | ✅ |
| Backward compatible | N/A | ✅ (connectorId is optional) |

### Migration Path

1. Add `connectorId` parameter to `create_connections`
2. Mark `set_default_connector` as deprecated in documentation
3. Remove `set_default_connector` in next major version

---

## Enhancement #8: Consolidate Auto-Layout Tools

### Overview

Consolidate 5 separate auto-layout tools into a single `set_auto_layout` tool. This is the highest-impact consolidation opportunity, saving 4 tools while matching how designers actually configure auto-layout (all properties together).

### Current Tools

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `set_layout_mode` | Enable/disable auto-layout | `layoutMode`, `layoutWrap?` |
| `set_padding` | Set inner padding | `paddingTop?`, `paddingRight?`, `paddingBottom?`, `paddingLeft?` |
| `set_axis_align` | Set alignment | `primaryAxisAlignItems?`, `counterAxisAlignItems?` |
| `set_layout_sizing` | Set sizing behavior | `layoutSizingHorizontal?`, `layoutSizingVertical?` |
| `set_item_spacing` | Set gaps between children | `itemSpacing?`, `counterAxisSpacing?` |

All share `nodeId` + `nodeName` (or `expectedName`) as required parameters.

### Problem

- Configuring auto-layout requires up to 5 separate tool calls
- These properties are almost always configured together
- Inconsistent parameter naming (`nodeName` vs `expectedName` in `set_item_spacing`)
- Doesn't match Figma's UI where all auto-layout settings appear in one panel

### Proposed Tool: `set_auto_layout`

```javascript
set_auto_layout({
    nodeId: "123:456",
    nodeName: "Card",

    // Layout mode
    layoutMode: "VERTICAL",
    layoutWrap: "NO_WRAP",

    // Padding
    paddingTop: 16,
    paddingRight: 16,
    paddingBottom: 16,
    paddingLeft: 16,

    // Alignment
    primaryAxisAlignItems: "MIN",
    counterAxisAlignItems: "CENTER",

    // Sizing
    layoutSizingHorizontal: "FILL",
    layoutSizingVertical: "HUG",

    // Spacing
    itemSpacing: 12,
    counterAxisSpacing: 8
})
```

### `set_auto_layout` Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `nodeId` | string | ✅ | Target frame ID |
| `nodeName` | string | ✅ | Frame name for verification |
| **Layout Mode** |
| `layoutMode` | enum | ❌ | `NONE`, `HORIZONTAL`, `VERTICAL` |
| `layoutWrap` | enum | ❌ | `NO_WRAP`, `WRAP` |
| **Padding** |
| `paddingTop` | number | ❌ | Top padding in pixels |
| `paddingRight` | number | ❌ | Right padding in pixels |
| `paddingBottom` | number | ❌ | Bottom padding in pixels |
| `paddingLeft` | number | ❌ | Left padding in pixels |
| **Alignment** |
| `primaryAxisAlignItems` | enum | ❌ | `MIN`, `MAX`, `CENTER`, `SPACE_BETWEEN` |
| `counterAxisAlignItems` | enum | ❌ | `MIN`, `MAX`, `CENTER`, `BASELINE` |
| **Sizing** |
| `layoutSizingHorizontal` | enum | ❌ | `FIXED`, `HUG`, `FILL` |
| `layoutSizingVertical` | enum | ❌ | `FIXED`, `HUG`, `FILL` |
| **Spacing** |
| `itemSpacing` | number | ❌ | Gap between children (ignored if `SPACE_BETWEEN`) |
| `counterAxisSpacing` | number | ❌ | Gap between wrapped rows/columns (requires `WRAP`) |

### Usage Examples

```javascript
// Enable vertical auto-layout with padding and spacing
set_auto_layout({
    nodeId: "123:456",
    nodeName: "Card",
    layoutMode: "VERTICAL",
    paddingTop: 16,
    paddingRight: 16,
    paddingBottom: 16,
    paddingLeft: 16,
    itemSpacing: 12
})

// Just update alignment (partial update)
set_auto_layout({
    nodeId: "123:456",
    nodeName: "Card",
    primaryAxisAlignItems: "CENTER",
    counterAxisAlignItems: "CENTER"
})

// Configure a responsive wrap layout
set_auto_layout({
    nodeId: "123:456",
    nodeName: "Grid",
    layoutMode: "HORIZONTAL",
    layoutWrap: "WRAP",
    itemSpacing: 16,
    counterAxisSpacing: 16,
    layoutSizingHorizontal: "FILL"
})
```

### Implementation Notes

> [!IMPORTANT]
> **Strict Handler Behavior**: This tool must rigorously treat missing parameters as "do not change" (noop). If a parameter is `undefined`, the corresponding property on the node MUST remain untouched.

**main.js — Add to `handleCommand` switch:**

```javascript
case "set_auto_layout":
    if (state.readOnly) throw new Error(ERRORS.READ_ONLY_MODE);
    if (!(await checkScopeAccess(params ? params.nodeId : null))) throw new Error(ERRORS.OUTSIDE_SCOPE);
    if (!(await verifyNodeName(params ? params.nodeId : null, params ? params.nodeName : null))) throw new Error(ERRORS.NAME_MISMATCH);
    return await setAutoLayout(params);
```

**layoutHandlers.js — Handler implementation:**

```javascript
export async function setAutoLayout(params) {
    const { nodeId, layoutMode, layoutWrap,
            paddingTop, paddingRight, paddingBottom, paddingLeft,
            primaryAxisAlignItems, counterAxisAlignItems,
            layoutSizingHorizontal, layoutSizingVertical,
            itemSpacing, counterAxisSpacing } = params;

    const node = await figma.getNodeByIdAsync(nodeId);

    // Type check
    if (!('layoutMode' in node)) {
        throw new Error(`Node does not support auto-layout (type: ${node.type})`);
    }

    // Apply only provided properties
    if (layoutMode !== undefined) node.layoutMode = layoutMode;
    if (layoutWrap !== undefined) node.layoutWrap = layoutWrap;
    if (paddingTop !== undefined) node.paddingTop = paddingTop;
    if (paddingRight !== undefined) node.paddingRight = paddingRight;
    if (paddingBottom !== undefined) node.paddingBottom = paddingBottom;
    if (paddingLeft !== undefined) node.paddingLeft = paddingLeft;
    if (primaryAxisAlignItems !== undefined) node.primaryAxisAlignItems = primaryAxisAlignItems;
    if (counterAxisAlignItems !== undefined) node.counterAxisAlignItems = counterAxisAlignItems;
    if (layoutSizingHorizontal !== undefined) node.layoutSizingHorizontal = layoutSizingHorizontal;
    if (layoutSizingVertical !== undefined) node.layoutSizingVertical = layoutSizingVertical;
    if (itemSpacing !== undefined) node.itemSpacing = itemSpacing;
    if (counterAxisSpacing !== undefined) node.counterAxisSpacing = counterAxisSpacing;

    return {
        id: node.id,
        name: node.name,
        layoutMode: node.layoutMode,
        // ... return applied properties for confirmation
    };
}
```

- **Scope validation** (🔒): Performed in `handleCommand` via `checkScopeAccess()`
- **Name verification**: Performed in `handleCommand` via `verifyNodeName()`
- All parameters except `nodeId`/`nodeName` are optional
- Only applies properties that are explicitly provided
- Add handler to `layoutHandlers.js`, import in `main.js`

### Benefits

| Aspect | Before | After |
|--------|--------|-------|
| Tool count | 5 | 1 |
| Calls to configure layout | Up to 5 | 1 |
| Atomic configuration | ❌ | ✅ |
| Partial updates | ✅ | ✅ |
| Consistent param naming | ❌ (`expectedName` vs `nodeName`) | ✅ |
| Matches Figma UI | ❌ | ✅ |

### Migration Path

1. Add `set_auto_layout` tool
2. Mark 5 existing tools as deprecated in documentation
3. Remove deprecated tools in next major version:
   - `set_layout_mode`
   - `set_padding`
   - `set_axis_align`
   - `set_layout_sizing`
   - `set_item_spacing`

---

## Implementation Priority

### Phase 1: Quick Wins (High Impact, Low Effort)
1. Enhance `get_document_info` to include all pages (#1)
2. Rename `get_local_components` → `get_components` with filtering (#5)
3. Consolidate connector tools (#7)

### Phase 2: Major Consolidations (High Impact)
4. Consolidate auto-layout tools into `set_auto_layout` (#8) — **saves 4 tools**
5. Add unified `set_text_style` tool (#2)

### Phase 3: New Capabilities
6. Add shape creation tools: `create_ellipse`, `create_polygon_star` (#3)
7. Add node organization tools: `group_nodes`, `ungroup_nodes`, `flatten_node`, `insert_child` (#4)
8. Add `create_component_set` for variant workflows (#6)

---

## Tracking

| Enhancement | Status | PR | Notes |
|-------------|--------|-----|-------|
| #1 Expand `get_document_info` | Pending | - | Include all pages, not just current |
| #2 Text styling tool | Pending | - | 1 unified `set_text_style` (replaces 9 tools) |
| #3 Shape creation tools | Pending | - | 2 tools: `create_ellipse`, `create_polygon_star` |
| #4 Node organization tools | Pending | - | 4 tools: group, ungroup, flatten, insert_child |
| #5 Rename to `get_components` | Pending | - | Add `remote` property and optional `filter` param |
| #6 Component set tool | Pending | - | `create_component_set` for variant workflows |
| #7 Consolidate connector tools | Pending | - | Merge `set_default_connector` into `create_connections` (-1 tool) |
| #8 Consolidate auto-layout tools | Pending | - | Merge 5 tools into `set_auto_layout` (-4 tools) |

---

**Last Updated:** February 3, 2026 (Refactored validation to use handleCommand pattern from main.js)
