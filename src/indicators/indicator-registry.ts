import type { IndicatorMetadata, IndicatorParameter, IndicatorSubField } from '../exchange/indicator-meta.type.js';
import { getIndicatorSubFields } from './indicator-subfields.js';
import type { MultiLineIndicatorName } from './indicator-subfields.js';
import { INDICATOR_NAMES } from './indicator-request.types.js';
import type { IndicatorName } from './indicator-request.types.js';

/**
 * ============================================================================
 * 📖 INDICATOR REGISTRY
 * Source unique par indicateur : libellé, overlay, paramètres (nom, libellé,
 * type, valeur par défaut) et lignes (`subFields`). Remplace la duplication
 * qui existait entre `INDICATOR_DEFAULTS` (indicator-defaults.ts) et la
 * métadonnée UI (`AVAILABLE_INDICATORS_METADATA`, jusqu'ici recopiée à la
 * main côté nest-trading-bot) : les deux sont désormais dérivées d'ici.
 *
 * `subFields` provient de `getIndicatorSubFields` (indicator-subfields.ts) —
 * pas de nouvelle copie des lignes, `INDICATOR_SUBFIELDS` y reste la source
 * canonique (son typage littéral est exploité par l'app mobile, voir
 * `indicator-default-styles.util.ts` côté hyperliquid-mobile).
 * ============================================================================
 */

/** Ajoute `subFields` uniquement pour un indicateur multi-lignes (jamais un tableau vide pour un mono-ligne). */
function withSubFields(
  name: MultiLineIndicatorName,
): { subFields: readonly IndicatorSubField[] } {
  return { subFields: getIndicatorSubFields(name) };
}

function numberParam(
  name: string,
  label: string,
  defaultValue: number,
): IndicatorParameter {
  return { type: 'number', name, label, defaultValue };
}

export const INDICATOR_REGISTRY: { [N in IndicatorName]: IndicatorMetadata } = {
  // =========================================================
  // INDICATEURS STANDARDS (Mono-Sortie / Période Unique)
  // =========================================================
  ema: {
    name: 'ema',
    label: 'Exponential Moving Average',
    overlay: true,
    parameters: [numberParam('period', 'Period', 9)],
  },
  sma: {
    name: 'sma',
    label: 'Simple Moving Average',
    overlay: true,
    parameters: [numberParam('period', 'Period', 20)],
  },
  hma: {
    name: 'hma',
    label: 'Hull Moving Average',
    overlay: true,
    parameters: [numberParam('period', 'Period', 9)],
  },
  rsi: {
    name: 'rsi',
    label: 'Relative Strength Index',
    overlay: false,
    parameters: [numberParam('period', 'Period', 14)],
  },
  atr: {
    name: 'atr',
    label: 'Average True Range',
    overlay: false,
    parameters: [numberParam('period', 'Period', 14)],
  },
  sd: {
    name: 'sd',
    label: 'Standard Deviation',
    overlay: false,
    parameters: [numberParam('period', 'Period', 14)],
  },
  chop: {
    name: 'chop',
    label: 'Choppiness Index',
    overlay: false,
    parameters: [numberParam('period', 'Period', 14)],
  },
  obv: {
    name: 'obv',
    label: 'On-Balance Volume',
    overlay: false,
    parameters: [],
  },

  // =========================================================
  // INDICATEURS COMPLEXES (Multi-Sorties / Multi-Paramètres)
  // =========================================================
  macd: {
    name: 'macd',
    label: 'MACD (Moving Average Convergence Divergence)',
    overlay: false,
    parameters: [
      numberParam('fastPeriod', 'Fast Period', 12),
      numberParam('slowPeriod', 'Slow Period', 26),
      numberParam('signalPeriod', 'Signal Period', 9),
    ],
    ...withSubFields('macd'),
  },
  adx: {
    name: 'adx',
    label: 'ADX / DMI (Average Directional Index)',
    overlay: false,
    parameters: [numberParam('period', 'Period', 14)],
    ...withSubFields('adx'),
  },
  ichimoku: {
    name: 'ichimoku',
    label: 'Ichimoku Cloud',
    overlay: true,
    parameters: [
      numberParam('conversionPeriod', 'Tenkan (Conversion)', 9),
      numberParam('basePeriod', 'Kijun (Base)', 26),
      numberParam('spanPeriod', 'Senkou Span B', 52),
      numberParam('displacement', 'Displacement (Chikou/Cloud)', 26),
    ],
    ...withSubFields('ichimoku'),
  },
  bb: {
    name: 'bb',
    label: 'Bollinger Bands',
    overlay: true,
    parameters: [
      numberParam('period', 'Period', 20),
      numberParam('stdDev', 'Standard Deviation', 2),
    ],
    ...withSubFields('bb'),
  },
  bbw: {
    name: 'bbw',
    label: 'Bollinger Band Width',
    overlay: false,
    parameters: [
      numberParam('period', 'Period', 20),
      numberParam('stdDev', 'Standard Deviation', 2),
    ],
  },
  bbp: {
    name: 'bbp',
    label: 'Bollinger %B',
    overlay: false,
    parameters: [
      numberParam('period', 'Period', 20),
      numberParam('stdDev', 'Standard Deviation', 2),
    ],
  },
  stochrsi: {
    name: 'stochrsi',
    label: 'Stochastic RSI',
    overlay: false,
    parameters: [
      numberParam('rsiPeriod', 'RSI Period', 14),
      numberParam('stochasticPeriod', 'Stochastic Period', 14),
      numberParam('kPeriod', 'K Period', 3),
      numberParam('dPeriod', 'D Period', 3),
    ],
    ...withSubFields('stochrsi'),
  },
  supertrend: {
    name: 'supertrend',
    label: 'Supertrend',
    overlay: true,
    parameters: [
      numberParam('period', 'Period', 10),
      numberParam('multiplier', 'Multiplier', 3),
    ],
    ...withSubFields('supertrend'),
  },
  keltner: {
    name: 'keltner',
    label: 'Keltner Channels',
    overlay: true,
    parameters: [
      numberParam('period', 'Period', 20),
      numberParam('multiplier', 'Multiplier', 2),
    ],
    ...withSubFields('keltner'),
  },
  pivotpoints: {
    name: 'pivotpoints',
    label: 'Pivot Points',
    overlay: true,
    parameters: [
      {
        type: 'select',
        name: 'pivotType',
        label: 'Type',
        defaultValue: 'standard',
        options: [
          { label: 'Standard', value: 'standard' },
          { label: 'Fibonacci', value: 'fibonacci' },
          { label: 'Camarilla', value: 'camarilla' },
          { label: 'Woodie', value: 'woodie' },
        ],
      },
    ],
    ...withSubFields('pivotpoints'),
  },
};

/**
 * Catalogue de métadonnées indicateurs, tel qu'exposé aux clients (formulaire
 * de règles, sélecteurs de graphique). Remplace `AVAILABLE_INDICATORS_METADATA`
 * qui vivait jusqu'ici dans nest-trading-bot
 * (`src/exchanges/advanced-rules.definition.ts`), recopiant à la main des
 * valeurs déjà présentes dans `INDICATOR_DEFAULTS`.
 */
export const AVAILABLE_INDICATORS_METADATA: IndicatorMetadata[] =
  INDICATOR_NAMES.map((name) => INDICATOR_REGISTRY[name]);
