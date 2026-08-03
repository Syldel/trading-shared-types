import type {
  IndicatorName,
  IndicatorOperand,
  IndicatorRequest,
} from './indicator-request.types.js';
import type { PivotPointsType } from './indicator-series.types.js';

/**
 * ============================================================================
 * ⚙️ INDICATOR DEFAULTS REGISTRY
 * Source unique des valeurs par défaut des paramètres d'indicateurs.
 * Toute clé d'indicateur (buildIndicatorKey) et tout calcul doit passer par
 * ce registre plutôt que de recopier des `?? 14` / `?? 20` locaux.
 * ============================================================================
 */

type SinglePeriodDefaults = { period: number };
type BollingerFamilyDefaults = { period: number; stdDev: number };

type IndicatorDefaultsFor<N extends IndicatorName> = N extends 'macd'
  ? { fastPeriod: number; slowPeriod: number; signalPeriod: number }
  : N extends 'ichimoku'
    ? {
        conversionPeriod: number;
        basePeriod: number;
        spanPeriod: number;
        displacement: number;
      }
    : N extends 'bb' | 'bbw' | 'bbp'
      ? BollingerFamilyDefaults
      : N extends 'supertrend' | 'keltner'
        ? { period: number; multiplier: number }
        : N extends 'stochrsi'
          ? {
              rsiPeriod: number;
              stochasticPeriod: number;
              kPeriod: number;
              dPeriod: number;
            }
          : N extends 'pivotpoints'
            ? { pivotType: PivotPointsType }
            : N extends 'obv'
              ? Record<string, never>
              : SinglePeriodDefaults; // ema, sma, hma, rsi, atr, sd, chop, adx

/**
 * Valeurs par défaut alignées sur les conventions standards (TradingView).
 * Ne jamais dupliquer ces valeurs ailleurs : importer `INDICATOR_DEFAULTS`
 * ou passer par `resolveIndicatorParams` / `buildIndicatorKey`.
 */
export const INDICATOR_DEFAULTS: { [N in IndicatorName]: IndicatorDefaultsFor<N> } = {
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
  stochrsi: {
    rsiPeriod: 14,
    stochasticPeriod: 14,
    kPeriod: 3,
    dPeriod: 3,
  },
  pivotpoints: { pivotType: 'standard' },
};

/**
 * Renvoie les paramètres effectifs d'un indicateur : valeurs fournies
 * complétées par `INDICATOR_DEFAULTS` pour tout champ omis.
 */
export function resolveIndicatorParams<N extends IndicatorName>(
  name: N,
  params?: Partial<IndicatorDefaultsFor<N>> | Record<string, unknown> | null,
): IndicatorDefaultsFor<N> {
  return {
    ...INDICATOR_DEFAULTS[name],
    ...(params ?? {}),
  } as IndicatorDefaultsFor<N>;
}

/**
 * Construit la clé unique et déterministe d'un indicateur (ex: "ema_9",
 * "macd_12_26_9", "ichimoku_9_26_52_26_conversion").
 * Toute valeur de paramètre omise est résolue via `INDICATOR_DEFAULTS`.
 */
export function buildIndicatorKey(
  name: IndicatorName,
  params?: Record<string, unknown> | null,
  subField?: string,
): string {
  const p = resolveIndicatorParams(name, params) as Record<string, unknown>;
  const sub = subField ? `_${subField}` : '';

  switch (name) {
    case 'macd':
      return `macd_${p.fastPeriod}_${p.slowPeriod}_${p.signalPeriod}${sub}`;

    case 'ichimoku':
      return `ichimoku_${p.conversionPeriod}_${p.basePeriod}_${p.spanPeriod}_${p.displacement}${sub}`;

    case 'bb':
    case 'bbw':
    case 'bbp':
      return `${name}_${p.period}_${p.stdDev}${sub}`;

    case 'supertrend':
      return `supertrend_${p.period}_${p.multiplier}${sub}`;

    case 'keltner':
      return `keltner_${p.period}_${p.multiplier}${sub}`;

    case 'pivotpoints':
      return `pivotpoints_${p.pivotType}${sub}`;

    case 'stochrsi':
      return `stochrsi_${p.rsiPeriod}_${p.stochasticPeriod}_${p.kPeriod}_${p.dPeriod}${sub}`;

    case 'obv':
      return `obv${sub}`;

    default:
      // ema, sma, hma, rsi, atr, sd, chop, adx
      return `${name}_${p.period}${sub}`;
  }
}

/**
 * Variante pratique de `buildIndicatorKey` acceptant directement un
 * `IndicatorRequest` ou `IndicatorOperand` (name + params + subField groupés).
 */
export function buildIndicatorKeyFromOperand(
  operand: IndicatorRequest | IndicatorOperand,
): string {
  const { name, subField, ...params } = operand as {
    name: IndicatorName;
    subField?: string;
  } & Record<string, unknown>;

  return buildIndicatorKey(name, params, subField);
}
