import { describe, expect, it } from '@jest/globals';
import { summarizeBacktestSignals } from './backtest-summary.type.js';
import type { TimelineSignal } from './strategy-engine.type.js';

function enter(side: 'LONG' | 'SHORT', time: number, price: number): TimelineSignal {
  return { time, signal: 'ENTER', metadata: { side, price, cumulativeProfitPercent: 0 } };
}

function exit(
  side: 'LONG' | 'SHORT',
  time: number,
  price: number,
  tradeProfitPercent: number,
): TimelineSignal {
  return {
    time,
    signal: 'EXIT',
    metadata: { side, price, tradeProfitPercent, cumulativeProfitPercent: 0 },
  };
}

describe('summarizeBacktestSignals', () => {
  it('returns a null win rate and zeroed counters for an empty timeline', () => {
    expect(summarizeBacktestSignals([])).toEqual({
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRatePercent: null,
      cumulativeProfitPercent: 0,
      openPositionAtEnd: false,
    });
  });

  it('tallies a 100% winning series', () => {
    const signals = [
      enter('LONG', 1, 100),
      exit('LONG', 2, 110, 10),
      enter('LONG', 3, 110),
      exit('LONG', 4, 121, 10),
    ];

    expect(summarizeBacktestSignals(signals)).toEqual({
      totalTrades: 2,
      wins: 2,
      losses: 0,
      winRatePercent: 100,
      cumulativeProfitPercent: 20,
      openPositionAtEnd: false,
    });
  });

  it('tallies a 100% losing series', () => {
    const signals = [enter('SHORT', 1, 100), exit('SHORT', 2, 110, -10)];

    expect(summarizeBacktestSignals(signals)).toEqual({
      totalTrades: 1,
      wins: 0,
      losses: 1,
      winRatePercent: 0,
      cumulativeProfitPercent: -10,
      openPositionAtEnd: false,
    });
  });

  it('flags a position left open at the end without counting it as a trade', () => {
    const signals = [
      enter('LONG', 1, 100),
      exit('LONG', 2, 105, 5),
      enter('LONG', 3, 105),
    ];

    const summary = summarizeBacktestSignals(signals);

    expect(summary.totalTrades).toBe(1);
    expect(summary.wins).toBe(1);
    expect(summary.cumulativeProfitPercent).toBe(5);
    expect(summary.openPositionAtEnd).toBe(true);
  });

  it('tracks LONG and SHORT open positions independently', () => {
    const signals = [
      enter('LONG', 1, 100),
      exit('LONG', 2, 105, 5),
      enter('SHORT', 3, 105),
    ];

    expect(summarizeBacktestSignals(signals).openPositionAtEnd).toBe(true);
  });
});
