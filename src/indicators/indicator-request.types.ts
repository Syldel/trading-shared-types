import type { PivotPointsType } from './indicator-series.types.js';

/**
 * Groupements de noms d'indicateurs par signature de paramètres
 */
export type SinglePeriodIndicatorName = 'ema' | 'sma' | 'hma' | 'rsi' | 'atr' | 'sd' | 'chop' | 'adx';
export type BollingerFamilyName = 'bb' | 'bbw' | 'bbp';

/**
 * Sous-ensemble de `SinglePeriodIndicatorName` réellement utilisable sans `subField`
 * dans `IndicatorOperand`.
 *
 * Un indicateur mono-période (period-only) qui expose plusieurs lignes calculées
 * (ex: ADX → adx/pdi/mdi) doit sortir de ce sous-ensemble et recevoir sa propre
 * branche dédiée dans `IndicatorOperand`, avec un `subField` listant ses lignes.
 * `SinglePeriodIndicatorName` (utilisé par `IndicatorRequest`) n'a pas cette
 * contrainte : il ne sert qu'à demander la série complète, jamais une ligne isolée.
 */
export type SinglePeriodOperandName = Exclude<SinglePeriodIndicatorName, 'adx'>;

/**
 * ============================================================================
 * 📈 INDICATOR REQUEST
 * Utilisé par le front-end pour demander le calcul de séries complètes
 * pour l'affichage des graphiques (Chart UI).
 * ============================================================================
 */
export type IndicatorRequest =
  | { name: SinglePeriodIndicatorName; period?: number }
  | { name: 'obv' }
  | { name: 'macd'; fastPeriod?: number; slowPeriod?: number; signalPeriod?: number }
  | { name: 'ichimoku'; conversionPeriod?: number; basePeriod?: number; spanPeriod?: number; displacement?: number }
  | { name: BollingerFamilyName; period?: number; stdDev?: number }
  | { name: 'supertrend'; period?: number; multiplier?: number }
  | { name: 'keltner'; period?: number; multiplier?: number }
  | { name: 'stochrsi'; rsiPeriod?: number; stochasticPeriod?: number; kPeriod?: number; dPeriod?: number }
  | { name: 'pivotpoints'; pivotType?: PivotPointsType };

/**
 * ============================================================================
 * ⚙️ INDICATOR OPERAND
 * Utilisé par le moteur de règles/stratégies.
 * Étend la logique des requêtes en y ajoutant le `subField` strict pour
 * sélectionner une ligne spécifique d'un indicateur complexe.
 *
 * Un indicateur multi-lignes ne désigne pas une valeur unique : `subField` y
 * est donc obligatoire (pas de ligne par défaut, jamais). Voir
 * `INDICATOR_SUBFIELDS` dans `indicator-subfields.ts`, source unique de ces
 * mêmes listes de lignes.
 * ============================================================================
 */
export type IndicatorOperand =
  | { name: SinglePeriodOperandName; period?: number; subField?: never }
  | { name: 'obv'; subField?: never }
  | { name: 'bbw' | 'bbp'; period?: number; stdDev?: number; subField?: never }
  | {
      name: 'adx';
      period?: number;
      subField: 'adx' | 'pdi' | 'mdi'
    }
  | {
      name: 'macd';
      fastPeriod?: number;
      slowPeriod?: number;
      signalPeriod?: number;
      subField: 'macd' | 'signal' | 'histogram'
    }
  | {
      name: 'ichimoku';
      conversionPeriod?: number;
      basePeriod?: number;
      spanPeriod?: number;
      displacement?: number;
      subField: 'conversion' | 'base' | 'spanA' | 'spanB'
    }
  | {
      name: 'bb';
      period?: number;
      stdDev?: number;
      subField: 'upper' | 'middle' | 'lower'
    }
  | {
      name: 'supertrend';
      period?: number;
      multiplier?: number;
      subField: 'supertrend' | 'direction'
    }
  | {
      name: 'keltner';
      period?: number;
      multiplier?: number;
      subField: 'upper' | 'middle' | 'lower'
    }
  | {
      name: 'stochrsi';
      rsiPeriod?: number;
      stochasticPeriod?: number;
      kPeriod?: number;
      dPeriod?: number;
      subField: 'k' | 'd' | 'stochRSI'
    }
  | {
      name: 'pivotpoints';
      pivotType?: PivotPointsType;
      subField: 'pivot' | 'r1' | 'r2' | 'r3' | 'r4' | 's1' | 's2' | 's3' | 's4';
    };

/**
 * Type utilitaire optionnel si tu as besoin de lister tous les noms d'indicateurs valides
 * (ex: pour des validations ou des itérations)
 */
export type IndicatorName = IndicatorRequest['name'];

/**
 * Constante runtime miroir de `IndicatorName`, dans le même esprit que
 * `PRICE_FIELDS`/`COMPARISON_OPERATORS` (strategy-engine.type.ts) : sert de
 * source à `isIndicatorName` sans dépendre de `INDICATOR_REGISTRY`
 * (indicator-registry.ts), qui a lui-même besoin de `indicator-subfields.ts`
 * — dépendre de `INDICATOR_REGISTRY` ici créerait un cycle. Ce fichier reste
 * une feuille sans dépendance vers le reste du dossier `indicators/`.
 */
export const INDICATOR_NAMES = [
  'ema',
  'sma',
  'hma',
  'rsi',
  'atr',
  'sd',
  'chop',
  'adx',
  'obv',
  'macd',
  'ichimoku',
  'bb',
  'bbw',
  'bbp',
  'supertrend',
  'keltner',
  'stochrsi',
  'pivotpoints',
] as const satisfies readonly IndicatorName[];