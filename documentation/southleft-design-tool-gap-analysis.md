# Southleft Figma Design Tool Gap Analysis

## Scope

This document compares Figma Design tools provided by `southleft/figma-console-mcp` that are missing from the local `figma-edit-mcp` project.

This is not a popularity comparison. It focuses on raw design functionality visible in the source code and on workflows a Figma Design user is likely to use.

Excluded from this document:

- FigJam-only tools.
- Figma Slides-only tools.
- Console/debugging tools.
- Transport, pairing, reconnect, diagnostics, status, and setup plumbing.
- Tools that are already covered well by the local project with a different name or a safer local implementation.

## Summary

The local project is stronger for safe, scoped live editing. Southleft is stronger for broad design-system workflows, design-to-code handoff, visual QA, library access, comments/version collaboration, image fills, and flexible automation.

Each tool entry includes a compact representative success response showing the LLM-visible payload shape. Field names, nesting, and information categories are the important part; exact values and optional fields vary by Southleft version, mode, input options, compression, and error handling.

The most valuable missing groups to consider are:

| Priority | Group | Why it matters |
|---|---|---|
| P0 | Image fills | Common Figma editing operation not currently exposed as a first-class local tool. |
| P0 | Component handoff and deep extraction | Critical for turning Figma components into production UI. |
| P1 | Design-system kit and token file workflows | Bridges Figma variables/styles/components with codebase design tokens. |
| P1 | Library discovery and import | Important for teams that use published Figma libraries. |
| P1 | Design QA and accessibility | Helps evaluate design quality, parity, and accessibility before implementation. |
| P2 | Comments and version history | Supports real collaboration and review workflows. |
| P2 | File/context reads | Useful for large-file discovery and REST-backed file inspection. |
| P3 | Arbitrary Figma execution | Very powerful escape hatch, but high risk and not aligned with local safety constraints. |

## 1. Image And Media Fills

### `figma_set_image_fill`

What it does:

- Applies image data as an image fill to one or more Figma nodes.
- Creates a Figma image from bytes, obtains its image hash, and sets the target node fills to an `IMAGE` paint.
- Supports `scaleMode` such as `FILL`.

Example response / LLM-visible data:

```json
{
  "success": true,
  "imageHash": "b9f4c2...",
  "updatedCount": 2,
  "nodes": [
    {
      "id": "123:456",
      "name": "Hero image placeholder",
      "type": "RECTANGLE",
      "fills": [
        {
          "type": "IMAGE",
          "imageHash": "b9f4c2...",
          "scaleMode": "FILL"
        }
      ]
    }
  ]
}
```

Role in the design process:

- Adds real product imagery, avatars, thumbnails, covers, and screenshots to design mockups.
- Lets an agent populate placeholder rectangles with actual visual assets.
- Useful for generating realistic states during design iteration, not just schematic layouts.

Local project gap:

- Local supports literal fill colors with `node_set_fill` and style/variable binding, but does not expose image fills as a first-class operation.

Implementation note:

- This is one of the cleanest high-value additions for the local project because it can fit the existing safety model: require `nodeId`, `nodeName`, scope validation, and per-item validation for batch targets.

## 2. Component Handoff And Deep Extraction

### `figma_get_component_for_development`

What it does:

- Fetches a component in a format optimized for implementation.
- Includes technical design data such as layout, sizing, text behavior, constraints, bound variables, reactions, annotations, and a rendered visual reference.
- Uses REST API data and can be paired with Desktop Bridge data where available.

Example response / LLM-visible data:

```json
{
  "component": {
    "id": "695:313",
    "name": "Button / Primary",
    "type": "COMPONENT",
    "description": "Primary action button",
    "componentPropertyDefinitions": {
      "Label": { "type": "TEXT", "defaultValue": "Continue" },
      "Icon": { "type": "BOOLEAN", "defaultValue": false }
    },
    "bounds": { "x": 120, "y": 80, "width": 144, "height": 44 },
    "layout": {
      "layoutMode": "HORIZONTAL",
      "paddingLeft": 16,
      "paddingRight": 16,
      "itemSpacing": 8,
      "primaryAxisSizingMode": "AUTO",
      "counterAxisSizingMode": "FIXED"
    },
    "visual": {
      "fills": [{ "type": "SOLID", "color": "#2563EB" }],
      "cornerRadius": 8,
      "effects": [{ "type": "DROP_SHADOW", "radius": 8 }]
    },
    "typography": {
      "fontFamily": "Inter",
      "fontSize": 14,
      "fontWeight": 600,
      "lineHeight": 20
    },
    "boundVariables": {
      "fills.0.color": {
        "id": "VariableID:1:10",
        "name": "color/action/primary"
      }
    },
    "annotations": [
      { "labelMarkdown": "Use for one primary action per view." }
    ]
  },
  "image": {
    "url": "https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/...",
    "format": "png",
    "scale": 2
  }
}
```

Role in the design process:

- Supports design-to-code handoff.
- Helps engineers implement components with the right spacing, typography, variants, states, and token bindings.
- Reduces the need for manual inspection in Figma Dev Mode.

Local project gap:

- Local `node_info`, `component_list`, `variable_list`, `annotation_list`, and `node_export_visual` expose pieces of this, but there is no single implementation-focused component extraction workflow.

### `figma_get_component_for_development_deep`

What it does:

- Extracts a deeply nested component tree through the Desktop Bridge plugin.
- Returns deeper visual structure than REST depth-limited reads.
- Resolves design token names, instance references, interactions, and annotations at nested levels.

Example response / LLM-visible data:

```json
{
  "component": {
    "id": "900:10",
    "name": "Combobox",
    "type": "COMPONENT_SET"
  },
  "tree": {
    "id": "900:11",
    "name": "State=Default",
    "type": "COMPONENT",
    "layout": { "layoutMode": "VERTICAL", "itemSpacing": 4 },
    "visualSpec": { "fills": [{ "color": "#FFFFFF" }], "cornerRadius": 8 },
    "children": [
      {
        "id": "900:12",
        "name": "Input row",
        "type": "FRAME",
        "layout": { "layoutMode": "HORIZONTAL", "paddingLeft": 12 },
        "boundTokens": {
          "borderColor": "color/border/default",
          "text": "typography/body-md"
        },
        "children": [
          { "id": "900:13", "name": "Label", "type": "TEXT", "characters": "Choose option" }
        ]
      }
    ]
  },
  "resolvedTokens": {
    "color/border/default": "#D1D5DB",
    "typography/body-md": {
      "fontFamily": "Inter",
      "fontSize": 14,
      "lineHeight": 20
    }
  },
  "instanceRefs": [
    { "nodeId": "900:14", "componentKey": "a1b2...", "name": "Icon / Chevron Down" }
  ],
  "interactions": [
    { "trigger": "ON_CLICK", "action": "OPEN_OVERLAY", "destinationId": "900:50" }
  ],
  "annotations": [
    { "nodeId": "900:12", "labelMarkdown": "Keyboard opens menu with Enter." }
  ]
}
```

Role in the design process:

- Useful for complex components such as tables, menus, date pickers, modals, filters, and compound forms.
- Helps agents understand hidden implementation-critical structure that shallow reads miss.
- Improves generated UI fidelity.

Local project gap:

- Local `node_info` supports recursive traversal and field selection, but it is a general-purpose node reader. It does not package a component-development view with resolved implementation guidance and code-facing metadata.

### `figma_analyze_component_set`

What it does:

- Analyzes a `COMPONENT_SET`.
- Extracts variant axes, variant values, default states, CSS-like state mappings, cross-variant diffs, and component property definitions.

