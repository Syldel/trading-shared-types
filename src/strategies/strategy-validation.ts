import type {
  IExchangePair,
  IExchangeStrategy,
  IOrderAnchor,
} from '../exchange/exchange-config.interface.js';
import {
  validateIndicatorOperand,
  type IndicatorOperandIssue,
} from '../indicators/indicator-subfields.js';
import type { AdvancedStrategyParameters } from './strategy-engine.type.js';

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

/** Anomalie d'opérande, située dans la structure de la stratégie. */
export interface StrategyValidationIssue extends IndicatorOperandIssue {
  /** Emplacement de l'opérande fautif (ex: `long.entry.conditions[0].left`). */
  path: string;
}

/** Une valeur de nœud/opérande telle qu'elle arrive du JSON : non typée. */
type RawNode = Record<string, unknown> | null | undefined;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Valide un opérande unique s'il s'agit d'un opérande de type `indicator`.
 * Les opérandes `number` et `price` ne désignent jamais d'indicateur.
 */
function collectOperandIssues(
  operand: unknown,
  path: string,
): StrategyValidationIssue[] {
  const node = asRecord(operand);
  if (!node || node.type !== 'indicator') return [];

  const issue = validateIndicatorOperand(node);
  return issue ? [{ ...issue, path }] : [];
}

/**
 * Parcourt récursivement un arbre de règles et collecte toutes les anomalies
 * d'opérandes indicateur qu'il contient.
 */
export function collectRuleTreeIssues(
  node: RawNode | unknown,
  path = 'rule',
): StrategyValidationIssue[] {
  const current = asRecord(node);
  if (!current) return [];

  if (current.type === 'logical' && Array.isArray(current.conditions)) {
    return current.conditions.flatMap((child, index) =>
      collectRuleTreeIssues(child, `${path}.conditions[${index}]`),
    );
  }

  if (current.type === 'comparison') {
    return [
      ...collectOperandIssues(current.left, `${path}.left`),
      ...collectOperandIssues(current.right, `${path}.right`),
    ];
  }

  if (current.type === 'trend') {
    return collectOperandIssues(current.target, `${path}.target`);
  }

  return [];
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
 */
export function collectAdvancedParametersIssues(
  parameters: AdvancedStrategyParameters | undefined | null,
  path = 'parameters',
): StrategyValidationIssue[] {
  if (!parameters) return [];

  const sides = ['long', 'short'] as const;

  return sides.flatMap((side) => {
    const config = parameters[side];
    if (!config) return [];

    return [
      ...collectRuleTreeIssues(config.entry, `${path}.${side}.entry`),
      ...collectRuleTreeIssues(config.exit, `${path}.${side}.exit`),
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

  const issues: StrategyValidationIssue[] = [];

  // Arbres de règles du rule-builder
  if (Array.isArray(strategy.parameters)) {
    strategy.parameters.forEach((parameter, index) => {
      if (parameter?.type !== 'rule-builder') return;
      issues.push(
        ...collectRuleTreeIssues(
          parameter.default,
          `${path}.parameters[${index}](${parameter.id})`,
        ),
      );
    });
  }

  // Ordres latents et protecteurs : ancre de prix + condition de déclenchement
  const groups = [
    { key: 'latent', entries: strategy.latent?.entries },
    { key: 'protective', entries: strategy.protective?.entries },
  ] as const;

  for (const group of groups) {
    if (!Array.isArray(group.entries)) continue;

    group.entries.forEach((entry, index) => {
      const entryPath = `${path}.${group.key}.entries[${index}]`;
      issues.push(...collectAnchorIssues(entry?.anchor, `${entryPath}.anchor`));
      issues.push(
        ...collectRuleTreeIssues(entry?.condition, `${entryPath}.condition`),
      );
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
