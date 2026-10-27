import { homedir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema.ts",
  dbCredentials: {
    url: join(process.env.AGENT_BOARD_DIR ?? join(homedir(), ".agent-board"), "board.db"),
  },
});
