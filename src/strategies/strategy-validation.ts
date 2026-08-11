import type {
  IExchangePair,
  IExchangeStrategy,
  IOrderAnchor,
} from '../exchange/exchange-config.interface.js';
import {
  validateIndicatorOperand,
  type IndicatorOperandIssueCode,
} from '../indicators/indicator-subfields.js';
import { buildOperandKey } from './operand-key.js';
import {
  ARITH_OPERATORS,
  COMPARISON_OPERATORS,
  CROSS_DIRECTIONS,
  LOGICAL_OPERATORS,
  PRICE_FIELDS,
  TRANSFORM_KINDS,
  TREND_DIRECTIONS,
  TREND_MODES,
  type Operand,
  type StrategyRules,
} from './strategy-engine.type.js';

/**
 * ============================================================================
 * 🛑 STRATEGY VALIDATION
 * Détection des opérandes indicateur incohérents dans une stratégie.
 *
 * Portée volontairement limitée à la **cohérence référentielle** : est-ce que
 * chaque opérande désigne une valeur calculable et non ambiguë ? Aucun jugement
 * n'est porté sur la pertinence de la stratégie — une stratégie cohérente peut
 * parfaitement ne jamais produire de signal, ce n'est pas le sujet ici.
 *
 * Ces fonctions sont pures et sans dépendance : elles sont destinées à être
 * utilisées aussi bien au moment de la sauvegarde (front) qu'au chargement et
 * à l'exécution (backend), afin que les deux appliquent la même règle.
 * ============================================================================
 */

/**
 * Anomalies de forme de l'arbre de règles : type de nœud inconnu, opérateur
 * hors énumération, groupe logique vide, période invalide, etc.
 *
 * Complémentaire aux codes `IndicatorOperandIssueCode` (qui portent sur la
 * cohérence référentielle d'un opérande `indicator`) : ceux-ci portent sur la
 * forme du nœud lui-même, avant même de savoir si c'est un opérande indicateur.
 */
export type StrategyStructureIssueCode =
  | 'MISSING_NODE'
  | 'UNKNOWN_NODE_TYPE'
  | 'UNKNOWN_LOGICAL_OPERATOR'
  | 'EMPTY_LOGICAL_CONDITIONS'
  | 'UNKNOWN_COMPARISON_OPERATOR'
  | 'MISSING_OPERAND'
  | 'UNKNOWN_OPERAND_TYPE'
  | 'INVALID_PRICE_FIELD'
  | 'INVALID_OFFSET'
  | 'INVALID_NUMBER_OPERAND'
  | 'UNKNOWN_TREND_DIRECTION'
  | 'INVALID_TREND_PERIOD'
  | 'UNKNOWN_TREND_MODE'
  | 'UNKNOWN_ARITH_OPERATOR'
  | 'ARITH_TOO_DEEP'
  | 'INVALID_TRANSFORM_KIND'
  | 'INVALID_TRANSFORM_PERIOD'
  | 'TRANSFORM_TOO_DEEP'
  | 'UNKNOWN_CROSS_DIRECTION'
  | 'INVALID_CONSTANT_VALUE'
  | 'EMPTY_STRATEGY_RULES'
  | 'INVALID_EXPRESSION_ID'
  | 'DUPLICATE_EXPRESSION_KEY';

/** Anomalie de nœud ou d'opérande, située dans la structure de la stratégie. */
export interface StrategyValidationIssue {
  /** Emplacement du nœud/opérande fautif (ex: `long.entry.conditions[0].left`). */
  path: string;
  code: IndicatorOperandIssueCode | StrategyStructureIssueCode;
  message: string;
  /** Présents uniquement pour les anomalies d'opérande `indicator` (voir `validateIndicatorOperand`). */
  indicator?: unknown;
  subField?: unknown;
  allowed?: readonly string[];
}

/** Une valeur de nœud/opérande telle qu'elle arrive du JSON : non typée. */
type RawNode = Record<string, unknown> | null | undefined;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * `offset` regarde `offset` bougies en arrière (t-offset), sur `price` comme
 * sur `indicator`. Négatif ou non entier lirait une bougie future — biais de
 * look-ahead en backtest, et hors bornes en fin de série côté moteur (voir
 * StrategyEngineService.resolveOperandValue dans nest-trading-bot).
 */
