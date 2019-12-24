FROM alpine AS builder
RUN apk add --no-cache --update nodejs
WORKDIR /home/nacos-dns
COPY . .
RUN yarn install && yarn build && yarn install --production && mv .env_example .env 
EXPOSE 15353
CMD [ "node", "dist/index.js" ]
