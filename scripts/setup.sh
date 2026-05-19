#!/bin/bash

# ------------------------------------------------------------
# Contributor-only setup script.
# End users should run `npx figma-edit-mcp` instead.
# See CONTRIBUTING.md for the local-development workflow.
# ------------------------------------------------------------

# Setup script for Figma Edit MCP
# Installs dependencies and builds the MCP server

echo "🤖 Figma Edit MCP Setup"
echo "========================================"
echo ""

# Get the absolute path to this project
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$( dirname "$SCRIPT_DIR" )"

cd "$PROJECT_DIR"

# Install dependencies
echo "📦 Installing dependencies..."
bun install

echo ""

# Build the MCP server
echo "🔨 Building MCP server..."
bun run build

# Build the Figma Plugin
echo "🎨 Building Figma Plugin..."
npm run plugin:build

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Run 'bun integrate' to configure your AI coding assistant"
echo "  2. Run 'bun socket' to start the WebSocket server"
echo "  3. Install the Figma plugin and connect"