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
 * ============================================================================
 * ✅ VALIDATION
 * ============================================================================
 */

/**
 * Nature d'une incohérence référentielle d'opérande.
 *
 * Ces codes ne portent aucun jugement sémantique sur la stratégie : ils
 * signalent uniquement qu'un opérande ne désigne pas une valeur calculable
 * de façon non ambiguë.
 */
export type IndicatorOperandIssueCode =
  /** Nom d'indicateur absent du registre. */
  | 'UNKNOWN_INDICATOR'
  /** Indicateur multi-lignes sans `subField` : la ligne visée est indéterminée. */
  | 'MISSING_SUBFIELD'
  /** `subField` inexistant pour cet indicateur (typo, ou ligne d'un autre indicateur). */
  | 'UNKNOWN_SUBFIELD'
  /** `subField` fourni à un indicateur mono-ligne. */
  | 'UNEXPECTED_SUBFIELD';

export interface IndicatorOperandIssue {
  code: IndicatorOperandIssueCode;
  /** Nom d'indicateur tel que reçu. */
  indicator: unknown;
  /** `subField` tel que reçu. */
  subField?: unknown;
  /** Valeurs acceptées dans ce contexte, quand elles sont connues. */
  allowed?: readonly string[];
  /** Message prêt à journaliser ou à remonter à l'utilisateur. */
  message: string;
}

/** Forme minimale acceptée en entrée : les données viennent de JSON, donc non typées. */
interface RawIndicatorOperand {
  name?: unknown;
  subField?: unknown;
}

/**
 * Vérifie qu'un opérande indicateur désigne une et une seule valeur calculable.
 *
 * Retourne `null` si l'opérande est cohérent, sinon l'anomalie détectée.
 * (Un résultat falsy signifie donc « valide » : `if (issue) { ... }`.)
 *
 * Conçue pour être appelée sur des données non typées (JSON issu de la base ou
 * d'une requête HTTP), là où les types TypeScript n'offrent aucune garantie.
 */
export function validateIndicatorOperand(
  operand: RawIndicatorOperand | null | undefined,
): IndicatorOperandIssue | null {
  const name = operand?.name;
  const subField = operand?.subField;

  if (!isIndicatorName(name)) {
    return {
      code: 'UNKNOWN_INDICATOR',
      indicator: name,
      message:
        `Unknown indicator "${String(name)}". ` +
        `Known indicators: ${INDICATOR_NAMES.join(', ')}.`,
    };
  }

  const hasSubField = subField !== undefined && subField !== null;

  if (!isMultiLineIndicator(name)) {
    if (hasSubField) {
      return {
        code: 'UNEXPECTED_SUBFIELD',
        indicator: name,
        subField,
        allowed: [],
        message:
          `Indicator "${name}" produces a single value and accepts no subField, ` +
          `but received "${String(subField)}". Remove it.`,
      };
    }
    return null;
  }

  const allowed = getIndicatorSubFieldNames(name);

  if (!hasSubField) {
    return {
      code: 'MISSING_SUBFIELD',
      indicator: name,
      allowed,
      message:
        `Indicator "${name}" produces ${allowed.length} lines and requires an explicit ` +
        `subField to designate one of them: ${allowed.join(', ')}.`,
    };
  }

  if (typeof subField !== 'string' || !allowed.includes(subField)) {
    return {
      code: 'UNKNOWN_SUBFIELD',
      indicator: name,
      subField,
      allowed,
      message:
        `Indicator "${name}" has no line named "${String(subField)}". ` +
        `Available lines: ${allowed.join(', ')}.`,
    };
  }

  return null;
}

/**
 * Variante levant une erreur, pour les frontières où l'exécution doit s'arrêter
 * (validation d'une stratégie à son chargement ou à sa réception).
 */
export function assertValidIndicatorOperand(
  operand: RawIndicatorOperand | null | undefined,
  context?: string,
): void {
  const issue = validateIndicatorOperand(operand);
  if (issue) {
    const prefix = context ? `${context}: ` : '';
    throw new Error(`${prefix}${issue.message}`);
  }
}
