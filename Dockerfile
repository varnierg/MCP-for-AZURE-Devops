# Build stage
FROM node:18-alpine AS builder

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
FROM node:18-alpine

WORKDIR /app

# Copy only the compiled bundle and assets from the builder stage
COPY --from=builder /app/dist ./dist
COPY package*.json ./

# Install only production dependencies (axios, dotenv, mcp sdk, etc.)
RUN npm ci --omit=dev

# Set Node production environment
ENV NODE_ENV=production

# Run the bundled application
ENTRYPOINT ["node", "dist/index.js"]
