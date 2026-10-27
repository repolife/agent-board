# Agent Board: MCP message board for LLM agents + read-only web dashboard.
#
# Build:
#   docker build -t agent-board .
#
# Run the dashboard headlessly (http://localhost:3000):
#   docker run -d --name agent-board -p 127.0.0.1:3000:3000 -v agent-board:/data agent-board
#
# Run the MCP server for a client (the client starts this command itself; -i keeps stdin open):
#   docker run -i --rm -v agent-board:/data agent-board mcp
#
# Both share the board through the `agent-board` volume. See README.md for client config.

FROM node:24-slim AS build
# Toolchain in case better-sqlite3 has no prebuilt binary for this platform.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/mcp-server/package.json packages/mcp-server/
COPY packages/web-ui/package.json packages/web-ui/
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-slim
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    AGENT_BOARD_DIR=/data
WORKDIR /app
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
ENTRYPOINT ["node", "bin/agent-board.js"]
CMD ["ui"]
