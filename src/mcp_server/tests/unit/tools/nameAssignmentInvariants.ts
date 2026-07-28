import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import * as ts from "typescript";

export interface ExpectedNameAssignmentSink {
    sink: string;
    contract: string | null;
}

/**
 * Independent source inventory for user-visible naming.
 *
 * This is intentionally not derived from the MCP schemas or a production
 * inventory. The scanner inventories every direct `.name = …` write plus the
 * explicitly recognized Figma naming methods below. Each sink is then
 * classified here as either an externally supplied assignment contract or an
 * internal/derived name. Adding a direct `.name` write or another use of a
 * recognized naming method without classifying it makes source parity fail.
 * A genuinely new Figma naming API must first be added to
 * `NAME_METHOD_ARGUMENT`; no AST rule can infer arbitrary API semantics.
 */
export const EXPECTED_NAME_ASSIGNMENT_SINKS: readonly ExpectedNameAssignmentSink[] = [
    {
        sink: "componentHandlers.ts:createComponent:name=node.name",
        contract: null,
    },
    {
        sink: "componentHandlers.ts:createComponentSet:name=c.originalName",
        contract: null,
    },
    {
        sink: "componentHandlers.ts:createComponentSet:name=c.variantName",
        contract: null,
    },
    {
        sink: "componentHandlers.ts:createComponentSet:name=c.variantName",
        contract: null,
    },
    {
        sink: "componentHandlers.ts:createComponentSet:name=plan.componentSetName",
        contract: "create_component_set.componentSetName",
    },
    {
        sink: "componentHandlers.ts:manageComponentProperty:call:addComponentProperty=propertyName",
        contract: "component_manage_property.propertyName@ADD",
    },
    {
        sink: "componentHandlers.ts:manageComponentProperty:call:editComponentProperty=options",
        contract: "component_manage_property.newPropertyName@EDIT",
    },
    {
        sink: "componentHandlers.ts:manageComponentProperty:name=newPropertyName",
        contract: "component_manage_property.newPropertyName@EDIT",
    },
    {
        sink: "connectorHandlers.ts:createConnections:name=`TTF_Connector/${startNode.id}/${endNode.id}`",
        contract: null,
    },
    {
        sink: 'connectorHandlers.ts:createCursorNode:name="TTF_Connector / Mouse Cursor"',
        contract: null,
    },
    {
        sink: "nodeCreators.ts:createFrame:name=name",
        contract: "create_frame.name",
    },
    {
        sink: "nodeCreators.ts:createShape:name=name",
        contract: "create_shape.name",
    },
    {
        sink: "nodeCreators.ts:createShape:name=type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()",
        contract: null,
    },
    {
        sink: "nodeCreators.ts:createText:name=name !== undefined ? name : text",
        contract: "create_text.name",
    },
    {
        sink: "nodeModifiers.ts:groupNodes:name=name",
        contract: "node_group.name",
    },
    {
        sink: "nodeModifiers.ts:setNodeName:name=name",
        contract: "node_rename.name",
    },
    {
        sink: "styleHandlers.ts:createStyle:name=name",
        contract: "style_manage.name@CREATE_OR_UPDATE",
    },
    {
        sink: "styleHandlers.ts:createStyle:name=name!",
        contract: "style_manage.name@CREATE_OR_UPDATE",
    },
    {
        sink: "variableHandlers.ts:handleVariableRequest:call:createVariable=name",
        contract: "variable_manage.name@CREATE_VARIABLE",
    },
    {
        sink: "variableHandlers.ts:handleVariableRequest:call:createVariableCollection=name",
        contract: "variable_manage.name@CREATE_COLLECTION",
    },
    {
        sink: "variableHandlers.ts:handleVariableRequest:call:renameMode=modeName",
        contract: "variable_manage.modeName@CREATE_COLLECTION",
    },
    {
        sink: "variableHandlers.ts:handleVariableRequest:name=name",
        contract: "variable_manage.name@UPDATE_VARIABLE",
    },
    {
        sink: "vectorHandlers.ts:createNodeFromSvg:name=name",
        contract: "create_svg.name",
    },
] as const;

const NAME_METHOD_ARGUMENT = new Map<string, number>([
    ["createVariableCollection", 0],
    ["renameMode", 1],
    ["createVariable", 0],
    ["addComponentProperty", 0],
    ["editComponentProperty", 1],
]);

function normalizedSource(node: ts.Node, sourceFile: ts.SourceFile): string {
    return node.getText(sourceFile).replace(/\s+/g, " ");
}

function isNameAssignmentTarget(node: ts.Expression): boolean {
    if (ts.isPropertyAccessExpression(node)) {
        return node.name.text === "name";
    }
    return (
        ts.isElementAccessExpression(node) &&
        node.argumentExpression !== undefined &&
        ts.isStringLiteralLike(node.argumentExpression) &&
        node.argumentExpression.text === "name"
    );
}

export function scanPluginNameAssignmentSinks(): string[] {
    const repoRoot = path.resolve(import.meta.dir, "../../../../..");
    const handlersDir = path.join(repoRoot, "figma_plugin", "handlers");
    const sinks: string[] = [];

    for (const fileName of readdirSync(handlersDir).filter((name) => name.endsWith(".ts"))) {
        const fullPath = path.join(handlersDir, fileName);
        const source = readFileSync(fullPath, "utf8");
        const sourceFile = ts.createSourceFile(
            fullPath,
            source,
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.TS,
        );

        const visit = (node: ts.Node, enclosingFunction = "<top>"): void => {
            let functionName = enclosingFunction;
            if (ts.isFunctionDeclaration(node) && node.name) {
                functionName = node.name.text;
            }

            if (
                ts.isBinaryExpression(node) &&
                node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
                isNameAssignmentTarget(node.left)
            ) {
                sinks.push(
                    `${fileName}:${functionName}:name=${normalizedSource(node.right, sourceFile)}`,
                );
            }

            if (
                ts.isCallExpression(node) &&
                ts.isPropertyAccessExpression(node.expression)
            ) {
                const method = node.expression.name.text;
                const argumentIndex = NAME_METHOD_ARGUMENT.get(method);
                if (argumentIndex !== undefined && node.arguments[argumentIndex]) {
                    sinks.push(
                        `${fileName}:${functionName}:call:${method}=` +
                        normalizedSource(node.arguments[argumentIndex], sourceFile),
                    );
                }
            }

            ts.forEachChild(node, (child) => visit(child, functionName));
        };

        visit(sourceFile);
    }

    return sinks.sort();
}

export function expectedNameAssignmentContracts(): string[] {
    return [
        ...new Set(
            EXPECTED_NAME_ASSIGNMENT_SINKS
                .map(({ contract }) => contract)
                .filter((contract): contract is string => contract !== null),
        ),
    ].sort();
}
