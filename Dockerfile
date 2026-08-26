FROM node:24-bookworm-slim AS build

WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY plugin/package.json ./plugin/package.json
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app
RUN groupadd --system tossmcp && useradd --system --gid tossmcp --home-dir /app tossmcp \
  && mkdir -p /data && chown tossmcp:tossmcp /data

COPY --from=build --chown=tossmcp:tossmcp /app/package.json /app/package-lock.json ./
COPY --from=build --chown=tossmcp:tossmcp /app/node_modules ./node_modules
COPY --from=build --chown=tossmcp:tossmcp /app/dist ./dist

USER tossmcp
EXPOSE 8787
ENTRYPOINT ["node", "dist/cli.js"]
CMD ["bridge"]
