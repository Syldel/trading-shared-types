import { FUNCTION_KINDS } from './strategy-engine.type.js';
import type { FunctionKind } from './strategy-engine.type.js';

/**
 * ============================================================================
 * 📖 FUNCTION REGISTRY
 * Source unique par fonction combinatoire (`FunctionKind`, déclaré dans
 * `strategy-engine.type.ts`) : libellé et arité. Même rôle que
 * `TRANSFORM_REGISTRY` (transform-registry.ts) mais pour les nœuds `fn`
 * d'`Operand` — une fonction combine plusieurs opérandes évalués au même
 * index de bougie (ex: `max(spanA, spanB)`), alors qu'un `transform` glisse
 * dans le temps sur une seule série. Les deux se composent librement : un
 * `fn` peut prendre un `transform` en argument, et inversement.
 * ============================================================================
 */

export interface FunctionMetadata {
  kind: FunctionKind;
  label: string;
  /** Nombre minimum d'arguments accepté par la fonction. */
  minArgs: number;
  /**
   * Nombre maximum d'arguments propre à la fonction, ou `null` si elle n'a
   * pas de plafond métier. Reste dans tous les cas borné en pratique par
   * `MAX_FN_ARGS` (`strategy-validation.ts`), une limite structurelle
   * partagée par tout nœud `fn` variadique, pas une caractéristique de
   * `min`/`max` — voir la note sur `MAX_OPERAND_DEPTH` dans le même fichier
   * pour la même logique appliquée à la profondeur plutôt qu'à l'arité.
   */
  maxArgs: number | null;
}

export const FUNCTION_REGISTRY: { [K in FunctionKind]: FunctionMetadata } = {
  min: {
    kind: 'min',
    label: 'Minimum',
    minArgs: 2,
    maxArgs: null,
  },
  max: {
    kind: 'max',
    label: 'Maximum',
    minArgs: 2,
    maxArgs: null,
  },
};

/**
 * Catalogue de métadonnées fonctions, tel qu'exposé aux clients (formulaire
 * de règles). Miroir d'`AVAILABLE_TRANSFORMS_METADATA` (transform-registry.ts).
 */
export const AVAILABLE_FUNCTIONS_METADATA: FunctionMetadata[] =
  FUNCTION_KINDS.map((kind) => FUNCTION_REGISTRY[kind]);

/** Vérifie qu'une valeur correspond à un type de fonction connu. */
export function isFunctionKind(value: unknown): value is FunctionKind {
  return (
    typeof value === 'string' &&
    (FUNCTION_KINDS as readonly string[]).includes(value)
  );
}
