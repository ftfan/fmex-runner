const UserConfig = {
  alinode: {
    appid: '',
    secret: '',
  },

  KeySecret: {
    Key: '',
    Secret: '',
  },

  AliOss: {
    region: '',
    accessKeyId: '',
    accessKeySecret: '',
    bucket: '',
  },
};
try {
  const RealConfig = require('./user.config');
  Object.assign(UserConfig, RealConfig);
} catch (e) {
  if (process.env.NODE_ENV !== 'local') {
    try {
      const RealConfig = require('../src/user.config');
      Object.assign(UserConfig, RealConfig);
    } catch (e) {
      // 用户没有配置
    }
  }
  // 用户没有配置
}

export { UserConfig };
