FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data
COPY package.json server.js api.js ./
COPY public ./public
EXPOSE 3000
CMD ["node", "server.js"]
