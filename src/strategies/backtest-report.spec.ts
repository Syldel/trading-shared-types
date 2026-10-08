import { describe, expect, it } from '@jest/globals';
import type { AnalysisCandle } from '../analysis/analysis-candle.type.js';
import {
  buildBacktestReport,
  relativeDrawdown,
} from './backtest-report.js';
import type { PositionSide, TimelineSignal } from './strategy-engine.type.js';

/**
 * Le rapport est ce qu'on lit pour juger une stratégie avant de la confier au
 * bot. Chaque test fixe une règle dont la violation ferait lire un chiffre faux
 * comme un chiffre vrai.
 */
const H = 3_600_000;

/** Bougies horaires aux clôtures données, la première ouverte à `H`. */
function candles(...closes: number[]): AnalysisCandle[] {
  return closes.map((close, i) => ({
    time: (i + 1) * H,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
  }));
}

const enter = (side: PositionSide, hour: number, price: number): TimelineSignal => ({
  time: hour * H,
  signal: 'ENTER',
  side,
  price,
});
const exit = (side: PositionSide, hour: number, price: number): TimelineSignal => ({
  time: hour * H,
  signal: 'EXIT',
  side,
  price,
});

describe('buildBacktestReport — trades and returns', () => {
  it('reports an empty strategy as zero trades, no win rate and a flat curve', () => {
    const report = buildBacktestReport({ signals: [], candles: candles(100, 101), from: H });

    expect(report.long).toMatchObject({ trades: 0, winRatePercent: null, realizedPercent: 0 });
    expect(report.total).toMatchObject({ trades: 0, winRatePercent: null });
    expect(report.equity.map((p) => p.total)).toEqual([0, 0]);
    expect(report.anomalies).toEqual([]);
  });

  // Le moteur arrondissait chaque trade à 2 décimales avant de les additionner.
  it('computes each return from the prices, without rounding', () => {
    const report = buildBacktestReport({
      signals: [enter('LONG', 1, 100), exit('LONG', 2, 101.2345)],
      candles: candles(100, 101.2345),
      from: H,
    });

    expect(report.trades[0]?.returnPercent).toBeCloseTo(1.2345, 10);
    expect(report.long.realizedPercent).toBeCloseTo(1.2345, 10);
  });

  it('counts a falling price as a gain on a short', () => {
    const report = buildBacktestReport({
      signals: [enter('SHORT', 1, 100), exit('SHORT', 2, 90)],
      candles: candles(100, 90),
      from: H,
    });

    expect(report.short).toMatchObject({ trades: 1, wins: 1, realizedPercent: 10 });
  });

  it('separates wins, losses and exactly flat trades', () => {
    const report = buildBacktestReport({
      signals: [
        enter('LONG', 1, 100),
        exit('LONG', 2, 110),
        enter('LONG', 3, 100),
        exit('LONG', 4, 95),
        enter('LONG', 5, 100),
        exit('LONG', 6, 100),
      ],
      candles: candles(100, 110, 100, 95, 100, 100),
      from: H,
    });

    expect(report.long).toMatchObject({ trades: 3, wins: 1, losses: 1, breakeven: 1 });
    expect(report.long.winRatePercent).toBeCloseTo(100 / 3, 10);
  });

  // Additionné, pas composé : +10 % puis −10 % font 0, pas −1 %.
  it('adds returns trade after trade at constant size', () => {
    const report = buildBacktestReport({
      signals: [enter('LONG', 1, 100), exit('LONG', 2, 110), enter('LONG', 3, 100), exit('LONG', 4, 90)],
      candles: candles(100, 110, 100, 90),
      from: H,
    });

    expect(report.long.realizedPercent).toBeCloseTo(0, 10);
  });
});