Example response / LLM-visible data:

```json
{
  "componentSet": {
    "id": "700:1",
    "name": "Button",
    "variantCount": 12
  },
  "variantAxes": {
    "Size": ["Small", "Medium", "Large"],
    "State": ["Default", "Hover", "Pressed", "Disabled"],
    "Variant": ["Primary", "Secondary"]
  },
  "defaultVariant": {
    "id": "700:2",
    "name": "Size=Medium, State=Default, Variant=Primary"
  },
  "componentProperties": {
    "Label": { "type": "TEXT", "defaultValue": "Button" },
    "Show icon": { "type": "BOOLEAN", "defaultValue": false }
  },
  "stateMappings": {
    "Hover": { "cssPseudoClass": ":hover", "variantId": "700:3" },
    "Pressed": { "cssPseudoClass": ":active", "variantId": "700:4" },
    "Disabled": { "ariaState": "disabled", "variantId": "700:5" }
  },
  "crossVariantDiffs": [
    {
      "from": "State=Default",
      "to": "State=Hover",
      "changes": [
        { "property": "fills.0.color", "from": "#2563EB", "to": "#1D4ED8" }
      ]
    }
  ],
  "recommendedProps": [
    { "name": "size", "values": ["sm", "md", "lg"] },
    { "name": "variant", "values": ["primary", "secondary"] },
    { "name": "disabled", "sourceAxis": "State=Disabled" }
  ]
}
```

Role in the design process:

- Turns Figma variant sets into implementation-ready component APIs.
- Helps map variant dimensions like `size`, `state`, `type`, and `theme` to code props.
- Helps identify what changes between hover, focus, disabled, selected, error, and default states.

Local project gap:

- Local can list components and manage component properties, but does not provide a variant-state analysis tool for code handoff.

### `figma_generate_component_doc`

What it does:

- Generates structured component documentation from a Figma component.
- Can include anatomy, variants, visual specs, typography, content guidance, annotations, accessibility notes, and implementation sections.

Example response / LLM-visible data:

```json
{
  "componentName": "Button",
  "markdown": "---\ntitle: Button\nlevel: atom\n---\n\n# Button\n\nUse Button for primary and secondary actions...\n",
  "includedSections": [
    "overview",
    "statesAndVariants",
    "visualSpecs",
    "implementation",
    "accessibility"
  ],
  "dataSourceSummary": {
    "figmaEnriched": true,
    "codeInfoProvided": true,
    "variablesIncluded": true,
    "stylesIncluded": true
  },
  "suggestedOutputPath": "docs/components/button.md",
  "ai_instruction": "Save the markdown to the suggested path or ask the user where to place it."
}
```

Role in the design process:

- Helps create design-system documentation.
- Converts design metadata into usable reference material for designers and engineers.
- Supports design reviews and onboarding for component libraries.

Local project gap:

- Local can read annotations, components, styles, and variables, but does not synthesize component documentation.

### `figma_get_component`

What it does:

- Retrieves a single component's metadata or a reconstruction specification.
- Can return component descriptions, properties, variants, annotations, and token-related metadata.

Example response / LLM-visible data:

```json
{
  "format": "metadata",
  "component": {
    "id": "695:313",
    "key": "6f2b9c...",
    "name": "Card",
    "type": "COMPONENT",
    "description": "Content container"
  },
  "properties": {
    "Variant": { "type": "VARIANT", "values": ["Default", "Elevated"] }
  },
  "variants": [
    { "id": "695:314", "name": "Variant=Default" },
    { "id": "695:315", "name": "Variant=Elevated" }
  ],
  "visualSpec": {
    "fills": [{ "color": "#FFFFFF" }],
    "cornerRadius": 12,
    "layout": { "paddingTop": 24, "paddingLeft": 24 }
  },
  "tokenCoverage": {
    "totalProperties": 9,
    "boundProperties": 6,
    "percentage": 67
  }
}
```

Role in the design process:

- Supports component inventory, documentation, and reuse decisions.
- Helps agents inspect one component before editing or implementing it.

Local project gap:

- Local `component_list` is useful for discovery, but does not provide the same higher-level metadata/reconstruction packaging.

### `figma_get_component_details`

What it does:

- Retrieves additional component detail beyond a basic search result.
- Typically used after discovering a component and before instantiating, documenting, or implementing it.

Example response / LLM-visible data:

```json
{
  "component": {
    "id": "810:22",
    "key": "f83a...",
    "name": "Input / Text Field",
    "type": "COMPONENT_SET",
    "description": "Single-line text input"
  },
  "source": {
    "fileKey": "abc123",
    "fileName": "Core Design System",
    "pageName": "Components"
  },
  "propertyDefinitions": {
    "State": { "type": "VARIANT", "values": ["Default", "Focus", "Error", "Disabled"] },
    "Label": { "type": "BOOLEAN", "defaultValue": true }
  },
  "variants": [
    {
      "id": "810:23",
      "name": "State=Default",
      "key": "variantKey1",
      "visualSpec": {
        "borderColor": "#D1D5DB",
        "height": 40,
        "typography": { "fontSize": 14 }
      }
    }
  ],
  "documentation": {
    "usage": "Use for short text entry.",
    "accessibility": "Requires visible label or aria-label."
  }
}
```

Role in the design process:

- Lets an agent move from broad search to precise component understanding.
- Helps avoid using the wrong variant or wrong component in a design system.

Local project gap:

- Local has component listing and instance/property operations, but less dedicated component-detail tooling for design-system handoff.

### `figma_get_component_image`

What it does:

- Retrieves a rendered image for a component.
- Provides a visual reference independent of raw node JSON.

Example response / LLM-visible data:

```json
{
  "nodeId": "695:313",
  "name": "Button / Primary",
  "format": "png",
  "scale": 2,
  "imageUrl": "https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/...",
  "expiresAt": "2026-07-09T12:00:00.000Z",
  "dimensions": {
    "width": 288,
    "height": 88
  }
}
```

Role in the design process:

- Useful for visual review, documentation, and design-to-code comparison.
- Helps agents verify what a component actually looks like.

Local project gap:

- Local has `node_export_visual`, so this is partially covered. The gap is the specialized component-oriented workflow and REST-backed component image handling.

## 3. Design-System Kit And Summary Tools

### `figma_get_design_system_kit`

What it does:

- Produces a combined design-system payload from a Figma file.
- Can include variables/tokens, components, styles, visual specs, and summary metadata.

Example response / LLM-visible data:

```json
{
  "fileKey": "abc123",
  "fileName": "Core Design System",
  "generatedAt": "2026-06-09T18:42:00.000Z",
  "format": "full",
  "tokens": {
    "collections": [
      {
        "name": "Color",
        "modes": [{ "name": "Light" }, { "name": "Dark" }],
        "variables": [
          {
            "id": "VariableID:1:10",
            "name": "action/primary",
            "type": "COLOR",
            "valuesByMode": {
              "Light": "#2563EB",
              "Dark": "#60A5FA"
            }
          }
        ]
      }
    ],
    "summary": { "totalCollections": 3, "totalVariables": 148 }
  },
  "components": {
    "items": [
      {
        "name": "Button",
        "type": "COMPONENT_SET",
        "properties": {
          "Variant": { "type": "VARIANT", "values": ["Primary", "Secondary"] }
        },
        "variants": [{ "id": "700:2", "name": "Variant=Primary" }],
        "visualSpec": {
          "fills": [{ "color": "#2563EB" }],
          "cornerRadius": 8,
          "layout": { "paddingLeft": 16, "paddingRight": 16 }
        }
      }
    ],
    "summary": { "totalComponents": 41, "totalComponentSets": 14 }
  },
  "styles": {
    "items": [
      {
        "name": "Text/Body MD",
        "styleType": "TEXT",
        "resolvedValue": {
          "fontFamily": "Inter",
          "fontSize": 16,
          "lineHeight": 24
        }
      }
    ],
    "summary": { "totalStyles": 28 }
  },
  "ai_instruction": "Use tokens first; use visualSpec only when no token binding is available.",
  "errors": []
}
```

