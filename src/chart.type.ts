/** Raw interval codes as used by the exchange/chart data provider API. */
export type ChartInterval =
  | '1'
  | '2'
  | '3'
  | '5'
  | '10'
  | '15'
  | '30'
  | '45'
  | '60'
  | '120'
  | '180'
  | '240'
  | '1D'
  | '1W'
  | '1M'
  | '3M';

/** Human-readable form of ChartInterval, used in UI labels. */
export type ReadableChartInterval =
  | '1m'
  | '2m'
  | '3m'
  | '5m'
  | '10m'
  | '15m'
  | '30m'
  | '45m'
  | '1h'
  | '2h'
  | '3h'
  | '4h'
  | 'D'
  | 'W'
  | 'M'
  | '3M';

export const chartIntervalMap: Record<ChartInterval, ReadableChartInterval> = {
  '1': '1m',
  '2': '2m',
  '3': '3m',
  '5': '5m',
  '10': '10m',
  '15': '15m',
  '30': '30m',
  '45': '45m',
  '60': '1h',
  '120': '2h',
  '180': '3h',
  '240': '4h',
  '1D': 'D',
  '1W': 'W',
  '1M': 'M',
  '3M': '3M',
};

export const chartIntervalToMinutes: Record<ChartInterval, number> = {
  '1': 1,
  '2': 2,
  '3': 3,
  '5': 5,
  '10': 10,
  '15': 15,
  '30': 30,
  '45': 45,
  '60': 60,
  '120': 120,
  '180': 180,
  '240': 240,
  '1D': 1440,
  '1W': 10080,
  '1M': 43200,
  '3M': 129600,
};

// NOTE: keys here don't fully match ChartInterval / ReadableChartInterval
// ('8h', '3d' have no equivalent above; '1d' vs '1D' casing differs).
// Kept as-is from the Nest project — worth reconciling into a single
// source of truth if this map and ChartInterval start drifting further apart.
export const INTERVAL_MS: Record<string, number> = {
  '1m': 60_000,
  '3m': 180_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
  '2h': 7_200_000,
  '4h': 14_400_000,
  '8h': 28_800_000,
  '12h': 43_200_000,
  '1d': 86_400_000,
  '3d': 259_200_000,
  '1w': 604_800_000,
  '1M': 2_592_000_000,
};

export interface AnalysisCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}