import { EggPlugin } from 'midway';
export default {
  static: true, // default is true
  alinode: {
    enable: process.env.NODE_ENV !== 'local',
    package: 'egg-alinode',
  },
} as EggPlugin;
