export type PriceField = 'open' | 'high' | 'low' | 'close' | 'volume';

export type Operand =
  | { type: 'price'; field: PriceField; offset?: number } // ex: close à j-1, high à j-2
  | { type: 'indicator'; name: string; period?: number; subField?: string } // ex: ema(9), macd_line
  | { type: 'number'; value: number }; // ex: 30, 70, 0

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
