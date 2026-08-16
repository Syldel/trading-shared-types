import type { IndicatorOperand } from "../indicators/indicator-request.types";

/**
 * Valeurs valides des unions de l'AST, exposées comme constantes runtime
 * (et non seulement comme types) pour servir de source unique à la fois au
 * typage et à la validation structurelle (`strategy-validation.ts`).
 */
export const PRICE_FIELDS = ['open', 'high', 'low', 'close', 'volume'] as const;
export type PriceField = typeof PRICE_FIELDS[number];

export const ARITH_OPERATORS = ['ADD', 'SUB', 'MUL', 'DIV'] as const;
export type ArithOperator = typeof ARITH_OPERATORS[number];

/**
 * Transformations glissantes applicables à la série produite par n'importe
 * quel `Operand` (voir le nœud `transform` ci-dessous). Métadonnées
 * (libellé, échelle de sortie, période par défaut) dans `TRANSFORM_REGISTRY`
 * (transform-registry.ts) — ce fichier ne porte que l'énumération, dans le
 * même esprit que `ARITH_OPERATORS` ci-dessus.
 */
export const TRANSFORM_KINDS = ['zscore', 'percentile', 'ratioToMa', 'slope'] as const;
export type TransformKind = typeof TRANSFORM_KINDS[number];

/**
 * Fonctions combinatoires appliquées à plusieurs opérandes au même index de
 * bougie (voir le nœud `fn` ci-dessous) — à ne pas confondre avec
 * `TransformKind`, qui glisse dans le temps sur une seule série. Métadonnées
 * (libellé, arité) dans `FUNCTION_REGISTRY` (function-registry.ts), même
 * esprit que `TRANSFORM_KINDS`/`TRANSFORM_REGISTRY`.
 */
export const FUNCTION_KINDS = ['min', 'max'] as const;
export type FunctionKind = typeof FUNCTION_KINDS[number];

/**
 * `arith` combine récursivement deux opérandes (ex: `ema20 + atr14 * 2`,
 * représenté par l'imbrication des nœuds, pas par une chaîne à parser).
 *
 * `transform` applique une transformation glissante (`TransformKind`) à la
 * série produite par `source` — lui-même un `Operand` quelconque, ce qui
 * permet la composition (ex: le ZScore de la pente d'une EMA : un `transform`
 * `zscore` dont la `source` est un `transform` `slope` dont la `source` est
 * l'EMA). `period` omise se résout via `TRANSFORM_REGISTRY`, comme `period`
 * sur un `IndicatorOperand` se résout via `INDICATOR_DEFAULTS` — jamais de
 * valeur par défaut dupliquée ici.
 *
 * `fn` applique une fonction combinatoire (`FunctionKind`) à une liste
 * d'`args` — un `Operand` quelconque chacun, composition libre comme pour
 * `transform` — évaluée au même index (ex: `max(ichimoku.spanA,
 * ichimoku.spanB)`, le haut du nuage Ichimoku). Distinct d'`arith` : `arith`
 * est strictement binaire et infixe (`ADD`/`SUB`/`MUL`/`DIV`), `fn` est
 * variadique (au moins `FUNCTION_REGISTRY[kind].minArgs` arguments, voir
 * `strategy-validation.ts` pour le plafond structurel). Si un seul `args`
 * résout à une valeur indéterminée, `fn` est indéterminé dans son ensemble —
 * jamais calculé sur un sous-ensemble des arguments disponibles (voir
 * `docs/trading/strategy-engine.md#negation-and-missing-data` dans
 * nest-trading-bot).
 *
 * `offset` ne s'applique qu'aux opérandes qui désignent une position dans le
 * temps (`price`, `indicator`, `transform`) : une constante n'a pas de
 * dimension temporelle, et un `arith`/`fn` n'offsette pas le résultat en
 * bloc — chaque feuille porte son propre offset si besoin.
 */
export type Operand =
  | { type: 'price'; field: PriceField; offset?: number }
  | ({ type: 'indicator'; offset?: number } & IndicatorOperand)
  | { type: 'number'; value: number }
  | { type: 'arith'; operator: ArithOperator; left: Operand; right: Operand }
  | { type: 'transform'; kind: TransformKind; period?: number; source: Operand; offset?: number }
  | { type: 'fn'; kind: FunctionKind; args: Operand[] };

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

/**
 * `STRICT` (défaut, comportement historique) : chaque pas de la fenêtre doit
 * être strictement monotone (`>`/`<`) — un seul palier invalide la tendance.
 * `SOFT` : tolère les paliers (`>=`/`<=`) — utile sur un prix qui plafonne
 * quelques bougies sans inverser. `NET` : ignore le chemin, ne compare que
 * les deux extrémités de la fenêtre (valeur actuelle vs valeur à `t-period`).
 */
export const TREND_MODES = ['STRICT', 'SOFT', 'NET'] as const;
export type TrendMode = typeof TREND_MODES[number];

export interface TrendCondition {
  type: 'trend';
  target: Operand;
  direction: TrendDirection;
  period: number;
  /** Absent = `STRICT`, pour ne changer le comportement d'aucune stratégie déjà stockée. */
  mode?: TrendMode;
}

/** Négation logique. Voir `docs/trading/strategy-engine.md#negation-and-missing-data`
 * dans nest-trading-bot pour la sémantique vis-à-vis d'une donnée manquante
 * (une valeur indéterminée ne doit jamais devenir `true` sous `not`). */
export interface NotCondition {
  type: 'not';
  condition: RuleNode;
}

export const CROSS_DIRECTIONS = ['UP', 'DOWN', 'ANY'] as const;
export type CrossDirection = typeof CROSS_DIRECTIONS[number];

/**
 * Détecte un croisement entre deux opérandes entre la bougie précédente et
 * la bougie courante (pas d'`offset` : un croisement est par nature un
 * évènement `t-1` vs `t`). `UP` = `left` franchit `right` par le haut,
 * `DOWN` = par le bas, `ANY` = l'un ou l'autre.
 */
export interface CrossCondition {
  type: 'cross';
  left: Operand;
  right: Operand;
  direction: CrossDirection;
}

/**
 * Condition toujours vraie ou toujours fausse, indépendante des données de
 * marché. Comble l'ambiguïté d'un groupe logique vide (qui évalue toujours à
 * `false`, voir `StrategyEngineService.compileTreeIndicators`) : pour
 * exprimer « toujours vrai » explicitement plutôt que par un vide qui se lit
 * comme un oubli.
 */
export interface ConstantCondition {
  type: 'constant';
  value: boolean;
}

export type RuleNode =
  | LogicalGroup
  | ComparisonCondition
  | TrendCondition
  | NotCondition
  | CrossCondition
  | ConstantCondition;
