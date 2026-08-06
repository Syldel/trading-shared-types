import type { TimelineSignal } from './strategy-engine.type.js';

/**
 * Bilan agrégé d'un backtest de stratégie, dérivé de son `TimelineSignal[]`.
 *
 * Chiffres bruts : ni frais, ni funding Hyperliquid ne sont déduits.
 *
 * Un `ENTER` sans `EXIT` correspondant (position encore ouverte à la
 * dernière bougie) n'est pas compté comme un trade complété — il est
 * seulement signalé via `openPositionAtEnd`. Voir le `logger.warn` émis par
 * le moteur au moment de la génération du `TimelineSignal[]`.
 */
export interface BacktestSummary {
  totalTrades: number;
  wins: number;
  losses: number;
  /** `null` si `totalTrades === 0` : un taux de réussite n'a pas de sens sans trade. */
  winRatePercent: number | null;
  cumulativeProfitPercent: number;
  openPositionAtEnd: boolean;
}

/**
 * Calcule le `BacktestSummary` d'une timeline déjà produite par le moteur.
 *
 * Fonction pure, sans dépendance : un trade complété est un `EXIT` portant
 * `tradeProfitPercent`. `openPositionAtEnd` est déduit en comparant, par
 * `side`, le nombre d'`ENTER` et d'`EXIT` — un solde positif signifie qu'un
 * `ENTER` de ce côté n'a jamais été refermé dans la timeline.
 */
export function summarizeBacktestSignals(
  signals: TimelineSignal[],
): BacktestSummary {
  let wins = 0;
  let losses = 0;
  let cumulativeProfitPercent = 0;
  const openPositionsBySide = new Map<string, number>();

  for (const signal of signals) {
    const side = signal.metadata?.side;
    const sideKey = typeof side === 'string' ? side : 'UNKNOWN';

    if (signal.signal === 'ENTER') {
      openPositionsBySide.set(sideKey, (openPositionsBySide.get(sideKey) ?? 0) + 1);
      continue;
    }

    if (signal.signal === 'EXIT') {
      openPositionsBySide.set(sideKey, (openPositionsBySide.get(sideKey) ?? 0) - 1);

      const { tradeProfitPercent } = signal.metadata ?? {};
      if (tradeProfitPercent === undefined) continue;

      if (tradeProfitPercent >= 0) wins++;
      else losses++;
      cumulativeProfitPercent = Number(
        (cumulativeProfitPercent + tradeProfitPercent).toFixed(2),
      );
    }
  }

  const totalTrades = wins + losses;
  const openPositionAtEnd = [...openPositionsBySide.values()].some(
    (balance) => balance > 0,
  );

  return {
    totalTrades,
    wins,
    losses,
    winRatePercent:
      totalTrades === 0
        ? null
        : Number(((wins / totalTrades) * 100).toFixed(2)),
    cumulativeProfitPercent,
    openPositionAtEnd,
  };
}
