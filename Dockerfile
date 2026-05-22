# Pangolinfo MCP Server - HTTP mode Docker image
#
# Build:   docker build -t pangolinfo-mcp:0.2.0 .
# Run:     docker run --rm -p 3000:3000 \
#            -e PANGOLINFO_TRANSPORT=http \
#            pangolinfo-mcp:0.2.0
# Verify:  curl http://localhost:3000/health
#
# Two-stage build keeps the runtime image lean (~150 MB on node:20-alpine).
# Stage 1 compiles src/ -> dist/server.mjs (single bundled file).
# Stage 2 copies just that one file into a fresh image.

# ----- Stage 1: build -----
FROM node:20-alpine AS build
WORKDIR /build

# Copy manifest first so `npm ci` layer caches when src/ changes.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ----- Stage 2: runtime -----
FROM node:20-alpine AS runtime
WORKDIR /app

# Pull only the compiled bundle. No node_modules, no src — bundle is self-contained.
COPY --from=build /build/dist/server.mjs /app/server.mjs

# Drop privileges. node:20-alpine ships a non-root `node` user (uid 1000).
USER node

# HTTP mode by default. Override at runtime with -e PANGOLINFO_TRANSPORT=stdio
# if you really want to run stdio inside a container (unusual).
ENV PANGOLINFO_TRANSPORT=http \
    PORT=3000 \
    NODE_ENV=production

EXPOSE 3000

# wget is in busybox -> alpine, so we get a free zero-extra-dep healthcheck.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

# Use exec form so SIGTERM reaches node directly (graceful shutdown handler
# in src/server.ts catches it).
ENTRYPOINT ["node", "/app/server.mjs"]
