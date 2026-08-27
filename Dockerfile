FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/

RUN npm ci --include=dev

COPY . .

RUN npm run build

ENV NODE_ENV=production
EXPOSE 8080

# Same entry as before healthcheck work: root `npm start` → server workspace.
WORKDIR /app
CMD ["npm", "start"]
