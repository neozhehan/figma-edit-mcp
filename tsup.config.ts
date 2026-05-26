import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { server: 'src/mcp_server/server.ts', socket: 'src/socket.ts' },
  format: ['esm'],
  dts: false,
  clean: true,
  outDir: 'dist',
  target: 'node20',
  banner: { js: '#!/usr/bin/env node\nimport { createRequire as __cr } from "module";\nconst require = __cr(import.meta.url);' },
  sourcemap: true,
  minify: false,
  splitting: false,
  bundle: true,
  noExternal: ['@modelcontextprotocol/sdk', 'uuid', 'ws', 'zod'],
}); 