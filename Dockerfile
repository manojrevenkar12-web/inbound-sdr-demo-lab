FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY config ./config
RUN mkdir -p var && chown node:node var
USER node
EXPOSE 8787
CMD ["node", "src/server/main.ts"]
