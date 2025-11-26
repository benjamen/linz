FROM node:20-slim

# Create app directory
WORKDIR /app

# Install dependencies (use package-lock.json when present)
COPY package*.json ./
RUN npm ci --only=production

# Copy sources
COPY . .

# Expose port the server listens on
EXPOSE 3000

# Start the server
CMD ["node", "server.js"]
