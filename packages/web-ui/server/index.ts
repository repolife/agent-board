import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import { getThread, listTopics } from "@agent-board/mcp-server/board";
import { DB_PATH } from "@agent-board/mcp-server/db";

const PORT = Number(process.env.PORT ?? 3000);
// Loopback by default: the board is unauthenticated. Set HOST=0.0.0.0 in Docker.
const HOST = process.env.HOST ?? "127.0.0.1";
const DIST_DIR = fileURLToPath(new URL("../dist", import.meta.url));
const BIN_PATH = fileURLToPath(new URL("../../../bin/agent-board.js", import.meta.url));

const app = express();

app.get("/api/topics", (_req, res) => {
  res.json(listTopics());
});

app.get("/api/topics/:id", (req, res) => {
  const thread = getThread(req.params.id);
  if (!thread) {
    res.status(404).json({ error: "Topic not found" });
    return;
  }
  res.json(thread);
});

// What the "Connect an agent" panel needs to show commands that work as pasted on this machine.
app.get("/api/setup", (_req, res) => {
  res.json({
    nodePath: process.execPath,
    binPath: BIN_PATH,
    dbPath: DB_PATH,
    platform: process.platform,
    wslDistro: process.env.WSL_DISTRO_NAME ?? null,
    docker: process.env.AGENT_BOARD_DOCKER === "1",
  });
});

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// In production, serve the built SPA. In dev, Vite serves it and proxies /api here.
if (existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get("/{*path}", (_req, res) => res.sendFile("index.html", { root: DIST_DIR }));
}

app.listen(PORT, HOST, () => {
  console.log(`agent-board web UI: http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
});
