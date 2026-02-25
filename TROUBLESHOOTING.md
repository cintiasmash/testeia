# Troubleshooting

- **Connection / "Must join a channel before sending commands"**  
  Ensure the WebSocket server is running (`npm run socket`) and the Figma plugin is open and joined to the same channel as in Cursor (`join_channel`). See [FIGMA-SETUP.md](FIGMA-SETUP.md).

- **Tools not appearing or failing**  
  Restart the MCP and/or Cursor after changing configuration. Full tool list: [COMMANDS.md](COMMANDS.md).
