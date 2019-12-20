import { resolve } from 'dns';
import { format, promisify } from 'util';
import { isIPv4, isIPv6 } from 'net';
import { Address4, Address6 } from 'ip-address';
import { NacosLogger } from './nacos.logger';

const NacosNamingClient = require('nacos').NacosNamingClient;

const resolveSync = promisify(resolve);

export class NacosDnsResolver {
    private naming_client = new NacosNamingClient({
        serverList: process.env.NACOS_LIST,
        namespace: process.env.NACOS_NAMESPACEID,
        logger: new NacosLogger()
    });
    private all_dom_names: string[] = [];

    constructor() {
        this.init();
    }

    async updateAllDomNames() {
        try {
            const { data } = await this.naming_client._serverProxy.getServiceList(1, 99999);
            this.all_dom_names = data;
            this.naming_client.logger.debug(data);
        } catch (err) {
            this.naming_client.logger.error(err);
        }
    }

    async init() {
        try {
            await this.naming_client.ready();
            await this.updateAllDomNames();
        } catch (err) {
            this.naming_client.logger.error(err);
        }
        setInterval(this.updateAllDomNames.bind(this), Number(process.env.DOM_UPDATE_INTERVAL));
        this.naming_client.logger.info('Initialize DnsResolver successfully!');
    }

    handler() {
        return async (req: any, res: any) => {
            // req.id 2个字节(16bit)，标识字段，客户端会解析服务器返回的DNS应答报文，获取ID值与请求报文设置的ID值做比较，如果相同，则认为是同一个DNS会话

            // req.type 0表示查询报文，1表示响应报文;
            // 0 => request
            // 1 => response

            // req.opcode 通常值为0（标准查询），其他值为1（反向查询）和2（服务器状态请求）,[3,15]保留值;
            // 0 => query
            // 1 => iquery
            // 2 => status

            // req.authoritative  AA (authoritative answer)  这个比特位在应答的时候才有意义，指出给出应答的服务器是查询域名的授权解析服务器
            // req.truncated  TC (truncated)  用来指出报文比允许的长度还要长，导致被截断
            // req.recursion_desired  RD (Recursion Desired)  这个比特位被请求设置，应答的时候使用的相同的值返回。如果设置了RD，就建议域名服务器进行递归解析，递归查询的支持是可选的
            // req.recursion_available RA (Recursion Available) 这个比特位在应答中设置或取消，用来代表服务器是否支持递归查询
            // req.authenticated AD
            // req.checking_disabled CD

            // req.responseCode 应答码(Response code)
            // 0 : 没有错误。
            // 1 : 报文格式错误(Format error) - 服务器不能理解请求的报文;
            // 2 : 服务器失败(Server failure) - 因为服务器的原因导致没办法处理这个请求;
            // 3 : 名字错误(Name Error) - 只有对授权域名解析服务器有意义，指出解析的域名不存在;
            // 4 : 没有实现(Not Implemented) - 域名服务器不支持查询类型;
            // 5 : 拒绝(Refused) - 服务器由于设置的策略拒绝给出应答.比如，服务器不希望对某些请求者给出应答，或者服务器不希望进行某些操作（比如区域传送zone transfer）;
            // [6,15] : 保留值，暂未使用。

            if (!this.naming_client) {
                return res.end();
            }
            this.naming_client.logger.log(format('%s:%s/%s %j', req.connection.remoteAddress, req.connection.remotePort, req.connection.type, req));

            const ttl = Number(process.env.CACHE_TTL);
            const q = res.question[0];
            if (!this.all_dom_names.includes(q.name)) {
                try {
                    switch (q.type) {
                        case 'A': {
                            const records = await resolveSync(q.name, 'A');
                            for (const record of records) {
                                res.answer.push({ name: q.name, type: q.type, class: q.class, ttl: ttl, data: record });
                            }
                            break;
                        }
                        case 'AAAA': {
                            const records = await resolveSync(q.name, 'AAAA');
                            for (const record of records) {
                                const address = new Address6(record);
                                const canonicalIp = address.canonicalForm();
                                res.answer.push({ name: q.name, type: q.type, class: q.class, ttl: ttl, data: canonicalIp });
                            }
                            break;
                        }
                    }
                } catch {}
            } else {
                try {
                    const instances: any[] = await this.naming_client.selectInstances(
                        q.name,
                        process.env.NACOS_GROUP,
                        process.env.NACOS_CLUSTERS,
                        true,
                        true
                    );
                    for (const instance of instances) {
                        if (q.type == 'A') {
                            if (isIPv4(instance.ip)) {
                                res.answer.push({ name: q.name, type: q.type, class: q.class, ttl: ttl, data: instance.ip });
                            } else {
                                const address = new Address6(instance.ip);
                                res.answer.push({ name: q.name, type: q.type, class: q.class, ttl: ttl, data: address.to4() });
                            }
                        }
                        if (q.type == 'AAAA') {
                            if (isIPv6(instance.ip)) {
                                const address = new Address6(instance.ip);
                                const canonicalIp = address.canonicalForm();
                                res.answer.push({ name: q.name, type: q.type, class: q.class, ttl: ttl, data: canonicalIp });
                            } else {
                                const address = Address6.fromAddress4(instance.ip);
                                const canonicalIp = address.canonicalForm();
                                res.answer.push({ name: q.name, type: q.type, class: q.class, ttl: ttl, data: canonicalIp });
                            }
                        }
                        if (q.type == 'SRV') {
                            res.answer.push({
                                name: q.name,
                                type: 'SRV',
                                class: q.class,
                                ttl: ttl,
                                data: {
                                    priority: 0,
                                    weight: instance.weight,
                                    port: instance.port,
                                    target: instance.ip
                                }
                            });
                        } else {
                            res.additional.push({
                                name: q.name,
                                type: 'SRV',
                                class: q.class,
                                ttl: ttl,
                                data: {
                                    priority: 0,
                                    weight: instance.weight,
                                    port: instance.port,
                                    target: instance.ip
                                }
                            });
                        }
                    }
                } catch (err) {
                    this.naming_client.logger.error(err);
                }
            }
            res.end();
        };
    }
}
