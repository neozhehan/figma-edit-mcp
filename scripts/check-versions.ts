import { readFileSync } from "fs";
import { join } from "path";

/**
 * Asserts version synchronization across version control descriptors:
 * - package.json version
 * - server.json version (top-level)
 * - server.json packages[0].version
 * - manifest.json version
 */
const root = process.cwd();

try {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const srv = JSON.parse(readFileSync(join(root, "server.json"), "utf8"));
    const man = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));

    const versions = {
        "package.json": pkg.version,
        "server.json (top-level)": srv.version,
        "server.json (package version)": srv.packages?.[0]?.version,
        "manifest.json": man.version,
    };

    const distinct = new Set(Object.values(versions));

    if (distinct.size > 1) {
        console.error("Error: version mismatch detected across descriptors!");
        console.error(JSON.stringify(versions, null, 2));
        process.exit(1);
    }

    console.log(`Success: All version descriptors are synchronized at v${pkg.version}`);
    process.exit(0);
} catch (error: any) {
    console.error("Error: check-versions script encountered a failure:", error.message);
    process.exit(1);
}