function collectOffsetIssue(
  offset: unknown,
  path: string,
): StrategyValidationIssue | null {
  if (offset === undefined) return null;

  if (
    typeof offset !== 'number' ||
    !Number.isInteger(offset) ||
    offset < 0
  ) {
    return {
      path,
      code: 'INVALID_OFFSET',
      message:
        `Operand at ${path} has an invalid "offset" (received: ${String(offset)}). ` +
        `Must be a non-negative integer when present.`,
    };
  }

  return null;
}

/** Un `arith` ou un `transform` imbriqué au-delà de cette profondeur est
 * rejeté plutôt que parcouru : protège le chemin bougie (évaluation par
 * candle) d'un arbre pathologique, accidentel ou non. Constante interne
 * (non exportée) : les deux nœuds partagent la même limite mais chacun son
 * propre code d'anomalie (`ARITH_TOO_DEEP` / `TRANSFORM_TOO_DEEP`), pour que
 * le diagnostic reste précis. */
const MAX_OPERAND_DEPTH = 6;

/**
 * Valide la forme d'un opérande (`price` | `indicator` | `number` | `arith` |
 * `transform`), quel que soit l'emplacement d'où il est référencé
 * (`comparison.left/right`, `trend.target`, `cross.left/right`, une
 * expression de chart — voir `collectExpressionIssues` — ou récursivement un
 * côté d'`arith` ou la `source` d'un `transform`).
 *
 * Exportée (au-delà de son usage interne par `collectRuleTreeIssues`) car
 * `collectExpressionIssues` valide un `Operand` isolé, hors de tout arbre de
 * règles : la même fonction sert les deux besoins plutôt que d'en dupliquer
 * une variante.
 */
export function collectOperandStructureIssues(
  operand: unknown,
  path: string,
  depth = 0,
): StrategyValidationIssue[] {
  const node = asRecord(operand);
  if (!node) {
    return [
      {
        path,
        code: 'MISSING_OPERAND',
        message: `Missing operand at ${path}.`,
      },
    ];
  }

  switch (node.type) {
    case 'price': {
      const issues: StrategyValidationIssue[] = [];

      if (!PRICE_FIELDS.includes(node.field as (typeof PRICE_FIELDS)[number])) {
        issues.push({
          path,
          code: 'INVALID_PRICE_FIELD',
          allowed: PRICE_FIELDS,
          message:
            `Unknown price field "${String(node.field)}" at ${path}. ` +
            `Allowed: ${PRICE_FIELDS.join(', ')}.`,
        });
      }

      const offsetIssue = collectOffsetIssue(node.offset, path);
      if (offsetIssue) issues.push(offsetIssue);

      return issues;
    }

    case 'number':
      if (typeof node.value !== 'number' || !Number.isFinite(node.value)) {
        return [
          {
            path,
            code: 'INVALID_NUMBER_OPERAND',
            message:
              `Operand at ${path} has type "number" but "value" is not a ` +
              `finite number (received: ${String(node.value)}).`,
          },
        ];
      }
      return [];

    case 'indicator': {
      const issues: StrategyValidationIssue[] = [];
      const issue = validateIndicatorOperand(node);
      if (issue) issues.push({ ...issue, path });

      const offsetIssue = collectOffsetIssue(node.offset, path);
      if (offsetIssue) issues.push(offsetIssue);

      return issues;
    }

    case 'arith': {
      const issues: StrategyValidationIssue[] = [];

      if (
        !ARITH_OPERATORS.includes(
          node.operator as (typeof ARITH_OPERATORS)[number],
        )
      ) {
        issues.push({
          path,
          code: 'UNKNOWN_ARITH_OPERATOR',
          allowed: ARITH_OPERATORS,
          message:
            `Unknown arithmetic operator "${String(node.operator)}" at ${path}. ` +
            `Allowed: ${ARITH_OPERATORS.join(', ')}.`,
        });
      }

      if (depth >= MAX_OPERAND_DEPTH) {
        issues.push({
          path,
          code: 'ARITH_TOO_DEEP',
          message:
            `Arithmetic expression at ${path} exceeds the maximum nesting ` +
            `depth (${MAX_OPERAND_DEPTH}).`,
        });
        return issues;
      }

      return [
        ...issues,
        ...collectOperandStructureIssues(node.left, `${path}.left`, depth + 1),
        ...collectOperandStructureIssues(node.right, `${path}.right`, depth + 1),
      ];
    }

    case 'transform': {
      const issues: StrategyValidationIssue[] = [];

      if (
        !TRANSFORM_KINDS.includes(node.kind as (typeof TRANSFORM_KINDS)[number])
      ) {
        issues.push({
          path,
          code: 'INVALID_TRANSFORM_KIND',
          allowed: TRANSFORM_KINDS,
          message:
            `Unknown transform kind "${String(node.kind)}" at ${path}. ` +
            `Allowed: ${TRANSFORM_KINDS.join(', ')}.`,
        });
      }

      // `period` est optionnel (résolu via TRANSFORM_REGISTRY si omis, voir
      // strategy-engine.type.ts) : seule une valeur *fournie* est validée
      // ici. Plancher à 2, pas 1 : une fenêtre d'un seul point ne définit ni
      // variance (zscore) ni régression (slope) — ce n'est pas un jugement
      // de pertinence, la sortie serait mathématiquement indéterminée.
      if (
        node.period !== undefined &&
        (typeof node.period !== 'number' ||
          !Number.isInteger(node.period) ||
          node.period < 2)
      ) {
        issues.push({
          path,
          code: 'INVALID_TRANSFORM_PERIOD',
          message:
            `Transform period at ${path} must be an integer >= 2 when ` +
            `present (received: ${String(node.period)}).`,
        });
      }

      const offsetIssue = collectOffsetIssue(node.offset, path);
      if (offsetIssue) issues.push(offsetIssue);

      if (depth >= MAX_OPERAND_DEPTH) {
        issues.push({
          path,
          code: 'TRANSFORM_TOO_DEEP',
          message:
            `Transform expression at ${path} exceeds the maximum nesting ` +
            `depth (${MAX_OPERAND_DEPTH}).`,
        });
        return issues;
      }

      return [
        ...issues,
        ...collectOperandStructureIssues(node.source, `${path}.source`, depth + 1),
      ];
    }

    default:
      return [
        {
          path,
          code: 'UNKNOWN_OPERAND_TYPE',
          message:
            `Unknown operand type "${String(node.type)}" at ${path}. ` +
            `Allowed: price, indicator, number, arith, transform.`,
        },
      ];
  }
}

