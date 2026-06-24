#!/usr/bin/env bun
/**
 * R3.8 — generate the node field set from `@figma/plugin-typings` so node_info's
 * SAFE_LIST_PROPERTIES can't drift from the official API. Emits:
 *
 *   figma_plugin/utils/nodeFields.generated.ts  — NODE_DATA_FIELDS (safe to read
 *       via node[key]) + NODE_FIELD_TYPES (name → type, for the reference).
 *   src/mcp_server/tools/bindableFields.generated.ts  — BINDABLE_FIELDS, the
 *       allowlist for node_bind_variable's bindVariables map (VariableBindableNodeField
 *       ∪ VariableBindableTextField + fills/strokes), so it can't drift from the typings.
 *   skills/figma-edit/references/node-fields.md  — LLM-facing whole-read reference
 *       (served as the figma-edit://guide/node-fields resource).
 *
 * Node-reference fields (typed as some *Node) are classified OUT of the data set:
 * `extractProperties` serializes the known ones (parent/mainComponent/instances/
 * exposedInstances/stuckNodes/attachedConnectors) to ids, and any *other* node-ref
 * field is kept out of the raw-read safe-list so it can never reach postMessage as
 * a host object (DataCloneError). Library-object references (boundVariables /
 * explicitVariableModes / *StyleId) stay in the data set — they're plain values in
 * the typings and `extractProperties` resolves them to {id, name}.
 *
 *   Usage: bun run scripts/gen-node-fields.ts
 */
import * as ts from "typescript";
import { writeFileSync } from "fs";

const DTS = "node_modules/@figma/plugin-typings/plugin-api.d.ts";

const program = ts.createProgram([DTS], { skipLibCheck: true, noEmit: true });
const checker = program.getTypeChecker();
const sf = program.getSourceFile(DTS);
if (!sf) throw new Error(`Cannot load ${DTS} — is @figma/plugin-typings installed?`);

// The SceneNode union enumerates every node type; its members carry the full
// (mixin-resolved) property set.
let sceneNode: ts.Type | undefined;
sf.forEachChild((n) => {
    if (ts.isTypeAliasDeclaration(n) && n.name.text === "SceneNode") {
        sceneNode = checker.getTypeFromTypeNode(n.type);
    }
});
if (!sceneNode) throw new Error("SceneNode type alias not found in typings");

const members = sceneNode.isUnion() ? sceneNode.types : [sceneNode];

const fieldTypes = new Map<string, string>();
for (const m of members) {
    for (const sym of checker.getPropertiesOfType(m)) {
        const name = sym.getName();
        if (name.startsWith("_") || fieldTypes.has(name)) continue;
        const decl = sym.valueDeclaration ?? sym.declarations?.[0];
        if (!decl) continue;
        const t = checker.getTypeOfSymbolAtLocation(sym, decl);
        // Skip methods (anything callable: clone, resize, exportAsync, getMainComponentAsync, …).
        if (checker.getSignaturesOfType(t, ts.SignatureKind.Call).length > 0) continue;
        fieldTypes.set(name, checker.typeToString(t));
    }
}

// A field is a node reference if its type mentions a `*Node` interface (excluding
// the `NodeType` enum). These can't be returned raw.
const isNodeRef = (typeStr: string) => /\b[A-Z][A-Za-z]*Node\b/.test(typeStr.replace(/NodeType/g, "X"));

// Structural keys live at the entry level (handled by the reader, not properties).
const STRUCTURAL = new Set(["id", "name", "type", "children"]);
// Node refs that extractProperties serializes to id / id[] (so they ARE safe-list
// members — the read path special-cases them before any raw read).
const RESOLVED_NODE_REFS = ["parent", "mainComponent", "instances", "exposedInstances", "stuckNodes", "attachedConnectors"];

const allNames = [...fieldTypes.keys()].sort();
const dataFields = allNames.filter((n) => !STRUCTURAL.has(n) && !isNodeRef(fieldTypes.get(n)!));
const nodeRefFields = allNames.filter((n) => isNodeRef(fieldTypes.get(n)!) && !STRUCTURAL.has(n));

