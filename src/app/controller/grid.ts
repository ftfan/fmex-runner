import { Context, controller, get, inject, provide } from 'midway';
import { GridService } from '../../service/grid';
import { CodeObj, Code } from '../../lib/Code';

@provide()
@controller('/grid')
export class GridController {
  @inject()
  ctx: Context;

  @inject('gridService')
  service: GridService;

  @get('/set-params')
  async SetParams(): Promise<void> {
    const query = this.ctx.query;
    const params = {
      MinPrice: parseFloat(query.MinPrice),
      MinPosition: parseFloat(query.MinPosition),
      MaxPrice: parseFloat(query.MaxPrice),
      MaxPosition: parseFloat(query.MaxPosition),
      MaxStepVol: parseFloat(query.MaxStepVol),
      OverStepChange: parseFloat(query.OverStepChange),
      GridDiff: parseFloat(query.GridDiff), // 设置偏移价格
      BasePriceWeight: parseFloat(query.BasePriceWeight),
      BasePrice: parseFloat(query.BasePrice),
      Runner: query.Runner === 'true',
      Key: query.Key,
    };
    const err = () => {
      this.ctx.body = new CodeObj(Code.Error);
    };
    if (isNaN(params.MinPrice)) return err();
    if (isNaN(params.MinPosition)) return err();
    if (isNaN(params.MaxPrice)) return err();
    if (isNaN(params.MaxPosition)) return err();
    if (isNaN(params.MaxStepVol)) return err();
    if (isNaN(params.OverStepChange)) return err();
    if (isNaN(params.BasePriceWeight)) return err();
    if (isNaN(params.GridDiff)) return err();
    if (isNaN(params.BasePrice)) return err();
    const res = await this.service.SetParams(params);
    this.ctx.body = res;
  }
}
