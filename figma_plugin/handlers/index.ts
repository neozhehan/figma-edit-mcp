/**
 * Handler module exports for Figma plugin
 * Central export point for all handler modules
 */

// Styling handlers
export { setFillColor, setStroke, setCornerRadius } from './stylingHandlers.js';

// Layout handlers
export {
    // @ts-ignore
    setLayoutMode,
    // @ts-ignore
    setPadding,
    // @ts-ignore
    setAxisAlign,
    // @ts-ignore
    setLayoutSizing,
    // @ts-ignore
    setItemSpacing
} from './layoutHandlers.js';

// Node readers
export {
    getPagesInfo,
    getSelection,
    getNodesInfo
} from './nodeReaders.js';

// Node creators
export {
    createShape,
    createFrame,
    createText,
    cloneNode
} from './nodeCreators.js';

// Node modifiers
export {
    transformNode,
    deleteMultipleNodes,
    setSelections,
    setNodeName
} from './nodeModifiers.js';

// Component handlers
export {
    getStyles,
    // @ts-ignore
    getLocalComponents,
    createComponentInstance,
    exportNodeAsImage,
    getInstanceOverrides,
    getValidTargetInstances,
    getSourceInstanceData,
    setInstanceOverrides
} from './componentHandlers.js';

// Connector handlers
export {
    getReactions,
    setDefaultConnector,
    createCursorNode,
    createConnections
} from './connectorHandlers.js';

// Text handlers
export {
    setMultipleTextContents
} from './textHandlers.js';

// Annotation handlers
export {
    getAnnotations,
    setMultipleAnnotations
} from './annotationHandlers.js';

// Variable handlers
export {
    getVariables,
    getNodeVariables,
    setBoundVariable
} from './variableHandlers.js';

// Connect handlers
export {
    getConnectPayload
} from './connectHandlers.js';
