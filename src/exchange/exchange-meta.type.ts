import type { ChartInterval } from "../chart.type";
import type { AnchorSource, ExitBehavior, OrderExecutionType, StrategyParameter, TpslType } from "./exchange-config.interface";
import type { IndicatorMetadata } from "./indicator-meta.type";

export interface StrategyMeta {
  name: string;
  shortname: string;
  description?: string;
  parameters?: StrategyParameter[];
}

export interface ExitBehaviorMeta {
  label: string;
  value: ExitBehavior;
  description: string;
}

export interface AnchorSourceMeta {
  value: AnchorSource;
  label: string;
  allowedContexts: ('latent' | 'protective')[];
}

export interface OrderTypeMeta {
  value: OrderExecutionType;
  label: string;
  requiresTriggerPx: boolean;
}

export interface TpslTypeMeta {
  value: TpslType;
  label: string;
}

export interface PositionSideMeta {
  value: 'LONG' | 'SHORT';
  label: string;
}

export interface StrategyFormSchema {
  anchorSources: AnchorSourceMeta[];
  orderTypes: OrderTypeMeta[];
  tpslTypes: TpslTypeMeta[];
  positionSides: PositionSideMeta[];
}

export interface ExchangesMetaResponse {
  intervals: ChartInterval[];
  exchanges: string[];
  strategies: Record<string, StrategyMeta[]>; // clé = nom d'exchange, ex: "hyperliquid"
  globalOptions: {
    exitBehaviors: ExitBehaviorMeta[];
  };
  indicators: IndicatorMetadata[];
  strategyFormSchema: StrategyFormSchema;
}