/**
 * Parcourt récursivement un arbre de règles et collecte toutes les anomalies
 * de structure (type de nœud, opérateur, arité) et d'opérandes indicateur
 * qu'il contient.
 *
 * Un nœud invalide interrompt la descente sur cette branche (inutile de
 * valider les enfants d'un groupe logique sans opérateur reconnu), mais pas
 * sur les branches voisines.
 */
export function collectRuleTreeIssues(
  node: RawNode | unknown,
  path = 'rule',
): StrategyValidationIssue[] {
  const current = asRecord(node);
  if (!current) {
    return [
      { path, code: 'MISSING_NODE', message: `Missing rule node at ${path}.` },
    ];
  }

  switch (current.type) {
    case 'logical': {
      const issues: StrategyValidationIssue[] = [];

      if (!LOGICAL_OPERATORS.includes(current.operator as (typeof LOGICAL_OPERATORS)[number])) {
        issues.push({
          path,
          code: 'UNKNOWN_LOGICAL_OPERATOR',
          allowed: LOGICAL_OPERATORS,
          message:
            `Unknown logical operator "${String(current.operator)}" at ${path}. ` +
            `Allowed: ${LOGICAL_OPERATORS.join(', ')}.`,
        });
      }

      if (!Array.isArray(current.conditions) || current.conditions.length === 0) {
        issues.push({
          path,
          code: 'EMPTY_LOGICAL_CONDITIONS',
          message:
            `Logical group at ${path} has no conditions. A group must ` +
            `contain at least one condition.`,
        });
        return issues;
      }

      return [
        ...issues,
        ...current.conditions.flatMap((child, index) =>
          collectRuleTreeIssues(child, `${path}.conditions[${index}]`),
        ),
      ];
    }

    case 'comparison': {
      const issues: StrategyValidationIssue[] = [];

      if (!COMPARISON_OPERATORS.includes(current.operator as (typeof COMPARISON_OPERATORS)[number])) {
        issues.push({
          path,
          code: 'UNKNOWN_COMPARISON_OPERATOR',
          allowed: COMPARISON_OPERATORS,
          message:
            `Unknown comparison operator "${String(current.operator)}" at ${path}. ` +
            `Allowed: ${COMPARISON_OPERATORS.join(', ')}.`,
        });
      }

      return [
        ...issues,
        ...collectOperandStructureIssues(current.left, `${path}.left`),
        ...collectOperandStructureIssues(current.right, `${path}.right`),
      ];
    }

    case 'trend': {
      const issues: StrategyValidationIssue[] = [];

      if (!TREND_DIRECTIONS.includes(current.direction as (typeof TREND_DIRECTIONS)[number])) {
        issues.push({
          path,
          code: 'UNKNOWN_TREND_DIRECTION',
          allowed: TREND_DIRECTIONS,
          message:
            `Unknown trend direction "${String(current.direction)}" at ${path}. ` +
            `Allowed: ${TREND_DIRECTIONS.join(', ')}.`,
        });
      }

      if (
        typeof current.period !== 'number' ||
        !Number.isInteger(current.period) ||
        current.period < 1
      ) {
        issues.push({
          path,
          code: 'INVALID_TREND_PERIOD',
          message:
            `Trend period at ${path} must be an integer >= 1 ` +
            `(received: ${String(current.period)}).`,
        });
      }

      if (
        current.mode !== undefined &&
        !TREND_MODES.includes(current.mode as (typeof TREND_MODES)[number])
      ) {
        issues.push({
          path,
          code: 'UNKNOWN_TREND_MODE',
          allowed: TREND_MODES,
          message:
            `Unknown trend mode "${String(current.mode)}" at ${path}. ` +
            `Allowed: ${TREND_MODES.join(', ')}.`,
        });
      }

      return [
        ...issues,
        ...collectOperandStructureIssues(current.target, `${path}.target`),
      ];
    }

    case 'not': {
      // Rien à valider sur le nœud lui-même : `not` n'a ni opérateur ni
      // opérande, seulement le sous-arbre qu'il inverse.
      return collectRuleTreeIssues(current.condition, `${path}.condition`);
    }

    case 'cross': {
      const issues: StrategyValidationIssue[] = [];

      if (
        !CROSS_DIRECTIONS.includes(
          current.direction as (typeof CROSS_DIRECTIONS)[number],
        )
      ) {
        issues.push({
          path,
          code: 'UNKNOWN_CROSS_DIRECTION',
          allowed: CROSS_DIRECTIONS,
          message:
            `Unknown cross direction "${String(current.direction)}" at ${path}. ` +
            `Allowed: ${CROSS_DIRECTIONS.join(', ')}.`,
        });
      }

      return [
        ...issues,
        ...collectOperandStructureIssues(current.left, `${path}.left`),
        ...collectOperandStructureIssues(current.right, `${path}.right`),
      ];
    }

    case 'constant': {
      if (typeof current.value !== 'boolean') {
        return [
          {
            path,
            code: 'INVALID_CONSTANT_VALUE',
            message:
              `Constant condition at ${path} must have a boolean "value" ` +
              `(received: ${String(current.value)}).`,
          },
        ];
      }
      return [];
    }

    default:
      return [
        {
          path,
          code: 'UNKNOWN_NODE_TYPE',
          message:
            `Unknown rule node type "${String(current.type)}" at ${path}. ` +
            `Allowed: logical, comparison, trend, not, cross, constant.`,
        },
      ];
  }
}

