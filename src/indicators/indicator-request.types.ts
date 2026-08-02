import type { PivotPointsType } from './indicator-series.types.js';

/**
 * Groupements de noms d'indicateurs par signature de paramètres
 */
export type SinglePeriodIndicatorName = 'ema' | 'sma' | 'hma' | 'rsi' | 'atr' | 'sd' | 'chop' | 'adx';
export type BollingerFamilyName = 'bb' | 'bbw' | 'bbp';

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
 * ============================================================================
 */
export type IndicatorOperand =
  | { name: SinglePeriodIndicatorName; period?: number; subField?: never }
  | { name: 'obv'; subField?: never }
  | { name: 'bbw' | 'bbp'; period?: number; stdDev?: number; subField?: never }
  | {
      name: 'macd';
      fastPeriod?: number;
      slowPeriod?: number;
      signalPeriod?: number;
      subField?: 'macd' | 'signal' | 'histogram'
    }
  | {
      name: 'ichimoku';
      conversionPeriod?: number;
      basePeriod?: number;
      spanPeriod?: number;
      displacement?: number;
      subField?: 'conversion' | 'base' | 'spanA' | 'spanB' | 'chikou'
    }
  | {
      name: 'bb';
      period?: number;
      stdDev?: number;
      subField?: 'upper' | 'middle' | 'lower'
    }
  | {
      name: 'supertrend';
      period?: number;
      multiplier?: number;
      subField?: 'supertrend' | 'direction'
    }
  | {
      name: 'keltner';
      period?: number;
      multiplier?: number;
      subField?: 'upper' | 'middle' | 'lower'
    }
  | {
      name: 'stochrsi';
      rsiPeriod?: number;
      stochasticPeriod?: number;
      kPeriod?: number;
      dPeriod?: number;
      subField?: 'k' | 'd' | 'stochRSI'
    }
  | {
      name: 'pivotpoints';
      pivotType?: PivotPointsType;
      subField?: 'pivot' | 'r1' | 'r2' | 'r3' | 'r4' | 's1' | 's2' | 's3' | 's4';
    };

/**
 * Type utilitaire optionnel si tu as besoin de lister tous les noms d'indicateurs valides
 * (ex: pour des validations ou des itérations)
 */
export type IndicatorName = IndicatorRequest['name'];