import type { ChartInterval } from '../chart.type.js';
import type {
  RuleNode,
  StrategyRules,
  StrategySettings,
} from '../strategies/strategy-engine.type.js';
import type { IndicatorOperand } from '../indicators/indicator-request.types.js';

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
export type AnchorSource = 'MARKET' | 'ENTRY' | 'INDICATOR';

/**
 * Dynamic structure defining the geometric price alignment of a trade order.
 *
 * The `INDICATOR` branch reuses `IndicatorOperand` — the exact same type
 * family already enforced for rule-builder operands (see `Operand` in
 * `strategy-engine.type.ts`). This is deliberate: a stop loss / take profit
 * anchor carries the same risk of designating an ambiguous value (e.g. `adx`
 * without a line) as a signal condition does, so it gets the same
 * compile-time guarantee — `subField` mandatory on multi-output indicators,
 * `parameters` no longer an untyped bag but the indicator's exact fields.
 *
 * `MARKET` and `ENTRY` anchors carry no indicator data.
 */
export type IOrderAnchor =
  | { source: 'MARKET' | 'ENTRY' }
  | IIndicatorOrderAnchor;

/** The `INDICATOR` branch of `IOrderAnchor`, isolated for call sites that already narrowed on `source`. */
export type IIndicatorOrderAnchor = { source: 'INDICATOR' } & IndicatorOperand;

// ─── LATENT ORDERS (HORS POSITION) ───────────────────────────────────────────

/** Configuration schema for individual resting or non-position trigger entry setups. */
export interface LatentOrderEntry {
  enabled?: boolean;
  side: 'LONG' | 'SHORT';
  orderType: OrderExecutionType;
  anchor: IOrderAnchor;
  condition?: RuleNode;
  atrMultiplier: number;
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
  anchor: IOrderAnchor;
  condition?: RuleNode;
  atrMultiplier: number;
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