// ── Bindable variable fields (for the MCP-server bind schema) ───────────────
// Pull the string-literal members of the bindable-field unions straight from the
// AST, preserving declaration order. Read directly from the type-alias nodes so
// a single-member (non-union) alias still works.
function literalUnionMembers(aliasName: string): string[] {
    const out: string[] = [];
    sf!.forEachChild((n) => {
        if (!ts.isTypeAliasDeclaration(n) || n.name.text !== aliasName) return;
        const members = ts.isUnionTypeNode(n.type) ? n.type.types : [n.type];
        for (const m of members) {
            if (ts.isLiteralTypeNode(m) && ts.isStringLiteral(m.literal)) out.push(m.literal.text);
        }
    });
    if (!out.length) throw new Error(`No string-literal members found for ${aliasName} in ${DTS}`);
    return out;
}
// VariableBindableNodeField ∪ VariableBindableTextField + the paint pseudo-fields
// ("fills"/"strokes") handled by node_bind_variable's fills/strokes branch.
const bindableFields = [
    "fills", "strokes",
    ...literalUnionMembers("VariableBindableNodeField"),
    ...literalUnionMembers("VariableBindableTextField"),
];

// ── Emit the generated TS (consumed by nodeUtils.ts) ───────────────────────
const generatedTs =
    `// AUTO-GENERATED from @figma/plugin-typings by scripts/gen-node-fields.ts.\n` +
    `// Do not edit by hand — run \`bun run gen:node-fields\`.\n\n` +
    `// Data fields safe to read directly via node[key] (no node-reference host objects).\n` +
    `export const NODE_DATA_FIELDS: ReadonlyArray<string> = [\n` +
    dataFields.map((n) => `    ${JSON.stringify(n)},`).join("\n") +
    `\n];\n\n` +
    `// Every node field (data + reference) → its TypeScript type, for documentation.\n` +
    `export const NODE_FIELD_TYPES: Readonly<Record<string, string>> = {\n` +
    allNames.map((n) => `    ${JSON.stringify(n)}: ${JSON.stringify(fieldTypes.get(n)!)},`).join("\n") +
    `\n};\n`;
writeFileSync("figma_plugin/utils/nodeFields.generated.ts", generatedTs);

// ── Emit the bind-field allowlist (consumed by tools/node.ts) ──────────────
const bindableTs =
    `// AUTO-GENERATED from @figma/plugin-typings by scripts/gen-node-fields.ts.\n` +
    `// Do not edit by hand — run \`bun run gen:node-fields\`.\n\n` +
    `// Allowlist of fields node_bind_variable accepts in its bindVariables map:\n` +
    `// VariableBindableNodeField ∪ VariableBindableTextField, plus the paint\n` +
    `// pseudo-fields ("fills"/"strokes") handled by the fills/strokes branch.\n` +
    `export const BINDABLE_FIELDS = [\n` +
    bindableFields.map((n) => `    ${JSON.stringify(n)},`).join("\n") +
    `\n] as const;\n\n` +
    `export type BindableField = (typeof BINDABLE_FIELDS)[number];\n`;
writeFileSync("src/mcp_server/tools/bindableFields.generated.ts", bindableTs);

// ── Emit the Markdown reference (whole-read resource) ──────────────────────
const row = (n: string) => `| \`${n}\` | \`${fieldTypes.get(n)!.replace(/\|/g, "\\|")}\` |`;
const md =
    `# node_info fields\n\n` +
    `Generated from \`@figma/plugin-typings\` — the official Figma node field set. ` +
    `Pass any of these in \`node_info\`'s \`fields\`. (\`id\`, \`name\`, \`type\` are always returned.)\n\n` +
    `## Reference fields (resolved, not raw)\n\n` +
    `- **Node references** → returned as the target's \`id\` (or \`id[]\`), never a raw node: ` +
    RESOLVED_NODE_REFS.map((n) => `\`${n}\``).join(", ") + `.\n` +
    `- **Library references** → resolved to \`{ id, name }\`: \`boundVariables\` (recursively), ` +
    `\`explicitVariableModes\`, and the \`*StyleId\` fields.\n` +
    (nodeRefFields.filter((n) => !RESOLVED_NODE_REFS.includes(n)).length
        ? `- Other node-typed fields (${nodeRefFields.filter((n) => !RESOLVED_NODE_REFS.includes(n)).map((n) => `\`${n}\``).join(", ")}) are not returned raw.\n`
        : ``) +
    `\n## Data fields\n\n` +
    `| Field | Type |\n|---|---|\n` +
    dataFields.map(row).join("\n") + `\n`;
writeFileSync("skills/figma-edit/references/node-fields.md", md);

console.log(
    `node-fields: ${allNames.length} fields (${dataFields.length} data, ${nodeRefFields.length} node-ref) → ` +
    `figma_plugin/utils/nodeFields.generated.ts + skills/figma-edit/references/node-fields.md\n` +
    `bind-fields: ${bindableFields.length} fields → src/mcp_server/tools/bindableFields.generated.ts`
);