Role in the design process:

- Gives agents a compact design-system context before making implementation or design decisions.
- Helps bootstrap code generation against the real Figma system instead of one component at a time.
- Useful for audits, migrations, and system documentation.

Local project gap:

- Local exposes individual reads for variables, styles, components, annotations, and nodes, but does not assemble them into a code-friendly design-system kit.

### `figma_get_design_system_summary`

What it does:

- Returns a higher-level summary of a design system.
- Focuses on inventory, counts, categories, or system-level organization rather than full raw details.

Example response / LLM-visible data:

```json
{
  "fileKey": "abc123",
  "fileName": "Core Design System",
  "summary": {
    "tokens": {
      "collections": 3,
      "variables": 148,
      "modes": ["Light", "Dark", "High Contrast"]
    },
    "components": {
      "componentSets": 14,
      "components": 41,
      "instances": 237,
      "largestSets": [
        { "name": "Button", "variantCount": 12 },
        { "name": "Input", "variantCount": 10 }
      ]
    },
    "styles": {
      "paint": 16,
      "text": 11,
      "effect": 1,
      "grid": 0
    }
  },
  "coverage": {
    "tokenBoundComponents": 34,
    "componentsMissingDescriptions": 7,
    "componentsMissingAnnotations": 19
  },
  "recommendations": [
    "Add descriptions to 7 published components.",
    "Audit Input variants for consistent error-state token bindings."
  ]
}
```

Role in the design process:

- Helps designers and agents understand the shape of a file quickly.
- Useful before deeper extraction or cleanup.
- Supports system health checks and planning.

Local project gap:

- Local lacks a one-call summary view across components, styles, and variables.

### Southleft kit vs local reads

The local project can produce much of the same raw data by combining:

- `component_list`
- `style_list`
- `variable_list`
- `node_info`
- `annotation_list`
- `node_export_visual`

The missing value is orchestration: southleft packages those reads into a design-system artifact that is easier for an agent to consume.

## 4. Design Token File Workflows

### `figma_export_tokens`

What it does:

- Exports Figma variables into codebase token files.
- Supports formats such as DTCG JSON and CSS custom properties, with additional formatter support in the southleft codebase.
- Can use local token configuration files when running in local mode.

Example response / LLM-visible data:

```json
{
  "success": true,
  "format": "dtcg",
  "strategy": "merge",
  "summary": {
    "collections": 3,
    "variables": 148,
    "filesWritten": 4,
    "filesUnchanged": 2
  },
  "files": [
    {
      "path": "tokens/color.light.json",
      "changed": true,
      "content": {
        "color": {
          "action": {
            "primary": {
              "$type": "color",
              "$value": "#2563EB",
              "$extensions": {
                "figma-console-mcp": {
                  "variableId": "VariableID:1:10",
                  "collectionId": "VariableCollectionId:1:1",
                  "lastSyncedAt": "2026-06-09T18:42:00.000Z"
                }
              }
            }
          }
        }
      }
    }
  ],
  "warnings": [
    "Skipped cross-library alias VariableID:9:99; source library values were not available."
  ]
}
```

Role in the design process:

- Moves design tokens from Figma into engineering artifacts.
- Supports design-system synchronization.
- Helps keep code styling aligned with Figma variables.

Local project gap:

- Local can read and manage Figma variables, but does not export them into token files or code formats.

### `figma_import_tokens`

What it does:

- Reads token data from the codebase or inline payloads and pushes changes into Figma variables.
- Computes diffs and can apply value updates through the bridge.

Example response / LLM-visible data:

```json
{
  "success": true,
  "strategy": "dry-run",
  "format": "dtcg",
  "diff": {
    "toCreate": [
      { "path": "color.action.tertiary", "type": "color", "value": "#7C3AED" }
    ],
    "toUpdate": [
      {
        "variableId": "VariableID:1:10",
        "path": "color.action.primary",
        "currentValue": "#2563EB",
        "nextValue": "#1D4ED8",
        "mode": "Light"
      }
    ],
    "toDelete": [],
    "conflicts": [
      {
        "variableId": "VariableID:1:20",
        "path": "color.surface.default",
        "figmaValue": "#FFFFFF",
        "codeValue": "#FAFAFA",
        "lastSyncedValue": "#F9FAFB"
      }
    ]
  },
  "applyResult": null,
  "warnings": [
    "toCreate apply is not wired; use figma_setup_design_tokens or figma_batch_create_variables."
  ]
}
```

Role in the design process:

- Supports code-to-Figma token synchronization.
- Useful when design tokens are maintained in source control and Figma should reflect code changes.
- Helps teams operate bidirectionally instead of treating Figma as the only source of truth.

Local project gap:

- Local has safe variable mutation, but no code-token parser, diff planner, conflict strategy, or file integration.

Limitations observed in southleft:

- Some apply phases are incomplete. Creates, deletes, and alias-target updates are surfaced in plans but not fully applied by `figma_import_tokens`.

### `figma_setup_design_tokens`

What it does:

- Creates a token system in Figma, usually including a collection, modes, and variables in one operation.

Example response / LLM-visible data:

```json
{
  "success": true,
  "message": "Created collection 'Brand Tokens' with 2 modes and 3 tokens (0 failed)",
  "collectionId": "VariableCollectionId:1:1",
  "collectionName": "Brand Tokens",
  "modes": {
    "Light": "1:0",
    "Dark": "1:1"
  },
  "created": 3,
  "failed": 0,
  "results": [
    { "success": true, "name": "color/background", "id": "VariableID:1:1" },
    { "success": true, "name": "color/text", "id": "VariableID:1:2" },
    { "success": true, "name": "spacing/page", "id": "VariableID:1:3" }
  ]
}
```

Role in the design process:

- Accelerates initial design-system setup.
- Useful for bootstrapping light/dark modes, semantic colors, spacing, radius, or typography variables.

Local project gap:

- Local `variable_manage` can create collections and variables, but does not provide a one-call token-system bootstrap workflow.

### `figma_batch_create_variables`

What it does:

- Creates many Figma variables in a single operation.
- Avoids repeated roundtrips for token creation.

Example response / LLM-visible data:

```json
{
  "success": true,
  "message": "Batch created 4 variables (1 failed)",
  "collectionId": "VariableCollectionId:1:1",
  "created": 4,
  "failed": 1,
  "results": [
    {
      "success": true,
      "name": "color/action/primary",
      "id": "VariableID:1:10",
      "resolvedType": "COLOR",
      "valuesByMode": {
        "Light": "#2563EB",
        "Dark": "#60A5FA"
      }
    },
    {
      "success": false,
      "name": "color/action/primary",
      "error": "Variable already exists in collection"
    }
  ]
}
```

Role in the design process:

- Speeds up token migration and bulk setup.
- Useful when importing a brand system or converting existing code tokens into Figma variables.

Local project gap:

- Local can create variables but does not expose a dedicated high-throughput batch create tool.

### `figma_batch_update_variables`

What it does:

