/**
 * ============================================================================
 * LES COMPARAISONS QUE LE PRIX NE PEUT JAMAIS SATISFAIRE
 *
 * Certaines règles sont grammaticalement parfaites et **structurellement
 * muettes** : elles ne peuvent jamais être vraies, à aucune bougie, sur aucun
 * marché. Elles ne lèvent rien, ne journalisent rien, et laissent croire qu'une
 * condition protège une position alors qu'elle ne s'évalue jamais.
 *
 * Le cas qui a motivé ce fichier : un canal de Donchian dont la fenêtre inclut
 * la bougie courante. `donchian.upper` vaut `max(high)` sur la fenêtre, donc
 * toujours ≥ le `high` de la bougie, donc ≥ son `open`, son `close` et son
 * `low`. La condition `close > donchian.upper` exigerait `close > close` : elle
 * est impossible.
 *
 * Ce n'est pas une déduction : **mesuré le 2026-10-08** sur quatre marchés
 * (BTC 1 h / 4 h / 1 j, ETH 4 h), **68 656 comparaisons, zéro franchissement
 * strict** pour les quatre champs de prix et les deux bornes. À `offset: 1` —
 * la borne ne connaissant plus la bougie courante — le franchissement redevient
 * possible : 1 790 fois pour `high > upper`, 1 392 pour `low < lower`. Le
 * correctif suggéré dans le message corrige donc réellement.
 *
 * Le même défaut a dormi des mois dans une stratégie codée en dur du bot
 * (`supportBroken`, inatteignable pour exactement cette raison) et y rendait un
 * réglage exposé à l'utilisateur totalement inerte. La leçon est qu'il faut le
 * détecter, pas le documenter.
 *
 * ⚠️ Volontairement conservateur. On ne signale que ce qui est **prouvé**
 * impossible :
 *
 * - seules les inégalités **strictes**. Mesuré, `high >= upper` arrive 1 851
 *   fois et `close >= upper` 9 fois : refuser la version non stricte rejetterait
 *   des règles légitimes ;
 * - seulement à **offset égal**. Comparer la bougie courante à la borne d'avant
 *   est précisément le correctif ;
 * - `volume` est exclu des champs bornés : un canal de prix ne le borne pas,
 *   c'est une autre unité.
 * ============================================================================
 */
import type { PriceField } from './strategy-engine.type.js';

/**
 * Les entrées sont volontairement `unknown` : cette détection s'exécute dans
 * `collectRuleTreeIssues`, qui valide du **JSON non typé** venu d'un document
 * utilisateur. Supposer un `Operand` bien formé ici reviendrait à faire
 * confiance à la donnée qu'on est en train de valider — et une donnée
 * corrompue ferait lever la validation elle-même.
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Les champs qu'un canal de prix borne. `volume` appartient à `PriceField` mais
 * pas à cette liste, et c'est le point : rien ne borne un volume par un prix.
 */
const BOUNDED_PRICE_FIELDS: readonly PriceField[] = [
  'open',
  'high',
  'low',
  'close',
];

/** De quel côté du prix la borne se trouve toujours, à offset égal. */
type BoundSide = 'above' | 'below';

/**
 * Sous-séries dont la fenêtre inclut la bougie courante, et qui bornent donc
 * son prix.
 *
 * Une seule entrée aujourd'hui, et c'est volontaire : `donchian` est le seul
 * extrême glissant du catalogue. Un futur `highest` / `lowest` se déclare ici,
 * et la détection le couvre sans autre changement. Ne **pas** y ajouter une
 * bande qui se franchit (`bb`, `keltner`, `supertrend`) : elles sont faites pour
 * être traversées.
 */
const PRICE_BOUNDS: Readonly<
  Record<string, Readonly<Record<string, BoundSide>>>
> = {
  donchian: { upper: 'above', lower: 'below' },
};

interface PriceBound {
  side: BoundSide;
  /** Pour le message : `donchian.upper`. */
  label: string;
}

function boundOf(record: Record<string, unknown>): PriceBound | null {
  if (record.type !== 'indicator') return null;
  if (typeof record.name !== 'string') return null;
  const bySubField = PRICE_BOUNDS[record.name];
  if (!bySubField) return null;
  if (typeof record.subField !== 'string') return null;
  const side = bySubField[record.subField];
  return side === undefined
    ? null
    : { side, label: `${record.name}.${record.subField}` };
}

function boundedPriceFieldOf(
  record: Record<string, unknown>,
): PriceField | null {
  if (record.type !== 'price') return null;
  const field = record.field;
  return typeof field === 'string' &&
    (BOUNDED_PRICE_FIELDS as readonly string[]).includes(field)
    ? (field as PriceField)
    : null;
}

