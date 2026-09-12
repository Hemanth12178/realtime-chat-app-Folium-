# Recipe for the frontend image: Node + the Vite dev server
FROM node:22-slim

WORKDIR /app

# Install dependencies first so this layer is cached (see the backend Dockerfile)
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 5173

# --host 0.0.0.0 = accept connections from outside the container
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
