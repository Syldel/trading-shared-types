import type { ComparisonCondition, CrossCondition, Operand, RuleNode, TrendCondition } from './strategy-engine.type.js';

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
  | { reason: 'NON_ARRAY_CONDITIONS'; node: unknown }
  | { reason: 'UNKNOWN_OPERAND_TYPE'; operand: unknown };

export interface RuleTreeVisitor {
  /** Appelé pour chaque nœud visité, avant la descente dans ses enfants/opérandes. */
  onNode?: (node: RuleNode) => void;
  /**
   * Appelé pour chaque opérande *feuille* atteignable (`comparison.left`/`.right`,
   * `trend.target`, `cross.left`/`.right`). Un opérande `arith` n'est jamais
   * transmis lui-même : le walker descend dans `.left`/`.right` jusqu'aux
   * feuilles (`price`/`indicator`/`number`/`transform`) — sans quoi un
   * indicateur niché dans une expression arithmétique ne serait jamais
   * calculé. `key` désigne l'emplacement sur le nœud parent, pas la position
   * dans l'arbre `arith`.
   *
   * `transform` est transmis tel quel (comme `indicator`), jamais décomposé :
   * bien qu'il porte lui-même un `source: Operand` imbriqué, résoudre cette
   * source récursivement est la responsabilité du consommateur qui sait
   * calculer une transformation (le moteur de stratégie), pas de ce walker.
   * Un consommateur qui ignore `transform` (ex: l'extraction d'ancres
   * d'ordre, qui ne s'intéresse qu'à `indicator`) n'a donc pas à connaître
   * cette récursion interne.
   *
   * `fn` est décomposé comme `arith` (jamais transmis lui-même) : il n'a pas
   * de série propre à matérialiser, seulement une liste d'`args` à visiter
   * jusqu'à leurs feuilles — même raisonnement que pour `arith` ci-dessus.
   */
  onOperand?: (
    operand: Operand,
    context: {
      node: ComparisonCondition | TrendCondition | CrossCondition;
      key: 'left' | 'right' | 'target';
    },
  ) => void;
  /** Appelé quand la structure rencontrée ne correspond à aucun type de nœud/opérande connu. */
  onMalformed?: (malformation: RuleTreeMalformation) => void;
}

function walkOperand(
  operand: Operand,
  context: {
    node: ComparisonCondition | TrendCondition | CrossCondition;
    key: 'left' | 'right' | 'target';
  },
  visitor: RuleTreeVisitor,
): void {
  if (!operand || typeof operand !== 'object') {
    visitor.onMalformed?.({ reason: 'UNKNOWN_OPERAND_TYPE', operand });
    return;
  }

  if (operand.type === 'arith') {
    walkOperand(operand.left, context, visitor);
    walkOperand(operand.right, context, visitor);
    return;
  }

  if (operand.type === 'fn') {
    for (const arg of operand.args) {
      walkOperand(arg, context, visitor);
    }
    return;
  }

  visitor.onOperand?.(operand, context);
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
      walkOperand(node.left, { node, key: 'left' }, visitor);
      walkOperand(node.right, { node, key: 'right' }, visitor);
      return;
    }

    case 'trend': {
      visitor.onNode?.(node);
      walkOperand(node.target, { node, key: 'target' }, visitor);
      return;
    }

    case 'cross': {
      visitor.onNode?.(node);
      walkOperand(node.left, { node, key: 'left' }, visitor);
      walkOperand(node.right, { node, key: 'right' }, visitor);
      return;
    }

    case 'not': {
      visitor.onNode?.(node);
      walkRuleTree(node.condition, visitor);
      return;
    }

    case 'constant': {
      visitor.onNode?.(node);
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
