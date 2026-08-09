import type {
  IndicatorName,
  IndicatorOperand,
  IndicatorRequest,
} from './indicator-request.types.js';
import { INDICATOR_NAMES } from './indicator-request.types.js';
import type { PivotPointsType } from './indicator-series.types.js';
import { INDICATOR_REGISTRY } from './indicator-registry.js';

/**
 * ============================================================================
 * ⚙️ INDICATOR DEFAULTS
 * Toute clé d'indicateur (buildIndicatorKey) et tout calcul doit passer par
 * ce registre plutôt que de recopier des `?? 14` / `?? 20` locaux.
 *
 * Les valeurs elles-mêmes viennent de `INDICATOR_REGISTRY`
 * (indicator-registry.ts, source unique — voir son en-tête). Ce module ne
 * fait plus que projeter ce registre vers la forme précise attendue par les
 * appelants historiques (`IndicatorDefaultsFor<N>`), inchangée pour rester
 * compatible avec tous les consommateurs existants.
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
 * Projette `INDICATOR_REGISTRY[name].parameters` (name/defaultValue) vers un
 * objet `{ [paramName]: defaultValue }`. Le seul endroit du module qui
 * s'écarte de `IndicatorDefaultsFor<N>` au niveau des types : la donnée
 * source (`IndicatorParameter[]`) est une liste, pas un objet à clés
 * connues statiquement — la précision est retrouvée par le cast documenté
 * ci-dessous, vérifié par `indicator-registry.spec.ts` (valeurs figées).
 */
function computeDefaults(): { [N in IndicatorName]: IndicatorDefaultsFor<N> } {
  const result: Record<string, Record<string, number | string>> = {};

  for (const name of INDICATOR_NAMES) {
    const defaults: Record<string, number | string> = {};
    for (const param of INDICATOR_REGISTRY[name].parameters) {
      defaults[param.name] = param.defaultValue;
    }
    result[name] = defaults;
  }

  return result as { [N in IndicatorName]: IndicatorDefaultsFor<N> };
}

/**
 * Valeurs par défaut alignées sur les conventions standards (TradingView).
 * Ne jamais dupliquer ces valeurs ailleurs : importer `INDICATOR_DEFAULTS`
 * ou passer par `resolveIndicatorParams` / `buildIndicatorKey`.
 */
export const INDICATOR_DEFAULTS = computeDefaults();

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
 *
 * L'ordre des valeurs dans la clé suit l'ordre de déclaration de
 * `INDICATOR_REGISTRY[name].parameters` — un seul indicateur (`bb`, `macd`,
 * ...) déclare cet ordre, il n'est plus dupliqué ici sous forme de switch.
 */
export function buildIndicatorKey(
  name: IndicatorName,
  params?: Record<string, unknown> | null,
  subField?: string,
): string {
  const resolved = resolveIndicatorParams(name, params) as Record<
    string,
    unknown
  >;
  const sub = subField ? `_${subField}` : '';
  const parameters = INDICATOR_REGISTRY[name].parameters;

  if (parameters.length === 0) {
    return `${name}${sub}`;
  }

  const values = parameters.map((param) => resolved[param.name]);
  return `${name}_${values.join('_')}${sub}`;
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
