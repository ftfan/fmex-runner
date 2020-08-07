import { provide, inject, Context } from 'midway';
import * as OSS from 'ali-oss';
import { UserConfig } from '../config';
import Axios from 'axios';

const handler = new OSS(UserConfig.AliOss);
handler.useBucket(UserConfig.AliOss.bucket);
const AliUrl = 'https://' + UserConfig.AliOss.bucket + '.' + UserConfig.AliOss.region + '.aliyuncs.com';

@provide('ossService')
export class OssService {
  @inject()
  ctx: Context;

  Handler = new OSS(UserConfig.AliOss);

  async put(OssUrl: string, data: any, options: OSS.PutObjectOptions) {
    try {
      const res = await this.Handler.put(OssUrl, Buffer.from(JSON.stringify(data)), options);
      return res;
    } catch (e) {
      this.ctx.logger.error('oss put error', e);
      return false;
    }
  }

  async get(fileUrl: string) {
    // 必须今日的文件已经创建了（昨日的文件不会再被修改了）
    const res = await Axios.get(AliUrl + fileUrl).catch((e) => Promise.resolve(e && e.response));
    if (!res || res.status !== 200) return null;
    return res.data;
  }
}
