import type { ChartInterval } from "../chart.type";
import type { IndicatorRequest } from "../indicators/indicator-request.types";
import type { IndicatorSeriesType } from "../indicators/indicator-series.types";
import type { TimelineSignal } from "../strategies/strategy-engine.type";
import type { AnalysisStrategyRequest } from "../strategies/strategy.types";
import type { AnalysisCandle } from "./analysis-candle.type";

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
    signals: TimelineSignal[] 
  }[];
  summary: { 
    lastClose: number | null 
  };
}