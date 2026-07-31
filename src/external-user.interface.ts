import type { IExchange } from "./exchange/exchange-config.interface";

export interface ExternalUser {
  _id: string;
  walletAddress: string;
  username: string;
  createdAt: string;
  updatedAt: string;
  tradingSettings: Record<string, IExchange>;
}