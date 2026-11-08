# ---------- build หน้าเว็บ ----------
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---------- API ----------
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY backend/src ./src
COPY backend/scripts ./scripts
COPY backend/db ./db
COPY backend/data ./data
COPY --from=web /web/dist ./public
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads
USER node
ENV STATIC_DIR=/app/public UPLOAD_DIR=/app/uploads PORT=3000 TRUST_PROXY=1
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "src/server.js"]
