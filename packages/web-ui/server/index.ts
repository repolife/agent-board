import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import express, { type NextFunction, type Request, type Response } from "express";
import {
  BoardError,
  getThread,
  listDecisions,
  listProjects,
  listTopicSummaries,
  NotReadyError,
  ratifyProposal,
  rejectProposal,
} from "@agent-board/mcp-server";
import { DB_PATH } from "@agent-board/mcp-server/db";

const PORT = Number(process.env.PORT ?? 3000);
// Loopback by default: the board is unauthenticated. Set HOST=0.0.0.0 in Docker.
const HOST = process.env.HOST ?? "127.0.0.1";
const DIST_DIR = fileURLToPath(new URL("../dist", import.meta.url));
const BIN_PATH = fileURLToPath(new URL("../../../bin/agent-board.js", import.meta.url));

// Hostnames the dashboard answers to. Requests naming any other host are refused, which defeats
// DNS rebinding (a website pointing its own domain at 127.0.0.1 to read or ratify through the browser).
const ALLOWED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
  ...(HOST !== "0.0.0.0" ? [HOST] : []),
  ...(process.env.AGENT_BOARD_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean),
]);

const hostnameOf = (host: string) => host.replace(/:\d+$/, "").toLowerCase();

function guardHost(req: Request, res: Response, next: NextFunction) {
  if (!ALLOWED_HOSTS.has(hostnameOf(req.headers.host ?? ""))) {
    res
      .status(403)
      .json({ error: `Host "${req.headers.host}" isn't allowed. Set AGENT_BOARD_ALLOWED_HOSTS to add it.` });
    return;
  }
  next();
}

/**
 * Writes (ratify, reject) need a custom header, which browsers won't send cross-site without a CORS
 * preflight this server never approves, and an Origin, when present, matching this dashboard.
 */
function guardWrite(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  if (req.get("x-agent-board") !== "1" || !req.is("application/json")) {
    res.status(403).json({ error: "Writes must come from the dashboard." });
    return;
  }
  if (origin && origin !== "null" && new URL(origin).host !== req.headers.host) {
    res.status(403).json({ error: `Cross-origin write from ${origin} refused.` });
    return;
  }
  next();
}

/** Maps board errors to responses the dashboard can show; anything else is a real failure. */
function respond(res: Response, action: () => unknown) {
  try {
    res.json(action());
  } catch (err) {
    if (err instanceof NotReadyError) res.status(409).json({ error: err.message, code: "not_ready" });
    else if (err instanceof BoardError) res.status(400).json({ error: err.message });
    else throw err;
  }
}

const app = express();
app.use(guardHost);
app.use("/api", express.json({ limit: "64kb" }));

app.get("/api/topics", (_req, res) => {
  res.json(listTopicSummaries());
});

app.get("/api/topics/:id", (req, res) => {
  // Full text of earlier proposal versions, for the dashboard's diffs.
  const thread = getThread(req.params.id, { includeHistoryContent: true });
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

app.get("/api/projects", (_req, res) => {
  res.json(listProjects());
});

app.get("/api/decisions", (_req, res) => {
  res.json(listDecisions());
});

app.post("/api/proposals/:id/ratify", guardWrite, (req, res) => {
  const { projectId, note, override } = req.body ?? {};
  respond(res, () =>
    ratifyProposal({
      proposalId: String(req.params.id),
      projectId: typeof projectId === "string" ? projectId : undefined,
      note: typeof note === "string" ? note : undefined,
      override: override === true,
      boardUrl: `${req.protocol}://${req.headers.host}`,
    }),
  );
});

app.post("/api/proposals/:id/reject", guardWrite, (req, res) => {
  const { note } = req.body ?? {};
  respond(res, () => rejectProposal({ proposalId: String(req.params.id), note: typeof note === "string" ? note : "" }));
});

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// API errors as JSON, never Express's HTML page (which includes a stack trace outside production).
app.use("/api", (err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status && err.status < 500 ? err.status : 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? "Internal error" : err.message });
});

// In production, serve the built SPA. In dev, Vite serves it and proxies /api here.
if (existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get("/{*path}", (_req, res) => res.sendFile("index.html", { root: DIST_DIR }));
}

app.listen(PORT, HOST, () => {
  console.log(`agent-board web UI: http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
});
