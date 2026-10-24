# Build context is the repository root:  docker build -f deploy/web/Dockerfile -t coblink-web .
# Angular 16 officially supports Node 16/18; the build works on newer even-numbered releases but prints a warning.

FROM node:22-alpine AS build
WORKDIR /client
COPY client/package.json client/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY client/ ./
RUN npm run build:prod

FROM nginx:stable-alpine AS runtime
COPY deploy/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /client/dist/client/ /usr/share/nginx/html/
EXPOSE 80
