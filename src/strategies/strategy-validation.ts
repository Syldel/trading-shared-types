import type {
  IExchangePair,
  IExchangeStrategy,
  IOrderAnchor,
  StrategyParameter,
} from '../exchange/exchange-config.interface.js';
import {
  validateIndicatorOperand,
  type IndicatorOperandIssueCode,
} from '../indicators/indicator-subfields.js';
import {
  COMPARISON_OPERATORS,
  LOGICAL_OPERATORS,
  PRICE_FIELDS,
  TREND_DIRECTIONS,
  type AdvancedStrategyParameters,
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
  | 'INVALID_NUMBER_OPERAND'
  | 'UNKNOWN_TREND_DIRECTION'
  | 'INVALID_TREND_PERIOD'
  | 'INVALID_RULE_BUILDER_ID'
  | 'EMPTY_STRATEGY_PARAMETERS';

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
 * Valide la forme d'un opérande (`price` | `indicator` | `number`), quel que
 * soit l'emplacement d'où il est référencé (`comparison.left/right` ou
 * `trend.target`).
 */
function collectOperandStructureIssues(
  operand: unknown,
  path: string,
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
    case 'price':
      if (!PRICE_FIELDS.includes(node.field as (typeof PRICE_FIELDS)[number])) {
        return [
          {
            path,
            code: 'INVALID_PRICE_FIELD',
            allowed: PRICE_FIELDS,
            message:
              `Unknown price field "${String(node.field)}" at ${path}. ` +
              `Allowed: ${PRICE_FIELDS.join(', ')}.`,
          },
        ];
      }
      return [];

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
      const issue = validateIndicatorOperand(node);
      return issue ? [{ ...issue, path }] : [];
    }

    default:
      return [
        {
          path,
          code: 'UNKNOWN_OPERAND_TYPE',
          message:
            `Unknown operand type "${String(node.type)}" at ${path}. ` +
            `Allowed: price, indicator, number.`,
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

      return [
        ...issues,
        ...collectOperandStructureIssues(current.target, `${path}.target`),
      ];
    }

    default:
      return [
        {
          path,
          code: 'UNKNOWN_NODE_TYPE',
          message:
            `Unknown rule node type "${String(current.type)}" at ${path}. ` +
            `Allowed: logical, comparison, trend.`,
        },
      ];
  }
}

/**
 * Un paramètre `rule-builder` n'est exploitable par le moteur que si son `id`
 * suit la convention `long|short.entry|exit` : c'est ce que
 * `mapExchangeStrategyToDto` (nest-trading-bot) utilise pour reconstituer
 * `AdvancedStrategyParameters` à partir de la liste de paramètres. Un id hors
 * convention n'est pas rejeté à l'exécution, il est silencieusement ignoré au
 * mapping — d'où la nécessité de le signaler ici.
 */
const RULE_BUILDER_ID_PATTERN = /^(long|short)\.(entry|exit)$/;

/**
 * Valide les paramètres `rule-builder` d'une stratégie de paire et vérifie la
 * cohérence par côté : un côté qui expose un `exit` configuré doit aussi
 * exposer un `entry` (l'inverse du moteur, qui ne peut pas évaluer une sortie
 * sans entrée — voir `AdvancedStrategyParameters`). Un côté totalement
 * inconfiguré (aucun `default` renseigné) n'est pas une anomalie : c'est un
 * état d'attente légitime avant configuration.
 */
function collectRuleBuilderParametersIssues(
  parameters: StrategyParameter[] | undefined,
  path: string,
): StrategyValidationIssue[] {
  const issues: StrategyValidationIssue[] = [];
  const configuredBySide: Record<'long' | 'short', Set<'entry' | 'exit'>> = {
    long: new Set(),
    short: new Set(),
  };

  parameters?.forEach((parameter, index) => {
    if (parameter?.type !== 'rule-builder') return;

    const parameterPath = `${path}.parameters[${index}](${parameter.id})`;
    const match = RULE_BUILDER_ID_PATTERN.exec(parameter.id ?? '');

    if (!match) {
      issues.push({
        path: parameterPath,
        code: 'INVALID_RULE_BUILDER_ID',
        message:
          `Rule-builder parameter id "${String(parameter.id)}" at ${parameterPath} ` +
          `does not follow the "long|short.entry|exit" convention the trading ` +
          `engine relies on to map parameters to a side. It will be silently ` +
          `ignored at execution.`,
      });
      return;
    }

    // `default: null` est un état légitime (paramètre pas encore configuré).
    if (!parameter.default) return;

    const side = match[1] as 'long' | 'short';
    const action = match[2] as 'entry' | 'exit';
    configuredBySide[side].add(action);

    issues.push(...collectRuleTreeIssues(parameter.default, parameterPath));
  });

  (['long', 'short'] as const).forEach((side) => {
    const configured = configuredBySide[side];
    if (configured.has('exit') && !configured.has('entry')) {
      issues.push(...collectRuleTreeIssues(undefined, `${path}.${side}.entry`));
    }
  });

  return issues;
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
 * Valide les arbres de règles d'entrée/sortie d'une stratégie `advanced-rules`
 * exécutée directement (backtest, requête d'analyse).
 *
 * `exit` est optionnel par construction (`AdvancedStrategyParameters`) : son
 * absence n'est pas une anomalie, elle n'est donc validée que si présente.
 *
 * En revanche, une stratégie sans `long` ni `short` du tout n'a rien à
 * évaluer : `StrategyEngineService.execute` renverrait silencieusement un
 * tableau de signaux vide. Sur ce chemin d'exécution directe, mieux vaut un
 * rejet explicite qu'une réponse 200 vide qui masque une requête mal formée.
 */
export function collectAdvancedParametersIssues(
  parameters: AdvancedStrategyParameters | undefined | null,
  path = 'parameters',
): StrategyValidationIssue[] {
  if (!parameters || (!parameters.long && !parameters.short)) {
    return [
      {
        path,
        code: 'EMPTY_STRATEGY_PARAMETERS',
        message:
          `Strategy at ${path} has neither "long" nor "short" configuration: ` +
          `there is nothing to evaluate.`,
      },
    ];
  }

  const sides = ['long', 'short'] as const;

  return sides.flatMap((side) => {
    const config = parameters[side];
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
 * Valide l'intégralité d'une stratégie de paire : arbres de règles du
 * rule-builder, ancres et conditions des ordres latents et protecteurs.
 */
export function collectStrategyIssues(
  strategy: IExchangeStrategy | undefined | null,
  path = 'strategy',
): StrategyValidationIssue[] {
  if (!strategy) return [];

  const issues: StrategyValidationIssue[] = [
    ...collectRuleBuilderParametersIssues(strategy.parameters, path),
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
