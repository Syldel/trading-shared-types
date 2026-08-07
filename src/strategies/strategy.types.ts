import type { StrategyRules } from "./strategy-engine.type";

/**
 * Requête d'une stratégie dynamique à exécuter (backtest).
 *
 * `rules` est exactement le type stocké dans `IExchangeStrategy.rules` : le
 * backtest porte donc littéralement sur l'objet qui sera exécuté en live,
 * sans conversion intermédiaire.
 */
export interface AnalysisStrategyRequest {
  id: string;
  name: string;
  rules?: StrategyRules;
}
