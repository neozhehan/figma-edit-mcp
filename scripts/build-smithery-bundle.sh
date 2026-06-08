#!/usr/bin/env bash
#
# WS4 R4.2/R4.3 — build a Smithery-targeted .mcpb bundle.
#
# Smithery's `mcp publish` requires per-tool `inputSchema` (and reads outputSchema +
# annotations), which the MCPB manifest spec forbids (`additionalProperties: false`,
# enforced by `mcpb pack`). So we cannot ship one bundle that satisfies both. This
# script keeps the repo's `figma-edit-mcp.mcpb` MCPB-spec-compliant (built by mcpb
# pack, Claude-Desktop-safe) and produces a SEPARATE `figma-edit-mcp.smithery.mcpb`
# whose manifest carries the rich tool schemas, by swapping manifest.json inside a
# copy of the spec bundle.
#
#   Usage:  bun run build:smithery
#   Then:   smithery mcp publish ./figma-edit-mcp.smithery.mcpb -n <org/server>
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SPEC_BUNDLE="figma-edit-mcp.mcpb"
SMITHERY_BUNDLE="figma-edit-mcp.smithery.mcpb"
MCPB="@anthropic-ai/mcpb@2.1.2"

echo "1/4 Building dist + plugin…"
bun run build:all >/dev/null

echo "2/4 Generating MCPB-spec manifest + packing spec bundle ($SPEC_BUNDLE)…"
bun run scripts/gen-manifest-tools.ts >/dev/null   # minimal tools -> manifest.json (spec-compliant)
npx --yes "$MCPB" pack . "$SPEC_BUNDLE" >/dev/null

echo "3/4 Composing Smithery manifest (rich tool schemas)…"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
RICH_TOOLS="$(bun run scripts/gen-manifest-tools.ts --rich)"
jq --argjson tools "$RICH_TOOLS" '.tools = $tools | .tools_generated = false' manifest.json > "$TMP/manifest.json"

echo "4/4 Writing $SMITHERY_BUNDLE (spec bundle + swapped manifest)…"
cp "$SPEC_BUNDLE" "$SMITHERY_BUNDLE"
( cd "$TMP" && zip -q "$ROOT/$SMITHERY_BUNDLE" manifest.json )

echo "Done."
echo "  $SPEC_BUNDLE      — MCPB-spec (name+description), for general .mcpb use"
echo "  $SMITHERY_BUNDLE  — rich tool schemas, for: smithery mcp publish ./$SMITHERY_BUNDLE -n <org/server>"
