FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/

RUN npm ci --include=dev

COPY . .

RUN npm run build

ENV NODE_ENV=production
EXPOSE 8080

CMD ["npm", "start"]
