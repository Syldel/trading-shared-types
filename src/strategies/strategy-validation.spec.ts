import { describe, expect, it } from '@jest/globals';
import type { IExchangePair } from '../exchange/exchange-config.interface.js';
import {
  collectExecutableStrategyRulesIssues,
  collectExpressionIssues,
  collectPairIssues,
  collectRuleTreeIssues,
  collectStrategyRulesIssues,
  toStrategyValidationResult,
  type StrategyValidationIssue,
} from './strategy-validation.js';

describe('collectRuleTreeIssues', () => {
  it('reports the path of the faulty operand in a nested tree', () => {
    const tree = {
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
          type: 'comparison',
          operator: 'GT',
          left: { type: 'indicator', name: 'adx', period: 14 },
          right: { type: 'number', value: 25 },
        },
      ],
    };

    const issues = collectRuleTreeIssues(tree, 'entry');

    expect(issues).toHaveLength(1);
    expect(issues[0]!.code).toBe('MISSING_SUBFIELD');
    expect(issues[0]!.path).toBe('entry.conditions[1].left');
  });

  it('inspects trend node targets', () => {
    const issues = collectRuleTreeIssues(
      {
        type: 'trend',
        direction: 'UP',
        period: 5,
        target: { type: 'indicator', name: 'macd' },
      },
      'exit',
    );

    expect(issues[0]!.path).toBe('exit.target');
    expect(issues[0]!.code).toBe('MISSING_SUBFIELD');
  });

  it('ignores non-indicator operands', () => {
    const issues = collectRuleTreeIssues({
      type: 'comparison',
      operator: 'GT',
      left: { type: 'price', field: 'close' },
      right: { type: 'number', value: 10 },
    });

    expect(issues).toEqual([]);
  });

  it('returns nothing for a fully explicit tree', () => {
    const issues = collectRuleTreeIssues({
      type: 'comparison',
      operator: 'GT',
      left: { type: 'indicator', name: 'adx', period: 14, subField: 'adx' },
      right: { type: 'number', value: 25 },
    });

    expect(issues).toEqual([]);
  });

  // Validation structurelle : la portée du dispositif a été étendue au-delà
  // des opérandes indicateur, pour rejeter un payload malformé avant qu'il
  // n'atteigne le moteur (voir StrategyEngineService, chemin ordres, dans
  // nest-trading-bot).
  describe('structural validation', () => {
    it('reports a missing node', () => {
      const issues = collectRuleTreeIssues(undefined, 'entry');
      expect(issues).toEqual([
        { path: 'entry', code: 'MISSING_NODE', message: expect.any(String) },
      ]);
    });

    it('rejects an unknown node type', () => {
      const issues = collectRuleTreeIssues({ type: 'xor' }, 'entry');
      expect(issues[0]!.code).toBe('UNKNOWN_NODE_TYPE');
    });

    it('rejects an unknown logical operator', () => {
      const issues = collectRuleTreeIssues(
        {
          type: 'logical',
          operator: 'XOR',
          conditions: [
            {
              type: 'comparison',
              operator: 'GT',
              left: { type: 'price', field: 'close' },
              right: { type: 'number', value: 1 },
            },
          ],
        },
        'entry',
      );
      expect(issues.map((i) => i.code)).toContain('UNKNOWN_LOGICAL_OPERATOR');
    });

    it('rejects a logical group with empty conditions', () => {
      const issues = collectRuleTreeIssues(
        { type: 'logical', operator: 'AND', conditions: [] },
        'entry',
      );
      expect(issues).toEqual([
        {
          path: 'entry',
          code: 'EMPTY_LOGICAL_CONDITIONS',
          message: expect.any(String),
        },
      ]);
    });

    it('rejects an unknown comparison operator', () => {
      const issues = collectRuleTreeIssues(
        {
          type: 'comparison',
          operator: 'NEQ',
          left: { type: 'price', field: 'close' },
          right: { type: 'number', value: 1 },
        },
        'entry',
      );
      expect(issues.map((i) => i.code)).toContain('UNKNOWN_COMPARISON_OPERATOR');
    });

    it('reports a missing operand', () => {
      const issues = collectRuleTreeIssues(
        {
          type: 'comparison',
          operator: 'GT',
          left: undefined,
          right: { type: 'number', value: 1 },
        },
        'entry',
      );
      expect(issues).toEqual([
        {
          path: 'entry.left',
          code: 'MISSING_OPERAND',
          message: expect.any(String),
        },
      ]);
    });

    it('rejects an unknown operand type', () => {
      const issues = collectRuleTreeIssues(
        {
          type: 'comparison',
          operator: 'GT',
          left: { type: 'wallet-balance' },
          right: { type: 'number', value: 1 },
        },
        'entry',
      );
      expect(issues.map((i) => i.code)).toContain('UNKNOWN_OPERAND_TYPE');
    });

    it('rejects an unknown price field', () => {
      const issues = collectRuleTreeIssues(
        {
          type: 'comparison',
          operator: 'GT',
          left: { type: 'price', field: 'openInterest' },
          right: { type: 'number', value: 1 },
        },
        'entry',
      );
      expect(issues.map((i) => i.code)).toContain('INVALID_PRICE_FIELD');
    });

    it.each([-1, 1.5, 'foo', NaN])(
      'rejects an invalid price offset (%p)',
      (offset) => {
        const issues = collectRuleTreeIssues(
          {
            type: 'comparison',
            operator: 'GT',
            left: { type: 'price', field: 'close', offset },
            right: { type: 'number', value: 1 },
          },
          'entry',
        );
        expect(issues.map((i) => i.code)).toContain('INVALID_OFFSET');
      },
    );

    it('accepts an explicit zero or positive integer price offset', () => {
      for (const offset of [0, 1, 20]) {
        const issues = collectRuleTreeIssues({
          type: 'comparison',
          operator: 'GT',
          left: { type: 'price', field: 'close', offset },
          right: { type: 'number', value: 1 },
        });
        expect(issues).toEqual([]);
      }
    });

    it.each([-1, 1.5, 'foo'])(
      'rejects an invalid indicator offset (%p)',
      (offset) => {
        const issues = collectRuleTreeIssues(
          {
            type: 'comparison',
            operator: 'GT',
            left: { type: 'indicator', name: 'ema', period: 9, offset },
            right: { type: 'number', value: 1 },
          },
          'entry',
        );
        expect(issues.map((i) => i.code)).toContain('INVALID_OFFSET');
      },
    );

    it('accepts an explicit zero or positive integer indicator offset', () => {
      const issues = collectRuleTreeIssues({
        type: 'comparison',
        operator: 'GT',
        left: { type: 'indicator', name: 'ema', period: 9, offset: 3 },
        right: { type: 'number', value: 1 },
      });
      expect(issues).toEqual([]);
    });

    it('rejects a non-finite number operand', () => {
      const issues = collectRuleTreeIssues(
        {
          type: 'comparison',
          operator: 'GT',
          left: { type: 'price', field: 'close' },
          right: { type: 'number', value: NaN },
        },
        'entry',
      );
      expect(issues.map((i) => i.code)).toContain('INVALID_NUMBER_OPERAND');
    });

    it('rejects an unknown trend direction', () => {
      const issues = collectRuleTreeIssues(
        {
          type: 'trend',
          direction: 'SIDEWAYS',
          period: 5,
          target: { type: 'price', field: 'close' },
        },
        'entry',
      );
      expect(issues.map((i) => i.code)).toContain('UNKNOWN_TREND_DIRECTION');
    });

    // Un `period` <= 0 rendrait la boucle du moteur vacuously true : la
    // condition serait toujours vraie. Voir StrategyEngineService.evaluateNode
    // dans nest-trading-bot.
    it.each([0, -1, 1.5, undefined])(
      'rejects an invalid trend period (%p)',
      (period) => {
        const issues = collectRuleTreeIssues(
          {
            type: 'trend',
            direction: 'UP',
            period,
            target: { type: 'price', field: 'close' },
          },
          'entry',
        );
        expect(issues.map((i) => i.code)).toContain('INVALID_TREND_PERIOD');
      },
    );

    it('accepts an absent trend mode (defaults to STRICT) and each explicit mode', () => {
      for (const mode of [undefined, 'STRICT', 'SOFT', 'NET']) {
        const issues = collectRuleTreeIssues({
          type: 'trend',
          direction: 'UP',
          period: 5,
          mode,
          target: { type: 'price', field: 'close' },
        });
        expect(issues).toEqual([]);
      }
    });

    it('rejects an unknown trend mode', () => {
      const issues = collectRuleTreeIssues(
        {
          type: 'trend',
          direction: 'UP',
          period: 5,
          mode: 'LOOSE',
          target: { type: 'price', field: 'close' },
        },
        'entry',
      );
      expect(issues.map((i) => i.code)).toContain('UNKNOWN_TREND_MODE');
    });

    describe('"not" node', () => {
      it('recurses into the wrapped condition and reports issues at .condition', () => {
        const issues = collectRuleTreeIssues(
          {
            type: 'not',
            condition: {
              type: 'comparison',
              operator: 'GT',
              left: { type: 'indicator', name: 'adx' },
              right: { type: 'number', value: 25 },
            },
          },
          'entry',
        );
        expect(issues).toHaveLength(1);
        expect(issues[0]!.code).toBe('MISSING_SUBFIELD');
        expect(issues[0]!.path).toBe('entry.condition.left');
      });

      it('reports a missing condition', () => {
        const issues = collectRuleTreeIssues({ type: 'not' }, 'entry');
        expect(issues).toEqual([
          {
            path: 'entry.condition',
            code: 'MISSING_NODE',
            message: expect.any(String),
          },
        ]);
      });

      it('accepts a well-formed wrapped condition', () => {
        const issues = collectRuleTreeIssues({
          type: 'not',
          condition: {
            type: 'comparison',
            operator: 'GT',
            left: { type: 'price', field: 'close' },
            right: { type: 'number', value: 1 },
          },
        });
        expect(issues).toEqual([]);
      });
    });

    describe('"cross" node', () => {
      it('rejects an unknown cross direction', () => {
        const issues = collectRuleTreeIssues(
          {
            type: 'cross',
            direction: 'SIDEWAYS',
            left: { type: 'indicator', name: 'ema', period: 9 },
            right: { type: 'indicator', name: 'ema', period: 20 },
          },
          'entry',
        );
        expect(issues.map((i) => i.code)).toContain('UNKNOWN_CROSS_DIRECTION');
      });

      it('inspects both operands', () => {
        const issues = collectRuleTreeIssues(
          {
            type: 'cross',
            direction: 'UP',
            left: { type: 'indicator', name: 'adx' },
            right: { type: 'indicator', name: 'macd' },
          },
          'entry',
        );
        expect(issues.map((i) => i.path)).toEqual([
          'entry.left',
          'entry.right',
        ]);
      });

      it('accepts a well-formed cross node', () => {
        const issues = collectRuleTreeIssues({
          type: 'cross',
          direction: 'ANY',
          left: { type: 'indicator', name: 'ema', period: 9 },
          right: { type: 'indicator', name: 'ema', period: 20 },
        });
        expect(issues).toEqual([]);
      });
    });

    describe('"constant" node', () => {
      it.each([undefined, 'true', 1, null])(
        'rejects a non-boolean value (%p)',
        (value) => {
          const issues = collectRuleTreeIssues(
            { type: 'constant', value },
            'entry',
          );
          expect(issues).toEqual([
            {
              path: 'entry',
              code: 'INVALID_CONSTANT_VALUE',
              message: expect.any(String),
            },
          ]);
        },
      );

      it.each([true, false])('accepts a boolean value (%p)', (value) => {
        expect(collectRuleTreeIssues({ type: 'constant', value })).toEqual([]);
      });
    });

    describe('"arith" operand', () => {
      it('rejects an unknown arithmetic operator', () => {
        const issues = collectRuleTreeIssues(
          {
            type: 'comparison',
            operator: 'GT',
            left: { type: 'price', field: 'close' },
            right: {
              type: 'arith',
              operator: 'MOD',
              left: { type: 'number', value: 1 },
              right: { type: 'number', value: 2 },
            },
          },
          'entry',
        );
        expect(issues.map((i) => i.code)).toContain('UNKNOWN_ARITH_OPERATOR');
      });

      it('recurses into both sides, reporting the nested path', () => {
        const issues = collectRuleTreeIssues(
          {
            type: 'comparison',
            operator: 'GT',
            left: { type: 'price', field: 'close' },
            right: {
              type: 'arith',
              operator: 'ADD',
              left: { type: 'indicator', name: 'ema', period: 20 },
              right: { type: 'indicator', name: 'adx' }, // missing subField
            },
          },
          'entry',
        );
        expect(issues).toHaveLength(1);
        expect(issues[0]!.code).toBe('MISSING_SUBFIELD');
        expect(issues[0]!.path).toBe('entry.right.right');
      });

      it('accepts a well-formed nested arithmetic expression', () => {
        const issues = collectRuleTreeIssues({
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
        });
        expect(issues).toEqual([]);
      });

      // Protège le chemin bougie d'un arbre pathologique : voir MAX_ARITH_DEPTH.
      it('rejects arithmetic expressions nested beyond the maximum depth', () => {
        let deeplyNested: unknown = { type: 'number', value: 1 };
        for (let i = 0; i < 10; i++) {
          deeplyNested = {
            type: 'arith',
            operator: 'ADD',
            left: deeplyNested,
            right: { type: 'number', value: 1 },
          };
        }

        const issues = collectRuleTreeIssues({
          type: 'comparison',
          operator: 'GT',
          left: { type: 'price', field: 'close' },
          right: deeplyNested,
        });

        expect(issues.map((i) => i.code)).toContain('ARITH_TOO_DEEP');
      });
    });

    describe('"transform" operand', () => {
      it('rejects an unknown transform kind', () => {
        const issues = collectRuleTreeIssues(
          {
            type: 'comparison',
            operator: 'LT',
            left: {
              type: 'transform',
              kind: 'bogus',
              period: 200,
              source: { type: 'indicator', name: 'bbw', period: 20 },
            },
            right: { type: 'number', value: 20 },
          },
          'entry',
        );
        expect(issues.map((i) => i.code)).toContain('INVALID_TRANSFORM_KIND');
      });

      it.each([0, 1, -5, 1.5, NaN, 'ten', null])(
        'rejects an invalid period when provided (%p)',
        (period) => {
          const issues = collectRuleTreeIssues(
            {
              type: 'comparison',
              operator: 'LT',
              left: {
                type: 'transform',
                kind: 'zscore',
                period,
                source: { type: 'indicator', name: 'bbw', period: 20 },
              },
              right: { type: 'number', value: -1 },
            },
            'entry',
          );
          expect(issues.map((i) => i.code)).toContain('INVALID_TRANSFORM_PERIOD');
        },
      );

      it('accepts an omitted period (resolved later from TRANSFORM_REGISTRY)', () => {
        const issues = collectRuleTreeIssues({
          type: 'comparison',
          operator: 'LT',
          left: {
            type: 'transform',
            kind: 'percentile',
            source: { type: 'indicator', name: 'bbw', period: 20 },
          },
          right: { type: 'number', value: 20 },
        });
        expect(issues).toEqual([]);
      });

      it('rejects an invalid offset', () => {
        const issues = collectRuleTreeIssues(
          {
            type: 'comparison',
            operator: 'LT',
            left: {
              type: 'transform',
              kind: 'zscore',
              period: 200,
              offset: -1,
              source: { type: 'indicator', name: 'bbw', period: 20 },
            },
            right: { type: 'number', value: -1 },
          },
          'entry',
        );
        expect(issues.map((i) => i.code)).toContain('INVALID_OFFSET');
      });

      it('recurses into "source", reporting the nested path', () => {
        const issues = collectRuleTreeIssues(
          {
            type: 'comparison',
            operator: 'LT',
            left: {
              type: 'transform',
              kind: 'zscore',
              period: 200,
              source: { type: 'indicator', name: 'adx' }, // missing subField
            },
            right: { type: 'number', value: -1 },
          },
          'entry',
        );
        expect(issues).toHaveLength(1);
        expect(issues[0]!.code).toBe('MISSING_SUBFIELD');
        expect(issues[0]!.path).toBe('entry.left.source');
      });

      it('accepts a well-formed transform composed on another transform (e.g. ZScore of a Slope)', () => {
        const issues = collectRuleTreeIssues({
          type: 'comparison',
          operator: 'LT',
          left: {
            type: 'transform',
            kind: 'zscore',
            period: 200,
            source: {
              type: 'transform',
              kind: 'slope',
              period: 20,
              source: { type: 'indicator', name: 'ema', period: 50 },
            },
          },
          right: { type: 'number', value: -1 },
        });
        expect(issues).toEqual([]);
      });

      // Protège le chemin bougie d'un arbre pathologique : voir MAX_OPERAND_DEPTH.
      it('rejects transform expressions nested beyond the maximum depth', () => {
        let deeplyNested: unknown = { type: 'indicator', name: 'sma', period: 20 };
        for (let i = 0; i < 10; i++) {
          deeplyNested = {
            type: 'transform',
            kind: 'zscore',
            period: 200,
            source: deeplyNested,
          };
        }

        const issues = collectRuleTreeIssues({
          type: 'comparison',
          operator: 'LT',
          left: deeplyNested,
          right: { type: 'number', value: -1 },
        });

        expect(issues.map((i) => i.code)).toContain('TRANSFORM_TOO_DEEP');
      });
    });

    it('does not flag an absent optional field as a missing node', () => {
      // `exit` est une absence légitime (optionnel dans `SideRules`) : c'est
      // aux call sites de ne pas appeler `collectRuleTreeIssues` dessus, pas à
      // la fonction de les tolérer en silence.
      expect(
        collectStrategyRulesIssues({
          long: {
            entry: {
              type: 'logical',
              operator: 'AND',
              conditions: [
                {
                  type: 'comparison',
                  operator: 'GT',
                  left: { type: 'price', field: 'close' },
                  right: { type: 'number', value: 1 },
                },
              ],
            },
            // exit absent
          },
        }),
      ).toEqual([]);
    });
  });
});

