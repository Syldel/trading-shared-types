import { INDICATOR_NAMES } from './indicator-request.types.js';
import type { IndicatorName } from './indicator-request.types.js';

/**
 * ============================================================================
 * 🎯 INDICATOR SUBFIELDS REGISTRY
 * Source unique des lignes (subFields) exposées par chaque indicateur
 * multi-lignes, et des règles de cohérence associées.
 *
 * Motivation : un indicateur multi-lignes ne désigne PAS une valeur unique.
 * Sans `subField` explicite, `adx` peut désigner la ligne ADX, +DI ou -DI.
 * Choisir une ligne par défaut produit une valeur plausible mais arbitraire :
 * l'erreur est alors invisible. Ce registre rend cette ambiguïté détectable.
 *
 * Ne jamais recopier ces listes ailleurs : importer `INDICATOR_SUBFIELDS`
 * ou passer par `validateIndicatorOperand`.
 * ============================================================================
 */

/** Une ligne calculée par un indicateur multi-lignes. */
export interface IndicatorSubFieldDefinition {
  /** Clé technique présente dans la sortie du calcul (ex: `pdi`). */
  name: string;
  /** Libellé destiné à l'UI (ex: `+DI (Plus Directional Index)`). */
  label: string;
}

/**
 * Lignes disponibles par indicateur multi-lignes.
 *
 * Un indicateur absent de ce registre est mono-ligne : il produit une valeur
 * unique et n'accepte donc aucun `subField`.
 *
 * Les clés `name` correspondent exactement aux champs des types de valeurs
 * de `indicator-series.types.ts` (`AdxValue`, `MacdValue`, ...).
 */
export const INDICATOR_SUBFIELDS = {
  macd: [
    { name: 'macd', label: 'MACD Line (Value)' },
    { name: 'signal', label: 'Signal Line' },
    { name: 'histogram', label: 'Histogram' },
  ],
  adx: [
    { name: 'adx', label: 'ADX Line' },
    { name: 'pdi', label: '+DI (Plus Directional Index)' },
    { name: 'mdi', label: '-DI (Minus Directional Index)' },
  ],
  ichimoku: [
    { name: 'conversion', label: 'Tenkan-Sen (Conversion Line)' },
    { name: 'base', label: 'Kijun-Sen (Base Line)' },
    { name: 'spanA', label: 'Senkou Span A (Leading A)' },
    { name: 'spanB', label: 'Senkou Span B (Leading B)' },
  ],
  bb: [
    { name: 'upper', label: 'Upper Band' },
    { name: 'middle', label: 'Middle Band' },
    { name: 'lower', label: 'Lower Band' },
  ],
  keltner: [
    { name: 'upper', label: 'Upper Band' },
    { name: 'middle', label: 'Middle Band (EMA)' },
    { name: 'lower', label: 'Lower Band' },
  ],
  donchian: [
    { name: 'upper', label: 'Upper Band (Highest High)' },
    { name: 'middle', label: 'Middle Band' },
    { name: 'lower', label: 'Lower Band (Lowest Low)' },
    { name: 'width', label: 'Channel Width' },
  ],
  supertrend: [
    { name: 'supertrend', label: 'Supertrend Line' },
    { name: 'direction', label: 'Direction (1 / -1)' },
  ],
  stochrsi: [
    { name: 'k', label: '%K' },
    { name: 'd', label: '%D' },
    { name: 'stochRSI', label: 'StochRSI' },
  ],
  pivotpoints: [
    { name: 'pivot', label: 'Pivot (P)' },
    { name: 'r1', label: 'Resistance 1 (R1)' },
    { name: 'r2', label: 'Resistance 2 (R2)' },
    { name: 'r3', label: 'Resistance 3 (R3)' },
    { name: 'r4', label: 'Resistance 4 (R4)' },
    { name: 's1', label: 'Support 1 (S1)' },
    { name: 's2', label: 'Support 2 (S2)' },
    { name: 's3', label: 'Support 3 (S3)' },
    { name: 's4', label: 'Support 4 (S4)' },
  ],
} as const satisfies Partial<
  Record<IndicatorName, readonly IndicatorSubFieldDefinition[]>
>;

/** Indicateurs produisant plusieurs lignes, donc exigeant un `subField`. */
export type MultiLineIndicatorName = keyof typeof INDICATOR_SUBFIELDS;

/** Vérifie qu'un nom correspond à un indicateur connu du registre. */
export function isIndicatorName(name: unknown): name is IndicatorName {
  return (
    typeof name === 'string' &&
    (INDICATOR_NAMES as readonly string[]).includes(name)
  );
}

/** Vérifie qu'un indicateur produit plusieurs lignes. */
export function isMultiLineIndicator(
  name: IndicatorName,
): name is MultiLineIndicatorName {
  return name in INDICATOR_SUBFIELDS;
}

/**
 * Lignes disponibles pour un indicateur (vide si mono-ligne).
 * Utile pour construire dynamiquement les métadonnées d'UI.
 */
export function getIndicatorSubFields(
  name: IndicatorName,
): readonly IndicatorSubFieldDefinition[] {
  return isMultiLineIndicator(name) ? INDICATOR_SUBFIELDS[name] : [];
}

/** Noms des lignes disponibles pour un indicateur (vide si mono-ligne). */
export function getIndicatorSubFieldNames(
  name: IndicatorName,
): readonly string[] {
  return getIndicatorSubFields(name).map((field) => field.name);
}

/**
 * La validation d'un opérande indicateur (`validateIndicatorOperand`) vivait
 * ici ; elle est passée dans `indicator-operand-validation.ts`, une couche
 * au-dessus, le jour où elle a dû juger aussi les **paramètres** : ceux-ci
 * sont déclarés par `INDICATOR_REGISTRY`, qui dépend de ce fichier-ci. Voir
 * l'en-tête de ce module pour le cycle que l'import inverse aurait créé.
 */
