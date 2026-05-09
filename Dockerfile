FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=optional
COPY tsconfig.json ./
COPY shared ./shared
COPY server ./server
ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787
CMD ["npx", "tsx", "server/index.ts"]
