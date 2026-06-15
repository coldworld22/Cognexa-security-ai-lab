FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json ./
COPY backend ./backend
RUN npm install
RUN npm run build --workspace @security-ai-lab/backend

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/backend ./backend
RUN mkdir -p /app/uploads /app/storage
EXPOSE 5000
CMD ["node", "backend/dist/main.js"]