describe('collectStrategyRulesIssues', () => {
  it('covers both sides and both entry and exit trees', () => {
    const issues = collectStrategyRulesIssues({
      long: {
        entry: {
          type: 'logical',
          operator: 'AND',
          conditions: [
            {
              type: 'comparison',
              operator: 'GT',
              left: { type: 'indicator', name: 'bb' },
              right: { type: 'number', value: 1 },
            },
          ],
        } as never,
        exit: {
          type: 'trend',
          direction: 'UP',
          period: 5,
          target: { type: 'indicator', name: 'stochrsi' },
        } as never,
      },
    });

    expect(issues.map((i: StrategyValidationIssue) => i.path)).toEqual([
      'rules.long.entry.conditions[0].left',
      'rules.long.exit.target',
    ]);
  });

  // Tolérant par conception : une stratégie codée en dur n'a aucune règle.
  it.each([undefined, null, {}])('tolerates an absent rule set (%p)', (rules) => {
    expect(collectStrategyRulesIssues(rules as never)).toEqual([]);
  });
});

describe('collectExecutableStrategyRulesIssues', () => {
  // Sur le chemin d'exécution directe (backtest), l'absence de règles est un
  // rejet explicite plutôt qu'une réponse vide silencieuse.
  it.each([undefined, null, {}])('rejects an empty rule set (%p)', (rules) => {
    expect(collectExecutableStrategyRulesIssues(rules as never)).toEqual([
      {
        path: 'rules',
        code: 'EMPTY_STRATEGY_RULES',
        message: expect.any(String),
      },
    ]);
  });

  it('validates the trees once at least one side is present', () => {
    const issues = collectExecutableStrategyRulesIssues({
      short: {
        entry: {
          type: 'comparison',
          operator: 'GT',
          left: { type: 'indicator', name: 'adx' },
          right: { type: 'number', value: 25 },
        } as never,
      },
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]!.code).toBe('MISSING_SUBFIELD');
    expect(issues[0]!.path).toBe('rules.short.entry.left');
  });
});

