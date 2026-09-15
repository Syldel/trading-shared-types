import { INDICATOR_NAMES } from './indicator-request.types.js';
import type { IndicatorName } from './indicator-request.types.js';
import { INDICATOR_REGISTRY } from './indicator-registry.js';
import {
  getIndicatorSubFieldNames,
  isIndicatorName,
  isMultiLineIndicator,
} from './indicator-subfields.js';
import type { IndicatorParameter } from '../exchange/indicator-meta.type.js';

/**
 * ============================================================================
 * ✅ INDICATOR OPERAND VALIDATION
 * Porte unique : un opérande `indicator` désigne-t-il une valeur calculable,
 * et une seule ?
 *
 * Trois vérifications, dans cet ordre — chacune suppose la précédente :
 *   1. le **nom** existe dans le registre ;
 *   2. le **subField** lève l'ambiguïté d'un indicateur multi-lignes ;
 *   3. les **paramètres** portent le type que le registre déclare.
 *
 * Pourquoi ce fichier plutôt qu'`indicator-subfields.ts`, où cette validation
 * vivait : la vérification des paramètres a besoin d'`INDICATOR_REGISTRY`, qui
 * dépend lui-même d'`indicator-subfields.ts` pour ses lignes. L'import inverse
 * créerait un cycle dont `INDICATOR_SUBFIELDS` sortirait en TDZ au chargement
 * du paquet — le même écueil que celui documenté sur `INDICATOR_NAMES`
 * (indicator-request.types.ts). La porte remonte donc d'une couche, au-dessus
 * du registre des lignes *et* du registre des indicateurs, et reste unique.
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
  | 'UNEXPECTED_SUBFIELD'
  /** Paramètre présent mais d'un type que le registre ne déclare pas. */
  | 'INVALID_INDICATOR_PARAM';

export interface IndicatorOperandIssue {
  code: IndicatorOperandIssueCode;
  /** Nom d'indicateur tel que reçu. */
  indicator: unknown;
  /** `subField` tel que reçu. */
  subField?: unknown;
  /** Paramètre visé, pour les anomalies `INVALID_INDICATOR_PARAM`. */
  parameter?: string;
  /** Valeurs acceptées dans ce contexte, quand elles sont connues. */
  allowed?: readonly string[];
  /** Message prêt à journaliser ou à remonter à l'utilisateur. */
  message: string;
}

/**
 * Forme minimale acceptée en entrée : les données viennent de JSON, donc non
 * typées. La signature d'index porte les paramètres, dont les noms varient
 * d'un indicateur à l'autre (`period`, `slowPeriod`, `pivotType`...).
 */
export interface RawIndicatorOperand {
  name?: unknown;
  subField?: unknown;
  [parameter: string]: unknown;
}

/**
 * Vérifie qu'un opérande indicateur désigne une et une seule valeur calculable.
 *
 * Retourne `null` si l'opérande est cohérent, sinon l'anomalie détectée.
 * (Un résultat falsy signifie donc « valide » : `if (issue) { ... }`.)
 *
 * Conçue pour être appelée sur des données non typées (JSON issu de la base ou
 * d'une requête HTTP), là où les types TypeScript n'offrent aucune garantie.
 *
 * Une seule anomalie est rendue, la première rencontrée : la signature est
 * lue partout comme un booléen enrichi (`if (issue)`), et un opérande dont le
 * nom est faux n'a de toute façon pas de paramètres à juger.
 */
export function validateIndicatorOperand(
  operand: RawIndicatorOperand | null | undefined,
): IndicatorOperandIssue | null {
  const name = operand?.name;

  if (!isIndicatorName(name)) {
    return {
      code: 'UNKNOWN_INDICATOR',
      indicator: name,
      message:
        `Unknown indicator "${String(name)}". ` +
        `Known indicators: ${INDICATOR_NAMES.join(', ')}.`,
    };
  }

  return (
    validateSubField(name, operand?.subField) ??
    validateParameters(name, operand ?? {})
  );
}

