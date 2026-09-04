import {
  ARITH_OPERATORS,
  CROSS_DIRECTIONS,
  PRICE_FIELDS,
  TREND_MODES,
} from './strategy-engine.type.js';
import type {
  ArithOperator,
  ComparisonOperator,
  CrossDirection,
  LogicalOperator,
  Operand,
  PriceField,
  RuleNode,
  TrendDirection,
  TrendMode,
} from './strategy-engine.type.js';

/**
 * ============================================================================
 * 🧩 RULE BUILDER GRAMMAR
 * Libellés humains des énumérations de `strategy-engine.type.ts`, tel
 * qu'affiché par un rule-builder (sélecteurs de type de nœud, d'opérateur,
 * de direction...).
 *
 * Volontairement séparé des catalogues à contenu métier variable
 * (`AVAILABLE_INDICATORS_METADATA`, `AVAILABLE_TRANSFORMS_METADATA`,
 * `AVAILABLE_FUNCTIONS_METADATA`) : ceux-ci sont déjà exposés individuellement
 * (voir `index.ts`) et un client les combine à cette grammaire comme il
 * l'entend, plutôt que de les recevoir dupliqués dans cet objet.
 *
 * Unique source de ces libellés : remplace la copie qui existait dans
 * `nest-trading-bot/src/exchanges/advanced-rules.definition.ts`
 * (`RULE_BUILDER_GRAMMAR`), désormais un simple re-export de cette constante.
 * ============================================================================
 */

/** Discriminant de nœud d'arbre de règles (`RuleNode['type']`), isolé pour nommer `nodeTypes` ci-dessous sans dépendre du nœud complet. */
export type RuleNodeType = RuleNode['type'];
/** Discriminant d'opérande (`Operand['type']`), même raison que `RuleNodeType`. */
export type OperandType = Operand['type'];

export interface GrammarOption<T extends string> {
  value: T;
  label: string;
}

const PRICE_FIELD_LABELS: Record<PriceField, string> = {
  open: 'Open Price',
  high: 'High Price',
  low: 'Low Price',
  close: 'Close Price',
  volume: 'Volume',
};

const TREND_MODE_LABELS: Record<TrendMode, string> = {
  STRICT: 'Strict (every step must move in the same direction)',
  SOFT: 'Soft (tolerates flat candles)',
  NET: 'Net (only start and end of the window matter)',
};

const CROSS_DIRECTION_LABELS: Record<CrossDirection, string> = {
  UP: 'Crosses Above',
  DOWN: 'Crosses Below',
  ANY: 'Crosses Either Way',
};

const ARITH_OPERATOR_LABELS: Record<ArithOperator, string> = {
  ADD: 'Add (+)',
  SUB: 'Subtract (-)',
  MUL: 'Multiply (×)',
  DIV: 'Divide (÷)',
};

export interface RuleBuilderGrammar {
  nodeTypes: GrammarOption<RuleNodeType>[];
  logicalOperators: GrammarOption<LogicalOperator>[];
  comparisonOperators: GrammarOption<ComparisonOperator>[];
  priceFields: GrammarOption<PriceField>[];
  trendDirections: GrammarOption<TrendDirection>[];
  trendModes: GrammarOption<TrendMode>[];
  crossDirections: GrammarOption<CrossDirection>[];
  arithOperators: GrammarOption<ArithOperator>[];
  targetTypes: GrammarOption<OperandType>[];
}

export const RULE_BUILDER_GRAMMAR: RuleBuilderGrammar = {
  nodeTypes: [
    { value: 'logical', label: 'Logical Operator (AND/OR)' },
    { value: 'comparison', label: 'Comparison (A > B)' },
    { value: 'trend', label: 'Trend Analysis (Direction over X candles)' },
    { value: 'not', label: 'Negation (NOT condition)' },
    { value: 'cross', label: 'Cross (A crosses B)' },
    { value: 'constant', label: 'Constant (always true / always false)' },
  ],
  logicalOperators: [
    { value: 'AND', label: 'ALL conditions must be true (AND)' },
    { value: 'OR', label: 'At least ONE condition must be true (OR)' },
  ],
  comparisonOperators: [
    { value: 'GT', label: 'Greater Than (>)' },
    { value: 'GTE', label: 'Greater Than or Equal (>=)' },
    { value: 'LT', label: 'Less Than (<)' },
    { value: 'LTE', label: 'Less Than or Equal (<=)' },
    { value: 'EQ', label: 'Equal To (=)' },
  ],
  priceFields: PRICE_FIELDS.map((field) => ({
    value: field,
    label: PRICE_FIELD_LABELS[field],
  })),
  trendDirections: [
    { value: 'UP', label: 'Strictly Increasing (↗)' },
    { value: 'DOWN', label: 'Strictly Decreasing (↘)' },
  ],
  trendModes: TREND_MODES.map((mode) => ({
    value: mode,
    label: TREND_MODE_LABELS[mode],
  })),
  crossDirections: CROSS_DIRECTIONS.map((direction) => ({
    value: direction,
    label: CROSS_DIRECTION_LABELS[direction],
  })),
  arithOperators: ARITH_OPERATORS.map((operator) => ({
    value: operator,
    label: ARITH_OPERATOR_LABELS[operator],
  })),
  targetTypes: [
    { value: 'indicator', label: 'Technical Indicator' },
    { value: 'price', label: 'Market Data / Price Field' },
    { value: 'number', label: 'Static Value (Constant)' },
    { value: 'arith', label: 'Arithmetic Expression (A + B, A * B, ...)' },
    {
      value: 'transform',
      label: 'Rolling Transform (Z-Score, Percentile, ...)',
    },
    { value: 'fn', label: 'Function (Min, Max, ...)' },
  ],
};
