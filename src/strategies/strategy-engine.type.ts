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

/**
 * Règles d'un côté du marché. `entry` est obligatoire : une sortie ne peut
 * pas être évaluée sans l'entrée correspondante, le moteur n'aurait rien à
 * fermer. Cette contrainte est portée par le type, elle n'a donc pas à être
 * revalidée à l'exécution.
 */
export interface SideRules {
  entry: LogicalGroup;
  exit?: LogicalGroup;
}

/**
 * Les arbres de règles d'une stratégie, sous leur forme **unique** : c'est
 * exactement cet objet qui est stocké dans la configuration utilisateur,
 * validé, envoyé à `POST /analysis` pour backtest, et exécuté par le moteur.
 *
 * Les deux côtés sont optionnels — une stratégie peut n'exploiter que le long
 * ou que le short — mais une stratégie `advanced-rules` sans aucun des deux
 * n'a rien à évaluer (voir `collectExecutableStrategyRulesIssues`).
 */
export interface StrategyRules {
  long?: SideRules;
  short?: SideRules;
}

/**
 * Valeur d'un réglage scalaire de stratégie. Volontairement limité aux
 * primitives : tout ce qui a une structure (arbre de règles, ancre) a son
 * propre type dédié et n'a rien à faire ici.
 */
export type StrategySettingValue = number | boolean | string;

/**
 * Réglages scalaires d'une stratégie, par nom de réglage (ex: `atrPeriod`,
 * `useAdaptiveMultiplier`). Pendant « données utilisateur » des paramètres
 * `number` / `boolean` / `select` décrits par `StrategyParameter` dans le
 * schéma de formulaire.
 *
 * Destiné aux stratégies codées en dur (`tol-langit-atr-v7-pro` et consorts),
 * dont les réglages ne sont aujourd'hui pas configurables. Aucun consommateur
 * ne les lit encore : voir la note sur la validation dans
 * `collectStrategyIssues`.
 */
export type StrategySettings = Record<string, StrategySettingValue>;

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
