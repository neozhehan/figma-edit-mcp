import { describe, it, expect } from "bun:test";
import { execSync } from "child_process";
import { writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

describe("check-versions script regression self-test", () => {
    it("succeeds when all version surfaces are synchronized, and fails on any mismatch", () => {
        const tempDir = join(process.cwd(), "src/mcp_server/tests/unit/temp_version_test");
        rmSync(tempDir, { recursive: true, force: true });
        mkdirSync(tempDir, { recursive: true });

        const pkg = { version: "2.3.2" };
        const srv = { version: "2.3.2", packages: [{ version: "2.3.2" }] };
        const man = { version: "2.3.2" };

        const writeFiles = (p: typeof pkg, s: typeof srv, m: typeof man) => {
            writeFileSync(join(tempDir, "package.json"), JSON.stringify(p, null, 2));
            writeFileSync(join(tempDir, "server.json"), JSON.stringify(s, null, 2));
            writeFileSync(join(tempDir, "manifest.json"), JSON.stringify(m, null, 2));
        };

        const runScript = () => {
            const scriptPath = join(process.cwd(), "scripts/check-versions.ts");
            try {
                execSync(`bun run ${scriptPath}`, { cwd: tempDir, stdio: "pipe" });
                return 0;
            } catch (err: any) {
                return err.status || 1;
            }
        };

        // 1. All match -> exit code 0
        writeFiles(pkg, srv, man);
        expect(runScript()).toBe(0);

        // 2. package.json mismatch -> exit code 1
        writeFiles({ version: "2.3.3" }, srv, man);
        expect(runScript()).toBe(1);

        // 3. server.json top-level mismatch -> exit code 1
        writeFiles(pkg, { version: "2.3.3", packages: [{ version: "2.3.2" }] }, man);
        expect(runScript()).toBe(1);

        // 4. server.json packages[0] mismatch -> exit code 1
        writeFiles(pkg, { version: "2.3.2", packages: [{ version: "2.3.3" }] }, man);
        expect(runScript()).toBe(1);

        // 5. manifest.json mismatch -> exit code 1
        writeFiles(pkg, srv, { version: "2.3.3" });
        expect(runScript()).toBe(1);

        // Clean up
        rmSync(tempDir, { recursive: true, force: true });
    });
});
