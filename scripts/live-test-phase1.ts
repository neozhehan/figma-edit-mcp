import { connectToFigma, joinChannel, sendCommandToFigma } from "../src/mcp_server/figma-client.js";
import { readFileSync } from "fs";
import { join } from "path";
import { resizeIfOversized } from "../src/mcp_server/imageResize.js";

async function testFill(nodeId: string, nodeName: string, imageConfig: any) {
    let payload = { nodeId, nodeName, image: imageConfig };
    if (imageConfig.bytesBase64) {
        const result = await resizeIfOversized(imageConfig.bytesBase64);
        payload.image.bytesBase64 = result.base64;
        if (result.warning) console.log("Warning from resize:", result.warning);
    }
    return sendCommandToFigma("node_set_fill", payload);
}

async function run() {
    connectToFigma();
    await new Promise(r => setTimeout(r, 1000)); // wait for connection
    
    await joinChannel("mj3g");
    
    const fixtureDir = join(import.meta.dir, "../src/mcp_server/tests/fixtures/images");
    const getB64 = (name: string) => readFileSync(join(fixtureDir, name)).toString("base64");

    const tests = [
        "png-small.png", "jpeg-small.jpg", "gif-small.gif", "animated-small.gif",
        "png-large.png", "jpeg-large.jpg", "gif-large.gif", "animated-large.gif"
    ];

    for (const test of tests) {
        console.log(`\n--- Testing ${test} via bytesBase64 ---`);
        try {
            await testFill("2:16", "Rectangle 2", { bytesBase64: getB64(test) });
            console.log("Success.");
        } catch (e: any) {
            console.error("Failed:", e.message);
        }
        await new Promise(r => setTimeout(r, 1000));
    }

    const urls = {
        "png-small.png": "https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png",
        "jpeg-small.jpg": "https://upload.wikimedia.org/wikipedia/commons/b/b6/Felis_catus-cat_on_snow.jpg",
        "gif-small.gif": "https://upload.wikimedia.org/wikipedia/commons/d/d3/Newtons_cradle_animation_book_2.gif",
        "animated-small.gif": "https://upload.wikimedia.org/wikipedia/commons/2/2c/Rotating_earth_%28large%29.gif",
        "png-large.png": "https://upload.wikimedia.org/wikipedia/commons/8/81/R1_Canberra_light_rail_diagram.png",
        "jpeg-large.jpg": "https://upload.wikimedia.org/wikipedia/commons/f/ff/Pizigani_1367_Chart_10MB.jpg",
        "gif-large.gif": "https://upload.wikimedia.org/wikipedia/commons/b/b6/UCB_Miscellaneous_Symbols_and_Pictographs_wide.gif",
        "animated-large.gif": "https://upload.wikimedia.org/wikipedia/commons/7/70/Zellamsee.gif"
    };

    for (const [name, url] of Object.entries(urls)) {
        console.log(`\n--- Testing ${name} via URL ---`);
        try {
            await testFill("2:16", "Rectangle 2", { url });
            console.log("Success.");
        } catch (e: any) {
            console.error("Failed:", e.message);
        }
        await new Promise(r => setTimeout(r, 1000));
    }
    
    process.exit(0);
}
run().catch(console.error);
