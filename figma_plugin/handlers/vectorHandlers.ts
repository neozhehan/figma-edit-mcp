import { resolveAppendableParent } from './nodeCreators.js';
import { removeUncommitted } from '../utils/nodeUtils.js';

export async function createNodeFromSvg(params: any) {
    const { parentId, svg, name, x = 0, y = 0 } = params || {};

    if (!svg) {
        throw new Error("Missing required parameter: svg string.");
    }

    const parentNode = await resolveAppendableParent(parentId, "create_svg");

    let committed = false;
    const node = figma.createNodeFromSvg(svg);
    try {
        // D11: createNodeFromSvg uses an implicit parent; contain it first.
        parentNode.appendChild(node);

        if (name) {
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
            parentId: node.parent ? node.parent.id : undefined,
        };
        committed = true;
        return result;
    } finally {
        if (!committed) removeUncommitted(node, "create_svg");
    }
}
