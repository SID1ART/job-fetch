# Stage 1: Build the React application
FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Setup the production Express server
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --only=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.js ./

# Cloud Run injects the PORT environment variable; default to 8080
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
