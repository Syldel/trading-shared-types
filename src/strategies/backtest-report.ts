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
 * Rendement de chaque trade à taille constante, en pourcentage du prix
 * d'entrée, **additionné** d'un trade à l'autre — ni levier, ni
 * réinvestissement. Aucun arrondi n'est appliqué : c'est à l'affichage
 * d'arrondir, jamais au calcul (une somme d'arrondis accumule une erreur que
 * rien ne signale).
 *
 * **Les frais sont comptés depuis le 2026-10-09, et c'est une correction de
 * fond.** Ce rapport est ce que l'app affiche, et il rendait un brut qui se
 * lisait comme un résultat : mesuré, les frais valaient jusqu'à **27 points de
 * rendement sur 302 trades**. Chaque chiffre existe donc en deux versions,
 * `Gross` et `Net`, pour qu'on puisse lire ce qu'ils coûtent — et `feePerSide`
 * est **requis**, parce qu'un palier supposé est un coût inventé.
 *
 * ⚠️ Toujours hors du rapport : le **funding**, le slippage, et l'exécution
 * réelle. Le funding dépend de la durée de détention et d'un historique horaire
 * que ce module n'a pas ; les frais, eux, sont connus d'avance et exacts.
 *
 * ⚠️ Le palier assumé est celui que l'appelant passe. Un remplissage de ce
 * rapport est un ordre au marché — il exécute à la clôture de la bougie du
 * signal et ne simule ni TP ni SL —, donc le **taker** est la lecture fidèle.
 *
 * Remplace `BacktestSummary`, qui couvrait toute la fenêtre calculée —
 * amorçage des indicateurs compris — et mélangeait long et short.
 */

export interface BacktestReportInput {
  /**
   * Frais **par côté**, en fraction (0,00045 pour 0,045 %). Un aller-retour en
   * coûte deux ; une position encore ouverte n'en a payé qu'un.
   *
   * **Requis, et non optionnel avec un défaut.** Un défaut serait un palier
   * supposé, donc un coût inventé — et le palier réel dépend du volume sur 14
   * jours et du staking HYPE de l'appelant. `HYPERLIQUID_FEES` donne les
   * paliers publiés pour qui n'en a pas de meilleur.
   */
  feePerSide: number;
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
  /** Positif = gain. Frais exclus. */
  grossReturnPercent: number;
  /**
   * Positif = gain, **frais des deux côtés déduits**.
   *
   * ⚠️ Renommé depuis `returnPercent` le 2026-10-09, et c'est délibéré :
   * garder le nom en changeant son sens aurait déplacé chaque chiffre de chaque
   * consommateur sans qu'un compilateur n'en dise rien.
   */
  netReturnPercent: number;
}

/** Position ouverte dans la fenêtre et jamais refermée, valorisée à la dernière clôture. */
export interface BacktestOpenPosition {
  side: PositionSide;
  entryTime: number;
  entryPrice: number;
  /** `null` si aucune bougie de la fenêtre ne permet de la valoriser. */
  markTime: number | null;
  markPrice: number | null;
  unrealizedGrossPercent: number | null;
  /**
   * Frais **d'un seul côté** déduits : l'entrée est payée, la sortie ne l'est
   * pas encore. En compter deux surévaluerait le coût d'une position qu'on n'a
   * pas refermée.
   */
  unrealizedNetPercent: number | null;
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
  /**
   * Plus forte baisse depuis un sommet, **en pourcentage de ce sommet** (0 à
   * 100) — la définition standard d'un drawdown maximal.
   *
   * ⚠️ **Corrigé le 2026-10-08, et les valeurs changent.** Ce champ rendait
   * `sommet − valeur` sur une courbe de points cumulés : il manquait le
   * dénominateur, si bien qu'il décrivait le recul du pnl rapporté au capital
   * **initial** et non au sommet. L'écart n'est pas cosmétique — mesuré sur six
   * ans de BTC, un achat-conservation donnait « 562 » là où son drawdown réel
   * est de **76,67 %**. Et l'app l'affichait via `formatPercent`.
   *
   * La documentation Hyperliquid décrit sa page portefeuille comme
   * `max over end > start de (pnl(end) − pnl(start)) / account_value(start)`, en
   * précisant que ce n'est **pas** le drawdown absolu divisé par une valeur de
   * compte. Cette formule se réduit à celle employée ici : `(x − b) / (C + x)`
   * est croissante en `x`, donc le pire intervalle part toujours du sommet
   * courant, et son dénominateur est la valeur de compte à ce sommet.
   *
   * `100` signifie **capital épuisé** : la courbe a atteint zéro, et la suite ne
   * décrit plus rien d'atteignable.
   */
  depthPercent: number;
  /**
   * Bougie du sommet dont part la pire baisse. `null` quand il n'y a aucune
   * baisse, comme `troughTime` : sans drawdown il n'y a pas de couple
   * sommet/creux.
   *
   * ⚠️ Avant le 2026-10-08, `null` signifiait « le sommet est le début de la
   * fenêtre » et pouvait accompagner un `depthPercent` non nul.
   */
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
  /**
   * `null` sans trade : un taux de réussite n'a pas de sens sur zéro trade.
   *
   * ⚠️ Compté **net**, et l'écart n'est pas théorique : un trade à +0,02 % brut
   * est une perte en taker. Un taux de réussite brut flatterait exactement les
   * trades que les frais emportent.
   */
  winRatePercent: number | null;
  realizedGrossPercent: number;
  realizedNetPercent: number;
  /** Positions encore ouvertes en fin de fenêtre, à la dernière clôture. */
  unrealizedGrossPercent: number;
  unrealizedNetPercent: number;
  /** Sur la courbe à chaque bougie, pertes latentes comprises. */
  maxDrawdown: BacktestDrawdown;
}