- Updates many variable values in a single operation.
- Uses partial-success style response handling in southleft workflows.

Example response / LLM-visible data:

```json
{
  "success": true,
  "message": "Batch updated 3 variables (0 failed)",
  "updated": 3,
  "failed": 0,
  "results": [
    {
      "success": true,
      "variableId": "VariableID:1:10",
      "name": "color/action/primary",
      "modeId": "1:0",
      "previousValue": "#2563EB",
      "value": "#1D4ED8"
    },
    {
      "success": true,
      "variableId": "VariableID:1:11",
      "name": "spacing/md",
      "modeId": "1:0",
      "previousValue": 16,
      "value": 20
    }
  ]
}
```

Role in the design process:

- Supports bulk token changes such as brand refreshes, theme updates, or large naming/value migrations.

Local project gap:

- Local can update variables, but does not have a dedicated batch update tool optimized for token workflows.

## 5. Library Discovery And Import

### `figma_get_library_components`

What it does:

- Reads published component metadata from a Figma library file through the REST API.

Example response / LLM-visible data:

```json
{
  "libraryFileKey": "lib123",
  "libraryName": "Acme Design System",
  "query": "Button",
  "summary": {
    "totalComponentSets": 2,
    "totalStandaloneComponents": 1,
    "returned": 3
  },
  "componentSets": [
    {
      "name": "Button",
      "key": "componentSetKey123",
      "nodeId": "700:1",
      "description": "Actions and navigation triggers",
      "variantCount": 12,
      "variants": [
        {
          "name": "Variant=Primary, Size=Medium",
          "key": "variantKey123",
          "nodeId": "700:2"
        }
      ]
    }
  ],
  "components": [
    {
      "name": "Icon Button",
      "key": "componentKey456",
      "nodeId": "701:1"
    }
  ],
  "instantiationExamples": [
    {
      "tool": "figma_instantiate_component",
      "componentKey": "variantKey123"
    }
  ]
}
```

Role in the design process:

- Lets agents discover reusable components from shared libraries.
- Supports teams with central design-system libraries rather than local-only components.

Local project gap:

- Local focuses on the live connected document and does not provide REST-backed library browsing.

### `figma_get_library_component_by_key`

What it does:

- Retrieves a specific published library component by component key.

Example response / LLM-visible data:

```json
{
  "key": "componentSetKey123",
  "kind": "COMPONENT_SET",
  "source": {
    "fileKey": "lib123",
    "nodeId": "700:1",
    "name": "Button"
  },
  "componentPropertyDefinitions": {
    "Size": { "type": "VARIANT", "variantOptions": ["Small", "Medium", "Large"] },
    "Variant": { "type": "VARIANT", "variantOptions": ["Primary", "Secondary"] }
  },
  "variants": [
    {
      "name": "Size=Medium, Variant=Primary",
      "nodeId": "700:2",
      "publishedKey": "variantKey123",
      "visualSpec": {
        "fills": [{ "color": "#2563EB" }],
        "cornerRadius": 8,
        "padding": { "left": 16, "right": 16, "top": 10, "bottom": 10 },
        "typography": { "fontSize": 14, "fontWeight": 600 }
      }
    }
  ],
  "compressed": false
}
```

Role in the design process:

- Lets an agent inspect or instantiate the correct published component.
- Reduces ambiguity when multiple components have similar names.

Local project gap:

- Local `create_instance` can instantiate by component key, but lacks a dedicated library lookup/read workflow.

### `figma_search_components`

What it does:

- Searches local or library components by query, category, or description.
- Returns component keys and node IDs for later use.

Example response / LLM-visible data:

```json
{
  "query": "Button",
  "limit": 10,
  "offset": 0,
  "results": [
    {
      "name": "Button",
      "source": "local",
      "type": "COMPONENT_SET",
      "nodeId": "700:1",
      "key": "componentSetKey123",
      "description": "Actions and navigation triggers",
      "variants": [
        { "name": "Primary / Medium", "nodeId": "700:2", "key": "variantKey123" }
      ]
    },
    {
      "name": "Button / Icon",
      "source": "library",
      "libraryName": "Acme Design System",
      "nodeId": "701:1",
      "key": "componentKey456"
    }
  ]
}
```

Role in the design process:

- Helps agents find the correct component before placing or documenting it.
- Supports component reuse instead of creating duplicate ad-hoc UI.

Local project gap:

- Local `component_list` provides component listing, but southleft offers a richer search workflow and library search path.

### `figma_get_library_variables`

What it does:

- Reads variables from a published library.

Example response / LLM-visible data:

```json
{
  "libraries": [
    {
      "libraryName": "Acme Design System",
      "collections": [
        {
          "name": "Color",
          "key": "VariableCollectionKey:abc",
          "variables": [
            {
              "key": "VariableKey:primary",
              "name": "color/action/primary",
              "resolvedType": "COLOR"
            },
            {
              "key": "VariableKey:radius",
              "name": "radius/md",
              "resolvedType": "FLOAT"
            }
          ]
        }
      ]
    }
  ],
  "filters": {
    "libraryName": "Acme",
    "collectionName": "Color",
    "resolvedType": "COLOR"
  },
  "summary": {
    "libraries": 1,
    "collections": 1,
    "variables": 2
  }
}
```

Role in the design process:

- Helps teams understand available shared tokens.
- Supports token reuse across files.

Local project gap:

- Local `variable_list` focuses on local variables in the current document.

### `figma_import_library_variable`

What it does:

- Imports a published library variable into the current file so it can be used locally.

Example response / LLM-visible data:

```json
{
  "success": true,
  "key": "VariableKey:primary",
  "id": "VariableID:9:42",
  "name": "color/action/primary",
  "resolvedType": "COLOR",
  "collectionName": "Color",
  "libraryName": "Acme Design System",
  "alreadyImported": false,
  "usageHint": "Pass id to figma_set_fills, figma_set_strokes, or figma_update_variable."
}
```

Role in the design process:

- Enables use of shared design tokens in local file edits.
- Helps align local components with organization-wide token libraries.

Local project gap:

- Local can bind variables, but does not expose a library-variable import workflow.

## 6. Visual QA, Screenshots, And Design Inspection

### `figma_take_screenshot`

What it does:

- Captures a screenshot from the current Figma context.
- Used as part of visual validation workflows.

Example response / LLM-visible data:

```json
{
  "target": "viewport",
  "format": "png",
  "screenshot": {
    "filename": "figma-screenshot-2026-06-09.png",
    "mimeType": "image/png",
    "width": 1440,
    "height": 900,
    "sizeBytes": 482193
  },
  "currentUrl": "https://www.figma.com/design/abc123/Core-Design-System",
  "capturedAt": "2026-06-09T18:42:00.000Z"
}
```

Role in the design process:

- Lets an agent verify the actual visual result of edits.
- Supports iterative design correction for spacing, alignment, hierarchy, and layout.

Local project gap:

- Local `node_export_visual` covers node export. The gap is less about raw capability and more about southleft's broader screenshot-driven workflow and context handling.

### `figma_capture_screenshot`

What it does:

- Captures a node or page screenshot through plugin export.
- Includes advice about format, scale, and targeting when captures are too large or broad.

Example response / LLM-visible data:

```json
{
  "target": "node",
  "nodeId": "695:313",
  "nodeName": "Button / Primary",
  "format": "png",
  "scale": 2,
  "image": {
    "mimeType": "image/png",
    "width": 288,
    "height": 88,
    "dataUrl": "data:image/png;base64,iVBORw0KGgo..."
  },
  "advice": [
    "Use a lower scale if the response is too large.",
    "Capture a node instead of the full page for visual parity checks."
  ]
}
```

