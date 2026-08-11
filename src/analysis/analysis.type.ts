import type { ChartInterval } from "../chart.type";
import type { IndicatorRequest } from "../indicators/indicator-request.types";
import type { IndicatorSeriesType, SimpleSeriesPoint } from "../indicators/indicator-series.types";
import type { BacktestSummary } from "../strategies/backtest-summary.type";
import type { Operand, TimelineSignal } from "../strategies/strategy-engine.type";
import type { AnalysisStrategyRequest } from "../strategies/strategy.types";
import type { AnalysisCandle } from "./analysis-candle.type";

/**
 * Une expression à calculer pour l'affichage chart (Chart UI) : n'importe
 * quel `Operand` (indicateur, prix, arith, ou une transformation glissante
 * comme `ZScore`/`Percentile`), pas seulement un indicateur "brut" — c'est
 * littéralement l'opérande qu'une condition de stratégie évaluerait, donc un
 * débogage visuel exact d'une règle.
 *
 * `id` absent : la clé de réponse (`AnalysisResponse.expressions`) est
 * dérivée de `operand` via `buildOperandKey` (operand-key.ts) — le frontend
 * peut calculer la même clé de son côté sans avoir à en inventer une.
 */
export interface ExpressionRequest {
  id?: string;
  operand: Operand;
}

/**
 * Requête globale d'analyse envoyée au backend
 */
export interface AnalysisRequest {
  symbol: string;
  interval: ChartInterval;
  startTime?: number;
  endTime?: number;
  lookbackPeriod?: number;
  indicators?: IndicatorRequest[];
  strategies?: AnalysisStrategyRequest[];
  expressions?: ExpressionRequest[];
}

/**
 * Réponse globale renvoyée par le service d'analyse
 */
export interface AnalysisResponse {
  symbol: string;
  interval: ChartInterval;
  candles: AnalysisCandle[];
  indicators: Record<string, IndicatorSeriesType>;
  strategies: {
    id: string;
    name: string;
    signals: TimelineSignal[];
    summary: BacktestSummary;
  }[];
  /** Clé = `id` fourni par la requête, sinon `buildOperandKey(operand)`. */
  expressions: Record<string, SimpleSeriesPoint[]>;
  summary: {
    lastClose: number | null
  };
}