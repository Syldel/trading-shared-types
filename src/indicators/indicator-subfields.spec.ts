import { describe, expect, it } from '@jest/globals';
import {
  getIndicatorSubFieldNames,
  INDICATOR_SUBFIELDS,
  isMultiLineIndicator,
  validateIndicatorOperand,
} from './indicator-subfields.js';

describe('INDICATOR_SUBFIELDS registry', () => {
  const multiLineNames = Object.keys(INDICATOR_SUBFIELDS);

  it('covers every multi-output indicator exposed by the engine', () => {
    expect(multiLineNames.sort()).toEqual(
      [
        'adx',
        'bb',
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

describe('validateIndicatorOperand', () => {
  it('accepts a multi-output indicator with an explicit valid line', () => {
    expect(validateIndicatorOperand({ name: 'adx', subField: 'pdi' })).toBeNull();
    expect(validateIndicatorOperand({ name: 'macd', subField: 'histogram' })).toBeNull();
  });

  it('accepts a single-output indicator with no subField', () => {
    expect(validateIndicatorOperand({ name: 'rsi' })).toBeNull();
    expect(validateIndicatorOperand({ name: 'obv' })).toBeNull();
  });

  // C'est le cas qui motive tout le dispositif : sans subField, `adx` peut
  // désigner 3 lignes différentes. Choisir la première produirait une valeur
  // plausible mais arbitraire, donc une erreur invisible.
  it.each(Object.keys(INDICATOR_SUBFIELDS))(
    'rejects "%s" when the subField is missing',
    (name) => {
      const issue = validateIndicatorOperand({ name });
      expect(issue?.code).toBe('MISSING_SUBFIELD');
      expect(issue?.allowed).toEqual(getIndicatorSubFieldNames(name as never));
    },
  );

  it('rejects a subField that belongs to another indicator', () => {
    // 'signal' existe sur macd, pas sur adx : l'ancienne allowlist globale
    // laissait passer ce cas, qui donnait ensuite `undefined` silencieusement.
    const issue = validateIndicatorOperand({ name: 'adx', subField: 'signal' });
    expect(issue?.code).toBe('UNKNOWN_SUBFIELD');
    expect(issue?.allowed).toEqual(['adx', 'pdi', 'mdi']);
  });

  it('rejects a misspelled subField', () => {
    expect(validateIndicatorOperand({ name: 'bb', subField: 'middel' })?.code).toBe(
      'UNKNOWN_SUBFIELD',
    );
  });

  it('rejects a subField on a single-output indicator', () => {
    const issue = validateIndicatorOperand({ name: 'rsi', subField: 'middle' });
    expect(issue?.code).toBe('UNEXPECTED_SUBFIELD');
  });

  it('rejects an unknown indicator name', () => {
    expect(validateIndicatorOperand({ name: 'vwap' })?.code).toBe('UNKNOWN_INDICATOR');
    expect(validateIndicatorOperand({})?.code).toBe('UNKNOWN_INDICATOR');
    expect(validateIndicatorOperand(null)?.code).toBe('UNKNOWN_INDICATOR');
  });

  it('produces a message naming the available lines', () => {
    const issue = validateIndicatorOperand({ name: 'ichimoku' });
    expect(issue?.message).toContain('conversion');
  });

  // `chikou` est le close d'une bougie future (lookahead) : disponible pour
  // l'affichage graphique (`IndicatorRequest`), jamais comme opérande de
  // règle. Une régression ici réintroduirait un signal calculé sur une
  // donnée que le live n'a pas encore.
  it('rejects "chikou" as a rule engine subField (lookahead)', () => {
    const issue = validateIndicatorOperand({ name: 'ichimoku', subField: 'chikou' });
    expect(issue?.code).toBe('UNKNOWN_SUBFIELD');
    expect(issue?.allowed).not.toContain('chikou');
  });
});
