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