/**
 * Performance cumulée à la clôture d'une bougie : réalisé + latent, **nette**.
 *
 * Nette et non brute, parce que c'est cette courbe qui porte le drawdown : un
 * drawdown brut décrirait un creux que le compte n'a pas traversé.
 */
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

/**
 * Paliers perpétuels publiés par Hyperliquid, relevés sur la documentation
 * officielle le 2026-10-07. Par côté.
 *
 * ⚠️ Ce sont les paliers de **base** du dex principal. Ils ne tiennent compte
 * ni du volume sur 14 jours, ni du staking HYPE, ni de la part du déployeur sur
 * un marché HIP-3 — mesuré, `deployerFeeScale` est présent sur tous les marchés
 * `xyz` et sur aucun marché standard, et aucun code ne le lit. Un appelant qui
 * connaît mieux son palier passe le sien.
 */
export const HYPERLIQUID_FEES = {
  /** Palier de base, preneur de liquidité. */
  taker: 0.00045,
  /** Palier de base, apporteur de liquidité. */
  maker: 0.00015,
  /** Pour isoler ce que les frais coûtent. */
  none: 0,
} as const;

export function returnPercent(side: PositionSide, entryPrice: number, exitPrice: number): number {
  const delta = side === 'LONG' ? exitPrice - entryPrice : entryPrice - exitPrice;
  return (delta / entryPrice) * 100;
}