Role in the design process:

- Provides visual feedback after edits.
- Helps agents compare intended versus actual design.

Local project gap:

- Local can export a node image, but southleft has more capture workflow logic around page/node targeting and AI-friendly image sizing.

### `figma_get_selection`

What it does:

- Returns the current Figma selection tracked by the bridge.

Example response / LLM-visible data:

```json
{
  "currentPage": {
    "id": "0:1",
    "name": "Components"
  },
  "count": 2,
  "selection": [
    {
      "id": "695:313",
      "name": "Button / Primary",
      "type": "COMPONENT",
      "absoluteBoundingBox": {
        "x": 120,
        "y": 80,
        "width": 144,
        "height": 44
      }
    },
    {
      "id": "695:320",
      "name": "Button / Secondary",
      "type": "COMPONENT"
    }
  ]
}
```

Role in the design process:

- Useful for designer-directed workflows where the user selects something and asks the agent to inspect it.
- Helps quick handoff from a designer's current focus to an agent.

Local project gap:

- Local intentionally avoids implicit selection state for safety. This is a deliberate omission, not necessarily a defect.

Safety note:

- If added locally, selection reads should remain read-only and should still feed into a discover-before-write flow with name verification.

### `figma_list_open_files`

What it does:

- Lists Figma files currently connected through the southleft bridge.

Example response / LLM-visible data:

```json
{
  "activeFileKey": "abc123",
  "files": [
    {
      "fileKey": "abc123",
      "fileName": "Core Design System",
      "pageName": "Components",
      "url": "https://www.figma.com/design/abc123/Core-Design-System",
      "connectionId": "local-9223",
      "isActive": true,
      "connectedAt": "2026-06-09T18:30:00.000Z"
    },
    {
      "fileKey": "def456",
      "fileName": "Marketing Site",
      "pageName": "Homepage",
      "connectionId": "local-9224",
      "isActive": false
    }
  ]
}
```

Role in the design process:

- Helps avoid editing or inspecting the wrong file when multiple Figma files are open.
- Useful in multi-file design-system work.

Local project gap:

- Local uses a channel model and does not maintain a multi-file connection registry.

## 7. Design QA, Accessibility, And Parity

### `figma_lint_design`

What it does:

- Scans a design node tree for design quality issues.
- Checks rules around layout, naming, accessibility-adjacent issues, visual consistency, and component structure.

Example response / LLM-visible data:

```json
{
  "nodeId": "0:1",
  "score": 82,
  "summary": {
    "checkedNodes": 214,
    "findings": 9,
    "critical": 1,
    "major": 3,
    "minor": 5
  },
  "findings": [
    {
      "ruleId": "contrast.text-aa",
      "category": "accessibility",
      "severity": "critical",
      "wcag": "1.4.3",
      "nodeId": "812:44",
      "nodeName": "Helper text",
      "message": "Text contrast is below WCAG AA.",
      "details": { "contrastRatio": 3.2, "required": 4.5 },
      "suggestion": "Use color/text/secondary or increase background contrast."
    },
    {
      "ruleId": "layout.auto-layout-missing",
      "category": "layout",
      "severity": "minor",
      "nodeId": "812:10",
      "nodeName": "Card actions",
      "message": "Sibling spacing appears manual instead of auto-layout."
    }
  ]
}
```

Role in the design process:

- Helps catch design debt before implementation.
- Useful before publishing components or handing off designs to engineers.

Local project gap:

- Local does not include design linting or quality scoring.

### `figma_audit_component_accessibility`

What it does:

- Runs deeper accessibility-focused checks on components or component sets.
- Looks at target sizes, color contrast patterns, state coverage, and related component accessibility concerns.

Example response / LLM-visible data:

```json
{
  "component": {
    "id": "700:1",
    "name": "Button",
    "type": "COMPONENT_SET"
  },
  "score": 88,
  "checks": {
    "contrast": {
      "status": "pass",
      "minimumRatio": 4.8
    },
    "targetSize": {
      "status": "warn",
      "minimumSize": { "width": 36, "height": 36 },
      "recommended": { "width": 44, "height": 44 }
    },
    "stateCoverage": {
      "status": "pass",
      "statesFound": ["Default", "Hover", "Pressed", "Disabled", "Focus"]
    },
    "focusIndicator": {
      "status": "fail",
      "message": "No visible focus state variant detected."
    }
  },
  "findings": [
    {
      "severity": "major",
      "message": "Add a visible focus state with at least 3:1 contrast against adjacent colors.",
      "nodeId": "700:9"
    }
  ],
  "recommendations": [
    "Add State=Focus variant.",
    "Increase Small button height to 44px or document touch-target exception."
  ]
}
```

Role in the design process:

- Helps designers verify accessible component behavior and visuals.
- Supports system-level accessibility review before components are used widely.

Local project gap:

- Local can read component structure and styles, but does not interpret them as accessibility findings.

### `figma_scan_code_accessibility`

What it does:

- Scans code-side artifacts for accessibility issues.

Example response / LLM-visible data:

```json
{
  "source": {
    "filePath": "src/components/button.tsx",
    "scanner": "axe-core"
  },
  "summary": {
    "violations": 2,
    "passes": 34,
    "incomplete": 1,
    "inapplicable": 67
  },
  "violations": [
    {
      "id": "button-name",
      "impact": "critical",
      "description": "Buttons must have discernible text.",
      "nodes": [
        {
          "target": ["button.icon-only"],
          "html": "<button class=\"icon-only\"><svg /></button>",
          "failureSummary": "Element does not have inner text or aria-label."
        }
      ]
    }
  ]
}
```

Role in the design process:

- Bridges design and implementation QA.
- Helps ensure the coded component preserves accessibility expectations from the design.

Local project gap:

- Local project is Figma-edit focused and does not inspect code artifacts.

### `figma_check_design_parity`

What it does:

- Compares Figma component specs against code-side data.
- Produces discrepancy categories, parity score, and action items.

Example response / LLM-visible data:

```json
{
  "summary": {
    "parityScore": 84,
    "totalDiscrepancies": 4,
    "critical": 0,
    "major": 2,
    "minor": 2,
    "info": 0
  },
  "discrepancies": [
    {
      "category": "visual",
      "severity": "major",
      "property": "borderRadius",
      "designValue": 12,
      "codeValue": 8,
      "suggestion": "Update code radius to token radius/lg or change Figma to radius/md."
    },
    {
      "category": "spacing",
      "severity": "minor",
      "property": "paddingLeft",
      "designValue": 24,
      "codeValue": 20
    }
  ],
  "actionItems": [
    {
      "fixSide": "code",
      "path": "src/components/card.tsx",
      "instruction": "Use var(--radius-lg) for Card root border-radius."
    }
  ],
  "designData": {
    "nodeId": "695:313",
    "fills": [{ "color": "#FFFFFF" }],
    "spacing": { "paddingLeft": 24 },
    "properties": {}
  },
  "codeData": {
    "metadata": { "filePath": "src/components/card.tsx" }
  },
  "ai_instruction": "Lead with critical and major differences, then list exact fixes."
}
```

Role in the design process:

- Useful for design-system governance.
- Helps teams detect drift between Figma and production code.
- Supports decisions about whether design or code is canonical.

Local project gap:

- Local does not compare Figma designs to code implementations.

### `figma_blame_node`

What it does:

- Attempts to identify change/version context for a node.
- Helps determine when or why a design element changed.

Example response / LLM-visible data:

