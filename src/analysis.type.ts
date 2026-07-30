// Types the contract of POST /analysis.

import type { ChartInterval } from './chart.type.js';
import type { AnalysisCandle } from './analysis-candle.type.js';
import type { AdvancedStrategyParameters, TimelineSignal } from './strategy-engine.type.js';

// Mirrors IndicatorOperand's discriminated shape, but without `subField`:
// this requests a full raw series for charting, not a single rule-evaluable value.
export type IndicatorRequest =
  | { name: 'ema' | 'sma' | 'hma' | 'rsi' | 'atr' | 'sd'; period?: number }
  | { name: 'macd'; fastPeriod?: number; slowPeriod?: number; signalPeriod?: number }
  | { name: 'adx'; period?: number }
  | {
      name: 'ichimoku';
      conversionPeriod?: number;
      basePeriod?: number;
      spanPeriod?: number;
      displacement?: number;
    }
  | {
      name: 'bb' | 'bbw' | 'bbp';
      period?: number;
      stdDev?: number;
    };

export interface SimpleSeriesPoint {
  time: number;
  value: number;
}

export interface MacdSeriesPoint {
  time: number;
  macd: number;
  signal: number;
  histogram: number;
}

export interface AdxSeriesPoint {
  time: number;
  adx: number;
  pdi: number;
  mdi: number;
}

export interface IchimokuSeriesPoint {
  time: number;
  conversion: number;
  base: number;
  spanA: number;
  spanB: number;
  chikou: number;
}

export interface AnalysisStrategyRequest {
  id: string;
  name: string;
  parameters?: AdvancedStrategyParameters;
}

export interface AnalysisRequest {
  symbol: string;
  // Same literal values as CandleInterval (@syldel/hl-shared-types) — see chart.type.ts note.
  // No conversion needed before calling HyperliquidApiService.getCandleSnapshot.
  interval: ChartInterval;
  startTime?: number;
  endTime?: number;
  lookbackPeriod?: number;
  indicators?: IndicatorRequest[];
  strategies?: AnalysisStrategyRequest[];
}

export interface AnalysisResponse {
  symbol: string;
  interval: ChartInterval;
  candles: AnalysisCandle[];
  // Key format is "<name>_<period>" or "<name>_<fast>_<slow>_<signal>", built by
  // AnalysisService — not itself typed. Value shape depends on which indicator produced it.
  indicators: Record<
    string,
    SimpleSeriesPoint[] | MacdSeriesPoint[] | AdxSeriesPoint[] | IchimokuSeriesPoint[]
  >;
  strategies: { id: string; name: string; signals: TimelineSignal[] }[];
  summary: { lastClose: number | null };
}