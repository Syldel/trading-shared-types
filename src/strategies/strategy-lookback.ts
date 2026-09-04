import { getIndicatorOperandLookback } from '../indicators/indicator-lookback.js';
import { resolveTransformPeriod } from './transform-registry.js';
import type { Operand, RuleNode, StrategyRules } from './strategy-engine.type.js';

/**
 * ============================================================================
 * 📏 STRATEGY LOOKBACK
 * Nombre minimal de bougies précédant la fenêtre affichée nécessaires pour
 * qu'un `Operand` / `RuleNode` / `StrategyRules` produise une valeur définie
 * dès la première bougie de cette fenêtre — ni plus ni moins que ce que
 * l'arbre exige structurellement (voir `getIndicatorOperandLookback`,
 * indicator-lookback.ts, pour la même distinction appliquée à un indicateur
 * seul).
 *
 * Consommateurs typiques : combien de bougies fetch en amont de la fenêtre
 * affichée avant d'appeler `POST /analysis` (Chart UI, backtest).
 * ============================================================================
 */

/** Lookback d'un opérande isolé, quel que soit son type — récursif sur `arith`/`transform`/`fn`. */
export function computeOperandLookback(operand: Operand): number {
  switch (operand.type) {
    case 'number':
      return 0;

    case 'price':
      return operand.offset ?? 0;

    case 'indicator':
      return getIndicatorOperandLookback(operand) + (operand.offset ?? 0);

    // Les deux branches sont évaluées à la même bougie : le lookback est
    // dicté par la branche la plus exigeante, pas par leur somme.
    case 'arith':
      return Math.max(
        computeOperandLookback(operand.left),
        computeOperandLookback(operand.right),
      );

    // La fenêtre glissante de la transformation s'ajoute au warm-up de sa
    // propre source : une transformation ne "voit" une série stable qu'une
    // fois sa source elle-même stabilisée.
    case 'transform':
      return (
        resolveTransformPeriod(operand.kind, operand.period) +
        computeOperandLookback(operand.source) +
        (operand.offset ?? 0)
      );

    // Même raisonnement que `arith` : tous les arguments sont évalués à la
    // même bougie, seul le plus exigeant compte.
    case 'fn':
      return Math.max(0, ...operand.args.map(computeOperandLookback));
  }
}

/** Lookback d'un nœud d'arbre de règles isolé — récursif sur `logical`/`not`. */
export function computeRuleNodeLookback(node: RuleNode): number {
  switch (node.type) {
    case 'logical':
      return Math.max(0, ...node.conditions.map(computeRuleNodeLookback));

    case 'comparison':
      return Math.max(
        computeOperandLookback(node.left),
        computeOperandLookback(node.right),
      );

    // La fenêtre de tendance s'ajoute au warm-up de sa cible : chaque pas de
    // la fenêtre exige sa propre valeur résolue, pas seulement la dernière.
    case 'trend':
      return computeOperandLookback(node.target) + node.period;

    case 'not':
      return computeRuleNodeLookback(node.condition);

    // Un croisement compare la bougie courante à la précédente : une bougie
    // de plus que le warm-up des opérandes comparés eux-mêmes.
    case 'cross':
      return (
        Math.max(
          computeOperandLookback(node.left),
          computeOperandLookback(node.right),
        ) + 1
      );

    case 'constant':
      return 0;
  }
}

/**
 * Lookback de l'ensemble des règles d'une stratégie — le maximum sur toutes
 * les branches présentes (`long`/`short` × `entry`/`exit`), tolérant comme
 * `collectStrategyRulesIssues` : une stratégie partielle ou absente renvoie 0
 * plutôt que d'échouer.
 */
export function computeStrategyRulesLookback(
  rules: StrategyRules | undefined | null,
): number {
  if (!rules) return 0;

  const nodes: RuleNode[] = [];
  for (const side of [rules.long, rules.short]) {
    if (!side) continue;
    nodes.push(side.entry);
    if (side.exit) nodes.push(side.exit);
  }

  return Math.max(0, ...nodes.map(computeRuleNodeLookback));
}
