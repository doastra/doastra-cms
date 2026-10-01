# Builds the admin panel and runs the API server (which also serves the admin at /admin).
FROM node:22-slim AS admin
WORKDIR /app/admin
COPY admin/package*.json ./
RUN npm ci
COPY admin/ ./
RUN npm run build

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY --from=admin /app/admin/dist /app/admin/dist
EXPOSE 4000
CMD ["node", "src/index.js"]