/** Valide une ancre d'ordre : seules les ancres `INDICATOR` sont concernées. */
export function collectAnchorIssues(
  anchor: IOrderAnchor | undefined,
  path: string,
): StrategyValidationIssue[] {
  if (!anchor || anchor.source !== 'INDICATOR') return [];

  const issue = validateIndicatorOperand({
    name: anchor.name.toLowerCase(),
    subField: anchor.subField,
  });

  return issue ? [{ ...issue, path }] : [];
}

/**
 * Valide les arbres de règles présents, sans exiger qu'il y en ait.
 *
 * Tolérant par conception : une stratégie codée en dur
 * (`tol-langit-atr-v7-pro` et consorts) n'a légitimement aucune règle, et une
 * stratégie en cours de configuration peut n'avoir qu'un seul côté. `exit`
 * étant optionnel dans `SideRules`, son absence n'est pas non plus une
 * anomalie. Seul `entry` est obligatoire — et cette contrainte est portée par
 * le type, donc déjà satisfaite à la compilation pour tout appelant typé ; la
 * vérification qui suit ne protège que des données non typées venues du
 * réseau ou de la base.
 */
export function collectStrategyRulesIssues(
  rules: StrategyRules | undefined | null,
  path = 'rules',
): StrategyValidationIssue[] {
  if (!rules) return [];

  const sides = ['long', 'short'] as const;

  return sides.flatMap((side) => {
    const config = rules[side];
    if (!config) return [];

    return [
      ...collectRuleTreeIssues(config.entry, `${path}.${side}.entry`),
      ...(config.exit
        ? collectRuleTreeIssues(config.exit, `${path}.${side}.exit`)
        : []),
    ];
  });
}

