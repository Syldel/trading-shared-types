/**
 * 🕒 Repère temporel commun pour les séries de graphiques
 */
export interface TimePoint {
  time: number;
}

// ============================================================================
// 🧮 VALEURS BRUTES (Pure Indicator Values - Sans notion de temps)
// ============================================================================

export interface SimpleValue {
  value: number;
}

export interface MacdValue {
  macd: number;
  signal: number;
  histogram: number;
}

export interface AdxValue {
  adx: number;
  pdi: number;
  mdi: number;
}

export interface IchimokuValue {
  conversion?: number;
  base?: number;
  spanA?: number;
  spanB?: number;
  chikou?: number;
}

export interface BollingerBandsValue {
  upper: number;
  middle: number;
  lower: number;
}

export interface SupertrendValue {
  supertrend: number;
  direction: number;
}

export interface KeltnerValue {
  upper: number;
  middle: number;
  lower: number;
}

export interface StochRsiValue {
  stochRSI: number;
  k: number;
  d: number;
}

export type PivotPointsType = 'standard' | 'fibonacci' | 'camarilla' | 'woodie';

export interface PivotPointsValue {
  pivot?: number;
  r1?: number;
  r2?: number;
  r3?: number;
  r4?: number;
  s1?: number;
  s2?: number;
  s3?: number;
  s4?: number;
  /** Calculation variant used to produce this value (lossless context). */
  type: PivotPointsType;
}

// ============================================================================
// 📈 SÉRIES TEMPORELLES (Time-aligned Series Points - Valeur + Time)
// ============================================================================

export interface SimpleSeriesPoint extends SimpleValue, TimePoint {}
export interface MacdSeriesPoint extends MacdValue, TimePoint {}
export interface AdxSeriesPoint extends AdxValue, TimePoint {}
export interface IchimokuSeriesPoint extends IchimokuValue, TimePoint {}
export interface BollingerBandsSeriesPoint extends BollingerBandsValue, TimePoint {}
export interface SupertrendSeriesPoint extends SupertrendValue, TimePoint {}
export interface KeltnerSeriesPoint extends KeltnerValue, TimePoint {}
export interface StochRsiSeriesPoint extends StochRsiValue, TimePoint {}
export interface PivotPointsSeriesPoint extends PivotPointsValue, TimePoint {}

/**
 * Union globale de tous les types de points de séries supportés par l'API
 * pour la constitution de la réponse `indicators` (Chart UI).
 */
export type IndicatorSeriesType =
  | SimpleSeriesPoint[]
  | MacdSeriesPoint[]
  | AdxSeriesPoint[]
  | IchimokuSeriesPoint[]
  | BollingerBandsSeriesPoint[]
  | SupertrendSeriesPoint[]
  | KeltnerSeriesPoint[]
  | StochRsiSeriesPoint[]
  | PivotPointsSeriesPoint[];
