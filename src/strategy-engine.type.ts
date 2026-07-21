export type PriceField = 'open' | 'high' | 'low' | 'close' | 'volume';

export type IndicatorOperand =
  | { name: 'ema' | 'sma' | 'hma' | 'atr' | 'sd'; period?: number; subField?: undefined }
  | { name: 'rsi'; period?: number; subField?: undefined }
  | { name: 'macd'; fastPeriod?: number; slowPeriod?: number; signalPeriod?: number; subField?: 'macd' | 'signal' | 'histogram' }
  | { name: 'adx'; period?: number; subField?: 'adx' | 'pdi' | 'mdi' }
  | { name: 'ichimoku'; conversionPeriod?: number; basePeriod?: number; spanPeriod?: number; displacement?: number; subField?: 'conversion' | 'base' | 'spanA' | 'spanB' | 'chikou' }
  | {
      name: 'bb';
      period?: number;
      stdDev?: number;
      subField?: 'upper' | 'middle' | 'lower';
    };

export type Operand =
  | { type: 'price'; field: PriceField; offset?: number }
  | ({ type: 'indicator' } & IndicatorOperand)
  | { type: 'number'; value: number };

export type ComparisonOperator = 'GT' | 'GTE' | 'LT' | 'LTE' | 'EQ';
export type LogicalOperator = 'AND' | 'OR';

// Une condition de comparaison pure (ex: EMA9 > SMA20)
export interface ComparisonCondition {
  type: 'comparison';
  left: Operand;
  operator: ComparisonOperator;
  right: Operand;
}

// Un groupe logique qui rassemble plusieurs conditions (ex: ConditionA AND ConditionB)
export interface LogicalGroup {
  type: 'logical';
  operator: LogicalOperator;
  conditions: (ComparisonCondition | LogicalGroup)[];
}

export interface AdvancedStrategyParameters {
  long?: {
    entry: LogicalGroup;
    exit?: LogicalGroup;
  };
  short?: {
    entry: LogicalGroup;
    exit?: LogicalGroup;
  };
}

export interface TimelineSignal {
  time: number;
  signal: 'ENTER' | 'EXIT';
  metadata?: Record<string, number | string>;
}

export type TrendDirection = 'UP' | 'DOWN';

export interface TrendCondition {
  type: 'trend';
  target: Operand;
  direction: TrendDirection;
  period: number;
}

export type RuleNode = LogicalGroup | ComparisonCondition | TrendCondition;
