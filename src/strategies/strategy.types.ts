import type { AdvancedStrategyParameters } from "./strategy-engine.type";

/**
 * Représente la requête d'une stratégie dynamique à exécuter
 */
export interface AnalysisStrategyRequest {
  id: string;
  name: string;
  parameters?: AdvancedStrategyParameters;
}