/**
 * Décalage effectif, ou `null` si la valeur n'est pas un décalage exploitable.
 *
 * `null` fait **abandonner** la détection plutôt que supposer 0 : un `offset`
 * mal formé est déjà signalé par `INVALID_OFFSET`, et empiler une plainte
 * sémantique sur une anomalie structurelle brouillerait le diagnostic.
 */
function offsetOf(record: Record<string, unknown>): number | null {
  const offset = record.offset;
  if (offset === undefined) return 0;
  if (typeof offset !== 'number') return null;
  if (!Number.isInteger(offset) || offset < 0) return null;
  return offset;
}

/**
 * Pourquoi `left > right` ne peut jamais être vrai, ou `null` si ça peut
 * l'être.
 *
 * **La** primitive de ce fichier : une comparaison `GT` et un croisement `UP`
 * exigent tous deux cette relation stricte, et leurs symétriques l'exigent dans
 * l'autre sens. Tout se ramène donc ici.
 */
function whyStrictlyGreaterIsImpossible(
  left: unknown,
  right: unknown,
): string | null {
  /**
   * **La** garde de forme, et il n'y en a qu'une : les aides ci-dessous
   * reçoivent un `Record` déjà vérifié.
   *
   * Elle était dupliquée dans chaque aide, et une campagne de mutation a montré
   * que ces copies étaient **inatteignables** — celle de `offsetOf` rejetait
   * déjà tout ce qui n'est pas un objet, et s'exécutait avant. Trois gardes dont
   * deux mortes donnaient l'illusion d'une défense éprouvée.
   */
  const leftRecord = asRecord(left);
  const rightRecord = asRecord(right);
  if (leftRecord === null || rightRecord === null) return null;

  const leftOffset = offsetOf(leftRecord);
  const rightOffset = offsetOf(rightRecord);
  if (leftOffset === null || rightOffset === null) return null;
  if (leftOffset !== rightOffset) return null;

  const sameCandle =
    leftOffset === 0 ? 'the same candle' : `the same candle (offset ${leftOffset})`;

  const priceOnLeft = boundedPriceFieldOf(leftRecord);
  const boundOnRight = boundOf(rightRecord);
  if (priceOnLeft !== null && boundOnRight?.side === 'above') {
    return (
      `"${priceOnLeft}" can never be strictly greater than ${boundOnRight.label} on ` +
      `${sameCandle}: the channel's window includes the current candle, so ` +
      `${boundOnRight.label} is always at least its high.`
    );
  }

  const priceOnRight = boundedPriceFieldOf(rightRecord);
  const boundOnLeft = boundOf(leftRecord);
  if (priceOnRight !== null && boundOnLeft?.side === 'below') {
    return (
      `${boundOnLeft.label} can never be strictly greater than "${priceOnRight}" on ` +
      `${sameCandle}: the channel's window includes the current candle, so ` +
      `${boundOnLeft.label} is always at most its low.`
    );
  }

  return null;
}

/** Le correctif, ajouté à chaque message pour qu'il soit actionnable. */
const REMEDY =
  ' Add "offset": 1 to the indicator operand to compare against the channel ' +
  'as it stood on the previous candle, or use a non-strict operator.';

/**
 * Pourquoi cette comparaison ne peut jamais être vraie, ou `null`.
 *
 * `GTE`, `LTE` et `EQ` ne sont jamais signalés : le prix **touche** ses bornes
 * régulièrement (mesuré : 1 851 fois pour `high >= upper`).
 */
export function describeUnsatisfiableComparison(
  left: unknown,
  operator: unknown,
  right: unknown,
): string | null {
  const reason =
    operator === 'GT'
      ? whyStrictlyGreaterIsImpossible(left, right)
      : operator === 'LT'
        ? whyStrictlyGreaterIsImpossible(right, left)
        : null;
  return reason === null ? null : reason + REMEDY;
}

/**
 * Pourquoi ce croisement ne peut jamais se produire, ou `null`.
 *
 * Repris de `StrategyEngineService.evaluateCrossTri` :
 * `crossedUp = prevLeft <= prevRight && currLeft > currRight`, et
 * `crossedDown = prevLeft >= prevRight && currLeft < currRight`. Chaque
 * direction exige donc une inégalité stricte à la bougie courante.
 *
 * `ANY` n'est jamais signalé : l'une des deux directions reste possible, et
 * la mesure le confirme — un `high` qui touchait la bande haute puis repasse
 * dessous est un croisement descendant parfaitement réel.
 */
export function describeUnsatisfiableCross(
  left: unknown,
  right: unknown,
  direction: unknown,
): string | null {
  const reason =
    direction === 'UP'
      ? whyStrictlyGreaterIsImpossible(left, right)
      : direction === 'DOWN'
        ? whyStrictlyGreaterIsImpossible(right, left)
        : null;
  if (reason === null) return null;
  return (
    `A "${String(direction)}" cross requires that strict inequality at the ` +
    `crossing candle. ` +
    `${reason}${REMEDY}`
  );
}
