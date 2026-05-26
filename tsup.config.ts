import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { server: 'src/mcp_server/server.ts', socket: 'src/socket.ts' },
  format: ['esm'],
  dts: false,
  clean: true,
  outDir: 'dist',
  target: 'node20',
  banner: { js: '#!/usr/bin/env node' },
  sourcemap: true,
  minify: false,
  splitting: false,
  bundle: true,
  noExternal: [/.*/],
}); 