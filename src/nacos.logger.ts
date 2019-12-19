import { getLogger } from 'log4js';

export class NacosLogger {
    private readonly logger = getLogger('Nacos');

    log(message?: any, ...optional_params: any[]) {
        this.logger.info(message, ...optional_params);
    }
    info(message?: any, ...optional_params: any[]) {
        this.logger.info(message, ...optional_params);
    }
    warn(message?: any, ...optional_params: any[]) {
        this.logger.warn(message, ...optional_params);
    }
    debug(message?: any, ...optional_params: any[]) {
        this.logger.debug(message, ...optional_params);
    }
    error(message?: any, ...optional_params: any[]) {
        this.logger.error(message, ...optional_params);
    }
}
