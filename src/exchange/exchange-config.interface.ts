import type { ChartInterval } from '../chart.type.js';
import type {
  Operand,
  RuleNode,
  StrategyRules,
  StrategySettings,
} from '../strategies/strategy-engine.type.js';

export type ExitBehavior = 'STRATEGY_SIGNAL' | 'EXIT_ON_PROFIT_ONLY' | 'NEVER';

// ─── CORE STRATEGY STRUCTURE ─────────────────────────────────────────────────

/**
 * La stratégie **configurée par un utilisateur** pour une paire : uniquement
 * des données métier, aucune métadonnée d'affichage.
 *
 * À ne pas confondre avec `StrategyMeta` (`exchange-meta.type.ts`), qui décrit
 * comment construire une stratégie dans un formulaire — quels champs existent,
 * leurs libellés et leurs valeurs par défaut. La distinction est structurante :
 * ces deux objets ont été confondus par le passé, ce qui menait un même champ
 * (`default`) à signifier « valeur initiale du formulaire » côté frontend et
 * « les règles configurées par l'utilisateur » côté backend.
 *
 * Correspondance entre les deux : chaque paramètre `rule-builder` de
 * `StrategyMeta` alimente une branche de `rules` ; chaque paramètre
 * `number` / `boolean` / `select` alimente une entrée de `settings`.
 */
export interface IExchangeStrategy {
  name: string;
  shortname: string;
  description?: string;
  /** Arbres de règles. Absent pour les stratégies codées en dur (non `advanced-rules`). */
  rules?: StrategyRules;
  /** Réglages scalaires. Voir `StrategySettings`. */
  settings?: StrategySettings;
  latent?: LatentOrderStrategy;
  protective?: ProtectiveOrderStrategy;
}

export type IExchange = {
  enabled?: boolean;
  pairs: IExchangePair[];
};

export type IExchangePair = {
  name: string;
  ratio: number;
  enabled?: boolean;
  interval: ChartInterval;
  strategy?: IExchangeStrategy;
  exitBehavior?: ExitBehavior;
};

// ─── ANCHORING SYSTEM ────────────────────────────────────────────────────────

/** Execution mechanism for the exchange order (standard limit or conditional triggers). */
export type OrderExecutionType = 'limit' | 'trigger_market' | 'trigger_limit';

/** Price origin reference used as the base for order anchoring offsets. */
export type AnchorSource = 'MARKET' | 'ENTRY' | 'EXPRESSION';

/**
 * ============================================================================
 * 📍 OÙ SE POSE UN ORDRE
 *
 * Deux origines que rien ne peut exprimer autrement, et une expression pour
 * tout le reste :
 *
 * - `ENTRY` — le prix d'entrée de la position. Le rule-builder n'a pas
 *   d'opérande pour ça : il ne connaît que des bougies ;
 * - `MARKET` — le dernier prix échangé, bougie en cours comprise. Distinct de
 *   `price.close`, qui est la dernière bougie **close** ;
 * - `EXPRESSION` — n'importe quel `Operand` du rule-builder, évalué sur la
 *   fenêtre du passage. Un indicateur seul (`bb.lower`), une composition
 *   (`max(spanA, spanB)`), une formule (`bb.lower − 1,5 × ATR(21)`), un
 *   décalage en bougies (`offset`), voire une constante.
 *
 * `EXPRESSION` remplace l'ancien `INDICATOR`, qui n'était qu'un
 * `IndicatorOperand` déguisé : garder les deux, c'était deux façons d'écrire la
 * même chose, que l'app aurait dû départager et que le bot aurait dû résoudre
 * deux fois. La validation refuse explicitement l'ancienne forme plutôt que de
 * la traduire en silence — voir `RETIRED_INDICATOR_ANCHOR`.
 *
 * La garantie de type qui motivait la branche `INDICATOR` est conservée, et
 * elle est même plus large : `Operand` impose déjà `subField` sur un
 * indicateur multi-lignes et le type exact de chaque paramètre. C'est la même
 * validation que pour une condition de règle, et c'est voulu — une ancre
 * ambiguë ferait un prix faux exactement comme une condition ambiguë fait un
 * signal faux.
 * ============================================================================
 */
export type PriceAnchor = { source: 'MARKET' | 'ENTRY' } | ExpressionAnchor;

/**
 * Miroir runtime d'`AnchorSource`, dans le même esprit que `FOLLOW_MODES` :
 * la validation a besoin de la liste pour dire ce qu'elle attendait.
 */
export const ANCHOR_SOURCES = [
  'MARKET',
  'ENTRY',
  'EXPRESSION',
] as const satisfies readonly AnchorSource[];

/** La branche `EXPRESSION`, isolée pour les appelants qui ont déjà discriminé sur `source`. */
export type ExpressionAnchor = { source: 'EXPRESSION'; expression: Operand };

export const DISTANCE_UNITS = ['ATR', 'PERCENT'] as const;
export type DistanceUnit = (typeof DISTANCE_UNITS)[number];