describe('buildBacktestReport — reporting window', () => {
  // Le défaut de l'ancien `summary` : il comptait des trades de l'amorçage,
  // invisibles à l'écran.
  it('ignores a trade entirely before the window', () => {
    const report = buildBacktestReport({
      signals: [enter('LONG', 1, 100), exit('LONG', 2, 120)],
      candles: candles(100, 120, 120, 120),
      from: 3 * H,
    });

    expect(report.trades).toEqual([]);
    expect(report.carriedIn).toEqual([]);
    expect(report.long.realizedPercent).toBe(0);
  });

  it('counts a trade opened exactly at the start of the window', () => {
    const report = buildBacktestReport({
      signals: [enter('LONG', 2, 100), exit('LONG', 3, 105)],
      candles: candles(90, 100, 105),
      from: 2 * H,
    });

    expect(report.trades).toHaveLength(1);
  });

  it('reports a position opened before the window apart, and out of every figure', () => {
    const report = buildBacktestReport({
      signals: [enter('LONG', 1, 100), exit('LONG', 3, 150)],
      candles: candles(100, 120, 150),
      from: 2 * H,
    });

    expect(report.carriedIn).toEqual([
      { side: 'LONG', entryTime: H, entryPrice: 100, exitTime: 3 * H, exitPrice: 150 },
    ]);
    expect(report.trades).toEqual([]);
    expect(report.long.realizedPercent).toBe(0);
    expect(report.equity.map((p) => p.long)).toEqual([0, 0]);
  });

  it('keeps a carried position that never closes, with no exit', () => {
    const report = buildBacktestReport({
      signals: [enter('SHORT', 1, 100)],
      candles: candles(100, 90),
      from: 2 * H,
    });

    expect(report.carriedIn).toEqual([
      { side: 'SHORT', entryTime: H, entryPrice: 100, exitTime: null, exitPrice: null },
    ]);
    expect(report.openPositions).toEqual([]);
  });

  it('reports the window bounds from the candles it covers', () => {
    const report = buildBacktestReport({ signals: [], candles: candles(1, 2, 3), from: 2 * H });

    expect(report.from).toBe(2 * H);
    expect(report.to).toBe(3 * H);
    expect(report.equity.map((p) => p.time)).toEqual([2 * H, 3 * H]);
  });

  it('has no end and no curve when the window holds no candle', () => {
    const report = buildBacktestReport({ signals: [], candles: candles(1, 2), from: 10 * H });

    expect(report.to).toBeNull();
    expect(report.equity).toEqual([]);
  });

  it('refuses a window start that is not a timestamp', () => {
    expect(() => buildBacktestReport({ signals: [], candles: [], from: Number.NaN })).toThrow(/from/);
  });
});

