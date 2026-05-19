#!/bin/bash

# Integration configuration script for Figma Edit MCP
# Configure MCP for various AI coding assistants

# Get the absolute path to this project
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$( dirname "$SCRIPT_DIR" )"

# Parse arguments
LOCAL_MODE=false
PORT_ARG=""

while [[ "$#" -gt 0 ]]; do
    case $1 in
        --local)
            LOCAL_MODE=true
            shift
            ;;
        --port)
            PORT_ARG="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: ./integrate.sh [options]"
            echo "Options:"
            echo "  --local     Use local repository clone (bun run dist/server.js) instead of npx figma-edit-mcp"
            echo "  --port <n>  Specify a custom port for the WebSocket bridge"
            echo "  -h, --help  Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown parameter passed: $1"
            echo "Use --help for usage."
            exit 1
            ;;
    esac
done

if [ "$LOCAL_MODE" = true ]; then
    CMD="bun"
    if [ -n "$PORT_ARG" ]; then
        ARGS="[\"run\", \"$PROJECT_DIR/dist/server.js\", \"--port\", \"$PORT_ARG\"]"
    else
        ARGS="[\"run\", \"$PROJECT_DIR/dist/server.js\"]"
    fi
else
    CMD="npx"
    if [ -n "$PORT_ARG" ]; then
        ARGS="[\"figma-edit-mcp\", \"--port\", \"$PORT_ARG\"]"
    else
        ARGS="[\"figma-edit-mcp\"]"
    fi
fi

# MCP configuration JSON
MCP_CONFIG="{\"FigmaEdit\":{\"command\":\"$CMD\",\"args\":$ARGS}}"

echo "🤖 Figma Edit MCP Integration"
echo "========================================"
echo ""

# Function to install for Cursor
install_cursor() {
    CURSOR_CONFIG_DIR="$HOME/.cursor"
    CURSOR_CONFIG_FILE="$CURSOR_CONFIG_DIR/mcp.json"
    
    echo "📦 Configuring Cursor..."
    if [ -d "$CURSOR_CONFIG_DIR" ] || command -v cursor &> /dev/null; then
        mkdir -p "$CURSOR_CONFIG_DIR"
        
        # Check if file exists AND has valid JSON content
        NEEDS_NEW_FILE=true
        if [ -f "$CURSOR_CONFIG_FILE" ]; then
            EXISTING=$(cat "$CURSOR_CONFIG_FILE")
            if [ -n "$EXISTING" ] && echo "$EXISTING" | jq -e '.' > /dev/null 2>&1; then
                NEEDS_NEW_FILE=false
            fi
        fi
        
        if [ "$NEEDS_NEW_FILE" = true ]; then
            echo '{"mcpServers":'"$MCP_CONFIG"'}' > "$CURSOR_CONFIG_FILE"
            echo "✅ Created ~/.cursor/mcp.json"
        else
            if command -v jq &> /dev/null; then
                if echo "$EXISTING" | jq -e '.mcpServers' > /dev/null 2>&1; then
                    MERGED=$(echo "$EXISTING" | jq --argjson new "$MCP_CONFIG" '.mcpServers += $new')
                else
                    MERGED=$(echo "$EXISTING" | jq --argjson new "$MCP_CONFIG" '. + {"mcpServers": $new}')
                fi
                echo "$MERGED" > "$CURSOR_CONFIG_FILE"
                echo "✅ Updated ~/.cursor/mcp.json"
            else
                echo "⚠️  jq not found. Please manually update ~/.cursor/mcp.json"
            fi
        fi
        echo ""
        echo "⚠️  Please reload Cursor to pick up the changes."
    else
        echo "ℹ️  Cursor not detected."
        return 1
    fi
    return 0
}

