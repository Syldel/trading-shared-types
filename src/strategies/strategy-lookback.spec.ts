import { describe, expect, it } from '@jest/globals';
import type {
  LogicalGroup,
  Operand,
  RuleNode,
  StrategyRules,
} from './strategy-engine.type.js';
import {
  computeOperandLookback,
  computeRuleNodeLookback,
  computeStrategyRulesLookback,
} from './strategy-lookback.js';

describe('computeOperandLookback', () => {
  it('is 0 for a "number" operand', () => {
    expect(computeOperandLookback({ type: 'number', value: 5 })).toBe(0);
  });

  it('is 0 for a "price" operand without offset, and the offset itself when present', () => {
    expect(computeOperandLookback({ type: 'price', field: 'close' })).toBe(0);
    expect(computeOperandLookback({ type: 'price', field: 'close', offset: 5 })).toBe(5);
  });

  it('delegates an "indicator" operand to its own lookback, plus offset', () => {
    const operand: Operand = { type: 'indicator', name: 'ema', period: 20 };
    expect(computeOperandLookback(operand)).toBe(20);
    expect(computeOperandLookback({ ...operand, offset: 3 })).toBe(23);
  });

  it('takes the max of both branches for "arith" (evaluated at the same candle)', () => {
    const operand: Operand = {
      type: 'arith',
      operator: 'ADD',
      left: { type: 'indicator', name: 'ema', period: 20 },
      right: { type: 'indicator', name: 'atr', period: 14 },
    };
    expect(computeOperandLookback(operand)).toBe(20);
  });

  it('adds its own window on top of the source lookback for "transform"', () => {
    const operand: Operand = {
      type: 'transform',
      kind: 'zscore',
      period: 200,
      source: { type: 'indicator', name: 'ema', period: 50 },
    };
    expect(computeOperandLookback(operand)).toBe(250);
    expect(computeOperandLookback({ ...operand, offset: 5 })).toBe(255);
  });

  it('resolves an omitted transform "period" via the transform registry default', () => {
    const operand: Operand = {
      type: 'transform',
      kind: 'zscore',
      source: { type: 'price', field: 'close' },
    };
    expect(computeOperandLookback(operand)).toBe(200);
  });

  it('composes recursively for a transform whose source is itself a transform', () => {
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
    // 200 (zscore) + 20 (slope) + 50 (ema)
    expect(computeOperandLookback(operand)).toBe(270);
  });

  it('takes the max across all args for "fn" (evaluated at the same candle)', () => {
    const operand: Operand = {
      type: 'fn',
      kind: 'max',
      args: [
        { type: 'indicator', name: 'ema', period: 9 },
        { type: 'indicator', name: 'ema', period: 20 },
      ],
    };
    expect(computeOperandLookback(operand)).toBe(20);
  });
});

describe('computeRuleNodeLookback', () => {
  it('takes the max of both operands for "comparison"', () => {
    const node: RuleNode = {
      type: 'comparison',
      operator: 'GT',
      left: { type: 'indicator', name: 'ema', period: 9 },
      right: { type: 'indicator', name: 'ema', period: 20 },
    };
    expect(computeRuleNodeLookback(node)).toBe(20);
  });

  it('adds the trend window on top of the target lookback for "trend"', () => {
    const node: RuleNode = {
      type: 'trend',
      target: { type: 'indicator', name: 'ema', period: 20 },
      direction: 'UP',
      period: 10,
    };
    expect(computeRuleNodeLookback(node)).toBe(30);
  });

  it('delegates to its inner condition for "not"', () => {
    const node: RuleNode = {
      type: 'not',
      condition: {
        type: 'comparison',
        operator: 'GT',
        left: { type: 'indicator', name: 'ema', period: 20 },
        right: { type: 'number', value: 0 },
      },
    };
    expect(computeRuleNodeLookback(node)).toBe(20);
  });

  it('adds one extra candle on top of both operands for "cross"', () => {
    const node: RuleNode = {
      type: 'cross',
      left: { type: 'indicator', name: 'ema', period: 9 },
      right: { type: 'indicator', name: 'ema', period: 20 },
      direction: 'UP',
    };
    expect(computeRuleNodeLookback(node)).toBe(21);
  });

  it('is 0 for "constant"', () => {
    expect(computeRuleNodeLookback({ type: 'constant', value: true })).toBe(0);
  });

  it('takes the max across all conditions for "logical", recursively', () => {
    const node: RuleNode = {
      type: 'logical',
      operator: 'AND',
      conditions: [
        {
          type: 'comparison',
          operator: 'GT',
          left: { type: 'indicator', name: 'ema', period: 9 },
          right: { type: 'number', value: 0 },
        },
        {
          type: 'trend',
          target: { type: 'indicator', name: 'sma', period: 20 },
          direction: 'UP',
          period: 5,
        },
      ],
    };
    // max(9, 20 + 5)
    expect(computeRuleNodeLookback(node)).toBe(25);
  });
});

describe('computeStrategyRulesLookback', () => {
  it('is 0 for undefined/null rules', () => {
    expect(computeStrategyRulesLookback(undefined)).toBe(0);
    expect(computeStrategyRulesLookback(null)).toBe(0);
  });

  it('is 0 for an empty rules object', () => {
    expect(computeStrategyRulesLookback({})).toBe(0);
  });

  // `SideRules.entry`/`.exit` sont typés `LogicalGroup`, pas `RuleNode` en
  // général (voir strategy-engine.type.ts) : on enveloppe la comparaison.
  const comparisonOn = (period: number): LogicalGroup => ({
    type: 'logical',
    operator: 'AND',
    conditions: [
      {
        type: 'comparison',
        operator: 'GT',
        left: { type: 'indicator', name: 'ema', period },
        right: { type: 'number', value: 0 },
      },
    ],
  });

  it('reads a lone long.entry', () => {
    const rules: StrategyRules = { long: { entry: comparisonOn(20) } };
    expect(computeStrategyRulesLookback(rules)).toBe(20);
  });

  it('takes the max across long/short and entry/exit', () => {
    const rules: StrategyRules = {
      long: { entry: comparisonOn(9), exit: comparisonOn(50) },
      short: { entry: comparisonOn(14) },
    };
    expect(computeStrategyRulesLookback(rules)).toBe(50);
  });

  it('does not crash when "exit" is absent on a populated side', () => {
    const rules: StrategyRules = { short: { entry: comparisonOn(30) } };
    expect(computeStrategyRulesLookback(rules)).toBe(30);
  });
});