describe('buildBacktestReport — open positions and the curve', () => {
  it('marks a position still open at the last close, outside the trade count', () => {
    const report = buildBacktestReport({
      signals: [enter('LONG', 1, 100)],
      candles: candles(100, 104),
      from: H,
    });

    expect(report.openPositions).toEqual([
      {
        side: 'LONG',
        entryTime: H,
        entryPrice: 100,
        markTime: 2 * H,
        markPrice: 104,
        unrealizedPercent: 4,
      },
    ]);
    expect(report.long).toMatchObject({ trades: 0, realizedPercent: 0, unrealizedPercent: 4 });
    expect(report.equity.at(-1)?.long).toBe(4);
  });

  // Tout l'intérêt d'une courbe à chaque bougie : un trade descendu à −8 % puis
  // refermé à +1 % a exposé à −8 %, et le drawdown doit le dire.
  it('measures the drawdown on unrealized losses, not only on closed trades', () => {
    const report = buildBacktestReport({
      signals: [enter('LONG', 1, 100), exit('LONG', 4, 101)],
      candles: candles(100, 95, 92, 101),
      from: H,
    });

    expect(report.equity.map((p) => p.long)).toEqual([0, -5, -8, 1]);
    // Le sommet est le capital intact, donc le dénominateur vaut 1 et la
    // profondeur coïncide avec l'écart de points : 8 %. `peakTime` désigne la
    // bougie de ce sommet, et non plus `null` comme avant le 2026-10-08.
    expect(report.long.maxDrawdown.depthPercent).toBeCloseTo(8, 10);
    expect(report.long.maxDrawdown.peakTime).toBe(H);
    expect(report.long.maxDrawdown.troughTime).toBe(3 * H);
  });

  it('measures a drawdown from the highest peak reached before it', () => {
    const report = buildBacktestReport({
      signals: [enter('LONG', 1, 100)],
      candles: candles(100, 110, 104, 107),
      from: H,
    });

    /**
     * **Le test qui porte la correction du 2026-10-08.** La courbe monte à +10
     * points puis retombe à +4 : l'écart est de 6 points, mais le drawdown est
     * de `6 / 1,10 = 5,4545…` %, puisque le sommet vaut 1,10 fois le capital
     * initial.
     *
     * L'ancienne version rendait `6` — l'écart sans dénominateur, qui n'est pas
     * un drawdown. C'est précisément ce qu'écarte la documentation Hyperliquid :
     * « ce n'est pas le drawdown absolu divisé par une valeur de compte ».
     */
    expect(report.equity.map((p) => p.long)).toEqual([
      0,
      10,
      4,
      expect.closeTo(7, 10),
    ]);
    expect(report.long.maxDrawdown.depthPercent).toBeCloseTo(5.454545, 5);
    expect(report.long.maxDrawdown.peakTime).toBe(2 * H);
    expect(report.long.maxDrawdown.troughTime).toBe(3 * H);
  });

  it('reports the first of two equal peaks', () => {
    // Révélé par mutation. Sur deux sommets de même valeur, c'est le premier
    // qui est rapporté : la courbe monte à +10, y reste, puis retombe.
    const report = buildBacktestReport({
      signals: [enter('LONG', 1, 100)],
      candles: candles(100, 110, 110, 105),
      from: H,
    });

    expect(report.long.maxDrawdown.peakTime).toBe(2 * H);
    expect(report.long.maxDrawdown.troughTime).toBe(4 * H);
  });

  it('names the wiping candle as the peak when ruin comes first', () => {
    // Révélé par mutation : un sommet initialisé à zéro au lieu de −∞ laisserait
    // `peakTime` à `null` ici. Le sommet est la bougie d'entrée, même si le
    // compte est vidé aussitôt.
    const report = buildBacktestReport({
      signals: [enter('SHORT', 1, 100)],
      candles: candles(100, 300),
      from: H,
    });

    expect(report.short.maxDrawdown.depthPercent).toBe(100);
    expect(report.short.maxDrawdown.peakTime).toBe(H);
  });

  it('stops at the first candle that wipes the account, not at a later one', () => {
    // Révélé par mutation : `<= 0` et `< 0` donnent la même profondeur, mais pas
    // le même creux. Un short à 100 vaut exactement zéro à 200, puis négatif à
    // 300 — c'est le premier moment de la ruine qui compte.
    const report = buildBacktestReport({
      signals: [enter('SHORT', 1, 100)],
      candles: candles(100, 200, 300),
      from: H,
    });

    expect(report.short.maxDrawdown.depthPercent).toBe(100);
    expect(report.short.maxDrawdown.troughTime).toBe(2 * H);
  });

  it('caps a wiped-out account at 100% instead of dividing past zero', () => {
    // Une perte cumulée supérieure au capital rend la suite de la courbe
    // inatteignable : un short entré à 100 et porté jusqu'à 250 perd 150 points,
    // soit une fois et demie la mise.
    const report = buildBacktestReport({
      signals: [enter('SHORT', 1, 100)],
      candles: candles(100, 150, 250),
      from: H,
    });

    expect(report.short.maxDrawdown.depthPercent).toBe(100);
    expect(report.short.maxDrawdown.troughTime).toBe(3 * H);
  });

  it('has no drawdown on a curve that never falls', () => {
    const report = buildBacktestReport({
      signals: [enter('LONG', 1, 100)],
      candles: candles(100, 101, 102),
      from: H,
    });

    expect(report.long.maxDrawdown).toEqual({ depthPercent: 0, peakTime: null, troughTime: null });
  });

  it('books a trade as realized on its exit candle, not also as unrealized', () => {
    const report = buildBacktestReport({
      signals: [enter('LONG', 1, 100), exit('LONG', 2, 110)],
      candles: candles(100, 110, 130),
      from: H,
    });

    expect(report.equity.map((p) => p.long)).toEqual([0, 10, 10]);
  });
});

