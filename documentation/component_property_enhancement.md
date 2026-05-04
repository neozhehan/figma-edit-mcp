# Component Property Enhancements

This document outlines the implementation plan for enhancing the Figma MCP server to fully support component property reading, writing, and management.

## 1. Enhance `get_nodes_info` Tool

Currently, `get_nodes_info` returns a large amount of hardcoded styling and structure data, but filters out component properties, auto-layout, and prototyping data. We will make this tool dynamic.

**Requirements:**
- Update the `get_nodes_info` MCP tool schema to accept an optional `fields` array of strings. Supported fields should include:
  - **Component Properties**: `componentPropertyDefinitions`, `componentProperties`, `overrides`
  - **Layout & Positioning**: `layoutMode`, `itemSpacing`, `paddingLeft`, `paddingRight`, `paddingTop`, `paddingBottom`, `primaryAxisAlignItems`, `counterAxisAlignItems`, `layoutAlign`, `layoutGrow`, `absoluteBoundingBox`
  - **Styling**: `fills`, `strokes`, `cornerRadius`, `opacity`, `blendMode`, `effects`
  - **Text**: `characters`, `style`
  - **Prototyping**: `transitionNodeID`, `transitionDuration`, `transitionEasing`
  - **Metadata**: `visible`, `locked`, `type`
- By default, if the `fields` array is empty or not provided, the tool must only return the `id` and `name` for each requested `nodeId` (significantly improving performance and token usage).
- Update the `filterFigmaNode` function in the Figma plugin to respect the `fields` array:
  - Extract the raw REST API data via `node.exportAsync({ format: "JSON_REST_V1" })`.
  - Filter the resulting object to include only `id`, `name`, and the specific properties requested in the `fields` array.
  - Recursively apply this filtering to `children`.

---

## 2. `set_component_instance_property` Tool

A new tool focused purely on setting property values on component instances (not to be confused with the bulk-cloning behavior of `set_instance_overrides`).

**Requirements:**
- **Purpose**: Set a specific property value (boolean toggle, text override, instance swap, or variant selection) on an instance.
- **Parameters**:
  - `nodeId` (string, required): ID of the instance node.
  - `nodeName` (string, required): Name of the instance node for verification.
  - `propertyName` (string, required): The exact name of the component property to change (e.g., "State", "Show Icon").
  - `value` (string | boolean, required): The new value for the property.
- **Implementation Strategy**:
  - Figma Plugin Handler: Find the instance node, verify it's an `INSTANCE`, and call `instance.setProperties({ [propertyName]: value })`.
  - MCP Tool: Register in `components.ts` and route the command in `main.ts`.

---

## 3. `manage_component_property` Tool

A new tool focused on defining, editing, and deleting component properties on Main Components or Component Sets.

**Requirements:**
- **Purpose**: Perform CRUD operations on property definitions for main components or variant sets.
- **Parameters**:
  - `nodeId` (string, required): ID of the `COMPONENT` or `COMPONENT_SET`.
  - `nodeName` (string, required): Name of the node for verification.
  - `action` (enum, required): `ADD`, `EDIT`, or `DELETE`.
  - `propertyName` (string, required): The name of the property to affect.
  - `newPropertyName` (string, optional): For the `EDIT` action, to rename the property.
  - `propertyType` (enum, required for `ADD`): `BOOLEAN`, `TEXT`, `INSTANCE_SWAP`, or `VARIANT`.
  - `defaultValue` (string | boolean, optional): Default value for the property (required for `ADD`).
- **Implementation Strategy**:
  - Add a handler in `componentHandlers.ts`.
  - For `ADD`: Use `node.addComponentProperty(propertyName, propertyType, defaultValue)`.
  - For `EDIT`: Use `node.editComponentProperty(propertyName, { name: newPropertyName, defaultValue: newDefaultValue })`.
  - For `DELETE`: Use `node.deleteComponentProperty(propertyName)`.
  - MCP Tool: Register in `components.ts` and route the command in `main.ts`.
