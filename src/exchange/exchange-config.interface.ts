import type { ChartInterval } from '../chart.type.js';
import type { LogicalGroup, RuleNode } from '../strategies/strategy-engine.type.js';

export type ExitBehavior = 'STRATEGY_SIGNAL' | 'EXIT_ON_PROFIT_ONLY' | 'NEVER';

// ─── CORE STRATEGY STRUCTURE ─────────────────────────────────────────────────

interface BaseParameter {
  id: string;
  label: string;
  description?: string;
  enabled?: boolean;
}

export type StrategyParameter =
  | (BaseParameter & {
      type: 'number';
      default: number;
    })
  | (BaseParameter & {
      type: 'boolean';
      default: boolean;
    })
  | (BaseParameter & {
      type: 'select';
      options: { label: string; value: any }[];
      default: any;
    })
  | (BaseParameter & {
      type: 'rule-builder';
      default: LogicalGroup | null;
    });

export interface IExchangeStrategy {
  name: string;
  shortname: string;
  description?: string;
  latent?: LatentOrderStrategy;
  protective?: ProtectiveOrderStrategy;
  parameters?: StrategyParameter[];
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

/** Dynamic structure defining the geometric price alignment of a trade order. */
export interface IOrderAnchor {
  source: AnchorSource;
  name?: string;
  subField?: string;
  parameters?: Record<string, number | string>;
}

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
