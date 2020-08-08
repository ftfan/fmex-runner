import { provide, inject, Context } from 'midway';
import { FMex } from '../lib/fmex';
import BigNumber from 'bignumber.js';
import { CodeObj, Code } from '../lib/Code';
import { UserConfig } from '../config';
import { MD5, DateFormat } from '../lib/utils';
import { OssService } from './oss';
import * as lodash from 'lodash';

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
  MaxPrice: 400,
  MaxPosition: -200,
  MaxStepVol: 100, // 每次下单最多不能超过该金额
  OverStepChange: 3, // 价差多少时，撤单。
  Runner: true,
  BasePriceWeight: 1, // 基准价格权重，为1表示忽略24H均价。
  BasePrice: 11700, // 基准价格，中间价格
  GridDiff: 0, // 设置偏移价格
};

const ks = UserConfig.KeySecret;

const OrderReqCache: any = {};
const ReqPromise: any = {};
const OssFileCache: any = {};
const KeyInited: any = {};

@provide('gridService')
export class GridService {
  @inject()
  ctx: Context;

  @inject('ossService')
  oss: OssService;

  // 设置参数
  async SetParams(params: any) {
    if (params.Key !== UserConfig.KeySecret.Key) return new CodeObj(Code.Error, null, 'Key 不匹配');
    const key = this.GetUserDatabaseDir(ks.Key);
    const keyPath = `${key}/config.json`;
    const res = await this.oss.put(keyPath, params, {});
    if (!res) return new CodeObj(Code.Error, null, '保存失败');
    Object.assign(UserParams, params);
    return new CodeObj(Code.Success);
  }

  async InitParams() {
    const key = this.GetUserDatabaseDir(ks.Key);
    const keyPath = `${key}/config.json`;
    const res = await this.oss.get(keyPath);
    if (!res) return new CodeObj(Code.Error, null, '用户未配置参数');
    Object.assign(UserParams, res);
    KeyInited[ks.Key] = true;
    return new CodeObj(Code.Success, res);
  }

  async Run() {
    if (!KeyInited[ks.Key]) return this.InitParams();
    if (!UserParams.Runner) return new CodeObj(Code.Error);
    const [pos, balance, ticker, orders] = await Promise.all([
      // 获取行情数据
      fmex.FetchPosition(ks),
      fmex.FetchBalance(ks),
      fmex.GetTicker(BtcSymbol),
      fmex.Orders(ks),
    ]);
    if (pos.Error()) return pos;
    if (balance.Error()) return balance;
    if (ticker.Error()) return ticker;
    if (orders.Error()) return orders;

    const BtcPrice = ticker.Data.ticker[0];
    const BtcPos =
      pos.Data.results && pos.Data.results[0]
        ? pos.Data.results[0]
        : ({
            quantity: 0,
            entry_price: 0,
            direction: 'long',
          } as any); // 仓位信息
    const balanceBtc = balance.Data.BTC || [0, 0, 0]; // 账户余额 [可用余额, 订单冻结金额, 仓位保证金金额]

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
      Ts: Date.now(),
      p24h: Math.floor(new BigNumber(ticker.Data.ticker[9]).dividedBy(ticker.Data.ticker[10]).multipliedBy(100).toNumber()) / 100,
      Price: BtcPrice,
      BtcSum: BtcSum.toNumber() || 0,
      UsdSum: UsdSum.toNumber() || 0,
      quantity: CurrentPos,
      WantPos,
    };

    // 执行成功
    const Success = async () => {
      const key = this.GetUserDatabaseDir(ks.Key);
      const keyPath = `${key}/${DateFormat(Date.now(), 'yyyy/MM/dd')}.json`;
      OssFileCache[key] = OssFileCache[key] || {};
      if (ReqPromise[ks.Key]) await ReqPromise[ks.Key];
      if (OssFileCache[key].keyPath !== keyPath) {
        ReqPromise[ks.Key] = new Promise(async (resolve) => {
          // 字段是首次建立，这里意味着是程序刚启动，所以需要加载oss文件数据，避免被覆盖
          const temp = await this.oss.get(keyPath);
          const newData = temp || [];

          OssFileCache[key] = {
            data: newData,
            keyPath,
            Saver: lodash.throttle((key: string, data: any) => {
              this.oss.put(key, data, {});
            }, 60000),
          };
          ReqPromise[ks.Key] = null;
          resolve();
        });
      }
      const cache = OssFileCache[key];

      const IsSameData = () => {
        const last = cache.data[cache.data.length - 1];
        if (!last) return false;
        const keys = ['p24h', 'Price', 'BtcSum', 'UsdSum', 'quantity'];
        for (const i in keys) {
          const val = keys[i];
          if (OutPut[val] !== last[val]) return false;
        }
        if (OutPut.WantPos[0] !== last.WantPos[0]) return false;
        if (OutPut.WantPos[1] !== last.WantPos[1]) return false;
        return true;
      };
      // 数据如果和上一次没有差别，就不保存了。有差异才保存
      if (!IsSameData()) {
        cache.data.push(OutPut);

        // 临时修复缺陷数据
        {
          let tttt = Date.now();
          tttt = tttt - (tttt % 86400000);
          cache.data = cache.data.filter((item: any) => item.Ts >= tttt);
        }

        // 因为执行太过频繁。这里保存数据有一定的延迟
        cache.Saver(cache.keyPath, cache.data);
      }

      return new CodeObj(Code.Success, OutPut);
    };