```json
{
  "node": {
    "id": "695:313",
    "name": "Button / Primary"
  },
  "property": "fills.0.color",
  "currentValue": "#1D4ED8",
  "introducedIn": {
    "versionId": "1234567890",
    "label": "Button color refresh",
    "createdAt": "2026-05-22T16:00:00.000Z",
    "user": {
      "handle": "Maya",
      "email": "maya@example.com"
    }
  },
  "previousValue": "#2563EB",
  "confidence": "high",
  "timeline": [
    {
      "versionId": "1234567880",
      "value": "#2563EB",
      "createdAt": "2026-05-20T12:00:00.000Z"
    },
    {
      "versionId": "1234567890",
      "value": "#1D4ED8",
      "createdAt": "2026-05-22T16:00:00.000Z"
    }
  ]
}
```

Role in the design process:

- Supports design review and regression investigation.
- Useful when unexpected design changes appear in a shared file.

Local project gap:

- Local does not use Figma version history or REST-backed change attribution.

## 8. Comments, Review, And Version History

### `figma_get_comments`

What it does:

- Fetches comments from a Figma file through the REST API.

Example response / LLM-visible data:

```json
{
  "comments": [
    {
      "id": "1627922741",
      "message": "Can we increase contrast on the helper text?",
      "user": {
        "handle": "Maya",
        "img_url": "https://..."
      },
      "created_at": "2026-06-08T21:15:00.000Z",
      "resolved_at": null,
      "client_meta": {
        "node_id": "812:44",
        "node_offset": { "x": 12, "y": 8 }
      },
      "replies": [
        {
          "id": "1627922742",
          "message": "Agree, marking this for token update.",
          "user": { "handle": "Lee" }
        }
      ]
    }
  ],
  "summary": {
    "total": 24,
    "active": 6,
    "resolved": 18,
    "returned": 1
  }
}
```

Role in the design process:

- Brings design review context into the agent workflow.
- Helps agents understand unresolved feedback before editing.

Local project gap:

- Local does not expose comments.

### `figma_post_comment`

What it does:

- Posts a comment to a Figma file.

Example response / LLM-visible data:

```json
{
  "comment": {
    "id": "1627923000",
    "message": "Border radius in code uses 8px but Figma shows 12px.",
    "created_at": "2026-06-09T18:42:00.000Z",
    "user": {
      "handle": "Figma Console MCP"
    },
    "client_meta": {
      "node_id": "695:313",
      "node_offset": { "x": 10, "y": 10 }
    }
  }
}
```

Role in the design process:

- Lets agents leave review notes, implementation questions, or change summaries directly in Figma.

Local project gap:

- Local does not create comments.

### `figma_delete_comment`

What it does:

- Deletes a Figma comment.

Example response / LLM-visible data:

```json
{
  "success": true,
  "deleted_comment_id": "1627923000"
}
```

Role in the design process:

- Supports comment cleanup and moderation.

Local project gap:

- Local does not manage comments.

Safety note:

- This is destructive collaboration state. If added locally, it should be separated from post/read comment tools and carry destructive annotations.

### `figma_get_file_versions`

What it does:

- Retrieves version history for a Figma file.

Example response / LLM-visible data:

```json
{
  "fileKey": "abc123",
  "versions": [
    {
      "id": "1234567890",
      "label": "Button color refresh",
      "description": "Updated primary and secondary button colors.",
      "created_at": "2026-05-22T16:00:00.000Z",
      "user": {
        "handle": "Maya",
        "email": "maya@example.com"
      }
    },
    {
      "id": "1234567800",
      "label": "Pre-release audit",
      "created_at": "2026-05-20T12:00:00.000Z"
    }
  ],
  "pagination": {
    "nextPage": "cursor-2"
  }
}
```

Role in the design process:

- Provides historical context for design changes.
- Useful before migrations, audits, or rollback discussions.

Local project gap:

- Local only works against the live plugin state, not historical REST snapshots.

### `figma_get_file_at_version`

What it does:

- Retrieves file data at a specific version.

Example response / LLM-visible data:

```json
{
  "fileKey": "abc123",
  "versionId": "1234567890",
  "name": "Core Design System",
  "lastModified": "2026-05-22T16:00:00.000Z",
  "document": {
    "id": "0:0",
    "name": "Document",
    "type": "DOCUMENT",
    "children": [
      {
        "id": "0:1",
        "name": "Components",
        "type": "CANVAS",
        "children": [
          {
            "id": "700:1",
            "name": "Button",
            "type": "COMPONENT_SET"
          }
        ]
      }
    ]
  },
  "components": {
    "componentSetKey123": {
      "name": "Button",
      "node_id": "700:1"
    }
  },
  "styles": {}
}
```

Role in the design process:

- Enables comparison of previous and current design states.
- Useful for regression analysis and release documentation.

Local project gap:

- Local has no versioned file reads.

### `figma_diff_versions`

What it does:

- Computes differences between Figma file versions.

Example response / LLM-visible data:

```json
{
  "fileKey": "abc123",
  "fromVersion": {
    "id": "1234567800",
    "label": "Pre-release audit"
  },
  "toVersion": {
    "id": "1234567890",
    "label": "Button color refresh"
  },
  "summary": {
    "pagesChanged": 1,
    "nodesAdded": 2,
    "nodesRemoved": 0,
    "nodesChanged": 8,
    "componentPropertyChanges": 1,
    "tokenBindingChanges": 3
  },
  "changes": [
    {
      "type": "PROPERTY_CHANGE",
      "nodeId": "700:2",
      "nodeName": "Button / Primary",
      "property": "fills.0.color",
      "before": "#2563EB",
      "after": "#1D4ED8"
    },
    {
      "type": "COMPONENT_PROPERTY_CHANGE",
      "nodeId": "700:1",
      "property": "Show icon",
      "before": false,
      "after": true
    }
  ]
}
```

Role in the design process:

- Helps reviewers understand what changed between milestones.
- Useful for changelogs, QA, and design-system governance.

Local project gap:

- Local does not provide historical diffing.

### `figma_get_changes_since_version`

What it does:

- Summarizes changes since a selected version.

Example response / LLM-visible data:

```json
{
  "fileKey": "abc123",
  "baseVersion": {
    "id": "1234567800",
    "label": "Pre-release audit"
  },
  "currentVersion": {
    "id": "current",
    "label": "Current file"
  },
  "summary": {
    "nodesChanged": 12,
    "componentsChanged": 3,
    "stylesChanged": 1
  },
  "changes": [
    {
      "type": "STYLE_CHANGE",
      "styleName": "Text/Body MD",
      "property": "fontSize",
      "before": 15,
      "after": 16
    }
  ]
}
```

Role in the design process:

- Helps teams review recent design changes without manually scanning the file.

Local project gap:

- Local lacks version-aware change summaries.

### `figma_get_design_changes`

What it does:

- Returns design changes tracked by the southleft bridge and/or version tooling.

Example response / LLM-visible data:

```json
{
  "since": "2026-06-09T18:00:00.000Z",
  "summary": {
    "changes": 5,
    "propertyChanges": 3,
    "nodeAdds": 1,
    "nodeDeletes": 1
  },
  "changes": [
    {
      "timestamp": "2026-06-09T18:35:12.000Z",
      "type": "PROPERTY_CHANGE",
      "nodeId": "812:44",
      "nodeName": "Helper text",
      "property": "fills",
      "oldValue": "#9CA3AF",
      "newValue": "#6B7280"
    }
  ],
  "source": "desktop-bridge"
}
```

Role in the design process:

- Helps agents notice recent edits and avoid stale assumptions.

