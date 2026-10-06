# Build stage
FROM node:22-slim AS builder

WORKDIR /app

# Copy package manifests and tsconfig
COPY package*.json tsconfig.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code, well-known metadata (imported by the bundle) and build scripts
COPY src/ ./src/
COPY .well-known/ ./.well-known/
COPY copy-assets.js bundle.js ./

# Compile typescript and bundle with esbuild
RUN npm run build

# Production stage
FROM node:22-slim

WORKDIR /app
RUN chown node:node /app

# Copy only the compiled bundle and assets from the builder stage
# (owned by "node": the API docs updater rewrites dist/api-directory.json at runtime)
COPY --from=builder --chown=node:node /app/dist ./dist
# Copy well-known metadata as well
COPY --chown=node:node .well-known ./.well-known

# Set Node production environment
ENV NODE_ENV=production
ENV PORT=8080
# Inside the container listen on all interfaces (the server defaults to 127.0.0.1)
ENV MCP_HOST=0.0.0.0

# Streamable HTTP at /mcp, legacy SSE at /sse
EXPOSE 8080

# Run as the unprivileged "node" user provided by the official image
USER node

# Run the bundled application using the absolute path
CMD ["node", "/app/dist/index.js"]
