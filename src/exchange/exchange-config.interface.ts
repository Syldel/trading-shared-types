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

export interface ProtectiveOrderEntry {
  enabled?: boolean;
  tpsl: TpslType;
  anchor: IOrderAnchor;
  condition?: RuleNode;
  atrMultiplier: number;
  sizePercent: number;
  trailingMode?: boolean;
}

export interface ProtectiveOrderStrategy {
  enabled?: boolean;
  entries: ProtectiveOrderEntry[];
}
