import { describe, expect, it } from '@jest/globals';
import type { AnalysisCandle } from '../analysis/analysis-candle.type.js';
import {
  HYPERLIQUID_FEES,
  buildBacktestReport,
  perpFeePerSide,
  measureDrawdowns,
} from './backtest-report.js';
import type { BacktestReportInput } from './backtest-report.js';
import type { PositionSide, TimelineSignal } from './strategy-engine.type.js';

/**
 * Le rapport est ce qu'on lit pour juger une stratégie avant de la confier au
 * bot. Chaque test fixe une règle dont la violation ferait lire un chiffre faux
 * comme un chiffre vrai.
 */
const H = 3_600_000;

/**
 * Les tests de mecanique - rejeu des positions, anomalies, chevauchement - ne
 * parlent pas de frais : `feePerSide: 0` les laisse comparer brut et net sans
 * repeter un palier a chaque appel. Les frais ont leurs propres tests, ou le
 * palier est explicite.
 */
function buildReport(input: Omit<BacktestReportInput, 'feePerSide'>) {
  return buildBacktestReport({ ...input, feePerSide: 0 });
}

/**
 * Une bougie horaire avec sa mèche. Le `candles` ci-dessous les fait plates
 * (haut = bas = clôture), ce qui convient à tout ce qui se lit sur les
 * clôtures ; le drawdown intra-bougie, lui, ne vit que dans ces mèches.
 */
function bar(hour: number, close: number, low = close, high = close): AnalysisCandle {
  return { time: hour * H, open: close, high, low, close, volume: 1 };
}

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
    const report = buildReport({
      signals: [],
      candles: candles(100, 101),
      from: H,
    });

    expect(report.long).toMatchObject({
      trades: 0,
      winRatePercent: null,
      realizedNetPercent: 0,
    });
    expect(report.total).toMatchObject({ trades: 0, winRatePercent: null });
    expect(report.equity.map((p) => p.total)).toEqual([0, 0]);
    expect(report.anomalies).toEqual([]);
  });

  // Le moteur arrondissait chaque trade à 2 décimales avant de les additionner.
  it('computes each return from the prices, without rounding', () => {
    const report = buildReport({
      signals: [enter('LONG', 1, 100), exit('LONG', 2, 101.2345)],
      candles: candles(100, 101.2345),
      from: H,
    });

    expect(report.trades[0]?.netReturnPercent).toBeCloseTo(1.2345, 10);
    expect(report.long.realizedNetPercent).toBeCloseTo(1.2345, 10);
  });

  it('counts a falling price as a gain on a short', () => {
    const report = buildReport({
      signals: [enter('SHORT', 1, 100), exit('SHORT', 2, 90)],
      candles: candles(100, 90),
      from: H,
    });

    expect(report.short).toMatchObject({
      trades: 1,
      wins: 1,
      realizedNetPercent: 10,
    });
  });

  it('separates wins, losses and exactly flat trades', () => {
    const report = buildReport({
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

    expect(report.long).toMatchObject({
      trades: 3,
      wins: 1,
      losses: 1,
      breakeven: 1,
    });
    expect(report.long.winRatePercent).toBeCloseTo(100 / 3, 10);
  });

  // Additionné, pas composé : +10 % puis −10 % font 0, pas −1 %.
  it('adds returns trade after trade at constant size', () => {
    const report = buildReport({
      signals: [enter('LONG', 1, 100), exit('LONG', 2, 110), enter('LONG', 3, 100), exit('LONG', 4, 90)],
      candles: candles(100, 110, 100, 90),
      from: H,
    });

    expect(report.long.realizedNetPercent).toBeCloseTo(0, 10);
  });
});

describe('buildBacktestReport — reporting window', () => {
  // Le défaut de l'ancien `summary` : il comptait des trades de l'amorçage,
  // invisibles à l'écran.
  it('ignores a trade entirely before the window', () => {
    const report = buildReport({
      signals: [enter('LONG', 1, 100), exit('LONG', 2, 120)],
      candles: candles(100, 120, 120, 120),
      from: 3 * H,
    });

    expect(report.trades).toEqual([]);
    expect(report.carriedIn).toEqual([]);
    expect(report.long.realizedNetPercent).toBe(0);
  });

  it('counts a trade opened exactly at the start of the window', () => {
    const report = buildReport({
      signals: [enter('LONG', 2, 100), exit('LONG', 3, 105)],
      candles: candles(90, 100, 105),
      from: 2 * H,
    });

    expect(report.trades).toHaveLength(1);
  });

  it('reports a position opened before the window apart, and out of every figure', () => {
    const report = buildReport({
      signals: [enter('LONG', 1, 100), exit('LONG', 3, 150)],
      candles: candles(100, 120, 150),
      from: 2 * H,
    });

    expect(report.carriedIn).toEqual([
      {
        side: 'LONG',
        entryTime: H,
        entryPrice: 100,
        exitTime: 3 * H,
        exitPrice: 150,
      },
    ]);
    expect(report.trades).toEqual([]);
    expect(report.long.realizedNetPercent).toBe(0);
    expect(report.equity.map((p) => p.long)).toEqual([0, 0]);
  });

  it('keeps a carried position that never closes, with no exit', () => {
    const report = buildReport({
      signals: [enter('SHORT', 1, 100)],
      candles: candles(100, 90),
      from: 2 * H,
    });

    expect(report.carriedIn).toEqual([
      {
        side: 'SHORT',
        entryTime: H,
        entryPrice: 100,
        exitTime: null,
        exitPrice: null,
      },
    ]);
    expect(report.openPositions).toEqual([]);
  });

  it('reports the window bounds from the candles it covers', () => {
    const report = buildReport({
      signals: [],
      candles: candles(1, 2, 3),
      from: 2 * H,
    });

    expect(report.from).toBe(2 * H);
    expect(report.to).toBe(3 * H);
    expect(report.equity.map((p) => p.time)).toEqual([2 * H, 3 * H]);
  });

  it('has no end and no curve when the window holds no candle', () => {
    const report = buildReport({
      signals: [],
      candles: candles(1, 2),
      from: 10 * H,
    });

    expect(report.to).toBeNull();
    expect(report.equity).toEqual([]);
  });

  it('refuses a window start that is not a timestamp', () => {
    expect(() => buildReport({ signals: [], candles: [], from: Number.NaN })).toThrow(/from/);
  });
});

