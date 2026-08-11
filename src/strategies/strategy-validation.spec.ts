import { describe, expect, it } from '@jest/globals';
import type { IExchangePair } from '../exchange/exchange-config.interface.js';
import {
  collectExecutableStrategyRulesIssues,
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
