import type { IExchange } from './exchange/exchange-config.interface';

/**
 * L'agent (API wallet Hyperliquid) qui signe les ordres de l'utilisateur, tel
 * que `set-agent-key` (nest-mongo-user) l'a enregistré. Rien de secret : la clé
 * privée reste à part, scellée, et ne sort jamais vers le mobile.
 *
 * Ces valeurs sont **déclarées** à la saisie, pas lues chez Hyperliquid :
 * `address` est dérivée de la clé saisie, `name` et `validUntil` sont recopiés
 * de la page API de Hyperliquid. Le gateway refuse de signer quand `validUntil`
 * est passée, ou quand l'adresse de la clé ne correspond pas à `address`.
 */
export interface ExternalUserAgent {
  /** Adresse EIP-55 (casse mixte) ; à comparer en minuscules. */
  address: string;
  /** Le nom donné sur la page API de Hyperliquid, 1 à 16 caractères. */
  name: string;
  /** ISO 8601 en UTC : l'instant où Hyperliquid cesse d'accepter l'agent. */
  validUntil: string;
  /** ISO 8601 en UTC : l'enregistrement de cette clé par `set-agent-key`. */
  keyUpdatedAt: string;
}

export interface ExternalUser {
  _id: string;
  walletAddress: string;
  username: string;
  createdAt: string;
  updatedAt: string;
  tradingSettings: Record<string, IExchange>;
  /**
   * Absent : aucune clé d'agent, ou une clé enregistrée avant que son
   * expiration soit demandée. Dans les deux cas le gateway refuse de signer.
   */
  agent?: ExternalUserAgent;
}
