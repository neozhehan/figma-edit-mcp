import jimp from "jimp";

export async function resizeIfOversized(base64: string): Promise<{ base64: string; warning?: string }> {
    // Strip optional data URL prefix
    const base64Data = base64.replace(/^data:image\/\w+;base64,/, "");

    let image: Awaited<ReturnType<typeof jimp.read>>;
    try {
        const buffer = Buffer.from(base64Data, "base64");
        image = await jimp.read(buffer);
    } catch (e: any) {
        const msg = e?.message || String(e);
        // Known limitation: jimp/jpeg-js refuse to decode images beyond their
        // resource budget (defaults ~512MB / 100MP, i.e. roughly >45 megapixels).
        // We deliberately do NOT raise that budget — decoding such an image balloons
        // process RSS to ~2GB that the runtime never returns to the OS (a child
        // process would be required to reclaim it). Such an image is necessarily far
        // larger than Figma's 4096px limit, so be honest that we cannot auto-resize
        // it, rather than passing it through to a misleading "Image is too large".
        if (/maxMemoryUsageInMB|maxResolutionInMP/.test(msg)) {
            throw new Error(
                "node_set_fill: image is too large to auto-resize server-side (exceeds the ~45 megapixel decode budget). Pre-resize it to ≤4096px per side and retry, or send a smaller image."
            );
        }
        // Other decode failures (invalid base64, truncated/corrupt bytes, or a
        // format jimp cannot read): pass through unchanged and let the plugin's
        // base64 decoder and Figma's image gate be the single authority — they
        // surface the structured node_set_fill errors ('bytesBase64' is not valid
        // base64 / Figma rejected the image). A decode failure here must never
        // become a raw jimp error in the tool result.
        return { base64 };
    }

    const mime = image.getMIME();
    
    // Resize iff detected MIME ∈ {image/png, image/jpeg}
    if (mime !== jimp.MIME_PNG && mime !== jimp.MIME_JPEG) {
        return { base64 };
    }
    
    const width = image.getWidth();
    const height = image.getHeight();
    const maxDim = Math.max(width, height);
    
    if (maxDim > 4096) {
        const scale = 4096 / maxDim;
        const newWidth = Math.round(width * scale);
        const newHeight = Math.round(height * scale);
        
        image.resize(newWidth, newHeight);
        
        if (mime === jimp.MIME_JPEG) {
            image.quality(85);
        }
        
        const resizedBuffer = await image.getBufferAsync(mime);
        const warning = `image resized ${width}×${height} → ${newWidth}×${newHeight} to meet Figma's 4096px limit`;
        return { base64: resizedBuffer.toString("base64"), warning };
    }
    
    return { base64 };
}
