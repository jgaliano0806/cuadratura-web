FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN npm install --workspace=@plataforma/shared --workspace=@plataforma/api
RUN npm run build -w @plataforma/shared && npm run build -w @plataforma/api

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
