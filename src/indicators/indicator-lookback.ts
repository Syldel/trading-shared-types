import type {
  IndicatorName,
  IndicatorOperand,
  IndicatorRequest,
} from './indicator-request.types.js';
import { resolveIndicatorParams } from './indicator-defaults.js';

/**
 * ============================================================================
 * 📏 INDICATOR LOOKBACK
 * Nombre minimal de bougies précédant la fenêtre affichée nécessaires pour
 * qu'un indicateur produise une valeur définie (non `null`/`NaN`) dès la
 * première bougie de cette fenêtre.
 *
 * C'est un minimum structurel, pas une marge de convergence : une EMA a une
 * valeur définie dès la bougie `period`, mais continue de se rapprocher de sa
 * valeur asymptotique bien après — une marge de sécurité éventuelle reste la
 * responsabilité de l'appelant (fetch de bougies pour un chart/backtest).
 * ============================================================================
 */

/**
 * Renvoie le nombre de bougies additionnelles requises par indicateur, au-delà
 * de son ou ses paramètres de période bruts — pour les indicateurs dont
 * plusieurs étapes de calcul se chaînent (ex: MACD = EMA rapide/lente PUIS EMA
 * du signal sur cette différence). Toute valeur de paramètre omise est
 * résolue via `resolveIndicatorParams` (mêmes valeurs par défaut que le reste
 * du package), donc jamais dupliquée ici.
 */
export function getIndicatorOperandLookback(
  operand: IndicatorRequest | IndicatorOperand,
): number {
  const { name, ...rawParams } = operand as { name: IndicatorName } & Record<
    string,
    unknown
  >;
  const params = resolveIndicatorParams(name, rawParams) as Record<
    string,
    number | string
  >;

  switch (name) {
    case 'ema':
    case 'sma':
    case 'hma':
    case 'rsi':
    case 'atr':
    case 'sd':
    case 'chop':
    case 'bb':
    case 'bbw':
    case 'bbp':
    case 'supertrend':
    case 'keltner':
    case 'donchian':
      return params.period as number;

    // ADX lisse deux fois (DX puis ADX lui-même) sur `period` : sa valeur est
    // techniquement définie après `period` bougies, mais ne reflète le
    // lissage complet qu'après environ le double.
    case 'adx':
      return (params.period as number) * 2;

    // Cumulatif depuis la première bougie disponible : aucune fenêtre de
    // warm-up fixe, plus d'historique ne fait qu'affiner la valeur.
    case 'obv':
      return 0;

    // Le signal est une EMA calculée sur la série MACD elle-même : les deux
    // étapes se cumulent, `slowPeriod` seul sous-estimerait le warm-up réel.
    case 'macd':
      return (params.slowPeriod as number) + (params.signalPeriod as number);

    // Span A/B (`spanPeriod`) est décalé de `displacement` bougies vers le
    // futur au tracé : la valeur visible aujourd'hui a été calculée
    // `displacement` bougies plus tôt à partir de `spanPeriod` bougies
    // d'historique — les deux s'additionnent.
    case 'ichimoku':
      return (params.spanPeriod as number) + (params.displacement as number);

    // %K lisse le Stochastic sur `stochasticPeriod`, lui-même calculé sur un
    // RSI de `rsiPeriod` bougies ; %D lisse %K sur `dPeriod`. Les trois
    // étapes se chaînent, `kPeriod` couvre le lissage de %K lui-même.
    case 'stochrsi':
      return (
        (params.rsiPeriod as number) +
        (params.stochasticPeriod as number) +
        Math.max(params.kPeriod as number, params.dPeriod as number)
      );

    // Dérivé de la bougie précédente (jour/semaine/mois selon `pivotType`) :
    // une seule bougie de contexte suffit.
    case 'pivotpoints':
      return 1;

    default: {
      const exhaustive: never = name;
      throw new Error(`Unknown indicator name: ${String(exhaustive)}`);
    }
  }
}
