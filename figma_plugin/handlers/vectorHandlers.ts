import { resolveAppendableParent } from './nodeCreators.js';

export async function createNodeFromSvg(params: any) {
    const { parentId, svg, name, x = 0, y = 0 } = params || {};

    if (!svg) {
        throw new Error("Missing required parameter: svg string.");
    }

    const parentNode = await resolveAppendableParent(parentId, "create_svg");

    const node = figma.createNodeFromSvg(svg);
    try {
        if (name) {
            node.name = name;
        }

        parentNode.appendChild(node);

        node.x = x;
        node.y = y;

        return {
            id: node.id,
            name: node.name,
            type: node.type
        };
    } catch (error) {
        if (node && typeof node.remove === "function" && (node as any).removed !== true) {
            node.remove();
        }
        throw error;
    }
}
