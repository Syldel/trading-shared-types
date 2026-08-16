import { describe, expect, it } from '@jest/globals';
import type { Operand } from './strategy-engine.type.js';
import { buildOperandKey } from './operand-key.js';

describe('buildOperandKey', () => {
  it('keys a "number" operand by its value', () => {
    expect(buildOperandKey({ type: 'number', value: 5 })).toBe('num_5');
    expect(buildOperandKey({ type: 'number', value: -1.5 })).toBe('num_-1.5');
  });

  it('keys a "price" operand by its field, ignoring "offset"', () => {
    const withoutOffset: Operand = { type: 'price', field: 'close' };
    const withOffset: Operand = { type: 'price', field: 'close', offset: 5 };

    expect(buildOperandKey(withoutOffset)).toBe('price_close');
    expect(buildOperandKey(withOffset)).toBe('price_close');
  });

  it('delegates an "indicator" operand to buildIndicatorKeyFromOperand, ignoring "offset"', () => {
    const withoutOffset: Operand = { type: 'indicator', name: 'ema', period: 9 };
    const withOffset: Operand = {
      type: 'indicator',
      name: 'ema',
      period: 9,
      offset: 3,
    };
    const multiLine: Operand = {
      type: 'indicator',
      name: 'adx',
      period: 14,
      subField: 'pdi',
    };

    expect(buildOperandKey(withoutOffset)).toBe('ema_9');
    expect(buildOperandKey(withOffset)).toBe('ema_9');
    expect(buildOperandKey(multiLine)).toBe('adx_14_pdi');
  });

  it('builds a recursive key for a nested "arith" operand', () => {
    const operand: Operand = {
      type: 'arith',
      operator: 'ADD',
      left: { type: 'indicator', name: 'ema', period: 20 },
      right: {
        type: 'arith',
        operator: 'MUL',
        left: { type: 'indicator', name: 'atr', period: 14 },
        right: { type: 'number', value: 2 },
      },
    };

    expect(buildOperandKey(operand)).toBe('arith_ADD(ema_20,arith_MUL(atr_14,num_2))');
  });

  it('keys a "transform" operand by kind, period and its source, ignoring "offset"', () => {
    const withPeriod: Operand = {
      type: 'transform',
      kind: 'zscore',
      period: 200,
      source: { type: 'indicator', name: 'bbw', period: 20, stdDev: 2 },
    };
    const withOffset: Operand = { ...withPeriod, offset: 1 };

    expect(buildOperandKey(withPeriod)).toBe('transform_zscore_200(bbw_20_2)');
    expect(buildOperandKey(withOffset)).toBe('transform_zscore_200(bbw_20_2)');
  });

  it('keys an omitted transform "period" distinctly from any explicit period (resolved later by the engine)', () => {
    const omitted: Operand = {
      type: 'transform',
      kind: 'zscore',
      source: { type: 'indicator', name: 'bbw', period: 20 },
    };

    expect(buildOperandKey(omitted)).toBe('transform_zscore_d(bbw_20_2)');
  });

  it('composes a key for a transform whose source is itself a transform', () => {
    const operand: Operand = {
      type: 'transform',
      kind: 'zscore',
      period: 200,
      source: {
        type: 'transform',
        kind: 'slope',
        period: 20,
        source: { type: 'indicator', name: 'ema', period: 50 },
      },
    };

    expect(buildOperandKey(operand)).toBe(
      'transform_zscore_200(transform_slope_20(ema_50))',
    );
  });

  it('builds a key for a "fn" operand from its kind and each arg key, in order', () => {
    const operand: Operand = {
      type: 'fn',
      kind: 'max',
      args: [
        { type: 'indicator', name: 'ichimoku', subField: 'spanA' },
        { type: 'indicator', name: 'ichimoku', subField: 'spanB' },
      ],
    };

    expect(buildOperandKey(operand)).toBe(
      'fn_max(ichimoku_9_26_52_26_spanA,ichimoku_9_26_52_26_spanB)',
    );
  });

  it('composes a key for a "fn" operand nested inside another "fn" operand', () => {
    const operand: Operand = {
      type: 'fn',
      kind: 'min',
      args: [
        {
          type: 'fn',
          kind: 'max',
          args: [
            { type: 'indicator', name: 'ema', period: 9 },
            { type: 'indicator', name: 'ema', period: 20 },
          ],
        },
        { type: 'price', field: 'close' },
      ],
    };

    expect(buildOperandKey(operand)).toBe(
      'fn_min(fn_max(ema_9,ema_20),price_close)',
    );
  });

  it('is deterministic: two structurally identical operands produce the same key', () => {
    const a: Operand = {
      type: 'transform',
      kind: 'percentile',
      period: 200,
      source: { type: 'indicator', name: 'chop', period: 14 },
    };
    const b: Operand = {
      type: 'transform',
      kind: 'percentile',
      period: 200,
      source: { type: 'indicator', name: 'chop', period: 14 },
    };

    expect(buildOperandKey(a)).toBe(buildOperandKey(b));
  });

  it('is discriminating: operands that differ in kind, period, or source produce different keys', () => {
    const base: Operand = {
      type: 'transform',
      kind: 'percentile',
      period: 200,
      source: { type: 'indicator', name: 'chop', period: 14 },
    };
    const differentKind: Operand = { ...base, kind: 'zscore' };
    const differentPeriod: Operand = { ...base, period: 100 };
    const differentSource: Operand = {
      ...base,
      source: { type: 'indicator', name: 'chop', period: 20 },
    };

    const keys = [base, differentKind, differentPeriod, differentSource].map(
      buildOperandKey,
    );
    expect(new Set(keys).size).toBe(4);
  });
});
