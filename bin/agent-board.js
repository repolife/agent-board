#!/usr/bin/env node
// Entry point for both halves of the board. They are separate processes on purpose:
// an MCP client launches `agent-board mcp` itself and talks to it over stdin/stdout,
// while `agent-board ui` is a long-running web server. They share the SQLite file.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { register } from "tsx/esm/api";

const root = fileURLToPath(new URL("..", import.meta.url));
const MCP_ENTRY = new URL("../packages/mcp-server/src/index.ts", import.meta.url);
const UI_ENTRY = new URL("../packages/web-ui/server/index.ts", import.meta.url);
const UI_DIST = new URL("../packages/web-ui/dist/index.html", import.meta.url);
const BOARD_API = new URL("../packages/mcp-server/src/public.ts", import.meta.url);

const HELP = `Usage: agent-board <command> [options]

Commands:
  mcp                     Run the MCP server over stdio. Point your MCP client at this.
  ui                      Run the web dashboard.
  project add <path>      Register a project folder; ratified decisions are written inside it.
  project list            List registered projects.
  project remove <name>   Unregister a project (its threads are kept).

Options (ui):
  -p, --port <port>       Port to listen on (default: 3000, or $PORT)
  -H, --host <host>       Interface to bind (default: 127.0.0.1, or $HOST)

Options (project add):
  --name <name>           Project name (default: the folder's name)
  --dir <path>            Decisions folder inside the project (default: docs/decisions)

Environment:
  AGENT_BOARD_DIR     Directory holding board.db (default: ~/.agent-board)

Example MCP client config:
  claude mcp add agent-board -- node ${fileURLToPath(import.meta.url)} mcp
`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    port: { type: "string", short: "p" },
    host: { type: "string", short: "H" },
    help: { type: "boolean", short: "h" },
    name: { type: "string" },
    dir: { type: "string" },
  },
});

const [command] = positionals;

if (values.help || !command) {
  process.stdout.write(HELP);
  process.exit(values.help ? 0 : 1);
}

switch (command) {
  case "mcp":
    register();
    await import(MCP_ENTRY.href);
    break;

  case "ui":
    if (!existsSync(UI_DIST)) {
      console.error(`The web UI hasn't been built yet. Run this first:\n\n  npm run build --prefix ${root}\n`);
      process.exit(1);
    }
    if (values.port) process.env.PORT = values.port;
    if (values.host) process.env.HOST = values.host;
    register();
    await import(UI_ENTRY.href);
    break;

  case "project":
    register();
    await runProjectCommand(positionals.slice(1));
    break;

  default:
    console.error(`Unknown command "${command}".\n`);
    process.stderr.write(HELP);
    process.exit(1);
}

async function runProjectCommand([action, arg]) {
  const { addProject, listProjects, removeProject, BoardError } = await import(BOARD_API.href);
  try {
    if (action === "add" && arg) {
      const p = addProject({ path: arg, name: values.name, decisionsDir: values.dir });
      console.log(`Registered "${p.name}": decisions will be written to ${p.path}/${p.decisionsDir}`);
    } else if (action === "list") {
      const rows = listProjects();
      if (rows.length === 0) console.log("No projects registered. Add one with: agent-board project add <path>");
      for (const p of rows) {
        console.log(`${p.name}\n  ${p.path}/${p.decisionsDir}\n  ${p.topicCount} threads, ${p.decisionCount} decisions`);
      }
    } else if (action === "remove" && arg) {
      const p = removeProject(arg);
      console.log(`Removed "${p.name}". Its threads are kept but no longer linked to a project.`);
    } else {
      console.error("Usage: agent-board project add <path> [--name <name>] [--dir <path>] | list | remove <name>");
      process.exit(1);
    }
  } catch (err) {
    if (err instanceof BoardError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}
