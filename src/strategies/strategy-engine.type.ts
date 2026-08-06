import type { IndicatorOperand } from "../indicators/indicator-request.types";

/**
 * Valeurs valides des unions de l'AST, exposées comme constantes runtime
 * (et non seulement comme types) pour servir de source unique à la fois au
 * typage et à la validation structurelle (`strategy-validation.ts`).
 */
export const PRICE_FIELDS = ['open', 'high', 'low', 'close', 'volume'] as const;
export type PriceField = typeof PRICE_FIELDS[number];

export type Operand =
  | { type: 'price'; field: PriceField; offset?: number }
  | ({ type: 'indicator' } & IndicatorOperand)
  | { type: 'number'; value: number };

export const COMPARISON_OPERATORS = ['GT', 'GTE', 'LT', 'LTE', 'EQ'] as const;
export type ComparisonOperator = typeof COMPARISON_OPERATORS[number];

export const LOGICAL_OPERATORS = ['AND', 'OR'] as const;
export type LogicalOperator = typeof LOGICAL_OPERATORS[number];

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

export const TREND_DIRECTIONS = ['UP', 'DOWN'] as const;
export type TrendDirection = typeof TREND_DIRECTIONS[number];

export interface TrendCondition {
  type: 'trend';
  target: Operand;
  direction: TrendDirection;
  period: number;
}

export type RuleNode = LogicalGroup | ComparisonCondition | TrendCondition;
