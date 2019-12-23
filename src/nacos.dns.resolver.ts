import { resolve } from 'dns';
import { format, promisify } from 'util';
import { sleep } from '@quickts/sleep';
import { NacosLogger } from './nacos.logger';

const NacosNamingClient = require('nacos').NacosNamingClient;

const resolveSync = promisify(resolve);

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

export class NacosDnsResolver {
    private naming_client = new NacosNamingClient({
        serverList: process.env.NACOS_LIST,
        namespace: process.env.NACOS_NAMESPACEID,
        logger: new NacosLogger()
    });
    private all_dom_names = new Array<string>();
    private all_dom_instances = new Map<string, any[]>();

    constructor() {
        this.updateLoop();
    }

    async updateAllDomNames() {
        const { data } = await this.naming_client._serverProxy.getServiceList(1, 99999);
        this.all_dom_names = data;

        const need_remove_dom_names = new Array<string>();
        for (const dom_name of this.all_dom_instances.keys()) {
            if (!this.all_dom_names.includes(dom_name)) {
                need_remove_dom_names.push(dom_name);
            }
        }
        for (const dom_name of need_remove_dom_names) {
            this.all_dom_instances.delete(dom_name);
        }
        this.naming_client.logger.debug(data);
    }

    async updateAllDomain() {
        for (const dom_name of this.all_dom_names) {
            const dom_instances = await this.naming_client.selectInstances(
                dom_name,
                process.env.NACOS_GROUP,
                process.env.NACOS_CLUSTERS,
                true,
                false
            );
            this.all_dom_instances.set(dom_name, dom_instances);
        }
    }

    async updateLoop() {
        await this.naming_client.ready();
        while (true) {
            try {
                await this.updateAllDomNames();
                await this.updateAllDomain();
            } catch (err) {
                this.naming_client.logger.error(err);
            }
            await sleep(Number(process.env.DOM_UPDATE_INTERVAL));
        }
    }

    handler() {
        return async (req: any, res: any) => {
            if (!this.naming_client) {
                return res.end();
            }
            this.naming_client.logger.debug(format('%s:%s/%s %j', req.connection.remoteAddress, req.connection.remotePort, req.connection.type, req));

            const ttl = Number(process.env.CACHE_TTL);
            const q = res.question[0];
            try {
                if (q.type == 'SRV') {
                    const dom_instances = this.all_dom_instances.get(q.name);
                    if (dom_instances) {
                        for (const instance of dom_instances) {
                            const host_name = instance.ip + '.node.nacos';

                            res.answer.push({
                                name: '_udp' + req.connection.type + '.' + q.name,
                                type: q.type,
                                class: q.class,
                                ttl: ttl,
                                data: {
                                    priority: 0,
                                    weight: instance.weight,
                                    port: instance.port,
                                    target: host_name
                                }
                            });
                            res.additional.push({ name: host_name, type: 'A', class: q.class, ttl: ttl, data: instance.ip });
                        }
                    } else {
                        this.naming_client.logger.warn(`Not found service: ${q.name}`);
                    }
                } else if (q.type == 'A') {
                    const result = /(.*)\.node\.nacos/.exec(q.name);
                    if (result) {
                        res.answer.push({ name: q.name, type: q.type, class: q.class, ttl: ttl, data: result[1] });
                    } else {
                        const records = await resolveSync(q.name, q.type);
                        for (const record of records) {
                            res.answer.push({ name: q.name, type: q.type, class: q.class, ttl: ttl, data: record });
                        }
                    }
                } else {
                    this.naming_client.logger.log(`Unsupported type: ${q.type}`);
                }
            } catch (err) {
                this.naming_client.logger.error(err);
            } finally {
                res.end();
            }
        };
    }
}
