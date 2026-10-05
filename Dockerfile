# ==========================================
# Stage 1: Build & Dependencies
# ==========================================
FROM node:20-bookworm-slim AS builder

WORKDIR /usr/src/app

# Install build dependencies for native modules (e.g. bcrypt)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package manifests
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev || npm install --omit=dev

# ==========================================
# Stage 2: Production Runtime
# ==========================================
FROM node:20-bookworm-slim AS runner

WORKDIR /usr/src/app

# Install curl for container health checks
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=8002

# Copy node_modules from builder
COPY --chown=node:node --from=builder /usr/src/app/node_modules ./node_modules

# Copy application source code
COPY --chown=node:node . .

# Run as non-root user for security
USER node

# Coolify auto-detects this exposed port
EXPOSE 8002

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8002/health || exit 1

# Start the server
CMD ["node", "app.js"]
