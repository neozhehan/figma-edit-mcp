export async function createNodeFromSvg(params: any) {
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
    // @ts-ignore
    parent.appendChild(node);

    node.x = x;
    node.y = y;

    return {
        id: node.id,
        name: node.name,
        type: node.type
    };
}