describe('buildBacktestReport — open positions and the curve', () => {
  it('marks a position still open at the last close, outside the trade count', () => {
    const report = buildReport({
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
        unrealizedGrossPercent: 4,
        // Egal au brut : ce test tourne a frais nuls.
        unrealizedNetPercent: 4,
      },
    ]);
    expect(report.long).toMatchObject({ trades: 0, realizedNetPercent: 0, unrealizedNetPercent: 4 });
    expect(report.equity.at(-1)?.long).toBe(4);
  });

  // Tout l'intérêt d'une courbe à chaque bougie : un trade descendu à −8 % puis
  // refermé à +1 % a exposé à −8 %, et le drawdown doit le dire.
  it('measures the drawdown on unrealized losses, not only on closed trades', () => {
    const report = buildReport({
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
    const report = buildReport({
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

  it('reports the last touch of a repeated peak, where the fall begins', () => {
    /**
     * Révélé par mutation, qui ne disait que « les égalités sont traitées
     * d'une façon déterminée » — pas laquelle. Jusqu'au 2026-10-13 c'était le
     * **premier** passage ; c'est désormais le dernier, et le changement est
     * délibéré : un drawdown commence quand l'équité **quitte** son sommet. La
     * courbe plafonne à +10 sur deux bougies, donc la chute part de la seconde,
     * et c'est ce que mesurera une durée de drawdown.
     */
    const report = buildReport({
      signals: [enter('LONG', 1, 100)],
      candles: candles(100, 110, 110, 105),
      from: H,
    });

    expect(report.long.maxDrawdown.peakTime).toBe(3 * H);
    expect(report.long.maxDrawdown.troughTime).toBe(4 * H);
  });

  it('names the wiping candle as the peak when ruin comes first', () => {
    // Révélé par mutation : un sommet initialisé à zéro au lieu de −∞ laisserait
    // `peakTime` à `null` ici. Le sommet est la bougie d'entrée, même si le
    // compte est vidé aussitôt.
    const report = buildReport({
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
    const report = buildReport({
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
    const report = buildReport({
      signals: [enter('SHORT', 1, 100)],
      candles: candles(100, 150, 250),
      from: H,
    });

    expect(report.short.maxDrawdown.depthPercent).toBe(100);
    expect(report.short.maxDrawdown.troughTime).toBe(3 * H);
  });

  it('has no drawdown on a curve that never falls', () => {
    const report = buildReport({
      signals: [enter('LONG', 1, 100)],
      candles: candles(100, 101, 102),
      from: H,
    });

    expect(report.long.maxDrawdown).toEqual({
      depthPercent: 0,
      peakTime: null,
      troughTime: null,
    });
  });

  it('books a trade as realized on its exit candle, not also as unrealized', () => {
    const report = buildReport({
      signals: [enter('LONG', 1, 100), exit('LONG', 2, 110)],
      candles: candles(100, 110, 130),
      from: H,
    });

    expect(report.equity.map((p) => p.long)).toEqual([0, 10, 10]);
  });
});

describe('buildBacktestReport — long and short together', () => {
  it('adds both sides into a total when they never overlap', () => {
    const report = buildReport({
      signals: [enter('LONG', 1, 100), exit('LONG', 2, 110), enter('SHORT', 3, 100), exit('SHORT', 4, 95)],
      candles: candles(100, 110, 100, 95),
      from: H,
    });

    expect(report.overlap).toEqual({ candles: 0, firstTime: null });
    expect(report.total).toMatchObject({ trades: 2, realizedNetPercent: 15 });
    expect(report.equity.at(-1)?.total).toBe(15);
  });

  // Un retournement sur la même bougie est ce que le bot sait faire : sortir du
  // long et entrer short au même passage. Ce n'est pas un chevauchement.
  it('does not treat a reversal on the same candle as an overlap', () => {
    const report = buildReport({
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
    const report = buildReport({
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
    const report = buildReport({
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
    const report = buildReport({
      signals: [exit('LONG', 1, 100)],
      candles: candles(100),
      from: H,
    });

    expect(report.anomalies).toMatchObject([{ code: 'EXIT_WITHOUT_ENTRY', time: H, side: 'LONG' }]);
    expect(report.trades).toEqual([]);
  });

  it('lists a second entry on an open side and keeps the first one', () => {
    const report = buildReport({
      signals: [enter('LONG', 1, 100), enter('LONG', 2, 120), exit('LONG', 3, 110)],
      candles: candles(100, 120, 110),
      from: H,
    });

    expect(report.anomalies).toMatchObject([{ code: 'ENTER_WHILE_OPEN', time: 2 * H }]);
    expect(report.trades).toMatchObject([{ entryPrice: 100, exitPrice: 110 }]);
  });

  // La donnée arrive par le réseau : le type ne garantit rien à l'exécution.
  it('lists a signal with an unknown side or an unusable price', () => {
    const report = buildReport({
      signals: [
        {
          time: H,
          signal: 'ENTER',
          side: 'BOTH',
          price: 100,
        } as unknown as TimelineSignal,
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
    const report = buildReport({
      signals: [enter('LONG', 1, 100), { time: 2 * H + 1, signal: 'EXIT', side: 'LONG', price: 110 }],
      candles: candles(100, 110),
      from: H,
    });

    expect(report.anomalies).toMatchObject([{ code: 'SIGNAL_WITHOUT_CANDLE', time: 2 * H + 1 }]);
    expect(report.trades).toHaveLength(1);
  });

  it('orders signals and candles itself', () => {
    const report = buildReport({
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
 * `measureDrawdowns` est exportée pour que la même formule serve aux courbes que
 * le rapport ne connaît pas — l'achat-conservation au premier chef. Elle doit
 * donc être juste sur une courbe **quelconque**, et pas seulement sur celles que
 * `buildBacktestReport` produit, qui commencent toutes à 0 point.
 */
describe('measureDrawdowns', () => {
  const at = (...values: number[]) =>
    values.map((value, index) => ({ time: (index + 1) * H, value }));

  it('floors its peak at the intact capital, never below', () => {
    /**
     * ⚠️ **Ce test disait l'inverse jusqu'au 2026-10-13**, au nom de « le sommet
     * est le plus haut point observé ». C'était contredire le contrat écrit sur
     * la fonction : la courbe est en points cumulés **depuis le début de la
     * fenêtre**, donc le compte valait 1 à cet instant-là, et une chute sous 1
     * est une perte réelle qu'il n'y a aucune raison d'effacer.
     *
     * Une courbe ouvrant à −10 puis descendant à −20 rendait **11,11 %** là où
     * le compte a perdu 20 %. Freqtrade borne son pic de la même façon
     * (`cummax().clip(lower=0)`), et sa formule est déjà la nôtre par ailleurs.
     *
     * `peakTime` vaut `null` ici : le sommet est le début de la fenêtre, pas une
     * bougie. C'est plus exact que de désigner la première bougie venue.
     */
    const result = measureDrawdowns(at(-10, -20)).max;

    expect(result.depthPercent).toBeCloseTo(20, 10);
    expect(result.peakTime).toBeNull();
    expect(result.troughTime).toBe(2 * H);
  });

  it('still names a candle as the peak when the curve starts whole', () => {
    // Le cas courant ne doit rien perdre : une courbe qui ouvre au capital
    // intact revendique bien ce premier point comme sommet.
    const result = measureDrawdowns(at(0, -20)).max;

    expect(result.depthPercent).toBeCloseTo(20, 10);
    expect(result.peakTime).toBe(H);
    expect(result.troughTime).toBe(2 * H);
  });

  it('reports a wiped account as a total loss', () => {
    // Valeur de compte négative dès le premier point : la perte est totale, et
    // diviser par un sommet positif décrirait la suite d'une courbe qui ne peut
    // plus exister.
    expect(measureDrawdowns(at(-120, -110)).max).toEqual({
      depthPercent: 100,
      peakTime: null,
      troughTime: H,
    });
  });

  it('expresses the fall as a share of the peak', () => {
    // +100 points puis +50 : la valeur de compte passe de 2 à 1,5, soit 25 %.
    const result = measureDrawdowns(at(0, 100, 50)).max;

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
    const result = measureDrawdowns(at(0, 100, 0, 900, 500)).max;

    expect(result.depthPercent).toBeCloseTo(50, 10);
    expect(result.troughTime).toBe(3 * H);
  });

  it('is zero on an empty curve', () => {
    expect(measureDrawdowns([]).max).toEqual({
      depthPercent: 0,
      peakTime: null,
      troughTime: null,
    });
  });

  /**
   * Le second drawdown : celui dans lequel la courbe est **encore**.
   *
   * Le maximum seul ne distingue pas un creux refermé d'un creux ouvert — il
   * vaut 25 % dans les deux cas, et seule la seconde situation demande une
   * décision aujourd'hui. Freqtrade publie les deux pour cette raison.
   */
  it('measures how far the last point still sits below its peak', () => {
    // Sommet à +100 (valeur 2) en 2 h, dernier point à +50 (valeur 1,5) :
    // le compte est encore 25 % sous son sommet.
    const result = measureDrawdowns(at(0, 100, 50)).current;

    expect(result.depthPercent).toBeCloseTo(25, 10);
    expect(result.peakTime).toBe(2 * H);
  });

  it('reports no current drawdown when the curve ends on its peak', () => {
    // Remontée complète : le pire creux reste à 25 %, mais il est refermé.
    const measured = measureDrawdowns(at(0, 100, 50, 100));

    expect(measured.max.depthPercent).toBeCloseTo(25, 10);
    expect(measured.current.depthPercent).toBe(0);
    expect(measured.current.peakTime).toBe(4 * H);
  });

  it('keeps the two apart when the deepest fall is already behind', () => {
    /**
     * Le cas qui justifie le champ : −50 % traversés puis presque entièrement
     * refermés. Rendre le maximum seul ferait lire une stratégie à terre alors
     * qu'elle est à 10 % de son sommet.
     */
    const measured = measureDrawdowns(at(0, 100, 0, 80));

    expect(measured.max.depthPercent).toBeCloseTo(50, 10);
    expect(measured.max.troughTime).toBe(3 * H);
    expect(measured.current.depthPercent).toBeCloseTo(10, 10);
  });

  it('measures the current fall from the window start, like the maximum', () => {
    // Courbe jamais remontée au capital intact : `peakTime` à `null` désigne le
    // début de la fenêtre, exactement comme pour le maximum.
    const result = measureDrawdowns(at(-10, -20)).current;

    expect(result.depthPercent).toBeCloseTo(20, 10);
    expect(result.peakTime).toBeNull();
  });

  it('leaves a wiped account under water, not back at its peak', () => {
    // Sortie anticipée : sans ce cas, le compte épuisé rendrait un drawdown
    // courant de 0 — « tout va bien » sur un capital qui n'existe plus.
    expect(measureDrawdowns(at(-120, -110)).current).toEqual({
      depthPercent: 100,
      peakTime: null,
    });
  });

  it('is zero on an empty curve, with no peak to name', () => {
    expect(measureDrawdowns([]).current).toEqual({
      depthPercent: 0,
      peakTime: null,
    });
  });
});

/**
 * ============================================================================
 * LE DRAWDOWN INTRA-BOUGIE
 *
 * Ce que les clôtures ne peuvent pas voir. TradingView publie un « max drawdown
 * (close-to-close) » **et** un « (intrabar) » précisément parce que le second
 * est plus profond, toujours.
 *
 * Toutes les bougies des autres tests sont plates (`candles`) : le creux y est
 * donc identique sur les deux mesures, et aucune n'aurait pu éprouver celle-ci.
 * Ici chaque bougie porte sa mèche (`bar`).
 * ============================================================================
 */
describe('buildBacktestReport — intrabar drawdown', () => {
  it('sees a dip that the candle had closed back over', () => {
    /**
     * Prix identique d'un bout à l'autre, et un plus bas à 90 au milieu : sur
     * les clôtures, la stratégie n'a jamais rien perdu. Le compte, lui, est
     * bien passé 10 % sous son sommet.
     */
    const report = buildReport({
      signals: [enter('LONG', 1, 100), exit('LONG', 3, 100)],
      candles: [bar(1, 100), bar(2, 100, 90), bar(3, 100)],
      from: H,
    });

    expect(report.long.maxDrawdown.depthPercent).toBe(0);
    expect(report.long.maxDrawdownIntrabar.depthPercent).toBeCloseTo(10, 10);
    expect(report.long.maxDrawdownIntrabar.troughTime).toBe(2 * H);
  });

  it('spares the entry candle, which the position did not live through', () => {
    /**
     * La position s'ouvre à la **clôture** du signal — c'est la règle de
     * remplissage de tout ce rapport. Le plus bas qui l'a précédée dans la même
     * bougie appartient donc à un compte qui n'était pas encore exposé.
     * Compter ce 50 ferait lire un creux de 50 % qui n'a jamais eu lieu.
     */
    const report = buildReport({
      signals: [enter('LONG', 1, 100)],
      candles: [bar(1, 100, 50), bar(2, 100)],
      from: H,
    });

    expect(report.long.maxDrawdownIntrabar.depthPercent).toBe(0);
  });

  it('counts the exit candle, which the position lived through to its close', () => {
    // Symétrique du précédent : la position traverse la bougie entière et n'est
    // refermée qu'à sa clôture, donc son plus bas la concerne.
    const report = buildReport({
      signals: [enter('LONG', 1, 100), exit('LONG', 2, 100)],
      candles: [bar(1, 100), bar(2, 100, 90)],
      from: H,
    });

    expect(report.long.maxDrawdown.depthPercent).toBe(0);
    expect(report.long.maxDrawdownIntrabar.depthPercent).toBeCloseTo(10, 10);
  });

  it('reads the high against a short, never the low', () => {
    /**
     * Une bougie qui monte à 120 et descend à 50 : le short souffre du haut.
     * Lire le plus bas lui prêterait un gain de 50 % là où il a perdu 20 %.
     */
    const report = buildReport({
      signals: [enter('SHORT', 1, 100), exit('SHORT', 3, 100)],
      candles: [bar(1, 100), bar(2, 100, 50, 120), bar(3, 100)],
      from: H,
    });

    expect(report.short.maxDrawdownIntrabar.depthPercent).toBeCloseTo(20, 10);
  });

  it('keeps the peak the closes reached, even when a wick dug under it', () => {
    /**
     * ⚠️ **Le défaut de la version 0.31.0, vu à l'écran avant d'être vu ici.**
     *
     * Le creux et le sommet se lisaient tous deux sur la courbe adverse. Or une
     * courbe partout plus basse ne donne pas un drawdown plus profond : le creux
     * se rapporte au sommet de **sa propre** courbe, et une mèche sous la bougie
     * du sommet abaisse ce sommet autant que le creux. Mesuré sur BTC le
     * 2026-10-14, le mobile affichait **−2,41 %** d'intra-bougie sous −2,86 % de
     * close-to-close : l'inverse de ce que la ligne promet.
     *
     * Ici : la position est ouverte à 100, la deuxième bougie clôture à 110
     * après être redescendue à 100, la troisième clôture à 100 après un plus bas
     * à 95.
     *
     * - sur les clôtures : sommet 1,10, creux 1,00 → `0,10 / 1,10 = 9,09 %` ;
     * - au pire instant, sommet pris à la clôture : `0,15 / 1,10 = 13,64 %` ;
     * - au pire instant, sommet pris sur la courbe adverse : le sommet retombe à
     *   1,00 et le creux ne vaut plus que **5 %** — moins que les clôtures.
     */
    const report = buildReport({
      signals: [enter('LONG', 1, 100)],
      candles: [bar(1, 100), bar(2, 110, 100), bar(3, 100, 95)],
      from: H,
    });

    expect(report.long.maxDrawdown.depthPercent).toBeCloseTo(9.0909090909, 8);
    expect(report.long.maxDrawdownIntrabar.depthPercent).toBeCloseTo(13.6363636364, 8);
    // Le sommet nommé est bien celui des clôtures, et non celui de la courbe adverse.
    expect(report.long.maxDrawdownIntrabar.peakTime).toBe(2 * H);
  });

  it('refuses a peak the candle only reached after its own low', () => {
    /**
     * L'ordre à l'intérieur d'une bougie est inconnu — sauf un : la **clôture
     * est le dernier instant**. Un sommet posé par cette clôture est donc
     * postérieur au plus bas de la même bougie, et mesurer la chute depuis lui
     * décrirait un creux à l'envers.
     *
     * Position ouverte à 100, puis une bougie qui descend à 90 et clôture à 120 :
     *
     * - creux depuis le sommet d'avant (1,00) : `0,10 / 1,00 = 10 %` ;
     * - creux depuis la clôture de cette même bougie (1,20) : 25 %, pour une
     *   chute que le compte n'a pas faite dans ce sens-là.
     *
     * Les clôtures, elles, ne voient aucune baisse : la courbe monte de 0 à +20.
     */
    const report = buildReport({
      signals: [enter('LONG', 1, 100)],
      candles: [bar(1, 100), bar(2, 120, 90)],
      from: H,
    });

    expect(report.long.maxDrawdown.depthPercent).toBe(0);
    expect(report.long.maxDrawdownIntrabar.depthPercent).toBeCloseTo(10, 10);
    expect(report.long.maxDrawdownIntrabar.peakTime).toBe(H);
  });

  it('never reads shallower than the drawdown measured on closes', () => {
    /**
     * L'invariant qui tient tout : la mesure au pire instant ne peut pas
     * flatter celle des clôtures.
     *
     * Le cas qui l'enfreindrait sans garde est la bougie de **sortie** sur un
     * prix plat : la position y est encore vivante, donc son frais de sortie
     * n'est pas encore dû, et la courbe adverse passerait au-dessus de la
     * courbe de clôture — une courbe « au pire » plus haute que l'autre.
     */
    const report = buildBacktestReport({
      signals: [enter('LONG', 1, 100), exit('LONG', 2, 100)],
      candles: [bar(1, 100), bar(2, 100)],
      from: H,
      feePerSide: 0.001,
    });

    // Aller-retour à 0,1 % par côté sur un prix inchangé : le compte finit à
    // −0,2 %, et c'est son pire point sur les deux mesures.
    expect(report.long.maxDrawdown.depthPercent).toBeCloseTo(0.2, 10);
    expect(report.long.maxDrawdownIntrabar.depthPercent).toBeCloseTo(0.2, 10);
  });

  it('adds the realized of one side to the worst instant of the other', () => {
    /**
     * Pas de chevauchement ici — un seul côté est exposé à la fois —, donc
     * additionner ne prétend pas que deux malheurs sont simultanés. C'est aussi
     * pourquoi la question ne se pose jamais : le rapport refuse un total dès
     * que les deux côtés se chevauchent.
     *
     * Le long sort à 95 (−5 points, acquis) ; le short, ouvert à 95, voit 110
     * dans la dernière bougie : `(95 − 110) / 95 = −15,7894...` points. Le pire
     * point du compte vaut donc −20,7894... points, soit une valeur de 0,79210
     * et un creux de **20,7894 %** — que ni l'un ni l'autre des côtés n'atteint
     * seul.
     */
    const report = buildReport({
      signals: [
        enter('LONG', 1, 100),
        exit('LONG', 2, 95),
        enter('SHORT', 3, 95),
        exit('SHORT', 4, 95),
      ],
      candles: [bar(1, 100), bar(2, 95, 90), bar(3, 95), bar(4, 95, 95, 110)],
      from: H,
    });

    expect(report.total?.maxDrawdownIntrabar.depthPercent).toBeCloseTo(20.7894736842, 8);
    expect(report.total?.maxDrawdownIntrabar.troughTime).toBe(4 * H);
  });
});

/**
 * ============================================================================
 * LA RÉFÉRENCE À BATTRE
 *
 * « Ne rien faire » est la référence à battre : une stratégie qui rend moins que
 * le cours qu'elle suit n'a pas de raison d'exister. Le rapport la porte donc
 * lui-même, mesurée sur la même fenêtre et avec les mêmes fonctions, plutôt que
 * de laisser chaque écran la refaire.
 * ============================================================================
 */
describe('buildBacktestReport — buy and hold', () => {
  it('measures the hold on the window, whatever the strategy did', () => {
    // Acheté à 100 à la première clôture, revendu à 110 : +10 points, et la
    // stratégie n'a rien à voir avec ce chiffre.
    const report = buildReport({
      signals: [enter('SHORT', 1, 100), exit('SHORT', 2, 110)],
      candles: candles(100, 110),
      from: H,
    });

    expect(report.hold?.returnPercent).toBeCloseTo(10, 10);
    expect(report.equity.map((p) => p.hold)).toEqual([0, expect.closeTo(10, 10)]);
    // Le short a perdu pendant que le hold gagnait : c'est tout l'intérêt.
    expect(report.short.realizedNetPercent).toBeCloseTo(-10, 10);
  });

  it('gives the hold the same drawdown as the strategy gets', () => {
    /**
     * 100 → 120 → 90 : la valeur de compte passe de 1 à 1,20 puis 0,90, soit
     * `0,30 / 1,20 = 25 %`. Et comme la courbe finit sur son creux, le recul
     * courant vaut le maximum.
     */
    const report = buildReport({ signals: [], candles: candles(100, 120, 90), from: H });

    expect(report.hold?.maxDrawdown.depthPercent).toBeCloseTo(25, 10);
    expect(report.hold?.maxDrawdown.peakTime).toBe(2 * H);
    expect(report.hold?.maxDrawdown.troughTime).toBe(3 * H);
    expect(report.hold?.currentDrawdown.depthPercent).toBeCloseTo(25, 10);
  });

  it('spares the buying candle, whose low came before the purchase', () => {
    // L'achat se fait à la **clôture** de la première bougie : son plus bas à 50
    // appartient à un capital qui n'était pas encore exposé.
    const report = buildReport({ signals: [], candles: [bar(1, 100, 50), bar(2, 100)], from: H });

    expect(report.hold?.maxDrawdownIntrabar.depthPercent).toBe(0);
  });

  it('reads the lows of every candle after it', () => {
    const report = buildReport({ signals: [], candles: [bar(1, 100), bar(2, 100, 90)], from: H });

    expect(report.hold?.maxDrawdown.depthPercent).toBe(0);
    expect(report.hold?.maxDrawdownIntrabar.depthPercent).toBeCloseTo(10, 10);
  });

  it('charges the hold no fee, where the strategy pays two', () => {
    /**
     * **Décision, pas oubli.** Ni TradingView (« Buy & hold return ») ni
     * Freqtrade (`market_change`) ne déduisent de frais de leur référence, et
     * l'écart va dans le sens prudent : il avantage la référence, donc
     * désavantage la stratégie. L'écran le dit ; ce test empêche qu'on le
     * « corrige » sans décider.
     *
     * Prix plat, aller-retour à 0,1 % par côté : la stratégie finit à −0,2 %, le
     * hold à zéro pile.
     */
    const report = buildBacktestReport({
      signals: [enter('LONG', 1, 100), exit('LONG', 2, 100)],
      candles: candles(100, 100),
      from: H,
      feePerSide: 0.001,
    });

    expect(report.long.realizedNetPercent).toBeCloseTo(-0.2, 10);
    expect(report.hold?.returnPercent).toBe(0);
  });

  it('has nothing to buy on an empty window', () => {
    expect(buildReport({ signals: [], candles: [], from: H }).hold).toBeNull();
  });
});

describe('buildBacktestReport — exposure and payoff', () => {
  it('counts the candles where a position is open, not the trades', () => {
    /**
     * Entrée à la clôture de la bougie 1, sortie à celle de la bougie 3 : la
     * position est ouverte aux bougies 1 et 2, donc 2 sur 4.
     *
     * Une stratégie à plat une bougie sur deux qui égale l'achat-conservation ne
     * lui est pas équivalente : elle est bien meilleure en risque.
     */
    const report = buildReport({
      signals: [enter('LONG', 1, 100), exit('LONG', 3, 100)],
      candles: candles(100, 100, 100, 100),
      from: H,
    });

    expect(report.exposurePercent).toBeCloseTo(50, 10);
  });

  it('counts an inherited position, which no other figure does', () => {
    // Elle n'entre dans aucun chiffre du rapport — mais elle occupe bien le
    // compte, et c'est du temps exposé. Même règle que pour `overlap`.
    const report = buildReport({
      signals: [enter('LONG', 1, 100), exit('LONG', 3, 100)],
      candles: candles(100, 100, 100, 100),
      from: 2 * H,
    });

    expect(report.carriedIn).toHaveLength(1);
    expect(report.trades).toHaveLength(0);
    // Fenêtre de 3 bougies (2, 3, 4), position ouverte sur la bougie 2 seule.
    expect(report.exposurePercent).toBeCloseTo(100 / 3, 10);
  });

  it('takes the union of both sides, never their sum', () => {
    // Long et short ouverts sur les mêmes bougies : une somme donnerait 200 %.
    const report = buildReport({
      signals: [
        enter('LONG', 1, 100),
        enter('SHORT', 1, 100),
        exit('LONG', 2, 100),
        exit('SHORT', 2, 100),
      ],
      candles: candles(100, 100),
      from: H,
    });

    expect(report.exposurePercent).toBeCloseTo(50, 10);
  });

  it('is zero without a single position', () => {
    expect(buildReport({ signals: [], candles: candles(100, 100), from: H }).exposurePercent).toBe(
      0,
    );
  });

  it('weighs the average win against the average loss', () => {
    /**
     * Le taux de réussite seul ne décide pas : un suiveur de tendance gagne 35 à
     * 40 % du temps avec un gros rapport. Ici deux trades, +10 % et −5 % :
     * le rapport vaut 2.
     */
    const report = buildReport({
      signals: [
        enter('LONG', 1, 100),
        exit('LONG', 2, 110),
        enter('LONG', 3, 100),
        exit('LONG', 4, 95),
      ],
      candles: candles(100, 110, 100, 95),
      from: H,
    });

    expect(report.long.payoffRatio).toBeCloseTo(2, 10);
  });

  it('refuses a ratio when one side is empty', () => {
    // Sans trade perdant le rapport serait infini, et l'annoncer comme un
    // chiffre flatterait un échantillon trop court.
    const report = buildReport({
      signals: [enter('LONG', 1, 100), exit('LONG', 2, 110)],
      candles: candles(100, 110),
      from: H,
    });

    expect(report.long.winRatePercent).toBe(100);
    expect(report.long.payoffRatio).toBeNull();
  });
});

/**
 * ============================================================================
 * LES FRAIS
 *
 * Le reste du fichier tourne à `feePerSide: 0`, ce qui laisse brut et net
 * égaux. Ici le palier est explicite, parce qu'un palier nul ne prouve rien.
 *
 * Tous les chiffres attendus sont calculés à la main dans le commentaire qui
 * les précède, jamais recopiés de l'implémentation.
 * ============================================================================
 */
describe('buildBacktestReport — fees', () => {
  /** 0,1 par côté, soit 10 points par côté : lisible à l'œil. */
  const FEE = 0.001;

  const oneTrade = () => ({
    signals: [enter('LONG', 1, 100), exit('LONG', 2, 110)],
    candles: candles(100, 110),
    from: H,
    feePerSide: FEE,
  });

  it('charges both sides of a closed round trip', () => {
    // Brut : (110 − 100) / 100 = +10 %. Net : 10 − 2 × 0,1 % = 9,8.
    const report = buildBacktestReport(oneTrade());

    expect(report.trades[0]!.grossReturnPercent).toBeCloseTo(10, 10);
    expect(report.trades[0]!.netReturnPercent).toBeCloseTo(9.8, 10);
  });

  it('charges only the entry of a position still open', () => {
    /**
     * Une sortie non advenue n'a pas de frais de sortie. En compter deux
     * surévaluerait le coût d'une position qu'on n'a pas refermée — et le
     * drawdown s'en trouverait creusé d'un frais qui n'a pas été payé.
     */
    const report = buildBacktestReport({
      signals: [enter('LONG', 1, 100)],
      candles: candles(100, 110),
      from: H,
      feePerSide: FEE,
    });

    expect(report.openPositions[0]!.unrealizedGrossPercent).toBeCloseTo(10, 10);
    expect(report.openPositions[0]!.unrealizedNetPercent).toBeCloseTo(9.9, 10);
  });

  it('keeps the gross figure alongside, so the cost can be read', () => {
    // C'est la mesure qui a motivé tout ceci : l'écart entre les deux est ce
    // que les frais coûtent, et il doit rester lisible.
    const report = buildBacktestReport(oneTrade());

    expect(report.long.realizedGrossPercent).toBeCloseTo(10, 10);
    expect(report.long.realizedNetPercent).toBeCloseTo(9.8, 10);
  });

  it('counts a winner the fees turn into a loser as a loss', () => {
    /**
     * **Le point de tout le changement.** Un trade à +0,1 % brut est une perte
     * à 0,1 % par côté : 0,1 − 0,2 = −0,1. Un taux de réussite brut aurait
     * compté ce trade comme gagnant, et flatterait exactement les trades que
     * les frais emportent.
     */
    const report = buildBacktestReport({
      signals: [enter('LONG', 1, 100), exit('LONG', 2, 100.1)],
      candles: candles(100, 100.1),
      from: H,
      feePerSide: FEE,
    });

    expect(report.long.realizedGrossPercent).toBeCloseTo(0.1, 10);
    expect(report.long.realizedNetPercent).toBeCloseTo(-0.1, 10);
    expect(report.long.wins).toBe(0);
    expect(report.long.losses).toBe(1);
    expect(report.long.winRatePercent).toBe(0);
  });

  it('measures the drawdown on the net curve', () => {
    /**
     * La courbe nette porte le frais d'entrée **dès la bougie d'entrée**, et
     * c'est ce qui rend le drawdown juste.
     *
     * Position ouverte à 100. À la première bougie, le brut vaut 0 et le net
     * −0,1 : la valeur de compte est déjà à 0,999. À la seconde, valorisée à 90,
     * le net vaut −10,1 et la valeur de compte 0,899.
     *
     * ⚠️ **Ce test attendait 10,01 % jusqu'au 2026-10-13**, en mesurant depuis
     * 0,999 au motif que le compte avait « déjà quitté » le capital intact.
     * C'était l'argument à l'envers : le compte valait bien 1 au début de la
     * fenêtre, et le frais d'entrée est ce qui l'en a fait descendre — donc une
     * part de la chute, pas un point de départ plus bas. La bonne valeur est
     * `0,101 / 1 = 10,1 %`.
     *
     * Et ce cas n'a rien d'exotique : **toute** position ouverte sur la
     * première bougie de la fenêtre faisait plonger la courbe sous 1 avant
     * qu'aucun point n'ait valu 1, et sous-estimait donc le drawdown du montant
     * du frais d'entrée.
     */
    const report = buildBacktestReport({
      signals: [enter('LONG', 1, 100)],
      candles: candles(100, 90),
      from: H,
      feePerSide: FEE,
    });

    expect(report.equity.at(-1)!.long).toBeCloseTo(-10.1, 10);
    expect(report.long.maxDrawdown.depthPercent).toBeCloseTo(10.1, 10);
  });

  it('keeps the net figure on the curve after a trade closes', () => {
    /**
     * Révélé par mutation : mon test de drawdown n'utilisait qu'une position
     * **ouverte**, si bien que la branche « trades refermés » de la courbe
     * n'était jamais éprouvée avec un frais.
     *
     * Aller-retour 100 → 110, soit +10 bruts et 9,8 nets. Après la sortie, la
     * courbe doit porter 9,8 : lire le brut y laisserait un gain que le compte
     * n'a pas.
     */
    const report = buildBacktestReport({
      signals: [enter('LONG', 1, 100), exit('LONG', 2, 110)],
      candles: candles(100, 110, 110),
      from: H,
      feePerSide: FEE,
    });

    expect(report.equity.at(-1)!.long).toBeCloseTo(9.8, 10);
  });

  it('refuses a fee it cannot charge', () => {
    /**
     * Un frais négatif gonflerait chaque rendement sans que rien ne le dise.
     *
     * ⚠️ Et non pas « parce qu'Hyperliquid n'en publie aucun » : la table
     * « Maker rebates » en publie, jusqu'à −0,003 %. La vraie raison est dans
     * le nom du test — ce simulateur remplit au marché, donc en taker, et un
     * taker ne touche pas de rebate.
     */
    for (const feePerSide of [-0.001, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        buildBacktestReport({ ...oneTrade(), feePerSide }),
      ).toThrow(/feePerSide/);
    }
  });

  it('accepts a zero fee, which is what isolates their cost', () => {
    expect(() =>
      buildBacktestReport({ ...oneTrade(), feePerSide: 0 }),
    ).not.toThrow();
  });

  it('echoes the tier it was given, so a reader can name it', () => {
    /**
     * Le mobile affiche ce rapport et ne peut pas deviner le palier : c'est une
     * constante privée du bot. Sans cet écho il écrit « net des frais » sans
     * pouvoir dire desquels, et nommer le palier depuis le paquet partagé en
     * ferait une seconde source de vérité.
     */
    expect(buildBacktestReport(oneTrade()).feePerSide).toBe(FEE);
  });

  it('echoes the tier even when it changes nothing to report', () => {
    /**
     * Un palier renvoyé depuis les trades serait indéfinissable sur une fenêtre
     * vide — et c'est précisément là que l'écran a besoin de le nommer, pour
     * dire sous quelle hypothèse le vide a été produit.
     */
    const empty = buildBacktestReport({
      signals: [],
      candles: [],
      from: H,
      feePerSide: HYPERLIQUID_FEES.maker,
    });

    expect(empty.trades).toHaveLength(0);
    expect(empty.feePerSide).toBe(HYPERLIQUID_FEES.maker);
  });

  it('echoes a zero tier as zero, never as a default', () => {
    // `0` est un palier choisi — celui qui isole ce que les frais coûtent. Le
    // confondre avec « non renseigné » ferait afficher un palier inventé.
    expect(buildBacktestReport({ ...oneTrade(), feePerSide: 0 }).feePerSide).toBe(0);
  });

  it('carries the published Hyperliquid tiers for a caller with nothing better', () => {
    // Relevés sur la documentation officielle le 2026-10-07. Les changer est
    // une décision, pas un ajustement.
    expect(HYPERLIQUID_FEES.taker).toBe(0.00045);
    expect(HYPERLIQUID_FEES.maker).toBe(0.00015);
    expect(HYPERLIQUID_FEES.none).toBe(0);
  });
});

/**
 * La formule publiée par Hyperliquid (page Fees, « Fee formula for
 * developers »), transcrite le 2026-10-11. Chaque test fixe soit une branche de
 * la formule, soit un cas réel relevé sur le dex `xyz` le même jour.
 */
describe('perpFeePerSide', () => {
  const BASE = HYPERLIQUID_FEES.taker;

  it('leaves a main-dex market at its published tier', () => {
    // Pas de déployeur, pas de growth mode : la formule est l'identité.
    expect(perpFeePerSide({ baseRatePerSide: BASE })).toBe(BASE);
  });

  it('doubles the rate at the scale every live xyz market carries', () => {
    /**
     * Mesuré le 2026-10-11 : `deployerFeeScale` vaut `'1.0'` sur 134 marchés
     * `xyz` sur 134 — la seule valeur que nous ayons jamais observée.
     *
     * ⚠️ La frontière `< 1` n'est **pas** un piège, contrairement à ce qu'elle
     * laisse croire : la formule y est continue. À `1`, la branche basse rend
     * `1 + 1 = 2` et la branche haute `1 × 2 = 2`. Remplacer `<` par `<=` ne
     * change donc aucune valeur, et aucun test ne peut l'attraper — mutation
     * survivante, prouvée équivalente, pas une lacune. Le `<` est gardé parce
     * que c'est ce que la page écrit.
     */
    expect(perpFeePerSide({ baseRatePerSide: BASE, deployerFeeScale: 1 })).toBeCloseTo(
      0.0009,
      12,
    );
  });

  it('adds one below the boundary instead of doubling', () => {
    // `0.5` : le déployeur prend 0,5×, le protocole 1× → 1,5× au total.
    expect(perpFeePerSide({ baseRatePerSide: BASE, deployerFeeScale: 0.5 })).toBeCloseTo(
      0.000675,
      12,
    );
  });

  it('lands on the published growth-mode rate for a real xyz market', () => {
    /**
     * Le cas qui compte : `xyz:BRENTOIL`, `deployerFeeScale: '1.0'`,
     * `growthMode: 'enabled'`. La page annonce de son côté « the baseline
     * all-in taker rate under growth mode will be between 0.0045 %-0.009 % », et
     * 0,009 % est exactement ce que la formule rend ici.
     *
     * C'est aussi la mesure de ce que notre harnais facturait de trop : 0,045 %
     * au lieu de 0,009 %, soit **cinq fois**.
     */
    const rate = perpFeePerSide({
      baseRatePerSide: BASE,
      deployerFeeScale: 1,
      growthMode: true,
    });

    expect(rate).toBeCloseTo(0.00009, 12);
    expect(BASE / rate).toBeCloseTo(5, 10);
  });

  it('treats an absent deployer scale as no deployer, never as zero', () => {
    /**
     * Une échelle de `0` est un déployeur qui ne prend rien : la formule rend
     * alors `× 1` — même résultat qu'une absence, mais pour une autre raison.
     *
     * ⚠️ Le garde `== null` ne se teste pas, et c'est assumé : remplacer
     * `== null` par `=== undefined` laisse un `null` traverser la formule, où
     * `null < 1` vaut `true` et `null + 1` vaut `1` — donc exactement le même
     * résultat, par coïncidence de coercition. Mutation survivante, prouvée
     * équivalente. Le garde reste parce qu'il dit l'intention et qu'il tient
     * sans dépendre de cette coïncidence.
     */
    expect(perpFeePerSide({ baseRatePerSide: BASE, deployerFeeScale: null })).toBe(BASE);
    expect(perpFeePerSide({ baseRatePerSide: BASE, deployerFeeScale: 0 })).toBeCloseTo(
      BASE,
      12,
    );
  });

  it('applies growth mode on top of the deployer scale, not instead of it', () => {
    // La page : « Growth mode applies on top of other multipliers ».
    const withBoth = perpFeePerSide({
      baseRatePerSide: BASE,
      deployerFeeScale: 0.5,
      growthMode: true,
    });

    expect(withBoth).toBeCloseTo(0.0000675, 12);
  });

  it('discounts a referral last, on the already-scaled rate', () => {
    // Ce test fixe la **valeur**, pas l'ordre des facteurs : la multiplication
    // commute, et déplacer `(1 - referralDiscount)` en tête rend le même
    // nombre au bit près (vérifié). Mutation survivante, prouvée équivalente.
    expect(
      perpFeePerSide({
        baseRatePerSide: BASE,
        deployerFeeScale: 1,
        referralDiscount: 0.4,
      }),
    ).toBeCloseTo(0.00054, 12);
  });

  it('scales a positive maker rate exactly like a taker one', () => {
    /**
     * La page sépare les deux branches, mais pour un taux maker **positif**
     * elle applique la même chaîne. C'est ce qui autorise une seule fonction —
     * et ce test est ce qui empêche de l'oublier.
     */
    expect(
      perpFeePerSide({
        baseRatePerSide: HYPERLIQUID_FEES.maker,
        deployerFeeScale: 1,
      }),
    ).toBeCloseTo(HYPERLIQUID_FEES.maker * 2, 12);
  });

  it('refuses inputs the formula cannot describe', () => {
    // Un taux négatif est un rebate, et la branche rebate n'est pas transcrite
    // — voir l'en-tête de la fonction.
    expect(() => perpFeePerSide({ baseRatePerSide: -0.0001 })).toThrow(/baseRatePerSide/);
    expect(() => perpFeePerSide({ baseRatePerSide: Number.NaN })).toThrow(/baseRatePerSide/);
    expect(() =>
      perpFeePerSide({ baseRatePerSide: BASE, deployerFeeScale: -1 }),
    ).toThrow(/deployerFeeScale/);
    expect(() =>
      perpFeePerSide({ baseRatePerSide: BASE, referralDiscount: 1.5 }),
    ).toThrow(/referralDiscount/);
  });
});