Local project gap:

- Local has live reads but no persistent design-change buffer.

### `figma_generate_changelog`

What it does:

- Generates a changelog from Figma version/change data.

Example response / LLM-visible data:

```json
{
  "fileKey": "abc123",
  "fromVersion": "1234567800",
  "toVersion": "current",
  "markdown": "# Design Changelog\n\n## Components\n\n- Button: primary fill changed from #2563EB to #1D4ED8.\n- Input: added Focus state variant.\n\n## Tokens\n\n- color/action/primary updated in Light mode.\n",
  "summary": {
    "componentsChanged": 2,
    "tokensChanged": 1,
    "stylesChanged": 0,
    "comments": 3
  },
  "changesByCategory": {
    "components": [
      { "name": "Button", "change": "Primary fill updated" }
    ],
    "tokens": [
      { "name": "color/action/primary", "before": "#2563EB", "after": "#1D4ED8" }
    ]
  }
}
```

Role in the design process:

- Supports release notes for design systems.
- Helps communicate component/token changes to engineering and design teams.

Local project gap:

- Local does not synthesize changelogs.

## 9. File And REST Data Reads

### `figma_get_file_data`

What it does:

- Retrieves Figma file structure through the REST API.
- Supports depth limits, specific node IDs, verbosity levels, and optional enrichment.

Example response / LLM-visible data:

```json
{
  "fileKey": "abc123",
  "name": "Core Design System",
  "lastModified": "2026-06-09T18:00:00.000Z",
  "version": "1234567890",
  "document": {
    "id": "0:0",
    "name": "Document",
    "type": "DOCUMENT",
    "children": [
      {
        "id": "0:1",
        "name": "Components",
        "type": "CANVAS",
        "children": [
          {
            "id": "700:1",
            "name": "Button",
            "type": "COMPONENT_SET",
            "absoluteBoundingBox": { "x": 120, "y": 80, "width": 400, "height": 240 }
          }
        ]
      }
    ]
  },
  "components": {
    "componentSetKey123": {
      "name": "Button",
      "node_id": "700:1",
      "description": "Actions and navigation triggers"
    }
  },
  "styles": {
    "styleKey123": {
      "name": "Text/Body MD",
      "style_type": "TEXT"
    }
  },
  "schemaVersion": 0
}
```

Role in the design process:

- Useful for broad file discovery without relying on a live plugin traversal.
- Helps inspect files even when a local plugin bridge is not the only source of truth.

Local project gap:

- Local `page_info` and `node_info` cover live document discovery, but not REST-backed file reads or remote file inspection.

### `figma_get_file_for_plugin`

What it does:

- Retrieves file data shaped for Figma plugin development or file-structure inspection.

Example response / LLM-visible data:

```json
{
  "fileKey": "abc123",
  "fileName": "Core Design System",
  "pluginView": {
    "pages": [
      {
        "id": "0:1",
        "name": "Components",
        "childCount": 42
      }
    ],
    "nodes": [
      {
        "id": "700:1",
        "name": "Button",
        "type": "COMPONENT_SET",
        "parentId": "0:1",
        "children": ["700:2", "700:3"],
        "pluginData": {},
        "sharedPluginData": {}
      }
    ]
  },
  "apiHints": {
    "nodeIdsUseColonFormat": true,
    "depthLimited": true
  }
}
```

Role in the design process:

- Helps inspect file structure and node data for automation planning.
- Less central to day-to-day design editing than `figma_get_file_data`, but still useful for advanced file analysis.

Local project gap:

- Local does not have specialized REST views for plugin/file analysis.

### `figma_get_variables`

What it does:

- Retrieves Figma variables through REST and/or bridge fallback depending on mode.
- Includes formatting and resolution helpers.

Example response / LLM-visible data:

```json
{
  "fileKey": "abc123",
  "collections": [
    {
      "id": "VariableCollectionId:1:1",
      "name": "Color",
      "modes": [
        { "modeId": "1:0", "name": "Light" },
        { "modeId": "1:1", "name": "Dark" }
      ],
      "variableIds": ["VariableID:1:10"]
    }
  ],
  "variables": [
    {
      "id": "VariableID:1:10",
      "name": "action/primary",
      "resolvedType": "COLOR",
      "collectionId": "VariableCollectionId:1:1",
      "valuesByMode": {
        "1:0": "#2563EB",
        "1:1": "#60A5FA"
      }
    }
  ],
  "summary": {
    "collections": 1,
    "variables": 1
  },
  "exports": {
    "css": ":root { --color-action-primary: #2563EB; }\n.dark { --color-action-primary: #60A5FA; }",
    "tailwind": {
      "theme": {
        "extend": {
          "colors": {
            "action-primary": "#2563EB"
          }
        }
      }
    }
  },
  "usage": [
    {
      "variableId": "VariableID:1:10",
      "consumers": [
        { "nodeId": "700:2", "nodeName": "Button / Primary", "property": "fills.0.color" }
      ]
    }
  ],
  "dependencies": [
    {
      "from": "color/action/primary-hover",
      "to": "color/action/primary"
    }
  ]
}
```

Role in the design process:

- Supports token inspection and design-system analysis.

Local project gap:

- Local already has `variable_list`, including local variable details and consumer scans. The missing part is REST/library/code-token integration rather than basic variable reading.

### `figma_get_styles`

What it does:

- Retrieves Figma styles through REST-backed tooling.

Example response / LLM-visible data:

```json
{
  "fileKey": "abc123",
  "styles": [
    {
      "key": "styleKey123",
      "node_id": "S:1",
      "name": "Text/Body MD",
      "style_type": "TEXT",
      "description": "Default body copy",
      "resolvedValue": {
        "fontFamily": "Inter",
        "fontSize": 16,
        "fontWeight": 400,
        "lineHeight": 24,
        "letterSpacing": 0
      },
      "usage": [
        { "nodeId": "900:13", "nodeName": "Paragraph" }
      ]
    },
    {
      "key": "styleKey456",
      "name": "Color/Primary",
      "style_type": "FILL",
      "resolvedValue": {
        "fills": [{ "type": "SOLID", "color": "#2563EB" }]
      }
    }
  ],
  "summary": {
    "paint": 1,
    "text": 1,
    "effect": 0,
    "grid": 0
  },
  "exports": {
    "css": "--color-primary: #2563EB;"
  }
}
```

Role in the design process:

- Supports style inventory, documentation, and design-system extraction.

Local project gap:

- Local already has `style_list` for local styles. The missing part is integration into broader REST/design-system workflows.

## 10. Component Instantiation And Creation Helpers

### `figma_instantiate_component`

What it does:

- Creates an instance from a component key and/or node ID.
- Supports variants, overrides, position, and parent placement.

Example response / LLM-visible data:

```json
{
  "success": true,
  "instance": {
    "id": "1200:44",
    "name": "Button / Primary Instance",
    "type": "INSTANCE",
    "mainComponentId": "700:2",
    "componentKey": "variantKey123",
    "parentId": "0:1",
    "position": { "x": 320, "y": 160 },
    "size": { "width": 144, "height": 44 }
  },
  "appliedProperties": {
    "Label": "Continue",
    "Show icon": false
  },
  "variantSelection": {
    "Variant": "Primary",
    "Size": "Medium"
  },
  "warnings": []
}
```

Role in the design process:

- Encourages reuse of existing design-system components.
- Lets agents compose screens from real components instead of drawing approximations.

Local project gap:

- Local has `create_instance`, so the core operation is covered. Southleft's advantage is richer search-to-instantiate workflow integration and automatic fallback patterns.

