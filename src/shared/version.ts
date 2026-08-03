import { existsSync, readFileSync } from "fs";

interface RootPackageMetadata {
    name?: string;
    version?: string;
}

function readRootPackageMetadata(): Required<Pick<RootPackageMetadata, "name" | "version">> {
    // Source modules live under src/**, while the bundled entry points live
    // under dist/. Try both layouts without introducing another hard-coded
    // version surface: package.json remains authoritative for the MCP server
    // and for the plugin build's __PLUGIN_VERSION__ define.
    const candidates = [
        new URL("../../package.json", import.meta.url),
        new URL("../package.json", import.meta.url),
    ];

    for (const candidate of candidates) {
        if (!existsSync(candidate)) continue;
        const parsed = JSON.parse(readFileSync(candidate, "utf8")) as RootPackageMetadata;
        if (typeof parsed.name === "string" && typeof parsed.version === "string") {
            return { name: parsed.name, version: parsed.version };
        }
    }

    throw new Error("Unable to resolve authoritative root package name/version");
}

const ROOT_PACKAGE = readRootPackageMetadata();

export const SERVER_NAME = ROOT_PACKAGE.name;
export const SERVER_VERSION = ROOT_PACKAGE.version;
