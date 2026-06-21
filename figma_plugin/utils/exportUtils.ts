/**
 * Export utilities for Figma plugin
 */

/**
 * Custom base64 encoder for binary data
 * @param {Uint8Array} bytes - Binary data to encode
 * @returns {string} Base64 encoded string
 */
export function customBase64Encode(bytes: any) {
    const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let base64 = "";

    const byteLength = bytes.byteLength;
    const byteRemainder = byteLength % 3;
    const mainLength = byteLength - byteRemainder;

    let a, b, c, d;
    let chunk;

    // Main loop deals with bytes in chunks of 3
    for (let i = 0; i < mainLength; i = i + 3) {
        // Combine the three bytes into a single integer
        chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];

        // Use bitmasks to extract 6-bit segments from the triplet
        a = (chunk & 16515072) >> 18; // 16515072 = (2^6 - 1) << 18
        b = (chunk & 258048) >> 12; // 258048 = (2^6 - 1) << 12
        c = (chunk & 4032) >> 6; // 4032 = (2^6 - 1) << 6
        d = chunk & 63; // 63 = 2^6 - 1

        // Convert the raw binary segments to the appropriate ASCII encoding
        base64 += chars[a] + chars[b] + chars[c] + chars[d];
    }

    // Deal with the remaining bytes and padding
    if (byteRemainder === 1) {
        chunk = bytes[mainLength];

        a = (chunk & 252) >> 2; // 252 = (2^6 - 1) << 2

        // Set the 4 least significant bits to zero
        b = (chunk & 3) << 4; // 3 = 2^2 - 1

        base64 += chars[a] + chars[b] + "==";
    } else if (byteRemainder === 2) {
        chunk = (bytes[mainLength] << 8) | bytes[mainLength + 1];

        a = (chunk & 64512) >> 10; // 64512 = (2^6 - 1) << 10
        b = (chunk & 1008) >> 4; // 1008 = (2^6 - 1) << 4

        // Set the 2 least significant bits to zero
        c = (chunk & 15) << 2; // 15 = 2^4 - 1

        base64 += chars[a] + chars[b] + chars[c] + "=";
    }

    return base64;
}

/**
 * Decode base64 to Uint8Array (Figma sandbox lacks atob)
 * @param {string} b64 - Base64 string, optionally with data: URI prefix
 * @returns {Uint8Array} Decoded bytes
 */
export function base64ToBytes(b64: string): Uint8Array {
    let base64 = b64.replace(/^data:.*?;base64,/, "");
    // Add padding if missing
    while (base64.length % 4 !== 0) {
        base64 += "=";
    }
    
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
        throw new Error("Invalid base64 string");
    }

    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const lookup = new Uint8Array(256);
    for (let i = 0; i < chars.length; i++) {
        lookup[chars.charCodeAt(i)] = i;
    }

    let bufferLength = base64.length * 0.75;
    if (base64[base64.length - 1] === "=") bufferLength--;
    if (base64[base64.length - 2] === "=") bufferLength--;

    const bytes = new Uint8Array(bufferLength);
    let p = 0;
    
    for (let i = 0; i < base64.length; i += 4) {
        const encoded1 = lookup[base64.charCodeAt(i)];
        const encoded2 = lookup[base64.charCodeAt(i + 1)];
        const encoded3 = lookup[base64.charCodeAt(i + 2)];
        const encoded4 = lookup[base64.charCodeAt(i + 3)];

        bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
        if (base64[i + 2] !== "=") {
            bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
            if (base64[i + 3] !== "=") {
                bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
            }
        }
    }

    return bytes;
}

/**
 * Decode UTF-8 bytes (e.g. an SVG export) to a string. Uses the native
 * TextDecoder when the runtime provides it, with a manual fallback for the
 * Figma sandbox (which historically lacks several web APIs — see the manual
 * base64 encoder above).
 * @param {Uint8Array} bytes - UTF-8 encoded binary data
 * @returns {string} Decoded string
 */
export function bytesToUtf8(bytes: any): string {
    if (typeof TextDecoder !== "undefined") {
        return new TextDecoder("utf-8").decode(bytes);
    }
    let out = "";
    let i = 0;
    const len = bytes.length;
    while (i < len) {
        const b1 = bytes[i++];
        if (b1 < 0x80) {
            out += String.fromCharCode(b1);
        } else if (b1 >= 0xc0 && b1 < 0xe0) {
            const b2 = bytes[i++];
            out += String.fromCharCode(((b1 & 0x1f) << 6) | (b2 & 0x3f));
        } else if (b1 >= 0xe0 && b1 < 0xf0) {
            const b2 = bytes[i++];
            const b3 = bytes[i++];
            out += String.fromCharCode(((b1 & 0x0f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f));
        } else {
            const b2 = bytes[i++];
            const b3 = bytes[i++];
            const b4 = bytes[i++];
            let cp = ((b1 & 0x07) << 18) | ((b2 & 0x3f) << 12) | ((b3 & 0x3f) << 6) | (b4 & 0x3f);
            cp -= 0x10000;
            out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
        }
    }
    return out;
}
