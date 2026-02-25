#!/usr/bin/env node
/**
 * WebSocket server for Talk to Figma MCP.
 * Runs on port 3055 by default. MCP and Figma plugin both connect here.
 */
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3055;

// channel name -> Set of WebSocket clients
const channels = new Map<string, Set<WebSocket>>();

const server = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("WebSocket server running. Connect with ws://localhost:" + PORT);
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws: WebSocket) => {
  console.log("[Socket] New client connected");

  ws.send(
    JSON.stringify({
      type: "system",
      message: "Please join a channel to start chatting",
    })
  );

  ws.on("message", (raw: Buffer | string) => {
    try {
      const data = JSON.parse(raw.toString());

      if (data.type === "join") {
        const channelName = data.channel;
        if (!channelName || typeof channelName !== "string") {
          ws.send(
            JSON.stringify({ type: "error", message: "Channel name is required" })
          );
          return;
        }
        // Remove from any previous channel
        channels.forEach((clients) => clients.delete(ws));
        if (!channels.has(channelName)) {
          channels.set(channelName, new Set());
        }
        const channelClients = channels.get(channelName)!;
        channelClients.add(ws);

        ws.send(
          JSON.stringify({
            type: "system",
            message: `Joined channel: ${channelName}`,
            channel: channelName,
          })
        );
        return;
      }

      if (data.type === "message") {
        const channelName = data.channel;
        if (!channelName || typeof channelName !== "string") {
          ws.send(
            JSON.stringify({ type: "error", message: "Channel name is required" })
          );
          return;
        }
        const channelClients = channels.get(channelName);
        if (!channelClients || !channelClients.has(ws)) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "You must join the channel first",
            })
          );
          return;
        }
        // Broadcast to all clients in the channel (including sender, so MCP gets plugin responses)
        const payload = JSON.stringify({
          type: "broadcast",
          message: data.message,
          channel: channelName,
        });
        channelClients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
          }
        });
      }
    } catch (err) {
      console.error("[Socket] Error handling message:", err);
    }
  });

  ws.on("close", () => {
    channels.forEach((clients) => clients.delete(ws));
  });
});

server.listen(PORT, () => {
  console.log(`WebSocket server running on ws://localhost:${PORT}`);
});
