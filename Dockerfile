# syntax=docker/dockerfile:1

ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable
WORKDIR /app

FROM base AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --prod --frozen-lockfile

FROM base AS build

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile
COPY tsconfig.json vite.config.ts server.node.ts ./
COPY vite ./vite
COPY app ./app
COPY public ./public
RUN pnpm build

FROM base AS runtime

ENV NODE_ENV="production"
ENV PORT="44100"

# The built server imports its dependencies at runtime; Vite bundled the rest.
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --from=build --chown=node:node /app/dist ./dist

USER node
EXPOSE 44100
STOPSIGNAL SIGTERM

CMD ["node", "dist/index.mjs"]
