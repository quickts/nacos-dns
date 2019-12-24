FROM node:alpine as build
WORKDIR /home/nacos-dns
COPY . .
RUN yarn install && yarn build && yarn install --production && mv .env_example .env

FROM alpine
RUN apk add --no-cache --update nodejs
WORKDIR /home/nacos-dns
COPY --from=build /home/nacos-dns/node_modules /home/nacos-dns/node_modules
COPY --from=build /home/nacos-dns/dist /home/nacos-dns/dist
COPY --from=build /home/nacos-dns/.env /home/nacos-dns/
EXPOSE 15353
CMD [ "node", "dist/index.js" ]
