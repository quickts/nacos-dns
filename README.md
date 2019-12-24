# nacos-dns

## 使用 node 直接执行

    需要提前安装nodejs,yarn

```sh
git clone https://github.com/quickts/nacos-dns.git
cd nacos-dns
vim .env # 配置环境变量
yarn install
yarn build
yarn start:prod
```

## 自己打包镜像

```sh
git clone https://github.com/quickts/nacos-dns.git
cd nacos-dns
sudo docker build --rm -t quickts/nacos-dns .
sudo docker run \
    --name nacos-dns \
    --network common-network \
    -e "NODE_ENV=production" \
    -e "LOG_LEVEL=INFO" \
    -e "NACOS_LIST=nacos-server:8848" \
    -e "NACOS_NAMESPACEID=public" \
    -e "DOM_UPDATE_INTERVAL=5000" \
    -e "CACHE_TTL=5" \
    -p 15353:15353/tcp \
    -p 15353:15353/udp \
    -v $PWD/nacos-dns/logs:/home/nacos-dns/logs \
    -d quickts/nacos-dns
```

## 直接使用镜像

```sh
sudo docker run \
    --name nacos-dns \
    --network common-network \
    -e "NODE_ENV=production" \
    -e "LOG_LEVEL=INFO" \
    -e "NACOS_LIST=nacos-server:8848" \
    -e "NACOS_NAMESPACEID=public" \
    -e "DOM_UPDATE_INTERVAL=5000" \
    -e "CACHE_TTL=5" \
    -p 15353:15353/tcp \
    -p 15353:15353/udp \
    -v $PWD/nacos-dns/logs:/home/nacos-dns/logs \
    -d quickts/nacos-dns
```
