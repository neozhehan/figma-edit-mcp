import { resolveAppendableParent } from './nodeCreators.js';
import { rethrowAfterCreatorCleanup } from '../utils/nodeUtils.js';
import { assertNonEmptyExplicitName } from '../utils/creatorValidation.js';

export async function createNodeFromSvg(params: any) {
    const { parentId, svg, name, x = 0, y = 0 } = params || {};

    if (!svg) {
        throw new Error("Missing required parameter: svg string.");
    }

    assertNonEmptyExplicitName(name, "name", "create_svg");

    const parentNode = await resolveAppendableParent(parentId, "create_svg");

    const node = figma.createNodeFromSvg(svg);
    try {
        // D11: createNodeFromSvg uses an implicit parent; contain it first.
        parentNode.appendChild(node);

        if (name !== undefined) {
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
        return result;
    } catch (error: any) {
        rethrowAfterCreatorCleanup(error, node, "create_svg", parentId);
    }
}
