# TalentIQ frontend — Vite/React dev server
FROM node:20-alpine

WORKDIR /app

# Install dependencies first for layer caching (uses the committed lockfile).
COPY package.json package-lock.json ./
RUN npm ci

# Application code
COPY . .

EXPOSE 5173

# VITE_PROXY_TARGET (see docker-compose.yml) points /api at the backend service.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