describe('collectPairIssues', () => {
  const pairWith = (strategy: unknown): IExchangePair =>
    ({
      name: 'BTC',
      ratio: 1,
      interval: '60',
      strategy,
    }) as IExchangePair;

  it('reports an ambiguous protective order anchor', () => {
    const issues = collectPairIssues(
      pairWith({
        name: 'Advanced',
        shortname: 'advanced-rules',
        protective: {
          enabled: true,
          entries: [
            {
              tpsl: 'sl',
              anchor: { source: 'INDICATOR', name: 'keltner' },
              atrMultiplier: 1,
              sizePercent: 100,
            },
          ],
        },
      }),
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]!.code).toBe('MISSING_SUBFIELD');
    expect(issues[0]!.path).toBe('BTC.strategy.protective.entries[0].anchor');
  });

  it('ignores non-indicator anchors', () => {
    const issues = collectPairIssues(
      pairWith({
        name: 'Advanced',
        shortname: 'advanced-rules',
        latent: {
          enabled: true,
          entries: [
            {
              side: 'LONG',
              orderType: 'limit',
              anchor: { source: 'MARKET' },
              atrMultiplier: 1,
              sizePercent: 100,
            },
          ],
        },
      }),
    );

    expect(issues).toEqual([]);
  });

  it('inspects the rule trees', () => {
    const issues = collectPairIssues(
      pairWith({
        name: 'Advanced',
        shortname: 'advanced-rules',
        rules: {
          long: {
            entry: {
              type: 'comparison',
              operator: 'GT',
              left: { type: 'indicator', name: 'supertrend' },
              right: { type: 'number', value: 0 },
            },
          },
        },
      }),
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]!.path).toBe('BTC.strategy.rules.long.entry.left');
  });

  it('returns nothing for a pair without strategy', () => {
    expect(collectPairIssues(pairWith(undefined))).toEqual([]);
  });

  // Une strategie codee en dur (tol-langit & co) n'a legitimement aucune
  // regle : son absence ne doit pas ecarter la paire du trading.
  it('tolerates a strategy carrying no rules at all', () => {
    const issues = collectPairIssues(
      pairWith({
        name: 'Tol Langit',
        shortname: 'tol-langit-atr-v7-pro',
      }),
    );

    expect(issues).toEqual([]);
  });

  it('tolerates a side with only an entry configured', () => {
    const issues = collectPairIssues(
      pairWith({
        name: 'Advanced',
        shortname: 'advanced-rules',
        rules: {
          long: {
            entry: {
              type: 'comparison',
              operator: 'GT',
              left: { type: 'price', field: 'close' },
              right: { type: 'number', value: 0 },
            },
          },
        },
      }),
    );

    expect(issues).toEqual([]);
  });

  // `settings` est volontairement hors du perimetre fail-closed tant qu'aucun
  // consommateur ne le lit : un reglage inerte ne doit pas couper le trading.
  it('ignores settings entirely', () => {
    const issues = collectPairIssues(
      pairWith({
        name: 'Tol Langit',
        shortname: 'tol-langit-atr-v7-pro',
        settings: { atrPeriod: 14, useAdaptiveMultiplier: true },
      }),
    );

    expect(issues).toEqual([]);
  });

  it('tolerates a latent/protective entry without a condition (always applies)', () => {
    const issues = collectPairIssues(
      pairWith({
        name: 'Advanced',
        shortname: 'advanced-rules',
        latent: {
          enabled: true,
          entries: [
            {
              side: 'LONG',
              orderType: 'limit',
              anchor: { source: 'MARKET' },
              atrMultiplier: 1,
              sizePercent: 100,
              // condition absente
            },
          ],
        },
      }),
    );

    expect(issues).toEqual([]);
  });
});

