# Build stage
FROM node:18-slim AS builder

WORKDIR /app

# Copy package manifests and tsconfig
COPY package*.json tsconfig.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code and build scripts
COPY src/ ./src/
COPY copy-assets.js bundle.js ./

# Compile typescript and bundle with esbuild
RUN npm run build

# Production stage
FROM node:18-slim

WORKDIR /app

# Copy only the compiled bundle and assets from the builder stage
COPY --from=builder /app/dist ./dist
# Copy well-known metadata as well
COPY .well-known ./.well-known

# Set Node production environment
ENV NODE_ENV=production

# Run the bundled application using the absolute path
CMD ["node", "/app/dist/index.js"]
