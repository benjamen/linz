FROM node:20-slim

# Create app directory
WORKDIR /app

# Install dependencies (use package-lock.json when present)
COPY package*.json ./
# Use `npm install` when a lockfile may be missing in the repo
# `npm ci` requires a package-lock.json; Render's build failed because
# the repository did not include a lockfile. `npm install --omit=dev`
# installs only production deps and works without a lockfile.
RUN npm install --omit=dev

# Copy sources
COPY . .

# Expose port the server listens on
EXPOSE 3000

# Start the server
CMD ["node", "server.js"]