### `figma_create_child`

What it does:

- Creates a child node under a parent with a generic node type and properties.
- Supports common primitives such as rectangles, ellipses, frames, text, lines, polygons, stars, and vectors.

Example response / LLM-visible data:

```json
{
  "success": true,
  "node": {
    "id": "1200:45",
    "name": "New card",
    "type": "FRAME",
    "parentId": "0:1",
    "absoluteBoundingBox": {
      "x": 240,
      "y": 240,
      "width": 320,
      "height": 180
    },
    "fills": [{ "type": "SOLID", "color": "#FFFFFF" }],
    "layoutMode": "VERTICAL"
  }
}
```

Role in the design process:

- Provides a flexible creation helper for rapid layout construction.

Local project gap:

- Local has more explicit creation tools (`create_shape`, `create_frame`, `create_text`, `create_svg`) with stronger safety checks. This is not a high-priority gap unless local wants a generic creation router.

### `figma_set_fills`

What it does:

- Sets node fills using Figma paint arrays, including hex colors and variable-bound paint handling.

Example response / LLM-visible data:

```json
{
  "success": true,
  "nodeId": "1200:45",
  "nodeName": "New card",
  "fills": [
    {
      "type": "SOLID",
      "color": "#FFFFFF",
      "variableId": "VariableID:1:30",
      "boundVariableName": "color/surface/default"
    }
  ],
  "appliedBindings": [
    {
      "property": "fills.0.color",
      "variableId": "VariableID:1:30"
    }
  ],
  "warnings": []
}
```

Role in the design process:

- Supports multi-fill and token-bound paint workflows.

Local project gap:

- Local `node_set_fill` is simpler and focused on a literal RGBA fill. Local also has `node_bind_variable`, but not a full paint-array setter.

### `figma_set_strokes`

What it does:

- Sets stroke paint arrays and optional stroke weight.

Example response / LLM-visible data:

```json
{
  "success": true,
  "nodeId": "1200:45",
  "nodeName": "New card",
  "strokes": [
    {
      "type": "SOLID",
      "color": "#E5E7EB",
      "variableId": "VariableID:1:40",
      "boundVariableName": "color/border/default"
    }
  ],
  "strokeWeight": 1,
  "appliedBindings": [
    {
      "property": "strokes.0.color",
      "variableId": "VariableID:1:40"
    }
  ],
  "warnings": []
}
```

Role in the design process:

- Supports richer border styling than a basic stroke setter.

Local project gap:

- Local `node_set_stroke` covers common stroke edits. Southleft may support more raw paint-array shapes.

### `figma_set_text`

What it does:

- Sets text content and optionally applies font size/family/style.
- Includes fallback behavior for common font-style naming issues.

Example response / LLM-visible data:

```json
{
  "success": true,
  "nodeId": "1300:12",
  "nodeName": "Button label",
  "characters": "Continue",
  "fontFamily": "Inter",
  "fontStyle": "Semi Bold",
  "fontSize": 14,
  "normalizedFontStyle": "Semi Bold",
  "warnings": [
    "Requested fontStyle 'SemiBold' normalized to 'Semi Bold'."
  ]
}
```

Role in the design process:

- Supports quick content editing and typography adjustment.

Local project gap:

- Local has `text_set_content` and `text_set_style`, so this is mostly covered. Southleft's advantage is convenience in a single tool.

### `figma_set_instance_properties`

What it does:

- Sets component instance properties.

Example response / LLM-visible data:

```json
{
  "success": true,
  "nodeId": "1200:44",
  "nodeName": "Button / Primary Instance",
  "appliedProperties": {
    "Label": "Continue",
    "Show icon": true,
    "Variant": "Primary"
  },
  "failedProperties": [],
  "warnings": []
}
```

Role in the design process:

- Lets agents change labels, toggles, variants, swaps, and other component API values on instances.

Local project gap:

- Local has `instance_set_property`. This is not a major missing capability.

## 11. Flexible Automation Escape Hatch

### `figma_execute`

What it does:

- Executes arbitrary JavaScript in Figma's plugin context with access to the Figma Plugin API.
- Can read or mutate almost anything the Plugin API allows.

Example response / LLM-visible data:

```json
{
  "success": true,
  "result": {
    "createdNodeIds": ["1400:1", "1400:2"],
    "updatedNodeIds": ["1200:45"],
    "summary": "Created two frames and updated one fill."
  },
  "logs": [
    { "level": "info", "message": "Created frame 1400:1" }
  ],
  "warnings": [
    "Result shape is arbitrary because it is defined by the executed code."
  ]
}
```

Role in the design process:

- Enables one-off automation that no explicit MCP tool supports yet.
- Useful for complex migrations, custom audits, or experimental workflows.
- Lets advanced users unblock themselves without waiting for a dedicated tool.

Local project gap:

- Local intentionally does not expose arbitrary code execution.

Safety note:

- This is powerful but risky. It bypasses the local project's core safety model: scope locking, name verification, batch validation, and predictable tool schemas.
- If the local project ever adds an escape hatch, it should probably be separate, clearly dangerous, optionally disabled by default, and constrained by the same editable scope.


## Recommended Additions For The Local Project

### P0: Add first-class image fill support

Suggested local tool:

- `node_set_image_fill`

Recommended safety behavior:

- Require `nodeId` and `nodeName`.
- Validate scope inside the plugin.
- Validate each item in batch mode.
- Return image hash and updated node list.

Why first:

- It is a common Figma Design operation.
- It fills a clear local capability gap.
- It fits the local safety model cleanly.

### P0: Add component development extraction

Suggested local tools:

- `component_get_development_info`
- `component_analyze_set`

Why:

- These would make the local project much more useful for design-to-code workflows.
- They can build on existing `node_info`, `variable_list`, `annotation_list`, `reaction_list`, and `node_export_visual`.

### P1: Add design-system kit assembly

Suggested local tool:

- `design_system_info`

Why:

- Local already has most raw reads.
- The missing piece is orchestration into a compact design-system artifact.

### P1: Add token export/import integration

Suggested local tools:

- `token_export`
- `token_import_plan`
- `token_import_apply`

Why:

- This would connect local variable safety with real codebase token workflows.
- Splitting plan/apply would preserve safety and reviewability.

### P1: Add library reads/imports

Suggested local tools:

- `library_component_list`
- `library_variable_list`
- `library_variable_import`

Why:

- Many real teams use published libraries.
- This would extend local beyond the current live file without weakening node-edit safety.

### P2: Add design lint and accessibility audit

Suggested local tools:

- `design_lint`
- `component_accessibility_audit`

Why:

- These are high-value read-only workflows.
- They do not need to mutate the Figma file.
- They would complement local's safe edit model with quality feedback.

### P2: Add comments and version history

Suggested local tools:

- `comment_list`
- `comment_post`
- `version_list`
- `version_diff`

Why:

- Useful for review-heavy teams.
- Requires REST authentication, so it should be an optional subsystem.

## Final Prioritization

If the goal is to improve the local project without diluting its safety identity, prioritize tools in this order:

1. `node_set_image_fill`
2. `component_get_development_info`
3. `component_analyze_set`
4. `design_system_info`
5. `token_export` and `token_import_plan`
6. `library_variable_import` and library component search
7. `design_lint` and `component_accessibility_audit`
8. Comments/version history
9. A constrained alternative to `figma_execute`, if ever needed

The key principle: add southleft's workflow breadth where it is useful, but keep local's differentiator intact: explicit discovery, scoped writes, name verification, and predictable MCP schemas.
