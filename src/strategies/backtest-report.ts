import type { AnalysisCandle } from '../analysis/analysis-candle.type.js';
import {
  POSITION_SIDES,
  type PositionSide,
  type TimelineSignal,
} from './strategy-engine.type.js';

/**
 * Rapport de backtest d'une stratégie, dérivé de sa timeline et des bougies sur
 * lesquelles elle a été calculée.
 *
 * Tous les chiffres sont **bruts** : rendement de chaque trade à taille
 * constante, en pourcentage du prix d'entrée, **additionnés** d'un trade à
 * l'autre — ni frais, ni funding, ni slippage, ni levier, ni réinvestissement.
 * Aucun arrondi n'est appliqué : c'est à l'affichage d'arrondir, jamais au
 * calcul (une somme d'arrondis accumule une erreur que rien ne signale).
 *
 * Remplace `BacktestSummary`, qui couvrait toute la fenêtre calculée —
 * amorçage des indicateurs compris — et mélangeait long et short.
 */

export interface BacktestReportInput {
  signals: readonly TimelineSignal[];
  /** Les bougies de calcul, amorçage compris. Seules celles dès `from` entrent dans le rapport. */
  candles: readonly AnalysisCandle[];
  /**
   * Début (ms, inclus) de la fenêtre rapportée — celle que l'utilisateur voit.
   * Un trade compte s'il est **ouvert** dans la fenêtre ; une position ouverte
   * avant et encore ouverte à `from` est signalée à part (`carriedIn`).
   */
  from: number;
}

export interface BacktestTrade {
  side: PositionSide;
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  /** Positif = gain. */
  returnPercent: number;
}

/** Position ouverte dans la fenêtre et jamais refermée, valorisée à la dernière clôture. */
export interface BacktestOpenPosition {
  side: PositionSide;
  entryTime: number;
  entryPrice: number;
  /** `null` si aucune bougie de la fenêtre ne permet de la valoriser. */
  markTime: number | null;
  markPrice: number | null;
  unrealizedPercent: number | null;
}

/**
 * Position ouverte **avant** la fenêtre et encore ouverte à son début. Elle
 * n'entre dans aucun chiffre : son entrée n'est pas visible, et la compter
 * attribuerait à la fenêtre une performance commencée ailleurs.
 */
export interface BacktestCarriedPosition {
  side: PositionSide;
  entryTime: number;
  entryPrice: number;
  exitTime: number | null;
  exitPrice: number | null;
}

export interface BacktestDrawdown {
  /** Plus forte baisse depuis un sommet de la courbe, en points de pourcentage (≥ 0). */
  depthPercent: number;
  /** Bougie du sommet ; `null` = début de fenêtre, où la courbe part de 0. */
  peakTime: number | null;
  /** Bougie du creux ; `null` quand la courbe ne baisse jamais. */
  troughTime: number | null;
}

export interface BacktestStats {
  /** Trades refermés, ouverts dans la fenêtre. */
  trades: number;
  wins: number;
  losses: number;
  /** Trades à rendement exactement nul : ni gain ni perte. */
  breakeven: number;
  /** `null` sans trade : un taux de réussite n'a pas de sens sur zéro trade. */
  winRatePercent: number | null;
  realizedPercent: number;
  /** Positions encore ouvertes en fin de fenêtre, à la dernière clôture. */
  unrealizedPercent: number;
  /** Sur la courbe à chaque bougie, pertes latentes comprises. */
  maxDrawdown: BacktestDrawdown;
}

/** Performance cumulée à la clôture d'une bougie : réalisé + latent. */
export interface BacktestEquityPoint {
  time: number;
  long: number;
  short: number;
  /** `null` quand long et short se chevauchent dans la fenêtre — voir `BacktestReport.total`. */
  total: number | null;
}

export interface BacktestOverlap {
  /** Bougies de la fenêtre où une position longue et une courte sont ouvertes ensemble. */
  candles: number;
  firstTime: number | null;
}

export const BACKTEST_ANOMALY_CODES = [
  'INVALID_SIGNAL',
  'ENTER_WHILE_OPEN',
  'EXIT_WITHOUT_ENTRY',
  'SIGNAL_WITHOUT_CANDLE',
] as const;
export type BacktestAnomalyCode = (typeof BACKTEST_ANOMALY_CODES)[number];

/**
 * Ce que la timeline contient d'incohérent. Le rapport ne corrige rien en
 * silence : un signal inexploitable est écarté **et** listé ici.
 */
export interface BacktestAnomaly {
  code: BacktestAnomalyCode;
  time: number | null;
  side: PositionSide | null;
  message: string;
}

export interface BacktestReport {
  from: number;
  /** Temps d'ouverture de la dernière bougie de la fenêtre ; `null` si la fenêtre est vide. */
  to: number | null;
  long: BacktestStats;
  short: BacktestStats;
  /**
   * `null` quand long et short sont ouverts en même temps sur au moins une
   * bougie. Le simulateur évalue les deux côtés indépendamment, mais le bot ne
   * tient qu'une position par paire : additionner les deux décrirait un
   * résultat qu'il ne peut pas obtenir.
   */
  total: BacktestStats | null;
  trades: BacktestTrade[];
  openPositions: BacktestOpenPosition[];
  carriedIn: BacktestCarriedPosition[];
  equity: BacktestEquityPoint[];
  overlap: BacktestOverlap;
  anomalies: BacktestAnomaly[];
}