    // 需要磨平的仓位
    const diffPos = WantPos.map((item) => item - CurrentPos);

    // 持有仓位一致。无需变更
    if (diffPos[0] === 0 && diffPos[1] === 0) {
      // 撤销目前已有的订单
      if (orders.Data.results.length) {
        const cancel = await fmex.CancelOrders(ks, BtcSymbol);
        if (cancel.Error()) return cancel;
        this.ctx.logger.info(process.pid, '撤单', cancel.Data);
      }
      return Success();
    }

    // 符号相同。只保留一个
    if (diffPos[0] * diffPos[1] > 1) {
      if (diffPos[0] > 0) {
        diffPos[1] = 0;
      } else {
        diffPos[0] = 0;
      }
    }

    const CancelOrders: number[] = [];
    const CreateOrder = diffPos.map((item) => {
      if (item === 0) return false;
      if (!orders.Data.results.length) return item;
      const IsBuy = item > 0;
      let revert = true;
      orders.Data.results.forEach((order) => {
        if (IsBuy && order.direction === 'long') {
          if (ticker.Data.ticker[2] - UserParams.GridDiff - order.price > UserParams.OverStepChange) {
            CancelOrders.push(order.id);
          } else {
            revert = false;
          }
        }
        if (!IsBuy && order.direction === 'short') {
          if (order.price - (ticker.Data.ticker[4] + UserParams.GridDiff) > UserParams.OverStepChange) {
            CancelOrders.push(order.id);
          } else {
            revert = false;
          }
        }
      });
      if (revert) return item;
      return false;
    });
    CreateOrder.forEach((item) => {
      if (item) this.TakeOrder(ticker.Data, item);
    });
    CancelOrders.forEach((item) => {
      fmex.OrderCancel(ks, item);
    });

    return Success();
  }

  private GetUserDatabaseDir(key: string) {
    return `/report/` + MD5(`fmex-runner,${key}`);
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
        price: IsBuy ? ticker.ticker[2] - UserParams.GridDiff : ticker.ticker[4] + UserParams.GridDiff,
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

    const Price24H = new BigNumber(ticker.ticker[9]).dividedBy(ticker.ticker[10]); // 24小时均价
    // 基准价格
    const BasePrice = new BigNumber(UserParams.BasePrice).multipliedBy(UserParams.BasePriceWeight).plus(Price24H.multipliedBy(Num1.minus(UserParams.BasePriceWeight)));

    const MinPrice = BasePrice.minus(UserParams.BasePrice).plus(UserParams.MinPrice); // 用户设置的低价

    const Diff = [new BigNumber(ticker.ticker[2]).minus(MinPrice), new BigNumber(ticker.ticker[4]).minus(MinPrice)]; // 当前价格，离最低价距离
    const PricePosition = [BigNumber.min(Num1, BigNumber.max(Num0, Diff[0].dividedBy(PriceDiff))), BigNumber.min(Num1, BigNumber.max(Num0, Diff[1].dividedBy(PriceDiff)))]; // 当前价格处于用户设置范围的位置

    const PositionDiff = new BigNumber(UserParams.MinPosition).minus(UserParams.MaxPosition); // 用户持仓范围
    const CurrentPricePosition = [
      PositionDiff.multipliedBy(Num1.minus(PricePosition[0])).plus(UserParams.MaxPosition),
      PositionDiff.multipliedBy(Num1.minus(PricePosition[1])).plus(UserParams.MaxPosition),
    ];
    return [Math.floor(CurrentPricePosition[0].toNumber()), Math.floor(CurrentPricePosition[1].toNumber())];
  }
}
