import { describe, expect, it } from '@jest/globals';
import {
  getIndicatorSubFieldNames,
  INDICATOR_SUBFIELDS,
  isMultiLineIndicator,
} from './indicator-subfields.js';

describe('INDICATOR_SUBFIELDS registry', () => {
  const multiLineNames = Object.keys(INDICATOR_SUBFIELDS);

  it('covers every multi-output indicator exposed by the engine', () => {
    expect(multiLineNames.sort()).toEqual(
      [
        'adx',
        'bb',
        'donchian',
        'ichimoku',
        'keltner',
        'macd',
        'pivotpoints',
        'stochrsi',
        'supertrend',
      ].sort(),
    );
  });

  it('treats single-output indicators as line-free', () => {
    for (const name of ['ema', 'sma', 'hma', 'rsi', 'atr', 'sd', 'chop', 'obv', 'bbw', 'bbp'] as const) {
      expect(isMultiLineIndicator(name)).toBe(false);
      expect(getIndicatorSubFieldNames(name)).toEqual([]);
    }
  });

  it('exposes unique, non-empty line names per indicator', () => {
    for (const name of multiLineNames) {
      const names = getIndicatorSubFieldNames(name as never);
      expect(names.length).toBeGreaterThan(1);
      expect(new Set(names).size).toBe(names.length);
    }
  });
});