interface Position {
  side: PositionSide;
  entryTime: number;
  entryPrice: number;
  exitTime: number | null;
  exitPrice: number | null;
}

export function returnPercent(side: PositionSide, entryPrice: number, exitPrice: number): number {
  const delta = side === 'LONG' ? exitPrice - entryPrice : entryPrice - exitPrice;
  return (delta / entryPrice) * 100;
}

export function buildBacktestReport({ signals, candles, from }: BacktestReportInput): BacktestReport {
  if (!Number.isFinite(from)) {
    throw new Error(`buildBacktestReport: "from" must be a finite timestamp, got ${from}.`);
  }

  const anomalies: BacktestAnomaly[] = [];
  const orderedCandles = [...candles].sort((a, b) => a.time - b.time);
  const candleTimes = new Set(orderedCandles.map((candle) => candle.time));
  const windowCandles = orderedCandles.filter((candle) => candle.time >= from);
  const lastCandle = windowCandles.at(-1) ?? null;

  const positions = replayPositions(signals, candleTimes, anomalies);

  const inWindow = positions.filter((p) => p.entryTime >= from);
  const trades: BacktestTrade[] = inWindow
    .filter((p): p is Position & { exitTime: number; exitPrice: number } => p.exitTime !== null)
    .map((p) => ({
      side: p.side,
      entryTime: p.entryTime,
      entryPrice: p.entryPrice,
      exitTime: p.exitTime,
      exitPrice: p.exitPrice,
      returnPercent: returnPercent(p.side, p.entryPrice, p.exitPrice),
    }))
    .sort((a, b) => a.entryTime - b.entryTime);

  const openPositions: BacktestOpenPosition[] = inWindow
    .filter((p) => p.exitTime === null)
    .map((p) => {
      const markable = lastCandle !== null && lastCandle.time >= p.entryTime;
      return {
        side: p.side,
        entryTime: p.entryTime,
        entryPrice: p.entryPrice,
        markTime: markable ? lastCandle.time : null,
        markPrice: markable ? lastCandle.close : null,
        unrealizedPercent: markable ? returnPercent(p.side, p.entryPrice, lastCandle.close) : null,
      };
    });

  const carriedIn: BacktestCarriedPosition[] = positions
    .filter((p) => p.entryTime < from && (p.exitTime === null || p.exitTime >= from))
    .map((p) => ({ ...p }));

  const overlap = measureOverlap(positions, windowCandles);
  const overlapping = overlap.candles > 0;

  const equity: BacktestEquityPoint[] = windowCandles.map((candle) => {
    const long = equityAt('LONG', candle, trades, inWindow);
    const short = equityAt('SHORT', candle, trades, inWindow);
    return { time: candle.time, long, short, total: overlapping ? null : long + short };
  });

  const statsFor = (side: PositionSide | null): BacktestStats => {
    const sideTrades = trades.filter((t) => side === null || t.side === side);
    const sideOpen = openPositions.filter((p) => side === null || p.side === side);
    const curve = equity.map((point) => ({
      time: point.time,
      value: side === 'LONG' ? point.long : side === 'SHORT' ? point.short : (point.total ?? 0),
    }));
    return summarize(sideTrades, sideOpen, curve);
  };

  return {
    from,
    to: lastCandle?.time ?? null,
    long: statsFor('LONG'),
    short: statsFor('SHORT'),
    total: overlapping ? null : statsFor(null),
    trades,
    openPositions,
    carriedIn,
    equity,
    overlap,
    anomalies,
  };
}

/**
 * Rejoue la timeline côté par côté. Les deux côtés sont indépendants, comme dans
 * le moteur : une entrée LONG ne referme pas un SHORT.
 */
