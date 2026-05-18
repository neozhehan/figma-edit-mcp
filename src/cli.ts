import { readFileSync } from "fs";

export function parseCliArgs(binName: string) {
  const args = process.argv.slice(2);

  if (args.includes('--version')) {
    try {
      // Handle the fact that we might be bundled into dist/
      const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
      console.log(pkg.version);
    } catch (e) {
      console.log('1.5.0');
    }
    process.exit(0);
  }

  if (args.includes('--help')) {
    console.log(`${binName}
Usage: ${binName} [options]

Options:
  --version    Print version and exit
  --help       Print this help message and exit
  --port <n>   Set WebSocket port (default: 3055, env: FIGMA_EDIT_MCP_SOCKET_PORT)`);
    process.exit(0);
  }

  let port = process.env.FIGMA_EDIT_MCP_SOCKET_PORT ? parseInt(process.env.FIGMA_EDIT_MCP_SOCKET_PORT, 10) : 3055;
  const portIdx = args.indexOf('--port');
  if (portIdx !== -1 && args[portIdx + 1]) {
    port = parseInt(args[portIdx + 1], 10);
  }

  return { port };
}
