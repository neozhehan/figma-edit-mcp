import { describe, it, expect } from "bun:test";
import jimp from "jimp";
import jpeg from "jpeg-js";
import { resizeIfOversized } from "../../imageResize.js";

describe("resizeIfOversized", () => {
    it("downscales oversized PNGs preserving aspect ratio", async () => {
        const image = new jimp(4096, 5000, 0xFFFFFFFF);
        const buffer = await image.getBufferAsync(jimp.MIME_PNG);
        const b64 = buffer.toString('base64');
        
        const result = await resizeIfOversized(b64);
        
        expect(result.warning).toContain("image resized 4096×5000 → 3355×4096");
        
        const decoded = Buffer.from(result.base64, 'base64');
        const resizedImage = await jimp.read(decoded);
        
        expect(resizedImage.getWidth()).toBe(3355);
        expect(resizedImage.getHeight()).toBe(4096);
        expect(resizedImage.getMIME()).toBe(jimp.MIME_PNG);
    });

    it("downscales oversized JPEGs preserving aspect ratio and source format", async () => {
        const image = new jimp(5000, 4000, 0xFFFFFFFF);
        const buffer = await image.getBufferAsync(jimp.MIME_JPEG);
        const b64 = buffer.toString('base64');

        const result = await resizeIfOversized(b64);

        expect(result.warning).toContain("image resized 5000×4000 → 4096×3277");

        const decoded = Buffer.from(result.base64, 'base64');
        const resizedImage = await jimp.read(decoded);

        expect(resizedImage.getWidth()).toBe(4096);
        expect(resizedImage.getHeight()).toBe(3277);
        // Source format preserved (JPEG stays JPEG, not transcoded to PNG)
        expect(resizedImage.getMIME()).toBe(jimp.MIME_JPEG);
    });

    it("throws an honest 'too large to auto-resize' error when an image exceeds jimp's decode budget", async () => {
        // Force a tiny JPEG decode budget so a modest image trips the real
        // maxMemoryUsageInMB path (no need for the 9.7MB jpeg-large fixture).
        const original = (jimp as any).decoders["image/jpeg"];
        (jimp as any).decoders["image/jpeg"] = (d: Buffer) => jpeg.decode(d, { maxMemoryUsageInMB: 1, maxResolutionInMP: 100 });
        try {
            const b64 = (await new jimp(1500, 1500, 0xFFFFFFFF).getBufferAsync(jimp.MIME_JPEG)).toString("base64");
            await expect(resizeIfOversized(b64)).rejects.toThrow(/too large to auto-resize/);
        } finally {
            (jimp as any).decoders["image/jpeg"] = original;
        }
    });

    it("passes undecodable/invalid base64 through unchanged without throwing", async () => {
        // Server-side resize is best-effort: input jimp cannot decode (invalid
        // base64, truncated/corrupt bytes) must pass through so the plugin's
        // base64 decoder / Figma's image gate emit the structured errors.
        for (const bad of ["not!valid!base64!!!", "SGVsbG8=", "AAAA"]) {
            const result = await resizeIfOversized(bad);
            expect(result.warning).toBeUndefined();
            expect(result.base64).toBe(bad);
        }
    });

    it("returns smaller images byte-identical without warning", async () => {
        const image = new jimp(100, 100, 0xFFFFFFFF);
        const buffer = await image.getBufferAsync(jimp.MIME_JPEG);
        const b64 = buffer.toString('base64');
        
        const result = await resizeIfOversized(b64);
        
        expect(result.warning).toBeUndefined();
        expect(result.base64).toBe(b64);
    });

    it("passes GIFs through without modifying", async () => {
        // Dummy 1x1 GIF
        const b64 = "R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
        const result = await resizeIfOversized(b64);
        
        expect(result.warning).toBeUndefined();
        expect(result.base64).toBe(b64);
    });

    it("a >4096px BMP/TIFF (jimp-decodable, Figma-unsupported) passes through byte-identical with no warning", async () => {
        const image = new jimp(5000, 5000, 0xFFFFFFFF);
        const buffer = await image.getBufferAsync(jimp.MIME_BMP);
        const b64 = buffer.toString('base64');
        
        const result = await resizeIfOversized(b64);
        
        expect(result.warning).toBeUndefined();
        expect(result.base64).toBe(b64);
    });

    describe("Resource-fixture integration", () => {
        const fs = require("fs");
        const path = require("path");
        const fixtureDir = path.join(import.meta.dir, "../fixtures/images");
        const getFixture = (name: string) => fs.readFileSync(path.join(fixtureDir, name)).toString("base64");

        it("each fixture decodes to its §1-table dimensions (fixture integrity)", async () => {
            // [file, width, height] per the §1 fixtures table (excludes the 9.7MB jpeg-large).
            const expected: [string, number, number][] = [
                ["png-small.png", 800, 600],
                ["jpeg-small.jpg", 3000, 2000],
                ["gif-small.gif", 480, 360],
                ["animated-small.gif", 400, 400],
                ["png-large.png", 4134, 5846],
                ["gif-large.gif", 13057, 517],
                ["animated-large.gif", 8211, 6250],
            ];
            for (const [file, w, h] of expected) {
                const img = await jimp.read(Buffer.from(getFixture(file), "base64"));
                expect(img.getWidth()).toBe(w);
                expect(img.getHeight()).toBe(h);
            }
        });

        it("png-small/jpeg-small/gif-small/animated-small (≤4096) → byte-identical, no warning", async () => {
            const files = ["png-small.png", "jpeg-small.jpg", "gif-small.gif", "animated-small.gif"];
            for (const file of files) {
                const b64 = getFixture(file);
                const result = await resizeIfOversized(b64);
                expect(result.warning).toBeUndefined();
                expect(result.base64).toBe(b64);
            }
        });

        it("png-large (4134×5846) → downscaled longest-side→4096 + warning", async () => {
            const b64 = getFixture("png-large.png");
            const result = await resizeIfOversized(b64);
            expect(result.warning).toBeDefined();
            expect(result.warning).toContain("4096"); // resized down
            expect(result.base64).not.toBe(b64);
        });

        it("gif-large/animated-large (>4096) → passed through unmodified", async () => {
            const files = ["gif-large.gif", "animated-large.gif"];
            for (const file of files) {
                const b64 = getFixture(file);
                const result = await resizeIfOversized(b64);
                expect(result.warning).toBeUndefined();
                expect(result.base64).toBe(b64);
            }
        });
    });
});
