FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN npm install --workspace=@plataforma/shared --workspace=@plataforma/web
RUN npm run build -w @plataforma/shared && npm run build -w @plataforma/web

FROM nginx:alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
