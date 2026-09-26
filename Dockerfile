FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DB_FILE=/var/data/accountability.db
COPY package.json ./
COPY src ./src
COPY public ./public
EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", "src/server.js"]
