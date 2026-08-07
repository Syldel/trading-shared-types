import { describe, expect, it } from '@jest/globals';
import type { IExchangePair } from '../exchange/exchange-config.interface.js';
import {
  collectAdvancedParametersIssues,
  collectPairIssues,
  collectRuleTreeIssues,
  toStrategyValidationResult,
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

    it('does not flag an absent optional field as a missing node', () => {
      // `exit` (AdvancedStrategyParameters) et `default` (paramètre
      // rule-builder non configuré) sont des absences légitimes : c'est aux
      // call sites de ne pas appeler `collectRuleTreeIssues` dessus, pas à
      // la fonction de les tolérer en silence.
      expect(
        collectAdvancedParametersIssues({
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

describe('collectAdvancedParametersIssues', () => {
  it('covers both sides and both entry and exit trees', () => {
    const issues = collectAdvancedParametersIssues({
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

    expect(issues.map((i) => i.path)).toEqual([
      'parameters.long.entry.conditions[0].left',
      'parameters.long.exit.target',
    ]);
  });

  // Une stratégie sans long ni short n'a rien à évaluer : sur le chemin
  // d'exécution directe (backtest), c'est un rejet explicite plutôt qu'une
  // réponse vide silencieuse.
  it.each([undefined, null, {}])(
    'rejects an empty configuration (%p)',
    (parameters) => {
      const issues = collectAdvancedParametersIssues(parameters as never);
      expect(issues).toEqual([
        {
          path: 'parameters',
          code: 'EMPTY_STRATEGY_PARAMETERS',
          message: expect.any(String),
        },
      ]);
    },
  );
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

  it('inspects rule-builder parameters', () => {
    const issues = collectPairIssues(
      pairWith({
        name: 'Advanced',
        shortname: 'advanced-rules',
        parameters: [
          {
            id: 'long.entry',
            label: 'Long entry',
            type: 'rule-builder',
            default: {
              type: 'comparison',
              operator: 'GT',
              left: { type: 'indicator', name: 'supertrend' },
              right: { type: 'number', value: 0 },
            },
          },
        ],
      }),
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]!.path).toBe(
      'BTC.strategy.parameters[0](long.entry).left',
    );
  });

  it('returns nothing for a pair without strategy', () => {
    expect(collectPairIssues(pairWith(undefined))).toEqual([]);
  });

  it('tolerates an unconfigured rule-builder parameter (default: null)', () => {
    const issues = collectPairIssues(
      pairWith({
        name: 'Advanced',
        shortname: 'advanced-rules',
        parameters: [
          {
            id: 'long.entry',
            label: 'Long entry',
            type: 'rule-builder',
            default: null,
          },
        ],
      }),
    );

    expect(issues).toEqual([]);
  });

  it('rejects a rule-builder parameter id outside the long|short.entry|exit convention', () => {
    const issues = collectPairIssues(
      pairWith({
        name: 'Advanced',
        shortname: 'advanced-rules',
        parameters: [
          {
            id: 'long-entry',
            label: 'Long entry',
            type: 'rule-builder',
            default: {
              type: 'comparison',
              operator: 'GT',
              left: { type: 'price', field: 'close' },
              right: { type: 'number', value: 0 },
            },
          },
        ],
      }),
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]!.code).toBe('INVALID_RULE_BUILDER_ID');
    expect(issues[0]!.path).toBe('BTC.strategy.parameters[0](long-entry)');
  });

  it('rejects a configured exit without a matching entry on the same side', () => {
    const issues = collectPairIssues(
      pairWith({
        name: 'Advanced',
        shortname: 'advanced-rules',
        parameters: [
          {
            id: 'short.exit',
            label: 'Short exit',
            type: 'rule-builder',
            default: {
              type: 'comparison',
              operator: 'GT',
              left: { type: 'price', field: 'close' },
              right: { type: 'number', value: 0 },
            },
          },
        ],
      }),
    );

    expect(issues).toEqual([
      {
        path: 'BTC.strategy.short.entry',
        code: 'MISSING_NODE',
        message: expect.any(String),
      },
    ]);
  });

  it('tolerates a side with only an entry configured', () => {
    const issues = collectPairIssues(
      pairWith({
        name: 'Advanced',
        shortname: 'advanced-rules',
        parameters: [
          {
            id: 'long.entry',
            label: 'Long entry',
            type: 'rule-builder',
            default: {
              type: 'comparison',
              operator: 'GT',
              left: { type: 'price', field: 'close' },
              right: { type: 'number', value: 0 },
            },
          },
        ],
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