/**
 * Variante stricte pour les chemins d'**exécution directe** (backtest, requête
 * d'analyse), où les règles sont la raison même de l'appel.
 *
 * Une stratégie sans `long` ni `short` n'a rien à évaluer :
 * `StrategyEngineService.execute` renverrait silencieusement un tableau de
 * signaux vide. Mieux vaut un rejet explicite qu'une réponse 200 vide qui
 * masque une requête mal formée.
 */
export function collectExecutableStrategyRulesIssues(
  rules: StrategyRules | undefined | null,
  path = 'rules',
): StrategyValidationIssue[] {
  if (!rules || (!rules.long && !rules.short)) {
    return [
      {
        path,
        code: 'EMPTY_STRATEGY_RULES',
        message:
          `Strategy at ${path} has neither "long" nor "short" rules: ` +
          `there is nothing to evaluate.`,
      },
    ];
  }

  return collectStrategyRulesIssues(rules, path);
}

/** Forme minimale acceptée en entrée : les données viennent de JSON, donc non typées. */
interface RawExpression {
  id?: unknown;
  operand?: unknown;
}

/**
 * Valide la liste `expressions` d'une requête d'analyse (Chart UI — voir
 * `ExpressionRequest` dans `trading-shared-types`) : cohérence référentielle
 * de chaque `operand` (réutilise `collectOperandStructureIssues`, la même
 * validation qu'un opérande de règle) et unicité de la clé de réponse
 * (`id` explicite, sinon `buildOperandKey(operand)`).
 *
 * Une expression dont l'opérande est déjà invalide n'entre pas dans le calcul
 * des clés dupliquées : `buildOperandKey` suppose un `Operand` structurellement
 * valide, l'appeler sur une donnée déjà rejetée ne produirait rien d'utile.
 */
export function collectExpressionIssues(
  expressions: readonly RawExpression[] | undefined | null,
  path = 'expressions',
): StrategyValidationIssue[] {
  if (!expressions || expressions.length === 0) return [];

  const issues: StrategyValidationIssue[] = [];
  const indicesByKey = new Map<string, number[]>();

  expressions.forEach((expr, index) => {
    const itemPath = `${path}[${index}]`;
    const hasId = expr?.id !== undefined;

    if (hasId && (typeof expr.id !== 'string' || expr.id.length === 0)) {
      issues.push({
        path: `${itemPath}.id`,
        code: 'INVALID_EXPRESSION_ID',
        message:
          `Expression id at ${itemPath}.id must be a non-empty string when ` +
          `present (received: ${String(expr?.id)}). Omit it entirely to ` +
          `derive the response key from the operand instead.`,
      });
      return;
    }

    const operandIssues = collectOperandStructureIssues(
      expr?.operand,
      `${itemPath}.operand`,
    );
    if (operandIssues.length > 0) {
      issues.push(...operandIssues);
      return;
    }

    const key = hasId
      ? (expr.id as string)
      : buildOperandKey(expr!.operand as Operand);
    const indices = indicesByKey.get(key) ?? [];
    indices.push(index);
    indicesByKey.set(key, indices);
  });

  for (const [key, indices] of indicesByKey) {
    if (indices.length <= 1) continue;
    for (const index of indices) {
      const others = indices.filter((i) => i !== index).join(', ');
      issues.push({
        path: `${path}[${index}]`,
        code: 'DUPLICATE_EXPRESSION_KEY',
        message:
          `Expression at ${path}[${index}] resolves to response key "${key}", ` +
          `also produced by expression(s) at index ${others}. Give each a ` +
          `distinct explicit "id", or ensure their operands differ.`,
      });
    }
  }

  return issues;
}

