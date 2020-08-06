import { Context, controller, get, inject, provide } from 'midway';
import { GridService } from '../../service/grid';

@provide()
@controller('/grid')
export class GridController {
  @inject()
  ctx: Context;

  @inject('gridService')
  service: GridService;

  @get('/')
  async getAccountInfo(): Promise<void> {
    const res = await this.service.GetAccountInfo();
    this.ctx.body = res;
  }
}