describe('toStrategyValidationResult', () => {
  it('reports valid: true and no issues for an empty set', () => {
    expect(toStrategyValidationResult([])).toEqual({
      valid: true,
      issues: [],
    });
  });

  it('reports valid: false and strips indicator/subField from each issue', () => {
    const result = toStrategyValidationResult([
      {
        path: 'strategy.long.entry.left',
        code: 'MISSING_SUBFIELD',
        message: 'Indicator "adx" requires an explicit subField.',
        indicator: { name: 'adx' },
        subField: undefined,
        allowed: ['adx', 'pdi', 'mdi'],
      },
    ]);

    expect(result).toEqual({
      valid: false,
      issues: [
        {
          path: 'strategy.long.entry.left',
          code: 'MISSING_SUBFIELD',
          message: 'Indicator "adx" requires an explicit subField.',
          allowed: ['adx', 'pdi', 'mdi'],
        },
      ],
    });
  });
});

describe('collectExpressionIssues', () => {
  it('returns nothing for an absent or empty list', () => {
    expect(collectExpressionIssues(undefined)).toEqual([]);
    expect(collectExpressionIssues(null)).toEqual([]);
    expect(collectExpressionIssues([])).toEqual([]);
  });

  it('accepts a well-formed expression without an id', () => {
    const issues = collectExpressionIssues([
      { operand: { type: 'indicator', name: 'ema', period: 9 } },
    ]);
    expect(issues).toEqual([]);
  });

  it('accepts a well-formed expression with an explicit id', () => {
    const issues = collectExpressionIssues([
      {
        id: 'myTrendZone',
        operand: {
          type: 'transform',
          kind: 'percentile',
          period: 200,
          source: { type: 'indicator', name: 'bbw', period: 20 },
        },
      },
    ]);
    expect(issues).toEqual([]);
  });

  it.each([1, '', true, {}])(
    'rejects a non-empty-string id (%p)',
    (id) => {
      const issues = collectExpressionIssues([
        { id, operand: { type: 'indicator', name: 'ema', period: 9 } },
      ]);
      expect(issues).toHaveLength(1);
      expect(issues[0]!.code).toBe('INVALID_EXPRESSION_ID');
      expect(issues[0]!.path).toBe('expressions[0].id');
    },
  );

  it('reports a structurally invalid operand at the nested "operand" path', () => {
    const issues = collectExpressionIssues([
      { operand: { type: 'indicator', name: 'adx', period: 14 } }, // missing subField
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.code).toBe('MISSING_SUBFIELD');
    expect(issues[0]!.path).toBe('expressions[0].operand');
  });

  it('does not compute a duplicate-key check for an expression whose operand is already invalid', () => {
    // Un deuxième opérande identique et VALIDE ne doit pas être signalé comme
    // doublon d'un premier opérande invalide : ce dernier n'a jamais atteint
    // le calcul de clé.
    const issues = collectExpressionIssues([
      { operand: { type: 'indicator', name: 'adx', period: 14 } }, // invalide (subField manquant)
      { operand: { type: 'indicator', name: 'ema', period: 9 } }, // valide, unique
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.code).toBe('MISSING_SUBFIELD');
  });

  it('flags two expressions sharing the same explicit id', () => {
    const issues = collectExpressionIssues([
      { id: 'dup', operand: { type: 'indicator', name: 'ema', period: 9 } },
      { id: 'dup', operand: { type: 'indicator', name: 'sma', period: 20 } },
    ]);

    expect(issues).toHaveLength(2);
    expect(issues.map((i) => i.code)).toEqual([
      'DUPLICATE_EXPRESSION_KEY',
      'DUPLICATE_EXPRESSION_KEY',
    ]);
    expect(issues.map((i) => i.path)).toEqual([
      'expressions[0]',
      'expressions[1]',
    ]);
  });

  it('flags two expressions whose operands resolve to the same computed key (no id on either)', () => {
    const issues = collectExpressionIssues([
      { operand: { type: 'indicator', name: 'ema', period: 9 } },
      { operand: { type: 'indicator', name: 'ema', period: 9 } },
    ]);

    expect(issues.map((i) => i.code)).toEqual([
      'DUPLICATE_EXPRESSION_KEY',
      'DUPLICATE_EXPRESSION_KEY',
    ]);
  });

  it('flags an explicit id colliding with another expression\'s computed key', () => {
    const issues = collectExpressionIssues([
      { id: 'ema_9', operand: { type: 'indicator', name: 'sma', period: 20 } },
      { operand: { type: 'indicator', name: 'ema', period: 9 } },
    ]);

    expect(issues.map((i) => i.code)).toEqual([
      'DUPLICATE_EXPRESSION_KEY',
      'DUPLICATE_EXPRESSION_KEY',
    ]);
  });

  it('does not flag distinct expressions (different ids, different operands)', () => {
    const issues = collectExpressionIssues([
      { id: 'a', operand: { type: 'indicator', name: 'ema', period: 9 } },
      { operand: { type: 'indicator', name: 'ema', period: 20 } },
      {
        operand: {
          type: 'transform',
          kind: 'zscore',
          period: 200,
          source: { type: 'indicator', name: 'atr', period: 14 },
        },
      },
    ]);
    expect(issues).toEqual([]);
  });
});
