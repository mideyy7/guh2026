# Build context: repo root. Uses core/dist/hive-core.js for score() once Dev B builds it, else the stub.
FROM node:24-alpine
WORKDIR /app
COPY contracts/params.json contracts/params.json
COPY world world
COPY core core
COPY bench/stub-core.cjs bench/stub-core.cjs
COPY services/lib services/lib
COPY services/hq/server.mjs services/hq/server.mjs
ENV NODE_NO_WARNINGS=1
CMD ["node", "services/hq/server.mjs"]
