FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=optional
COPY tsconfig.json ./
COPY shared ./shared
COPY server ./server
RUN mkdir -p /app/data
ENV NODE_ENV=production
ENV PORT=8787
ENV RTS_DB_PATH=/app/data/rts.db
EXPOSE 8787
VOLUME ["/app/data"]
CMD ["npx", "tsx", "server/index.ts"]
