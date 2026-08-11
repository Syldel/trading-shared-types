import type { NumberIndicatorParameter } from '../exchange/indicator-meta.type.js';
import { TRANSFORM_KINDS } from './strategy-engine.type.js';
import type { TransformKind } from './strategy-engine.type.js';

/**
 * ============================================================================
 * 📖 TRANSFORM REGISTRY
 * Source unique par transformation glissante (`TransformKind`, déclaré dans
 * `strategy-engine.type.ts`) : libellé, échelle de sortie, période par
 * défaut. Même rôle que `INDICATOR_REGISTRY`
 * (indicators/indicator-registry.ts) mais pour les nœuds `transform`
 * d'`Operand` — une transformation n'est pas un indicateur, elle s'applique
 * à la série produite par n'importe quel opérande (indicateur, prix, arith,
 * ou une autre transformation).
 * ============================================================================
 */

/**
 * Échelle/interprétation de la sortie d'une transformation. N'est jamais
 * utilisée pour bloquer une combinaison — le moteur reste volontairement
 * permissif sur la pertinence métier d'un opérande (voir l'en-tête de
 * `strategy-validation.ts`) : ce champ sert uniquement à un consommateur
 * (UI, aide à la saisie) pour signaler une comparaison entre échelles
 * incompatibles sans l'interdire.
 *
 * `sameAsSource` (`slope`) signifie que la sortie reste dans l'unité de
 * `source` (points d'ADX par bougie, prix par bougie, ...) : contrairement
 * aux trois autres échelles, elle n'est donc PAS comparable d'un actif ou
 * d'un indicateur à l'autre sans transformation supplémentaire.
 */
export type TransformOutputScale = 'zscore' | 'percent' | 'ratio' | 'sameAsSource';

export interface TransformMetadata {
  kind: TransformKind;
  label: string;
  outputScale: TransformOutputScale;
  /** Toujours exactement un paramètre : la taille de la fenêtre glissante. */
  parameters: readonly [NumberIndicatorParameter];
}

/**
 * `min: 2` reflète une contrainte mathématique, pas un jugement de
 * pertinence : sous 2 valeurs, une variance/régression n'est pas définie
 * (écart-type d'un seul point, pente d'un seul point). Voir la même
 * justification dans `strategy-validation.ts` (`INVALID_TRANSFORM_PERIOD`).
 */
function periodParam(defaultValue: number): readonly [NumberIndicatorParameter] {
  return [{ type: 'number', name: 'period', label: 'Period', defaultValue, min: 2 }];
}

export const TRANSFORM_REGISTRY: { [K in TransformKind]: TransformMetadata } = {
  zscore: {
    kind: 'zscore',
    label: 'Z-Score',
    outputScale: 'zscore',
    parameters: periodParam(200),
  },
  percentile: {
    kind: 'percentile',
    label: 'Percentile Rank',
    outputScale: 'percent',
    parameters: periodParam(200),
  },
  ratioToMa: {
    kind: 'ratioToMa',
    label: 'Ratio to Moving Average',
    outputScale: 'ratio',
    parameters: periodParam(100),
  },
  slope: {
    kind: 'slope',
    label: 'Slope (Linear Regression)',
    outputScale: 'sameAsSource',
    parameters: periodParam(20),
  },
};

/**
 * Catalogue de métadonnées transformations, tel qu'exposé aux clients
 * (formulaire de règles). Miroir d'`AVAILABLE_INDICATORS_METADATA`
 * (indicator-registry.ts).
 */
export const AVAILABLE_TRANSFORMS_METADATA: TransformMetadata[] =
  TRANSFORM_KINDS.map((kind) => TRANSFORM_REGISTRY[kind]);

/** Vérifie qu'une valeur correspond à un type de transformation connu. */
export function isTransformKind(value: unknown): value is TransformKind {
  return (
    typeof value === 'string' &&
    (TRANSFORM_KINDS as readonly string[]).includes(value)
  );
}

/** Période par défaut d'une transformation, résolue depuis `TRANSFORM_REGISTRY`. */
export function getDefaultTransformPeriod(kind: TransformKind): number {
  return TRANSFORM_REGISTRY[kind].parameters[0].defaultValue;
}

/**
 * Période effective d'un `transform` : celle fournie, sinon la valeur par
 * défaut du registre. Même rôle que `resolveIndicatorParams`
 * (indicator-defaults.ts) pour un `IndicatorOperand`.
 */
export function resolveTransformPeriod(
  kind: TransformKind,
  period?: number | null,
): number {
  return period ?? getDefaultTransformPeriod(kind);
}
