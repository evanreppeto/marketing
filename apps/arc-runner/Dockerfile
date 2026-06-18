# syntax=docker/dockerfile:1
# Standalone container for the Arc runner. Build context is apps/arc-runner only
# (the runner has no workspace-internal imports), so this is a plain npm build —
# no pnpm/workspace needed in the image.
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
# The Claude Agent SDK spawns the Claude Code CLI at runtime — it must be on PATH.
RUN npm install -g @anthropic-ai/claude-code
COPY --from=build /app/dist ./dist
# Run as the non-root `node` user (uid 1000, built into the base image). REQUIRED:
# the SDK runs claude-code with --dangerously-skip-permissions (permissionMode
# "bypassPermissions"), which claude-code REFUSES under root. HOME=/tmp gives the
# CLI a writable config dir on Cloud Run's filesystem regardless of execution env.
ENV HOME=/tmp
RUN chown -R node:node /app
USER node
# Cloud Run injects PORT (8080); config.ts reads process.env.PORT.
CMD ["node", "dist/index.js"]