function replayPositions(
  signals: readonly TimelineSignal[],
  candleTimes: ReadonlySet<number>,
  anomalies: BacktestAnomaly[],
): Position[] {
  const positions: Position[] = [];
  const open = new Map<PositionSide, Position>();
  // Tri stable : deux signaux au même instant gardent l'ordre du moteur.
  const ordered = [...signals].sort((a, b) => a.time - b.time);

  for (const signal of ordered) {
    const invalid = invalidReason(signal);
    if (invalid) {
      anomalies.push({
        code: 'INVALID_SIGNAL',
        time: Number.isFinite(signal.time) ? signal.time : null,
        side: isSide(signal.side) ? signal.side : null,
        message: `Signal ignored: ${invalid}.`,
      });
      continue;
    }

    if (!candleTimes.has(signal.time)) {
      anomalies.push({
        code: 'SIGNAL_WITHOUT_CANDLE',
        time: signal.time,
        side: signal.side,
        message: `${signal.side} ${signal.signal} at ${signal.time} matches no candle: signals and candles may not share a time unit.`,
      });
    }

    const current = open.get(signal.side);

    if (signal.signal === 'ENTER') {
      if (current) {
        anomalies.push({
          code: 'ENTER_WHILE_OPEN',
          time: signal.time,
          side: signal.side,
          message: `${signal.side} ENTER ignored: a ${signal.side} position opened at ${current.entryTime} is still open.`,
        });
        continue;
      }
      const position: Position = {
        side: signal.side,
        entryTime: signal.time,
        entryPrice: signal.price,
        exitTime: null,
        exitPrice: null,
      };
      open.set(signal.side, position);
      positions.push(position);
      continue;
    }

    if (!current) {
      anomalies.push({
        code: 'EXIT_WITHOUT_ENTRY',
        time: signal.time,
        side: signal.side,
        message: `${signal.side} EXIT ignored: no ${signal.side} position is open.`,
      });
      continue;
    }
    current.exitTime = signal.time;
    current.exitPrice = signal.price;
    open.delete(signal.side);
  }

  return positions;
}

function isSide(value: unknown): value is PositionSide {
  return (POSITION_SIDES as readonly unknown[]).includes(value);
}

/** La donnée vient d'une réponse réseau : le type ne garantit rien à l'exécution. */
function invalidReason(signal: TimelineSignal): string | null {
  if (!Number.isFinite(signal.time)) return `time ${String(signal.time)} is not a number`;
  if (signal.signal !== 'ENTER' && signal.signal !== 'EXIT') {
    return `unknown signal "${String(signal.signal)}"`;
  }
  if (!isSide(signal.side)) return `unknown side "${String(signal.side)}"`;
  if (!Number.isFinite(signal.price) || signal.price <= 0) {
    return `price ${String(signal.price)} is not a positive number`;
  }
  return null;
}

/** Une position est ouverte à la clôture d'une bougie si elle y est entrée et n'en est pas sortie. */
function isOpenAt(position: Position, time: number): boolean {
  return position.entryTime <= time && (position.exitTime === null || position.exitTime > time);
}

/**
 * Chevauchement mesuré sur **toutes** les positions, héritées comprises : une
 * position ouverte avant la fenêtre n'entre pas dans les chiffres, mais elle
 * occupe bien le côté que le bot ne pourrait pas tenir en même temps que l'autre.
 */
function measureOverlap(positions: readonly Position[], windowCandles: readonly AnalysisCandle[]): BacktestOverlap {
  let count = 0;
  let firstTime: number | null = null;

  for (const candle of windowCandles) {
    const longOpen = positions.some((p) => p.side === 'LONG' && isOpenAt(p, candle.time));
    const shortOpen = positions.some((p) => p.side === 'SHORT' && isOpenAt(p, candle.time));
    if (longOpen && shortOpen) {
      count++;
      firstTime ??= candle.time;
    }
  }

  return { candles: count, firstTime };
}

/** Réalisé jusqu'à cette bougie comprise, plus le latent des positions encore ouvertes à sa clôture. */
function equityAt(
  side: PositionSide,
  candle: AnalysisCandle,
  trades: readonly BacktestTrade[],
  inWindow: readonly Position[],
): number {
  const realized = trades
    .filter((t) => t.side === side && t.exitTime <= candle.time)
    .reduce((sum, t) => sum + t.returnPercent, 0);

  const unrealized = inWindow
    .filter((p) => p.side === side && isOpenAt(p, candle.time))
    .reduce((sum, p) => sum + returnPercent(side, p.entryPrice, candle.close), 0);

  return realized + unrealized;
}

function summarize(
  trades: readonly BacktestTrade[],
  open: readonly BacktestOpenPosition[],
  curve: readonly { time: number; value: number }[],
): BacktestStats {
  const wins = trades.filter((t) => t.returnPercent > 0).length;
  const losses = trades.filter((t) => t.returnPercent < 0).length;

  return {
    trades: trades.length,
    wins,
    losses,
    breakeven: trades.length - wins - losses,
    winRatePercent: trades.length === 0 ? null : (wins / trades.length) * 100,
    realizedPercent: trades.reduce((sum, t) => sum + t.returnPercent, 0),
    unrealizedPercent: open.reduce((sum, p) => sum + (p.unrealizedPercent ?? 0), 0),
    maxDrawdown: maxDrawdown(curve),
  };
}

/** Plus forte baisse depuis un sommet, la courbe partant de 0 au début de la fenêtre. */
function maxDrawdown(curve: readonly { time: number; value: number }[]): BacktestDrawdown {
  let peak = 0;
  let peakTime: number | null = null;
  let worst: BacktestDrawdown = { depthPercent: 0, peakTime: null, troughTime: null };

  for (const point of curve) {
    if (point.value > peak) {
      peak = point.value;
      peakTime = point.time;
    }
    const depth = peak - point.value;
    if (depth > worst.depthPercent) {
      worst = { depthPercent: depth, peakTime, troughTime: point.time };
    }
  }

  return worst;
}
