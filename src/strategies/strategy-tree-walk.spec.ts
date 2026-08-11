import { describe, expect, it, jest } from '@jest/globals';
import type { RuleNode } from './strategy-engine.type.js';
import { walkRuleTree } from './strategy-tree-walk.js';

describe('walkRuleTree', () => {
  it('visits every node and every operand of a nested tree, in order', () => {
    const tree: RuleNode = {
      type: 'logical',
      operator: 'AND',
      conditions: [
        {
          type: 'comparison',
          operator: 'GT',
          left: { type: 'indicator', name: 'rsi', period: 14 },
          right: { type: 'number', value: 70 },
        },
        {
          type: 'trend',
          direction: 'UP',
          period: 5,
          target: { type: 'price', field: 'close' },
        },
      ],
    };

    const nodeTypes: string[] = [];
    const operands: { type: string; key: string }[] = [];

    walkRuleTree(tree, {
      onNode: (node) => nodeTypes.push(node.type),
      onOperand: (operand, ctx) => operands.push({ type: operand.type, key: ctx.key }),
    });

    expect(nodeTypes).toEqual(['logical', 'comparison', 'trend']);
    expect(operands).toEqual([
      { type: 'indicator', key: 'left' },
      { type: 'number', key: 'right' },
      { type: 'price', key: 'target' },
    ]);
  });

  it('does not descend nor call onOperand on an empty logical group', () => {
    const onOperand = jest.fn();
    const onMalformed = jest.fn();

    walkRuleTree(
      { type: 'logical', operator: 'AND', conditions: [] },
      { onOperand, onMalformed },
    );

    expect(onOperand).not.toHaveBeenCalled();
    expect(onMalformed).not.toHaveBeenCalled();
  });

  it('lets the visitor inspect the node itself to apply its own rules (e.g. empty group, invalid period)', () => {
    const flagged: string[] = [];

    walkRuleTree(
      { type: 'logical', operator: 'AND', conditions: [] },
      {
        onNode: (node) => {
          if (node.type === 'logical' && node.conditions.length === 0) {
            flagged.push('empty-group');
          }
        },
      },
    );

    expect(flagged).toEqual(['empty-group']);
  });

  it('reports UNKNOWN_NODE_TYPE for an unrecognized node type without throwing', () => {
    const onMalformed = jest.fn();

    expect(() =>
      walkRuleTree({ type: 'xor' } as unknown as RuleNode, { onMalformed }),
    ).not.toThrow();

    expect(onMalformed).toHaveBeenCalledWith({
      reason: 'UNKNOWN_NODE_TYPE',
      node: { type: 'xor' },
    });
  });

  it('reports UNKNOWN_NODE_TYPE for a missing/null node without throwing', () => {
    const onMalformed = jest.fn();

    expect(() =>
      walkRuleTree(undefined as unknown as RuleNode, { onMalformed }),
    ).not.toThrow();

    expect(onMalformed).toHaveBeenCalledWith({
      reason: 'UNKNOWN_NODE_TYPE',
      node: undefined,
    });
  });

  it('reports NON_ARRAY_CONDITIONS and stops descending when conditions is not an array', () => {
    const onNode = jest.fn();
    const onOperand = jest.fn();
    const onMalformed = jest.fn();

    walkRuleTree(
      { type: 'logical', operator: 'AND', conditions: null } as unknown as RuleNode,
      { onNode, onOperand, onMalformed },
    );

    // `onNode` et `onMalformed` sont mutuellement exclusifs pour un même
    // nœud : un visiteur qui suppose `conditions` toujours tableau dans
    // `onNode` (ex: `n.conditions.length`) ne doit jamais le recevoir malformé.
    expect(onNode).not.toHaveBeenCalled();
    expect(onOperand).not.toHaveBeenCalled();
    expect(onMalformed).toHaveBeenCalledWith({
      reason: 'NON_ARRAY_CONDITIONS',
      node: { type: 'logical', operator: 'AND', conditions: null },
    });
  });

  it('descends into "not" and visits the wrapped node/operands', () => {
    const tree: RuleNode = {
      type: 'not',
      condition: {
        type: 'comparison',
        operator: 'GT',
        left: { type: 'indicator', name: 'rsi', period: 14 },
        right: { type: 'number', value: 70 },
      },
    };

    const nodeTypes: string[] = [];
    const operands: string[] = [];

    walkRuleTree(tree, {
      onNode: (node) => nodeTypes.push(node.type),
      onOperand: (operand) => operands.push(operand.type),
    });

    expect(nodeTypes).toEqual(['not', 'comparison']);
    expect(operands).toEqual(['indicator', 'number']);
  });

  it('visits both operands of a "cross" node', () => {
    const tree: RuleNode = {
      type: 'cross',
      direction: 'UP',
      left: { type: 'indicator', name: 'ema', period: 9 },
      right: { type: 'indicator', name: 'ema', period: 20 },
    };

    const operands: { type: string; key: string }[] = [];

    walkRuleTree(tree, {
      onOperand: (operand, ctx) => operands.push({ type: operand.type, key: ctx.key }),
    });

    expect(operands).toEqual([
      { type: 'indicator', key: 'left' },
      { type: 'indicator', key: 'right' },
    ]);
  });

  it('visits a "constant" node without expecting any operand', () => {
    const onOperand = jest.fn();
    const nodeTypes: string[] = [];

    walkRuleTree(
      { type: 'constant', value: true },
      { onNode: (node) => nodeTypes.push(node.type), onOperand },
    );

    expect(nodeTypes).toEqual(['constant']);
    expect(onOperand).not.toHaveBeenCalled();
  });

  // Sans cette descente récursive, un indicateur niché dans une expression
  // arithmétique ne serait jamais calculé (voir StrategyEngineService dans
  // nest-trading-bot) : c'est exactement le mode de défaillance silencieux
  // que ce walker existe pour éliminer.
  it('descends into nested "arith" operands down to their leaves, never emitting the arith node itself', () => {
    const tree: RuleNode = {
      type: 'comparison',
      operator: 'GT',
      left: { type: 'price', field: 'close' },
      right: {
        type: 'arith',
        operator: 'ADD',
        left: { type: 'indicator', name: 'ema', period: 20 },
        right: {
          type: 'arith',
          operator: 'MUL',
          left: { type: 'indicator', name: 'atr', period: 14 },
          right: { type: 'number', value: 2 },
        },
      },
    };

    const operands: { type: string; key: string }[] = [];
    walkRuleTree(tree, {
      onOperand: (operand, ctx) => operands.push({ type: operand.type, key: ctx.key }),
    });

    expect(operands).toEqual([
      { type: 'price', key: 'left' },
      { type: 'indicator', key: 'right' }, // ema20
      { type: 'indicator', key: 'right' }, // atr14
      { type: 'number', key: 'right' }, // 2
    ]);
    expect(operands.some((o) => o.type === 'arith')).toBe(false);
  });

  it('reports UNKNOWN_OPERAND_TYPE for a missing operand inside a comparison', () => {
    const onMalformed = jest.fn();

    walkRuleTree(
      {
        type: 'comparison',
        operator: 'GT',
        left: undefined,
        right: { type: 'number', value: 1 },
      } as unknown as RuleNode,
      { onMalformed },
    );

    expect(onMalformed).toHaveBeenCalledWith({
      reason: 'UNKNOWN_OPERAND_TYPE',
      operand: undefined,
    });
  });

  it('works with no visitor callbacks at all', () => {
    expect(() =>
      walkRuleTree(
        {
          type: 'comparison',
          operator: 'GT',
          left: { type: 'number', value: 1 },
          right: { type: 'number', value: 2 },
        },
        {},
      ),
    ).not.toThrow();
  });
});
