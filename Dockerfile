FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./

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
