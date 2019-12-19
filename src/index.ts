import 'dotenv/config';
import dnsd from 'modern-dnsd';
import { configure } from 'log4js';
import { buildConfig } from './log4js.config';
import { NacosDnsResolver } from './nacos.dns.resolver';
configure(buildConfig(process.env.LOG_LEVEL || 'INFO'));

const resolver = new NacosDnsResolver();
const server = dnsd.createServer(resolver.handler());
server.listen(Number(process.env.DNS_PORT));
