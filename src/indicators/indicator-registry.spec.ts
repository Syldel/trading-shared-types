import { describe, expect, it } from '@jest/globals';
import { INDICATOR_NAMES } from './indicator-request.types.js';
import { INDICATOR_REGISTRY, AVAILABLE_INDICATORS_METADATA } from './indicator-registry.js';
import { INDICATOR_DEFAULTS, buildIndicatorKey } from './indicator-defaults.js';
import { INDICATOR_SUBFIELDS, getIndicatorSubFieldNames } from './indicator-subfields.js';

/**
 * Filet de régression : verrouille les valeurs exactes que
 * `INDICATOR_DEFAULTS` / `buildIndicatorKey` produisaient avant que ces deux
 * fonctions ne soient dérivées de `INDICATOR_REGISTRY` (auparavant un objet
 * et un switch écrits à la main). Un changement de valeur ici est un
 * changement de comportement observable pour tous les consommateurs
 * (nest-trading-bot, hyperliquid-mobile), pas un détail interne.
 */
describe('INDICATOR_REGISTRY', () => {
  it('has exactly one entry per known indicator name, with a matching `name` field', () => {
    expect(Object.keys(INDICATOR_REGISTRY).sort()).toEqual(
      [...INDICATOR_NAMES].sort(),
    );
    for (const name of INDICATOR_NAMES) {
      expect(INDICATOR_REGISTRY[name].name).toBe(name);
    }
  });

  it('only declares subFields for multi-line indicators, matching INDICATOR_SUBFIELDS exactly', () => {
    for (const name of INDICATOR_NAMES) {
      const expected = getIndicatorSubFieldNames(name);
      const actual = INDICATOR_REGISTRY[name].subFields?.map((f) => f.name) ?? [];
      expect(actual).toEqual(expected);

      if (name in INDICATOR_SUBFIELDS) {
        expect(INDICATOR_REGISTRY[name].subFields).toBeDefined();
      } else {
        expect(INDICATOR_REGISTRY[name].subFields).toBeUndefined();
      }
    }
  });
});

describe('AVAILABLE_INDICATORS_METADATA', () => {
  it('contains one entry per indicator, in INDICATOR_NAMES order', () => {
    expect(AVAILABLE_INDICATORS_METADATA.map((m) => m.name)).toEqual([
      ...INDICATOR_NAMES,
    ]);
  });
});

describe('INDICATOR_DEFAULTS (derived from INDICATOR_REGISTRY)', () => {
  it('matches the exact values in place before the registry-based derivation', () => {
    expect(INDICATOR_DEFAULTS).toEqual({
      ema: { period: 9 },
      sma: { period: 20 },
      hma: { period: 9 },
      rsi: { period: 14 },
      atr: { period: 14 },
      sd: { period: 14 },
      chop: { period: 14 },
      adx: { period: 14 },
      obv: {},
      macd: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
      ichimoku: {
        conversionPeriod: 9,
        basePeriod: 26,
        spanPeriod: 52,
        displacement: 26,
      },
      bb: { period: 20, stdDev: 2 },
      bbw: { period: 20, stdDev: 2 },
      bbp: { period: 20, stdDev: 2 },
      supertrend: { period: 10, multiplier: 3 },
      keltner: { period: 20, multiplier: 2 },
      stochrsi: { rsiPeriod: 14, stochasticPeriod: 14, kPeriod: 3, dPeriod: 3 },
      pivotpoints: { pivotType: 'standard' },
    });
  });
});

describe('buildIndicatorKey (derived from INDICATOR_REGISTRY parameter order)', () => {
  it('reproduces the exact key strings the previous hand-written switch produced', () => {
    expect(buildIndicatorKey('ema', { period: 9 })).toBe('ema_9');
    expect(buildIndicatorKey('sma', { period: 20 })).toBe('sma_20');
    expect(buildIndicatorKey('hma', { period: 9 })).toBe('hma_9');
    expect(buildIndicatorKey('rsi', { period: 14 })).toBe('rsi_14');
    expect(buildIndicatorKey('atr', { period: 14 })).toBe('atr_14');
    expect(buildIndicatorKey('sd', { period: 14 })).toBe('sd_14');
    expect(buildIndicatorKey('chop', { period: 14 })).toBe('chop_14');
    expect(buildIndicatorKey('adx', { period: 14 })).toBe('adx_14');
    expect(buildIndicatorKey('adx', { period: 14 }, 'pdi')).toBe('adx_14_pdi');
    expect(buildIndicatorKey('obv')).toBe('obv');

    expect(
      buildIndicatorKey('macd', {
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
      }),
    ).toBe('macd_12_26_9');
    expect(
      buildIndicatorKey(
        'macd',
        { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
        'signal',
      ),
    ).toBe('macd_12_26_9_signal');

    expect(
      buildIndicatorKey('ichimoku', {
        conversionPeriod: 9,
        basePeriod: 26,
        spanPeriod: 52,
        displacement: 26,
      }),
    ).toBe('ichimoku_9_26_52_26');

    expect(buildIndicatorKey('bb', { period: 20, stdDev: 2 })).toBe('bb_20_2');
    expect(buildIndicatorKey('bbw', { period: 20, stdDev: 2 })).toBe(
      'bbw_20_2',
    );
    expect(buildIndicatorKey('bbp', { period: 20, stdDev: 2 })).toBe(
      'bbp_20_2',
    );

    expect(
      buildIndicatorKey('supertrend', { period: 10, multiplier: 3 }),
    ).toBe('supertrend_10_3');
    expect(buildIndicatorKey('keltner', { period: 20, multiplier: 2 })).toBe(
      'keltner_20_2',
    );

    expect(buildIndicatorKey('pivotpoints', { pivotType: 'standard' })).toBe(
      'pivotpoints_standard',
    );

    expect(
      buildIndicatorKey('stochrsi', {
        rsiPeriod: 14,
        stochasticPeriod: 14,
        kPeriod: 3,
        dPeriod: 3,
      }),
    ).toBe('stochrsi_14_14_3_3');
  });

  it('falls back to INDICATOR_DEFAULTS for any omitted parameter', () => {
    expect(buildIndicatorKey('ema')).toBe('ema_9');
    expect(buildIndicatorKey('macd')).toBe('macd_12_26_9');
    expect(buildIndicatorKey('bb', { period: 25 })).toBe('bb_25_2');
  });
});
