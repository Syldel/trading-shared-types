import type { IndicatorOperand } from "../indicators/indicator-request.types";

export type PriceField = 'open' | 'high' | 'low' | 'close' | 'volume';

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
  conditions: RuleNode[];
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
  metadata?: {
    price: number;
    tradeProfitPercent?: number;
    cumulativeProfitPercent: number;
    [key: string]: number | string | undefined;
  };
}

export type TrendDirection = 'UP' | 'DOWN';

export interface TrendCondition {
  type: 'trend';
  target: Operand;
  direction: TrendDirection;
  period: number;
}

export type RuleNode = LogicalGroup | ComparisonCondition | TrendCondition;
