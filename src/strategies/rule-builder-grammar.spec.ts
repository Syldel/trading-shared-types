import { describe, expect, it } from '@jest/globals';
import {
  ARITH_OPERATORS,
  COMPARISON_OPERATORS,
  CROSS_DIRECTIONS,
  LOGICAL_OPERATORS,
  PRICE_FIELDS,
  TREND_DIRECTIONS,
  TREND_MODES,
} from './strategy-engine.type.js';
import { RULE_BUILDER_GRAMMAR } from './rule-builder-grammar.js';

/** Extrait les `value` d'une liste `GrammarOption`, dans l'ordre déclaré. */
const values = (options: { value: string }[]) => options.map((o) => o.value);

describe('RULE_BUILDER_GRAMMAR', () => {
  // `RuleNode['type']` et `Operand['type']` ne sont pas des `as const` runtime
  // (voir strategy-engine.type.ts) : la liste attendue est donc figée ici à
  // la main plutôt que dérivée. Un nouveau type de nœud/opérande doit
  // mettre à jour aussi bien ce test que RULE_BUILDER_GRAMMAR lui-même.
  it('covers every RuleNode type in "nodeTypes"', () => {
    expect(values(RULE_BUILDER_GRAMMAR.nodeTypes).sort()).toEqual(
      ['comparison', 'constant', 'cross', 'logical', 'not', 'trend'].sort(),
    );
  });

  it('covers every Operand type in "targetTypes"', () => {
    expect(values(RULE_BUILDER_GRAMMAR.targetTypes).sort()).toEqual(
      ['arith', 'fn', 'indicator', 'number', 'price', 'transform'].sort(),
    );
  });

  it('covers every LOGICAL_OPERATORS value', () => {
    expect(values(RULE_BUILDER_GRAMMAR.logicalOperators).sort()).toEqual(
      [...LOGICAL_OPERATORS].sort(),
    );
  });

  it('covers every COMPARISON_OPERATORS value', () => {
    expect(values(RULE_BUILDER_GRAMMAR.comparisonOperators).sort()).toEqual(
      [...COMPARISON_OPERATORS].sort(),
    );
  });

  it('covers every PRICE_FIELDS value', () => {
    expect(values(RULE_BUILDER_GRAMMAR.priceFields).sort()).toEqual(
      [...PRICE_FIELDS].sort(),
    );
  });

  it('covers every TREND_DIRECTIONS value', () => {
    expect(values(RULE_BUILDER_GRAMMAR.trendDirections).sort()).toEqual(
      [...TREND_DIRECTIONS].sort(),
    );
  });

  it('covers every TREND_MODES value', () => {
    expect(values(RULE_BUILDER_GRAMMAR.trendModes).sort()).toEqual(
      [...TREND_MODES].sort(),
    );
  });

  it('covers every CROSS_DIRECTIONS value', () => {
    expect(values(RULE_BUILDER_GRAMMAR.crossDirections).sort()).toEqual(
      [...CROSS_DIRECTIONS].sort(),
    );
  });

  it('covers every ARITH_OPERATORS value', () => {
    expect(values(RULE_BUILDER_GRAMMAR.arithOperators).sort()).toEqual(
      [...ARITH_OPERATORS].sort(),
    );
  });

  it('gives every option a non-empty label', () => {
    const allOptions = Object.values(RULE_BUILDER_GRAMMAR).flat();
    for (const option of allOptions) {
      expect(option.label.length).toBeGreaterThan(0);
    }
  });
});
