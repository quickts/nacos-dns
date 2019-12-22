FROM node:12.14.0

WORKDIR /home/nacos-dns

COPY . .

RUN yarn install

RUN yarn build

RUN mv .env_example .env

EXPOSE 15353

CMD [ "node", "dist/index.js" ]