# Function to install for VS Code / Copilot
install_vscode_mcp() {
    VSCODE_CONFIG_DIR="$HOME/Library/Application Support/Code/User"
    VSCODE_MCP_FILE="$VSCODE_CONFIG_DIR/mcp.json"
    
    echo "📦 Configuring VS Code (standard mcp.json)..."
    if [ -d "$VSCODE_CONFIG_DIR" ]; then
        # Check if file exists AND has valid JSON content
        NEEDS_NEW_FILE=true
        if [ -f "$VSCODE_MCP_FILE" ]; then
            EXISTING=$(cat "$VSCODE_MCP_FILE")
            if [ -n "$EXISTING" ] && echo "$EXISTING" | jq -e '.' > /dev/null 2>&1; then
                NEEDS_NEW_FILE=false
            fi
        fi
        
        if [ "$NEEDS_NEW_FILE" = true ]; then
            echo '{"servers":'"$MCP_CONFIG"'}' > "$VSCODE_MCP_FILE"
            echo "✅ Created VS Code mcp.json"
        else
            if command -v jq &> /dev/null; then
                if echo "$EXISTING" | jq -e '.servers' > /dev/null 2>&1; then
                    MERGED=$(echo "$EXISTING" | jq --argjson new "$MCP_CONFIG" '.servers += $new')
                else
                    MERGED=$(echo "$EXISTING" | jq --argjson new "$MCP_CONFIG" '. + {"servers": $new}')
                fi
                echo "$MERGED" > "$VSCODE_MCP_FILE"
                echo "✅ Updated VS Code mcp.json"
            else
                echo "⚠️  jq not found. Please manually update VS Code mcp.json"
            fi
        fi
        echo ""
        echo "⚠️  Please reload VS Code to pick up the changes."
    else
        echo "ℹ️  VS Code not detected."
        return 1
    fi
    return 0
}

# Function to install for Antigravity
install_antigravity() {
    ANTIGRAVITY_CONFIG_DIR="$HOME/.gemini/antigravity"
    ANTIGRAVITY_CONFIG_FILE="$ANTIGRAVITY_CONFIG_DIR/mcp_config.json"
    
    echo "📦 Configuring Antigravity..."
    mkdir -p "$ANTIGRAVITY_CONFIG_DIR"
    
    # Check if file exists AND has valid JSON content
    NEEDS_NEW_FILE=true
    if [ -f "$ANTIGRAVITY_CONFIG_FILE" ]; then
        EXISTING=$(cat "$ANTIGRAVITY_CONFIG_FILE")
        # Check if file is not empty and contains valid JSON
        if [ -n "$EXISTING" ] && echo "$EXISTING" | jq -e '.' > /dev/null 2>&1; then
            NEEDS_NEW_FILE=false
        fi
    fi
    
    if [ "$NEEDS_NEW_FILE" = true ]; then
        # Create new config file
        echo '{"mcpServers":'"$MCP_CONFIG"'}' > "$ANTIGRAVITY_CONFIG_FILE"
        echo "✅ Created ~/.gemini/antigravity/mcp_config.json"
    else
        # Merge with existing config
        if command -v jq &> /dev/null; then
            if echo "$EXISTING" | jq -e '.mcpServers' > /dev/null 2>&1; then
                MERGED=$(echo "$EXISTING" | jq --argjson new "$MCP_CONFIG" '.mcpServers += $new')
            else
                MERGED=$(echo "$EXISTING" | jq --argjson new "$MCP_CONFIG" '. + {"mcpServers": $new}')
            fi
            echo "$MERGED" > "$ANTIGRAVITY_CONFIG_FILE"
            echo "✅ Updated ~/.gemini/antigravity/mcp_config.json"
        else
            echo "⚠️  jq not found. Please manually update Antigravity config."
        fi
    fi
    echo ""
    echo "⚠️  Please reload Google Antigravity to pick up the changes."
    return 0
}

# Function to install for Claude Desktop
install_claude_desktop() {
    CLAUDE_CONFIG_DIR="$HOME/Library/Application Support/Claude"
    CLAUDE_CONFIG_FILE="$CLAUDE_CONFIG_DIR/claude_desktop_config.json"
    
    echo "📦 Configuring Claude Desktop..."
    if [ -d "$CLAUDE_CONFIG_DIR" ] || [ -f "$CLAUDE_CONFIG_FILE" ]; then
        mkdir -p "$CLAUDE_CONFIG_DIR"
        
        # Check if file exists AND has valid JSON content
        NEEDS_NEW_FILE=true
        if [ -f "$CLAUDE_CONFIG_FILE" ]; then
            EXISTING=$(cat "$CLAUDE_CONFIG_FILE")
            if [ -n "$EXISTING" ] && echo "$EXISTING" | jq -e '.' > /dev/null 2>&1; then
                NEEDS_NEW_FILE=false
            fi
        fi
        
        if [ "$NEEDS_NEW_FILE" = true ]; then
            echo '{"mcpServers":'"$MCP_CONFIG"'}' > "$CLAUDE_CONFIG_FILE"
            echo "✅ Created Claude Desktop config"
        else
            if command -v jq &> /dev/null; then
                if echo "$EXISTING" | jq -e '.mcpServers' > /dev/null 2>&1; then
                    MERGED=$(echo "$EXISTING" | jq --argjson new "$MCP_CONFIG" '.mcpServers += $new')
                else
                    MERGED=$(echo "$EXISTING" | jq --argjson new "$MCP_CONFIG" '. + {"mcpServers": $new}')
                fi
                echo "$MERGED" > "$CLAUDE_CONFIG_FILE"
                echo "✅ Updated Claude Desktop config"
            else
                echo "⚠️  jq not found. Please update config manually."
            fi
        fi
        echo ""
        echo "⚠️  Please restart Claude Desktop to pick up the changes."
    else
        echo "ℹ️  Claude Desktop config not found."
        return 1
    fi
    return 0
}

