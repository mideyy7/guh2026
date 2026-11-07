FROM node:24-alpine
WORKDIR /app
COPY server.mjs .
# node:sqlite is built into Node 24; this only hides its "experimental" banner.
ENV NODE_NO_WARNINGS=1
RUN mkdir -p /data
CMD ["node", "server.mjs"]
