import { normalizeNodeId, normalizeNodeIds } from '../utils.js';

describe('normalizeNodeId', () => {
    it('should return undefined if input is undefined', () => {
        expect(normalizeNodeId(undefined)).toBeUndefined();
    });

    it('should return the same string if it does not match the pattern', () => {
        expect(normalizeNodeId('123:456')).toBe('123:456');
        expect(normalizeNodeId('simple')).toBe('simple');
    });

    it('should replace dash with colon for Figma URL format', () => {
        expect(normalizeNodeId('20485-41')).toBe('20485:41');
    });
});

describe('normalizeNodeIds', () => {
    it('should return undefined if input is undefined', () => {
        expect(normalizeNodeIds(undefined)).toBeUndefined();
    });

    it('should normalize each ID in the array', () => {
        const input = ['20485-41', '123:456', '789-0'];
        const expected = ['20485:41', '123:456', '789:0'];
        expect(normalizeNodeIds(input)).toEqual(expected);
    });
});