/** Ambiguïté de ligne : voir `INDICATOR_SUBFIELDS` (indicator-subfields.ts). */
function validateSubField(
  name: IndicatorName,
  subField: unknown,
): IndicatorOperandIssue | null {
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
 * Type d'un paramètre présent dans l'opérande, confronté à celui que le
 * registre déclare.
 *
 * Motivation, mesurée et non théorique : un formulaire web renvoie une
 * **chaîne** même pour un champ numérique. Un opérande
 * `{ name: 'ema', period: '20' }` traversait jusqu'ici toute la chaîne sans
 * qu'un seul contrôle le regarde — cette fonction ne jugeait que `name` et
 * `subField`, et `POST /exchanges/strategies/validate` répondait donc
 * `valid: true`. Le moteur calculait ensuite l'EMA avec `2 / (period + 1)`,
 * soit `2 / "201"` : un lissage dix fois trop long, sur une stratégie que
 * rien n'accusait. `computeStrategyRulesLookback` dérivait de son côté
 * `"200"` au lieu de `20`.
 *
 * Ce que cette vérification **ne fait pas**, délibérément :
 *
 * - **un paramètre absent n'est pas une anomalie** : `resolveIndicatorParams`
 *   applique le défaut du registre, c'est le fonctionnement normal ;
 * - **un paramètre que ce build ne déclare pas est ignoré** : il vient
 *   probablement d'un bot plus récent, et l'itération porte sur les
 *   paramètres *déclarés*, jamais sur les clés reçues ;
 * - **l'appartenance d'une valeur de `select` à sa liste n'est pas vérifiée**.
 *   Ajouter une option est une évolution de catalogue légitime, qu'une copie
 *   compilée plus ancienne refuserait à tort. Seul le *genre* de la valeur est
 *   vérifié. Un `pivotType` inconnu reste donc à juger ailleurs.
 *
 * D'où un code **non listé** dans `CATALOG_DEPENDENT_ISSUE_CODES` : ce qui est
 * signalé ici est une valeur *malformée*, pas une valeur *non reconnue*. Aucune
 * version future du catalogue ne rendra valide une chaîne là où un nombre est
 * déclaré — un client peut donc bloquer dessus sans attendre le serveur.
 *
 * Le risque résiduel est assumé et nommé : si le catalogue changeait le type
 * déclaré d'un paramètre existant (`number` → `select`), un build antérieur
 * accuserait à tort. Mais un tel changement invalide déjà toutes les
 * stratégies stockées et exige une reprise de données des deux côtés — ce
 * n'est pas une évolution silencieuse de catalogue.
 */
function validateParameters(
  name: IndicatorName,
  operand: RawIndicatorOperand,
): IndicatorOperandIssue | null {
  for (const parameter of INDICATOR_REGISTRY[name].parameters) {
    const value = operand[parameter.name];
    if (value === undefined || isWellFormedParameter(parameter, value)) continue;

    return {
      code: 'INVALID_INDICATOR_PARAM',
      indicator: name,
      parameter: parameter.name,
      message:
        `Parameter "${parameter.name}" of indicator "${name}" must be ` +
        `${expectedKindOf(parameter)} (received: ${describe(value)}). ` +
        `A value of the wrong type is computed as-is, not converted.`,
    };
  }

  return null;
}

function isWellFormedParameter(
  parameter: IndicatorParameter,
  value: unknown,
): boolean {
  switch (parameter.type) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);

    case 'string':
      return typeof value === 'string';

    /**
     * Le genre seulement, mesuré sur le `defaultValue` déclaré : ajouter une
     * option ne change jamais le type de la liste, alors que l'appartenance,
     * elle, dépend d'un catalogue qu'un build antérieur peut ignorer. On
     * refuse donc `pivotType: 42` sans refuser un `pivotType` inédit.
     */
    case 'select':
      return typeof value === typeof parameter.defaultValue;
  }
}

function expectedKindOf(parameter: IndicatorParameter): string {
  switch (parameter.type) {
    case 'number':
      return 'a finite number';
    case 'string':
      return 'a string';
    case 'select':
      return 'one of its declared options';
  }
}

/** `"20"` et `20` ne se distinguent pas une fois passés par `String()`. */
function describe(value: unknown): string {
  return typeof value === 'string' ? `"${value}" (string)` : String(value);
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
