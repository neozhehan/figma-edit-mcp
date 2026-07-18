// Ambient declarations for globals the Figma plugin sandbox provides at runtime
// but that neither @figma/plugin-typings nor lib es2018 declares. Do not add the
// `dom` lib instead — it redeclares globals the Figma typings own (TS2451/TS2300).
// (v2.3.3 PRD Track 1, D2 residual errors 8–9)

declare class TextDecoder {
    constructor(label?: string, options?: { fatal?: boolean; ignoreBOM?: boolean });
    decode(input?: ArrayBuffer | ArrayBufferView, options?: { stream?: boolean }): string;
}
