import { EggPlugin } from 'midway';
export default {
  static: true, // default is true
  alinode: {
    enable: process.env.NODE_ENV !== 'local',
    package: 'egg-alinode',
  },
  cors: {
    enable: true,
    package: 'egg-cors',
  },
} as EggPlugin;