describe('buildBacktestReport — long and short together', () => {
  it('adds both sides into a total when they never overlap', () => {
    const report = buildBacktestReport({
      signals: [enter('LONG', 1, 100), exit('LONG', 2, 110), enter('SHORT', 3, 100), exit('SHORT', 4, 95)],
      candles: candles(100, 110, 100, 95),
      from: H,
    });

    expect(report.overlap).toEqual({ candles: 0, firstTime: null });
    expect(report.total).toMatchObject({ trades: 2, realizedPercent: 15 });
    expect(report.equity.at(-1)?.total).toBe(15);
  });

  // Un retournement sur la même bougie est ce que le bot sait faire : sortir du
  // long et entrer short au même passage. Ce n'est pas un chevauchement.
  it('does not treat a reversal on the same candle as an overlap', () => {
    const report = buildBacktestReport({
      signals: [enter('LONG', 1, 100), exit('LONG', 2, 105), enter('SHORT', 2, 105), exit('SHORT', 3, 100)],
      candles: candles(100, 105, 100),
      from: H,
    });

    expect(report.overlap.candles).toBe(0);
    expect(report.total).not.toBeNull();
  });

  // Le bot ne tient qu'une position par paire : un total qui additionne un long
  // et un short ouverts ensemble décrit un résultat qu'il ne peut pas obtenir.
  it('refuses a total when long and short are open at the same time', () => {
    const report = buildBacktestReport({
      signals: [enter('LONG', 1, 100), enter('SHORT', 2, 102), exit('SHORT', 3, 100), exit('LONG', 4, 104)],
      candles: candles(100, 102, 100, 104),
      from: H,
    });

    // Le short est tenu de la clôture de 2h à celle de 3h : une période, pendant
    // laquelle le long est aussi ouvert. La bougie de sortie ne compte pas.
    expect(report.overlap).toEqual({ candles: 1, firstTime: 2 * H });
    expect(report.total).toBeNull();
    expect(report.equity.every((p) => p.total === null)).toBe(true);
    expect(report.long.trades).toBe(1);
    expect(report.short.trades).toBe(1);
  });

  it('sees an overlap with a position carried into the window', () => {
    const report = buildBacktestReport({
      signals: [enter('LONG', 1, 100), enter('SHORT', 2, 100), exit('SHORT', 3, 99)],
      candles: candles(100, 100, 99),
      from: 2 * H,
    });

    expect(report.overlap.candles).toBe(1);
    expect(report.total).toBeNull();
  });
});

