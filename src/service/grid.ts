import { provide, inject, Context } from 'midway';
import { FMex } from '../lib/fmex';
import BigNumber from 'bignumber.js';
import { CodeObj, Code } from '../lib/Code';
import { UserConfig } from '../config';

const fmex = new FMex.Api();
const Num0 = new BigNumber(0);
const Num1 = new BigNumber(1);
const BtcSymbol = 'btcusd_p';

// 以绝对价格为基准线。上下浮动范围调整仓位。
// const UserParams = {
//   MinPrice: 11200,
//   MinPosition: 1000,
//   MaxPrice: 12000,
//   MaxPosition: -200,
//   AutoPrice: false,
//   MaxStepVol: 5, // 每次下单最多不能超过该金额
//   OverStepChange: 5,
// };

// 以24小时均价为基准线。上下浮动范围调整仓位。
const UserParams = {
  MinPrice: -100,
  MinPosition: 1000,
  MaxPrice: 500,
  MaxPosition: -200,
  AutoPrice: true,
  MaxStepVol: 10, // 每次下单最多不能超过该金额
  OverStepChange: 5,
};

const ks = UserConfig.KeySecret;

const OrderReqCache: any = {};

@provide('gridService')
export class GridService {
  @inject()
  ctx: Context;

  async Run() {
    const [pos, balance, ticker, orders] = await Promise.all([fmex.FetchPosition(ks), fmex.FetchBalance(ks), fmex.GetTicker(BtcSymbol), fmex.Orders(ks)]);
    if (pos.Error()) return pos;
    if (balance.Error()) return balance;
    if (ticker.Error()) return ticker;
    if (orders.Error()) return orders;

    const BtcPrice = ticker.Data.ticker[0];

    const BtcPos = pos.Data.results[0]; // 仓位信息
    const balanceBtc = balance.Data.BTC; // 账户余额 [可用余额, 订单冻结金额, 仓位保证金金额]

    const quantity = new BigNumber(BtcPos.quantity);
    // 【未实现盈亏】 （按照现价计算、系统给的是指数价格计算的结果）
    const unrealized_pnl = quantity.dividedBy(BtcPos.entry_price).minus(quantity.dividedBy(BtcPrice));

    // 【持有BTC】 = 【可用余额】 + 【订单冻结金额】 + 【仓位保证金金额】 + 【未实现盈亏】
    const BtcSum = new BigNumber(balanceBtc[0]).plus(balanceBtc[1]).plus(balanceBtc[2]).plus(unrealized_pnl);

    // 【折合USD】 = 【持有BTC】 * 【BTC当前价格】
    const UsdSum = BtcSum.multipliedBy(BtcPrice);

    // 计算应该持有仓位
    const WantPos = this.GetPricePosition(ticker.Data);

    const CurrentPos = (BtcPos.direction === 'long' ? 1 : -1) * BtcPos.quantity;

    const OutPut = {
      p24h: new BigNumber(ticker.Data.ticker[9]).dividedBy(ticker.Data.ticker[10]).toNumber(),
      Price: BtcPrice,
      BtcSum: BtcSum.toNumber(),
      UsdSum: UsdSum.toNumber(),
      quantity: CurrentPos,
      WantPos,
    };

    // 需要磨平的仓位
    const diffPos = WantPos - CurrentPos;

    // 持有仓位一致。无需变更
    if (diffPos === 0) {
      // 撤销目前已有的订单
      if (orders.Data.results.length) {
        const cancel = await fmex.CancelOrders(ks, BtcSymbol);
        if (cancel.Error()) return cancel;
        this.ctx.logger.info(process.pid, '撤单', cancel.Data);
      }

      return new CodeObj(Code.Success, OutPut);
    }

    let CreateOrder = true;

    if (orders.Data.results.length) {
      // 如果当前订单就在 买一/卖一 上挂着，就等着成交
      const IsBuy = diffPos > 0;
      const order = orders.Data.results.filter((item) => (IsBuy ? item.direction === 'long' : item.direction === 'short'))[0];
      if (order) {
        if (IsBuy) {
          if (order.price - ticker.Data.ticker[2] < -UserParams.OverStepChange) {
            fmex.CancelOrders(ks, BtcSymbol);
          } else {
            CreateOrder = false;
          }
        } else {
          if (order.price - ticker.Data.ticker[4] > UserParams.OverStepChange) {
            fmex.CancelOrders(ks, BtcSymbol);
          } else {
            CreateOrder = false;
          }
        }
      }
    }
    if (CreateOrder) this.TakeOrder(ticker.Data, diffPos);

    return new CodeObj(Code.Success, OutPut);
  }

  private async TakeOrder(ticker: FMex.WsTickerRes, vol: number) {
    if (OrderReqCache[ks.Key]) return OrderReqCache[ks.Key];
    OrderReqCache[ks.Key] = new Promise(async (resolve) => {
      const IsBuy = vol > 0;
      const res = await fmex.CreateOrder(ks, {
        symbol: 'BTCUSD_P',
        type: 'LIMIT',
        direction: IsBuy ? 'LONG' : 'SHORT',
        post_only: true,
        price: IsBuy ? ticker.ticker[2] : ticker.ticker[4],
        quantity: Math.min(UserParams.MaxStepVol, Math.abs(vol)),
      });
      OrderReqCache[ks.Key] = null;
      resolve(res);
    });
    return OrderReqCache[ks.Key];
  }

  /**
   * 计算当前行情，应该持有仓位
   * @param ticker 行情数据
   */
  private GetPricePosition(ticker: FMex.WsTickerRes) {
    const PriceDiff = new BigNumber(UserParams.MaxPrice).minus(UserParams.MinPrice); // 用户设置的价格范围
    let MinPrice = new BigNumber(UserParams.MinPrice); // 用户设置的低价
    // 以均价为准
    if (UserParams.AutoPrice) {
      const Price = new BigNumber(ticker.ticker[9]).dividedBy(ticker.ticker[10]); // 24小时均价
      MinPrice = Price.plus(UserParams.MinPrice); // 当前下限价格。
    }
    const Diff = new BigNumber(ticker.ticker[0]).minus(MinPrice); // 当前价格，离最低价距离
    let PricePosition = Diff.dividedBy(PriceDiff); // 当前价格处于用户设置范围的位置

    const PricePositionNumber = PricePosition.toNumber();
    // 限制范围只能在0-1内
    if (PricePositionNumber < 0) {
      PricePosition = Num0;
    } else if (PricePositionNumber > 1) {
      PricePosition = Num1;
    }
    const PositionDiff = new BigNumber(UserParams.MinPosition).minus(UserParams.MaxPosition); // 用户持仓范围
    const CurrentPricePosition = PositionDiff.multipliedBy(Num1.minus(PricePosition)).plus(UserParams.MaxPosition);
    return Math.floor(CurrentPricePosition.toNumber());
  }
}
