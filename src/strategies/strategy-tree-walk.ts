import type { ComparisonCondition, Operand, RuleNode, TrendCondition } from './strategy-engine.type.js';

/**
 * ============================================================================
 * 🌳 RULE TREE WALK
 * Point d'entrée unique pour parcourir un `RuleNode` déjà typé (donnée
 * validée en amont) et visiter chaque nœud et chaque opérande qu'il contient.
 *
 * Volontairement distinct de `collectRuleTreeIssues` (`strategy-validation.ts`) :
 * celui-ci valide une donnée **non typée** venant du réseau/JSON, doit
 * continuer sur les branches voisines après une anomalie et construire un
 * chemin (`path`) par anomalie. Deux besoins différents ; les unifier de force
 * aurait complexifié les deux pour un bénéfice faible.
 * ============================================================================
 */

/**
 * Anomalie structurelle rencontrée pendant le parcours d'un `RuleNode` en
 * principe déjà typé. Ne devrait se produire qu'en cas de drift entre les
 * types et la donnée réelle (contournement de TypeScript à une frontière non
 * validée) — le parcours reste défensif plutôt que de lever une exception,
 * pour rester utilisable sur le chemin ordres (voir `known-gaps.md`).
 */
export type RuleTreeMalformation =
  | { reason: 'UNKNOWN_NODE_TYPE'; node: unknown }
  | { reason: 'NON_ARRAY_CONDITIONS'; node: unknown };

export interface RuleTreeVisitor {
  /** Appelé pour chaque nœud visité, avant la descente dans ses enfants/opérandes. */
  onNode?: (node: RuleNode) => void;
  /** Appelé pour chaque opérande atteignable (`comparison.left`/`.right`, `trend.target`). */
  onOperand?: (
    operand: Operand,
    context: { node: ComparisonCondition | TrendCondition; key: 'left' | 'right' | 'target' },
  ) => void;
  /** Appelé quand la structure rencontrée ne correspond à aucun type de nœud connu. */
  onMalformed?: (malformation: RuleTreeMalformation) => void;
}

/**
 * Parcourt récursivement un arbre de règles et invoque les callbacks du
 * visiteur pour chaque nœud et chaque opérande rencontrés.
 *
 * Ne fait aucun jugement sur la validité métier de l'arbre (période de trend,
 * groupe logique vide, etc.) : c'est au visiteur d'inspecter le nœud reçu via
 * `onNode` et de décider quoi en faire (log, calcul, etc.) — ce module ne
 * fait que garantir qu'aucun nœud ni opérande n'est oublié.
 */
export function walkRuleTree(node: RuleNode, visitor: RuleTreeVisitor): void {
  if (!node || typeof node !== 'object') {
    visitor.onMalformed?.({ reason: 'UNKNOWN_NODE_TYPE', node });
    return;
  }

  switch (node.type) {
    case 'logical': {
      // Vérifié avant `onNode` : le visiteur doit pouvoir supposer que
      // `node.conditions` est un tableau (fût-il vide) dès lors que `onNode`
      // est appelé — l'anomalie structurelle passe uniquement par
      // `onMalformed`, jamais les deux à la fois pour le même nœud.
      if (!Array.isArray(node.conditions)) {
        visitor.onMalformed?.({ reason: 'NON_ARRAY_CONDITIONS', node });
        return;
      }
      visitor.onNode?.(node);
      for (const child of node.conditions) {
        walkRuleTree(child, visitor);
      }
      return;
    }

    case 'comparison': {
      visitor.onNode?.(node);
      visitor.onOperand?.(node.left, { node, key: 'left' });
      visitor.onOperand?.(node.right, { node, key: 'right' });
      return;
    }

    case 'trend': {
      visitor.onNode?.(node);
      visitor.onOperand?.(node.target, { node, key: 'target' });
      return;
    }

    default: {
      // Exhaustivité : si `RuleNode` gagne un type de nœud, cette branche
      // redevient atteignable pour le compilateur et signale l'oubli ici.
      visitor.onMalformed?.({ reason: 'UNKNOWN_NODE_TYPE', node });
      return;
    }
  }
}