describe('buildBacktestReport — anomalies are listed, never absorbed', () => {
  it('lists an exit with no open position and ignores it', () => {
    const report = buildBacktestReport({
      signals: [exit('LONG', 1, 100)],
      candles: candles(100),
      from: H,
    });

    expect(report.anomalies).toMatchObject([{ code: 'EXIT_WITHOUT_ENTRY', time: H, side: 'LONG' }]);
    expect(report.trades).toEqual([]);
  });

  it('lists a second entry on an open side and keeps the first one', () => {
    const report = buildBacktestReport({
      signals: [enter('LONG', 1, 100), enter('LONG', 2, 120), exit('LONG', 3, 110)],
      candles: candles(100, 120, 110),
      from: H,
    });

    expect(report.anomalies).toMatchObject([{ code: 'ENTER_WHILE_OPEN', time: 2 * H }]);
    expect(report.trades).toMatchObject([{ entryPrice: 100, exitPrice: 110 }]);
  });

  // La donnée arrive par le réseau : le type ne garantit rien à l'exécution.
  it('lists a signal with an unknown side or an unusable price', () => {
    const report = buildBacktestReport({
      signals: [
        { time: H, signal: 'ENTER', side: 'BOTH', price: 100 } as unknown as TimelineSignal,
        { time: H, signal: 'ENTER', side: 'LONG', price: 0 },
        { time: H, signal: 'ENTER', side: 'LONG', price: Number.NaN },
      ],
      candles: candles(100),
      from: H,
    });

    expect(report.anomalies.map((a) => a.code)).toEqual(['INVALID_SIGNAL', 'INVALID_SIGNAL', 'INVALID_SIGNAL']);
    expect(report.anomalies[0]?.side).toBeNull();
    expect(report.openPositions).toEqual([]);
  });

  // Des signaux en secondes face à des bougies en millisecondes ne se
  // rencontreraient jamais : le dire plutôt que calculer à côté.
  it('lists a signal that matches no candle, but still counts it', () => {
    const report = buildBacktestReport({
      signals: [enter('LONG', 1, 100), { time: 2 * H + 1, signal: 'EXIT', side: 'LONG', price: 110 }],
      candles: candles(100, 110),
      from: H,
    });

    expect(report.anomalies).toMatchObject([{ code: 'SIGNAL_WITHOUT_CANDLE', time: 2 * H + 1 }]);
    expect(report.trades).toHaveLength(1);
  });

  it('orders signals and candles itself', () => {
    const report = buildBacktestReport({
      signals: [exit('LONG', 2, 110), enter('LONG', 1, 100)],
      candles: candles(100, 110).reverse(),
      from: H,
    });

    expect(report.anomalies).toEqual([]);
    expect(report.trades).toHaveLength(1);
    expect(report.equity.map((p) => p.time)).toEqual([H, 2 * H]);
  });
});

/**
 * `relativeDrawdown` est exportée pour que la même formule serve aux courbes que
 * le rapport ne connaît pas — l'achat-conservation au premier chef. Elle doit
 * donc être juste sur une courbe **quelconque**, et pas seulement sur celles que
 * `buildBacktestReport` produit, qui commencent toutes à 0 point.
 */
describe('relativeDrawdown', () => {
  const at = (...values: number[]) =>
    values.map((value, index) => ({ time: (index + 1) * H, value }));

  it('takes its peak from the first observed point, not from an assumed intact capital', () => {
    /**
     * Révélé par mutation, et invisible à travers le rapport : ses courbes
     * partent toujours de 0 point, aucune entrée ne pouvant perdre avant sa
     * première bougie. Une courbe quelconque, elle, peut ouvrir plus bas.
     *
     * Ici elle ouvre à −120 points, soit une valeur de compte négative : le
     * capital est déjà épuisé, et la profondeur vaut 100 % dès ce point. Le
     * **sommet** est cette première bougie, parce que c'est le plus haut point
     * observé. Un sommet initialisé au capital intact rendrait `peakTime: null`
     * et prétendrait qu'aucun sommet n'a été vu.
     */
    expect(relativeDrawdown(at(-120, -110))).toEqual({
      depthPercent: 100,
      peakTime: H,
      troughTime: H,
    });
  });

  it('expresses the fall as a share of the peak', () => {
    // +100 points puis +50 : la valeur de compte passe de 2 à 1,5, soit 25 %.
    const result = relativeDrawdown(at(0, 100, 50));

    expect(result.depthPercent).toBeCloseTo(25, 10);
    expect(result.peakTime).toBe(2 * H);
    expect(result.troughTime).toBe(3 * H);
  });

  it('prefers the deepest ratio over the deepest difference', () => {
    /**
     * Le piège que signale la documentation Hyperliquid : « ce n'est pas le
     * drawdown absolu divisé par une valeur de compte ».
     *
     * La seconde chute est plus grande en points (900 → 500, soit 400) que la
     * première (100 → 0, soit 100), mais plus faible en proportion : 40 %
     * contre 50 %.
     */
    const result = relativeDrawdown(at(0, 100, 0, 900, 500));

    expect(result.depthPercent).toBeCloseTo(50, 10);
    expect(result.troughTime).toBe(3 * H);
  });

  it('is zero on an empty curve', () => {
    expect(relativeDrawdown([])).toEqual({
      depthPercent: 0,
      peakTime: null,
      troughTime: null,
    });
  });
});
