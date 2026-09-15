import { describe, expect, it } from '@jest/globals';
import {
  getIndicatorSubFieldNames,
  INDICATOR_SUBFIELDS,
} from './indicator-subfields.js';
import { validateIndicatorOperand } from './indicator-operand-validation.js';

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

/**
 * Le type des paramètres, troisième contrôle de la porte.
 *
 * L'incident : un formulaire web renvoie une chaîne même pour un champ
 * numérique, et `{ name: 'ema', period: '20' }` était déclaré valide par cette
 * fonction, donc par `POST /exchanges/strategies/validate`. Le moteur calculait
 * alors `2 / ("20" + 1)` — un lissage dix fois trop long sur un signal que rien
 * n'accusait.
 */
describe('validateIndicatorOperand — parameter types', () => {
  it('accepts a parameter that carries the declared type', () => {
    expect(validateIndicatorOperand({ name: 'ema', period: 20 })).toBeNull();
  });

  // La régression elle-même.
  it('rejects a numeric string where the registry declares a number', () => {
    const issue = validateIndicatorOperand({ name: 'ema', period: '20' });

    expect(issue?.code).toBe('INVALID_INDICATOR_PARAM');
    expect(issue?.parameter).toBe('period');
    // Le message doit distinguer "20" de 20, sans quoi il serait illisible.
    expect(issue?.message).toContain('"20" (string)');
  });

  /**
   * `JSON.stringify({ period: NaN })` écrit `{"period":null}` : une valeur
   * calculée de travers arrive donc `null` après un aller-retour en base.
   */
  it('rejects a number that is not finite, and the null it becomes in JSON', () => {
    expect(validateIndicatorOperand({ name: 'ema', period: NaN })?.code).toBe(
      'INVALID_INDICATOR_PARAM',
    );
    expect(validateIndicatorOperand({ name: 'ema', period: null })?.code).toBe(
      'INVALID_INDICATOR_PARAM',
    );
  });

  // Absent ≠ invalide : `resolveIndicatorParams` applique le défaut du registre.
  it('accepts an operand that omits its parameters entirely', () => {
    expect(validateIndicatorOperand({ name: 'ema' })).toBeNull();
    expect(validateIndicatorOperand({ name: 'macd', subField: 'signal' })).toBeNull();
  });

  it('names the offending parameter among several', () => {
    const issue = validateIndicatorOperand({
      name: 'macd',
      subField: 'signal',
      fastPeriod: 12,
      slowPeriod: '26',
      signalPeriod: 9,
    });

    expect(issue?.parameter).toBe('slowPeriod');
  });

  /**
   * L'itération porte sur les paramètres *déclarés*, jamais sur les clés
   * reçues : une clé inconnue vient probablement d'un bot plus récent, et la
   * refuser ferait échouer un client en retard sur son propre serveur.
   */
  it('ignores a key the registry does not declare as a parameter', () => {
    expect(validateIndicatorOperand({ name: 'ema', period: 9, smoothing: 'wilder' })).toBeNull();
    // `type` et `offset` accompagnent tout opérande sans être des paramètres.
    expect(
      validateIndicatorOperand({ name: 'ema', type: 'indicator', offset: 2, period: 9 }),
    ).toBeNull();
  });

  describe('a parameter declared as a select', () => {
    it('accepts a declared option', () => {
      expect(
        validateIndicatorOperand({ name: 'pivotpoints', subField: 'r1', pivotType: 'standard' }),
      ).toBeNull();
    });

    /**
     * Délibérément accepté : ajouter une option est une évolution de catalogue
     * qu'une copie compilée plus ancienne refuserait à tort. Le verdict
     * d'appartenance appartient au serveur, pas à cette fonction.
     */
    it('accepts a value its own build does not list, being a catalogue matter', () => {
      expect(
        validateIndicatorOperand({ name: 'pivotpoints', subField: 'r1', pivotType: 'demark' }),
      ).toBeNull();
    });

    // Le genre, lui, ne dépend d'aucun catalogue.
    it('rejects a value of the wrong kind', () => {
      const issue = validateIndicatorOperand({
        name: 'pivotpoints',
        subField: 'r1',
        pivotType: 42,
      });

      expect(issue?.code).toBe('INVALID_INDICATOR_PARAM');
      expect(issue?.parameter).toBe('pivotType');
    });
  });

  // L'ordre des trois contrôles est un contrat : un nom faux rend les
  // paramètres injugeables, une ligne ambiguë prime sur un type de paramètre.
  describe('order of the three checks', () => {
    it('reports the unknown name before anything else', () => {
      expect(validateIndicatorOperand({ name: 'vwap', period: '20' })?.code).toBe(
        'UNKNOWN_INDICATOR',
      );
    });

    it('reports the ambiguous line before a malformed parameter', () => {
      expect(validateIndicatorOperand({ name: 'macd', slowPeriod: '26' })?.code).toBe(
        'MISSING_SUBFIELD',
      );
    });
  });
});
