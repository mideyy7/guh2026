# Build context: repo root (see docker-compose.yml). .dockerignore keeps .env and n8n data out.
FROM node:24-alpine
WORKDIR /app
COPY contracts/params.json contracts/params.json
COPY world world
COPY services/lib services/lib
COPY services/sim/server.mjs services/sim/server.mjs
ENV NODE_NO_WARNINGS=1
CMD ["node", "services/sim/server.mjs"]
