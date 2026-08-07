import type { ChartInterval } from "../chart.type";
import type { AnchorSource, ExitBehavior, OrderExecutionType, TpslType } from "./exchange-config.interface";
import type { LogicalGroup } from "../strategies/strategy-engine.type";
import type { IndicatorMetadata } from "./indicator-meta.type";

// ─── STRATEGY FORM SCHEMA ────────────────────────────────────────────────────
// Ce fichier décrit *comment construire* une stratégie dans une interface.
// Les données que l'utilisateur produit ainsi vivent dans `IExchangeStrategy`
// (`exchange-config.interface.ts`) — ne jamais mélanger les deux.

interface BaseStrategyParameter {
  /**
   * Identifiant du champ. Pour un `rule-builder`, désigne la branche de
   * `StrategyRules` alimentée par ce champ (`long.entry`, `short.exit`) ; pour
   * les autres types, la clé correspondante dans `StrategySettings`.
   */
  id: string;
  label: string;
  description?: string;
  enabled?: boolean;
}

/**
 * Description d'un champ de formulaire de stratégie.
 *
 * `defaultValue` signifie bien ici « valeur pré-remplie du champ », et rien
 * d'autre — même convention que `IndicatorParameter`. La valeur *saisie* par
 * l'utilisateur n'est jamais stockée ici : elle atterrit dans
 * `IExchangeStrategy.rules` ou `IExchangeStrategy.settings`.
 */
export type StrategyParameter =
  | (BaseStrategyParameter & {
      type: 'number';
      defaultValue: number;
    })
  | (BaseStrategyParameter & {
      type: 'boolean';
      defaultValue: boolean;
    })
  | (BaseStrategyParameter & {
      type: 'select';
      options: { label: string; value: string | number }[];
      defaultValue: string | number;
    })
  | (BaseStrategyParameter & {
      type: 'rule-builder';
      defaultValue: LogicalGroup | null;
    });

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