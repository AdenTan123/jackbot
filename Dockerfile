FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./
COPY scripts/install-ytdlp.js ./scripts/install-ytdlp.js

# Install build dependencies required for native modules, then install production dependencies
RUN apk add --no-cache python3 make g++ opus-dev \
  && npm ci --omit=dev \
  && apk del python3 make g++

# Bundle app source
COPY . .

# Expose the health check port from src/app.js
EXPOSE 3000

# Start the bot
CMD [ "npm", "start" ]


FROM node:18-slim

# Install ONLY what's needed for music
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    apt-get clean

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

CMD ["node", "src/app.js"]