export const UserConfig = {
  alinode: {
    appid: '',
    secret: '',
  },

  KeySecret: {
    Key: '',
    Secret: '',
  },
};
try {
  const RealConfig = require('./user.config');
  Object.assign(UserConfig, RealConfig);
} catch (e) {
  // 用户没有配置
}
