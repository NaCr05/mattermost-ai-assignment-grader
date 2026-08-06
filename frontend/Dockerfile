FROM node:24-alpine AS dependencies

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS development

ENV NODE_ENV=development

COPY --chown=node:node . .
RUN mkdir -p /app/node_modules/.tmp /app/node_modules/.vite \
    && chown node:node /app /app/node_modules/.tmp /app/node_modules/.vite

USER node

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

FROM dependencies AS build

ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}

COPY . .
RUN npm run build

FROM nginx:stable-alpine AS production

COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build --chown=nginx:nginx /app/dist /usr/share/nginx/html

RUN mkdir -p /tmp/nginx-client /tmp/nginx-proxy /tmp/nginx-fastcgi /tmp/nginx-uwsgi /tmp/nginx-scgi \
    && chown -R nginx:nginx /tmp/nginx-client /tmp/nginx-proxy /tmp/nginx-fastcgi /tmp/nginx-uwsgi /tmp/nginx-scgi

USER nginx

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
