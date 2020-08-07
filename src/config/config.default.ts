import { EggAppConfig, EggAppInfo, PowerPartial } from 'midway';
import { UserConfig } from '../config';

export type DefaultConfig = PowerPartial<EggAppConfig>;

export default (appInfo: EggAppInfo) => {
  const config = {} as DefaultConfig;

  // use for cookie sign key, should change to your own and keep security
  config.keys = appInfo.name + '_{{keys}}';

  // add your config here
  config.middleware = [];

  config.logger = {
    level: 'ALL',
  };

  config.cluster = {
    listen: {
      port: 7002,
      // hostname: '0.0.0.0', // 不建议设置 hostname 为 '0.0.0.0'，它将允许来自外部网络和来源的连接，请在知晓风险的情况下使用
      // path: '/var/run/egg.sock',
    },
  };

  config.alinode = {
    appid: UserConfig.alinode.appid,
    secret: UserConfig.alinode.secret,
    error_log: [
      // '~/logs/fmex-runner/common-error.json.log.2020-08-06',
      '~/logs/fmex-runner/common-error.log',
      // '~/logs/fmex-runner/common-error.log.2020-08-06',
      // '~/logs/fmex-runner/egg-schedule.json.log.2020-08-06',
      '~/logs/fmex-runner/egg-schedule.log',
      // '~/logs/fmex-runner/egg-schedule.log.2020-08-06',
      '~/logs/fmex-runner/midway-agent.log',
      // '~/logs/fmex-runner/midway-agent.log.2020-08-06',
      // '~/logs/fmex-runner/midway-core.json.log.2020-08-06',
      '~/logs/fmex-runner/midway-core.log',
      // '~/logs/fmex-runner/midway-core.log.2020-08-06',
      // '~/logs/fmex-runner/midway-web.json.log.2020-08-06',
      '~/logs/fmex-runner/midway-web.log',
      // '~/logs/fmex-runner/midway-web.log.2020-08-06',
    ],
    packages: ['~/fmex-runner/package.json'],
  };

  return config;
};