# Function for Claude Code instructions
show_claude_code_instructions() {
    echo ""
    echo "📦 Claude Code CLI Instructions:"
    echo "To install for Claude Code for the Current Project, run the following command in your terminal:"
    echo ""
    if [ "$LOCAL_MODE" = true ]; then
        CLAUDE_CMD="bun run $PROJECT_DIR/dist/server.js"
    else
        CLAUDE_CMD="npx figma-edit-mcp"
    fi
    if [ -n "$PORT_ARG" ]; then
        CLAUDE_CMD="$CLAUDE_CMD --port $PORT_ARG"
    fi
    echo "  claude mcp add FigmaEdit $CLAUDE_CMD"
    echo ""
    echo "After running the command above, Claude Code will be ready to use."
}

# Function for LM Studio instructions
show_lm_studio_instructions() {
    echo ""
    echo "📦 LM Studio Instructions:"
    
    # Extract inner config for LM Studio deeplink
    LM_STUDIO_CONFIG="{\"command\":\"$CMD\",\"args\":$ARGS}"
    
    # Try node first, then python3 for base64 URL encoding
    if command -v node >/dev/null 2>&1; then
        export LM_STUDIO_CONFIG
        ENCODED_CONFIG=$(node -e "console.log(encodeURIComponent(Buffer.from(process.env.LM_STUDIO_CONFIG).toString('base64')))")
    elif command -v python3 >/dev/null 2>&1; then
        export LM_STUDIO_CONFIG
        ENCODED_CONFIG=$(python3 -c "import urllib.parse, base64, os; print(urllib.parse.quote(base64.b64encode(os.environ['LM_STUDIO_CONFIG'].encode('utf-8')).decode('utf-8')))")
    else
        # Fallback
        ENCODED_CONFIG=$(echo -n "$LM_STUDIO_CONFIG" | base64 | tr -d '\n' | sed 's/+/%2B/g; s/\//%2F/g; s/=/%3D/g')
    fi
    
    echo "To install for LM Studio with one click, please choose one of the following:"
    echo "  1. Cmd/Ctrl + Click the link below if your terminal supports it"
    echo "  2. Run: open \"lmstudio://add_mcp?name=FigmaEdit&config=$ENCODED_CONFIG\""
    echo "  3. Copy and paste the link into your web browser"
    echo ""
    echo "  lmstudio://add_mcp?name=FigmaEdit&config=$ENCODED_CONFIG"
    echo ""
    echo "Or manually add this configuration to your mcp.json file by clicking 'Edit mcp.json' in LM Studio (Developer Tab):"
    echo ""
    echo '  "FigmaEdit": '"$LM_STUDIO_CONFIG"
    echo ""
}


# Interactive Menu
show_menu() {
    echo "Select an integration to configure:"
    echo ""
    echo "  1) Google Antigravity"
    echo "  2) Visual Studio Code (GitHub Copilot)"
    echo "  3) Cursor"
    echo "  4) Claude Desktop"
    echo "  5) Claude Code (Command Line, Visual Studio Code, Google Antigravity)"
    echo "  6) LM Studio"
    echo ""
    echo "  q) Quit"
    echo ""
}

show_menu
read -p "Enter your choice: " choice
echo ""

case $choice in
    1)
        install_antigravity
        ;;
    2)
        install_vscode_mcp
        ;;
    3)
        install_cursor
        ;;
    4)
        install_claude_desktop
        ;;
    5)
        show_claude_code_instructions
        ;;
    6)
        show_lm_studio_instructions
        ;;
    q|Q)
        echo "Goodbye!"
        exit 0
        ;;
    *)
        echo "❌ Invalid option."
        exit 1
        ;;
esac

echo ""
echo "🎉 Done!"
