import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/signal" });
const rooms = new Map();

app.get("/health", (_req, res) => res.json({ ok: true }));
app.post("/api/rooms", (_req, res) => {
  const roomId = crypto.randomBytes(18).toString("hex");
  rooms.set(roomId, new Set());
  res.json({ roomId });
});

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, "http://localhost");
  const roomId = url.searchParams.get("room");
  if (!roomId || !/^[a-f0-9]{36}$/.test(roomId)) {
    ws.close(1008, "Invalid room");
    return;
  }
  let peers = rooms.get(roomId);
  if (!peers) {
    peers = new Set();
    rooms.set(roomId, peers);
  }
  if (peers.size >= 2) {
    ws.close(1008, "Room is full");
    return;
  }
  peers.add(ws);
  ws.roomId = roomId;

  for (const peer of peers) {
    if (peer !== ws && peer.readyState === 1) peer.send(JSON.stringify({ type: "peer-joined" }));
  }

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!["offer", "answer", "ice", "ready"].includes(msg.type)) return;
    for (const peer of peers) {
      if (peer !== ws && peer.readyState === 1) peer.send(JSON.stringify(msg));
    }
  });

  ws.on("close", () => {
    peers.delete(ws);
    for (const peer of peers) {
      if (peer.readyState === 1) peer.send(JSON.stringify({ type: "peer-left" }));
    }
    if (peers.size === 0) rooms.delete(roomId);
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Duo Meet signaling server listening on ${port}`));