/**
 * ============================================================================
 * 📏 À QUELLE DISTANCE DE L'ANCRE
 *
 * Le sens n'est pas porté ici : il découle du côté et de la position
 * (`isAbove` dans `protective-plan.ts`). Une distance est toujours **positive**
 * et **éloigne** du prix courant.
 *
 * - `ATR` — `value × ATR`. C'est l'unique unité qui existait, sous le nom
 *   `atrMultiplier`. ⚠️ La période de l'ATR n'est pas configurable : le bot
 *   calcule un seul ATR(14) par passage. Ouvrir la période demanderait d'en
 *   transporter plusieurs, y compris dans le contexte d'entrée ; un `period?`
 *   optionnel s'ajoutera sans rien casser le jour où le besoin se montre. En
 *   attendant, une autre période s'écrit dans l'**ancre** :
 *   `bb.lower − 1,5 × ATR(21)` est une expression parfaitement valide ;
 * - `PERCENT` — `value %` **du prix de l'ancre**, et non du prix d'entrée. Les
 *   deux coïncident seulement quand l'ancre est `ENTRY`. C'est l'unité du stop
 *   par défaut de Freqtrade (`stoploss = -0.10`), que le modèle précédent ne
 *   savait pas exprimer du tout.
 *
 * Un seul champ `value` plutôt qu'un nom par unité : le formulaire se réduit à
 * un nombre et un sélecteur, et lire la valeur n'oblige pas à discriminer.
 * ============================================================================
 */
export interface PriceDistance {
  unit: DistanceUnit;
  /** Toujours positive. Voir l'unité pour ce qu'elle multiplie. */
  value: number;
}

// ─── LATENT ORDERS (HORS POSITION) ───────────────────────────────────────────

/** Configuration schema for individual resting or non-position trigger entry setups. */
export interface LatentOrderEntry {
  enabled?: boolean;
  side: 'LONG' | 'SHORT';
  orderType: OrderExecutionType;
  anchor: PriceAnchor;
  condition?: RuleNode;
  distance: PriceDistance;
  sizePercent: number;
}

/** Strategic parent schema handling latent entry setups before active execution. */
export interface LatentOrderStrategy {
  enabled?: boolean;
  entries: LatentOrderEntry[];
}

// ─── Protective order types ───────────────────────────────────────────────────

export type TpslType = 'tp' | 'sl';

/**
 * Dans quel sens une protection déjà posée a le droit de se déplacer, **lu par
 * rapport au prix courant**.
 *
 * Le sens est volontairement relatif au marché et non au trade : « se
 * resserrer » veut dire la même chose pour un stop-loss et pour un take-profit,
 * pour un long et pour un short. C'est ce qui manquait au booléen
 * `trailingMode` qu'il remplace : son cliquet était écrit « dans le sens du
 * trade », si bien qu'une même ligne de code resserrait le stop et **éloignait**
 * la cible — pour un long, un take-profit ne pouvait que fuir devant le prix.
 *
 * `FIXED` est le défaut, et décrit ce que produit l'app aujourd'hui.
 */
export type FollowMode =
  /**
   * Calculée une fois, à l'ouverture de la position, puis immobile.
   *
   * L'ancre peut être dynamique — un indicateur : c'est sa valeur **au moment
   * de l'entrée** qui sert, pas la valeur courante. Le prix reste donc
   * reconstituable à chaque passage, ce qui permet de reposer l'ordre au même
   * endroit s'il a disparu du carnet ou n'a été exécuté qu'en partie.
   */
  | 'FIXED'
  /** Recalculée à chaque passage, mais ne peut que **se rapprocher** du prix courant. */
  | 'TIGHTEN_ONLY'
  /** Recalculée à chaque passage, mais ne peut que **s'éloigner** du prix courant. */
  | 'WIDEN_ONLY'
  /** Recalculée à chaque passage, et suit son ancre sans contrainte de sens. */
  | 'FREE';

export const FOLLOW_MODES = [
  'FIXED',
  'TIGHTEN_ONLY',
  'WIDEN_ONLY',
  'FREE',
] as const satisfies readonly FollowMode[];

/** Le mode retenu quand la configuration n'en nomme aucun. */
export const DEFAULT_FOLLOW_MODE: FollowMode = 'FIXED';

export interface ProtectiveOrderEntry {
  enabled?: boolean;
  tpsl: TpslType;
  anchor: PriceAnchor;
  condition?: RuleNode;
  distance: PriceDistance;
  sizePercent: number;
  /** Défaut : `FIXED`. Voir `FollowMode`. */
  followMode?: FollowMode;
  /**
   * Interdit à la protection de s'éloigner du prix courant **au-delà de là où
   * elle était à l'entrée**, quel que soit son mode.
   *
   * La borne est un prix absolu : celui que cette protection aurait sous
   * `FIXED`. Sur un stop-loss, c'est la perte acceptée à l'ouverture, qu'aucun
   * déplacement ultérieur ne peut alors annuler — c'est le rôle de
   * `self.stoploss` chez Freqtrade. Sur un take-profit, c'est la cible
   * d'origine, qui ne peut plus fuir devant le prix.
   *
   * Sans objet sous `FIXED` et `TIGHTEN_ONLY`, qui ne peuvent déjà pas
   * s'éloigner. **Recommandé avec `WIDEN_ONLY` et `FREE`**, les deux seuls
   * modes qui le permettent.
   */
  boundedByEntry?: boolean;
}

export interface ProtectiveOrderStrategy {
  enabled?: boolean;
  entries: ProtectiveOrderEntry[];
}
