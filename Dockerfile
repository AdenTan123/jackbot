FROM node:20-alpine

WORKDIR /app

# Install system dependencies (ffmpeg + opus for voice/music)
RUN apk add --no-cache ffmpeg python3 make g++ opus-dev

# Copy package files
COPY package*.json ./

# Remove postinstall script temporarily, install deps, then restore
RUN npm pkg delete scripts.postinstall && npm ci --omit=dev

# Copy the rest of the source
COPY . .

EXPOSE 3000

CMD ["node", "src/app.js"]