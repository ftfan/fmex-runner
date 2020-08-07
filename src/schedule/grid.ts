import { provide, schedule, CommonSchedule, inject, Context } from 'midway';
import { GridService } from '../service/grid';

@provide()
@schedule({
  interval: '4s', // 20s 间隔
  type: 'worker', // 指定某一个 worker 执行
  immediate: true,
})
export class GridCron implements CommonSchedule {
  @inject()
  ctx: Context;

  @inject('gridService')
  service: GridService;
  // 定时执行的具体任务
  async exec() {
    const res = await this.service.Run();
    if (res.Error()) return this.ctx.logger.info(process.pid, res);
    this.ctx.logger.info(process.pid, res.Data);
  }
}