/**
 * Valide l'intégralité d'une stratégie de paire : arbres de règles, ancres et
 * conditions des ordres latents et protecteurs.
 *
 * `settings` n'est volontairement pas validé. Cette fonction est fail-closed —
 * une anomalie écarte la paire du trading (voir `rejectAmbiguousPairs` dans
 * nest-trading-bot) — et aucun consommateur ne lit encore `settings` : rejeter
 * une stratégie pour un réglage sans effet couperait le trading au nom d'un
 * champ inerte. À valider le jour où une stratégie l'exploite réellement.
 */
export function collectStrategyIssues(
  strategy: IExchangeStrategy | undefined | null,
  path = 'strategy',
): StrategyValidationIssue[] {
  if (!strategy) return [];

  const issues: StrategyValidationIssue[] = [
    ...collectStrategyRulesIssues(strategy.rules, `${path}.rules`),
  ];

  // Ordres latents et protecteurs : ancre de prix + condition de déclenchement.
  // `condition` absente signifie « toujours applicable » (voir
  // `StrategyEngineService.evaluateCondition`) : ce n'est pas une anomalie.
  const groups = [
    { key: 'latent', entries: strategy.latent?.entries },
    { key: 'protective', entries: strategy.protective?.entries },
  ] as const;

  for (const group of groups) {
    if (!Array.isArray(group.entries)) continue;

    group.entries.forEach((entry, index) => {
      const entryPath = `${path}.${group.key}.entries[${index}]`;
      issues.push(...collectAnchorIssues(entry?.anchor, `${entryPath}.anchor`));
      if (entry?.condition) {
        issues.push(
          ...collectRuleTreeIssues(entry.condition, `${entryPath}.condition`),
        );
      }
    });
  }

  return issues;
}

/** Valide la stratégie attachée à une paire. */
export function collectPairIssues(
  pair: IExchangePair,
): StrategyValidationIssue[] {
  return collectStrategyIssues(pair.strategy, `${pair.name}.strategy`);
}

/** Rend un ensemble d'anomalies lisible sur une seule ligne de log. */
export function formatStrategyIssues(
  issues: readonly StrategyValidationIssue[],
): string {
  return issues
    .map((issue) => `[${issue.code}] ${issue.path}: ${issue.message}`)
    .join(' | ');
}

/**
 * Sous-ensemble de `StrategyValidationIssue` destiné à traverser une
 * frontière HTTP. `indicator` / `subField` sont typés `unknown` — des détails
 * de diagnostic interne (voir `validateIndicatorOperand`), pas des valeurs
 * qu'un client peut exploiter tel quel.
 */
export type PublicStrategyValidationIssue = Pick<
  StrategyValidationIssue,
  'code' | 'path' | 'message' | 'allowed'
>;

/**
 * Réponse d'une validation de stratégie, telle qu'exposée à un client (ex:
 * `POST /exchanges/strategies/validate` dans nest-trading-bot).
 */
export interface StrategyValidationResult {
  valid: boolean;
  issues: PublicStrategyValidationIssue[];
}

/**
 * Construit l'enveloppe `StrategyValidationResult` à partir d'un ensemble
 * d'anomalies. Point d'application unique de la troncature vers
 * `PublicStrategyValidationIssue`, pour que chaque consommateur HTTP (bot,
 * app mobile) expose exactement les mêmes champs sans redéfinir la liste.
 */
export function toStrategyValidationResult(
  issues: readonly StrategyValidationIssue[],
): StrategyValidationResult {
  return {
    valid: issues.length === 0,
    issues: issues.map(({ code, path, message, allowed }) => ({
      code,
      path,
      message,
      allowed,
    })),
  };
}
