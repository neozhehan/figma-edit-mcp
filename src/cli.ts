import { readFileSync } from "fs";

export function parseCliArgs(binName: string) {
  const args = process.argv.slice(2);

  if (args.includes('--version')) {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
    console.log(pkg.version);
    process.exit(0);
  }

  if (args.includes('--help')) {
    console.log(`${binName}
Usage: ${binName} [options]

Options:
  --version    Print version and exit
  --help       Print this help message and exit
  --host <ip>  Set WebSocket host (default: "localhost", env: FIGMA_EDIT_MCP_SOCKET_HOST)
  --port <n>   Set WebSocket port (default: 3055, env: FIGMA_EDIT_MCP_SOCKET_PORT)`);
    process.exit(0);
  }

  let port = process.env.FIGMA_EDIT_MCP_SOCKET_PORT ? parseInt(process.env.FIGMA_EDIT_MCP_SOCKET_PORT, 10) : 3055;
  const portIdx = args.indexOf('--port');
  if (portIdx !== -1 && args[portIdx + 1]) {
    port = parseInt(args[portIdx + 1], 10);
  }

  let host = process.env.FIGMA_EDIT_MCP_SOCKET_HOST || "localhost";
  const hostIdx = args.indexOf('--host');
  if (hostIdx !== -1 && args[hostIdx + 1]) {
    host = args[hostIdx + 1];
  }

  return { port, host };
}
