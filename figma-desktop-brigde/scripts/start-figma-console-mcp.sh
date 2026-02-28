#!/usr/bin/env bash
# Inicia o servidor MCP figma-console (figma-console-mcp via npx).
# Usado pelo Cursor em ~/.cursor/mcp.json (command + args: -y figma-console-mcp@latest).
# FIGMA_ACCESS_TOKEN é passado pelo Cursor via env do mcp.json.

set -e
exec npx "$@"