export function buildBacktestReport({
  signals,
  candles,
  from,
  feePerSide,
}: BacktestReportInput): BacktestReport {
  if (!Number.isFinite(from)) {
    throw new Error(`buildBacktestReport: "from" must be a finite timestamp, got ${from}.`);
  }
  if (!Number.isFinite(feePerSide) || feePerSide < 0) {
    // Un frais négatif inflaterait chaque rendement sans que rien ne le dise.
    // Hyperliquid n'en publie aucun : le palier maker le plus bas est zéro.
    throw new Error(
      `buildBacktestReport: "feePerSide" must be a finite fraction of at least 0, got ${feePerSide}.`,
    );
  }

  /** Un aller-retour paie les deux côtés. */
  const roundTripFee = feePerSide * 2 * 100;
  /** Une position encore ouverte n'a payé que son entrée. */
  const entryFee = feePerSide * 100;

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
      grossReturnPercent: returnPercent(p.side, p.entryPrice, p.exitPrice),
      netReturnPercent:
        returnPercent(p.side, p.entryPrice, p.exitPrice) - roundTripFee,
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
        unrealizedGrossPercent: markable
          ? returnPercent(p.side, p.entryPrice, lastCandle.close)
          : null,
        unrealizedNetPercent: markable
          ? returnPercent(p.side, p.entryPrice, lastCandle.close) - entryFee
          : null,
      };
    });

  const carriedIn: BacktestCarriedPosition[] = positions
    .filter((p) => p.entryTime < from && (p.exitTime === null || p.exitTime >= from))
    .map((p) => ({ ...p }));

  const overlap = measureOverlap(positions, windowCandles);
  const overlapping = overlap.candles > 0;

  const equity: BacktestEquityPoint[] = windowCandles.map((candle) => {
    const long = equityAt('LONG', candle, trades, inWindow, entryFee);
    const short = equityAt('SHORT', candle, trades, inWindow, entryFee);
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
/**
 * Équité **nette** d'un côté, à la clôture d'une bougie.
 *
 * Nette, parce que c'est cette courbe qui porte le drawdown : un drawdown brut
 * décrirait un creux que le compte n'a pas traversé. Les trades refermés
 * portent déjà leurs deux côtés de frais ; une position encore ouverte n'a payé
 * que son entrée, d'où `entryFee`.
 */
function equityAt(
  side: PositionSide,
  candle: AnalysisCandle,
  trades: readonly BacktestTrade[],
  inWindow: readonly Position[],
  entryFee: number,
): number {
  const realized = trades
    .filter((t) => t.side === side && t.exitTime <= candle.time)
    .reduce((sum, t) => sum + t.netReturnPercent, 0);

  const unrealized = inWindow
    .filter((p) => p.side === side && isOpenAt(p, candle.time))
    .reduce(
      (sum, p) =>
        sum + returnPercent(side, p.entryPrice, candle.close) - entryFee,
      0,
    );

  return realized + unrealized;
}

function summarize(
  trades: readonly BacktestTrade[],
  open: readonly BacktestOpenPosition[],
  curve: readonly { time: number; value: number }[],
): BacktestStats {
  // Gagnants et perdants comptés **net** : un trade à +0,02 % brut est une
  // perte en taker, et un taux de réussite brut flatterait exactement les
  // trades que les frais emportent.
  const wins = trades.filter((t) => t.netReturnPercent > 0).length;
  const losses = trades.filter((t) => t.netReturnPercent < 0).length;

  const sum = (values: readonly number[]) =>
    values.reduce((total, value) => total + value, 0);

  return {
    trades: trades.length,
    wins,
    losses,
    breakeven: trades.length - wins - losses,
    winRatePercent: trades.length === 0 ? null : (wins / trades.length) * 100,
    realizedGrossPercent: sum(trades.map((t) => t.grossReturnPercent)),
    realizedNetPercent: sum(trades.map((t) => t.netReturnPercent)),
    unrealizedGrossPercent: sum(
      open.map((p) => p.unrealizedGrossPercent ?? 0),
    ),
    unrealizedNetPercent: sum(open.map((p) => p.unrealizedNetPercent ?? 0)),
    maxDrawdown: relativeDrawdown(curve),
  };
}

/**
 * Drawdown maximal relatif : `max(sommet − valeur) / sommet`.
 *
 * La courbe est en points de pourcentage cumulés à notionnel fixe ; la valeur de
 * compte est donc `1 + points / 100`, en multiples du capital initial. C'est ce
 * rapport qui porte le dénominateur dont la version précédente manquait.
 *
 * ⚠️ L'hypothèse de notionnel fixe sans réinvestissement est celle de tout ce
 * rapport (voir son en-tête). Avec un autre dimensionnement, la même suite de
 * trades donnerait un autre drawdown.
 *
 * **Exportée** pour que la même formule serve aussi aux courbes que ce rapport
 * ne connaît pas — au premier chef l'achat-conservation, la référence à battre.
 * Deux implémentations d'un même drawdown dériveraient, et c'est arrivé : le
 * harnais de backtest du bot en portait une copie jusqu'au 2026-10-08.
 */
export function relativeDrawdown(
  curve: readonly { time: number; value: number }[],
): BacktestDrawdown {
  let peak = Number.NEGATIVE_INFINITY;
  let peakTime: number | null = null;
  let worst: BacktestDrawdown = { depthPercent: 0, peakTime: null, troughTime: null };

  for (const point of curve) {
    const accountValue = 1 + point.value / 100;

    if (accountValue > peak) {
      peak = accountValue;
      peakTime = point.time;
    }
    if (accountValue <= 0) {
      // Capital épuisé : la perte est totale, et diviser par un sommet positif
      // décrirait la suite d'une courbe qui ne peut plus exister.
      return { depthPercent: 100, peakTime, troughTime: point.time };
    }

    const depth = ((peak - accountValue) / peak) * 100;
    if (depth > worst.depthPercent) {
      worst = { depthPercent: depth, peakTime, troughTime: point.time };
    }
  }

  return worst;
}
