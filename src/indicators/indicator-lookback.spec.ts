import { describe, expect, it } from '@jest/globals';
import type { IndicatorOperand } from './indicator-request.types.js';
import { getIndicatorOperandLookback } from './indicator-lookback.js';

describe('getIndicatorOperandLookback', () => {
  it.each([
    ['ema', 9],
    ['sma', 20],
    ['hma', 9],
    ['rsi', 14],
    ['atr', 14],
    ['sd', 14],
    ['chop', 14],
    ['bb', 20],
    ['bbw', 20],
    ['bbp', 20],
    ['supertrend', 10],
    ['keltner', 20],
    ['donchian', 20],
  ] as const)('returns the default "period" for "%s" (%i)', (name, expected) => {
    expect(getIndicatorOperandLookback({ name } as IndicatorOperand)).toBe(expected);
  });

  it('honors a custom "period" over the registry default', () => {
    expect(
      getIndicatorOperandLookback({ name: 'ema', period: 200 } as IndicatorOperand),
    ).toBe(200);
  });

  it('doubles "period" for adx (DX then ADX itself smoothed)', () => {
    expect(getIndicatorOperandLookback({ name: 'adx' } as IndicatorOperand)).toBe(28);
    expect(
      getIndicatorOperandLookback({ name: 'adx', period: 20 } as IndicatorOperand),
    ).toBe(40);
  });

  it('has no fixed warm-up for obv (cumulative from the first candle)', () => {
    expect(getIndicatorOperandLookback({ name: 'obv' } as IndicatorOperand)).toBe(0);
  });

  it('sums slowPeriod + signalPeriod for macd (signal is an EMA of the MACD series)', () => {
    expect(getIndicatorOperandLookback({ name: 'macd' } as IndicatorOperand)).toBe(35);
    expect(
      getIndicatorOperandLookback({
        name: 'macd',
        fastPeriod: 5,
        slowPeriod: 40,
        signalPeriod: 15,
      } as IndicatorOperand),
    ).toBe(55);
  });

  it('sums spanPeriod + displacement for ichimoku (cloud is plotted forward)', () => {
    expect(getIndicatorOperandLookback({ name: 'ichimoku' } as IndicatorOperand)).toBe(78);
    expect(
      getIndicatorOperandLookback({
        name: 'ichimoku',
        spanPeriod: 52,
        displacement: 10,
      } as IndicatorOperand),
    ).toBe(62);
  });

  it('chains rsiPeriod + stochasticPeriod + max(kPeriod, dPeriod) for stochrsi', () => {
    expect(getIndicatorOperandLookback({ name: 'stochrsi' } as IndicatorOperand)).toBe(31);
    expect(
      getIndicatorOperandLookback({
        name: 'stochrsi',
        rsiPeriod: 14,
        stochasticPeriod: 14,
        kPeriod: 3,
        dPeriod: 7,
      } as IndicatorOperand),
    ).toBe(35);
  });

  it('needs a single candle of context for pivotpoints', () => {
    expect(getIndicatorOperandLookback({ name: 'pivotpoints' } as IndicatorOperand)).toBe(1);
  });

  it('ignores non-period fields (e.g. subField) when resolving params', () => {
    expect(
      getIndicatorOperandLookback({
        name: 'adx',
        period: 14,
        subField: 'pdi',
      } as IndicatorOperand),
    ).toBe(28);
  });
});
