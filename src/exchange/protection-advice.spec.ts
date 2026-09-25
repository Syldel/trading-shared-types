import { describe, expect, it } from '@jest/globals';
import {
  adviseProtection,
  type ProtectionAdviceCode,
} from './protection-advice.js';
import {
  FOLLOW_MODES,
  type IOrderAnchor,
  type ProtectiveOrderEntry,
  type TpslType,
} from './exchange-config.interface.js';

/**
 * ============================================================================
 * L'AVIS SUR UNE PROTECTION, COMBINAISON PAR COMBINAISON
 *
 * Les règles sont ordonnées et la première gagne. Ce qui casse en silence avec
 * ce genre de liste, c'est une règle **masquée** par une plus large placée
 * avant elle : elle ne rend plus jamais son avis, et rien ne le dit. Deux tests
 * ferment ça — l'exhaustivité (les 48 combinaisons ont un avis) et
 * l'atteignabilité (chaque code sort au moins une fois).
 * ============================================================================
 */

const SOURCES = ['ENTRY', 'MARKET', 'INDICATOR'] as const;
const SIDES: TpslType[] = ['sl', 'tp'];

/**
 * Une ancre **valide** pour chaque source. Une ancre `INDICATOR` réclame son
 * indicateur : la fabriquer correctement plutôt que de la caster, c'est laisser
 * le compilateur vérifier que le banc dit la vérité.
 */
const anchorOf = (source: (typeof SOURCES)[number]): IOrderAnchor =>
  source === 'INDICATOR'
    ? { source: 'INDICATOR', name: 'hma', period: 3 }
    : { source };

const entry = (over: Partial<ProtectiveOrderEntry> = {}): ProtectiveOrderEntry =>
  ({
    tpsl: 'sl',
    anchor: { source: 'ENTRY' },
    atrMultiplier: 1,
    sizePercent: 100,
    ...over,
  }) as ProtectiveOrderEntry;

/** Les 48 combinaisons : 2 côtés × 3 ancres × 4 modes × plancher ou non. */
const allCombinations = (): ProtectiveOrderEntry[] => {
  const out: ProtectiveOrderEntry[] = [];
  for (const tpsl of SIDES) {
    for (const source of SOURCES) {
      for (const followMode of FOLLOW_MODES) {
        for (const boundedByEntry of [false, true]) {
          out.push(
            entry({
              tpsl,
              anchor: anchorOf(source),
              followMode,
              boundedByEntry,
            }),
          );
        }
      }
    }
  }
  return out;
};

const codeOf = (over: Partial<ProtectiveOrderEntry>) =>
  adviseProtection(entry(over))!.code;

const levelOf = (over: Partial<ProtectiveOrderEntry>) =>
  adviseProtection(entry(over))!.level;

describe('adviseProtection', () => {
  it('covers the 48 combinations without a gap', () => {
    const combinations = allCombinations();
    expect(combinations).toHaveLength(48);

    for (const combination of combinations) {
      const advice = adviseProtection(combination);
      expect(advice).not.toBeNull();
      expect(advice!.message.length).toBeGreaterThan(40);
    }
  });

  it('leaves no rule unreachable', () => {
    // Une règle masquée par une plus large placée avant elle ne rend plus jamais
    // son avis. Ce test est la seule chose qui le dise.
    const reached = new Set<ProtectionAdviceCode>(
      allCombinations().map((c) => adviseProtection(c)!.code),
    );

    const declared: ProtectionAdviceCode[] = [
      'MARKET_ANCHOR_RUNS_AWAY',
      'STOP_ONLY_LOOSENS',
      'STOP_RATCHET_AND_FLOOR',
      'STOP_RATCHET',
      'BOUND_CANCELS_WIDENING',
      'STOP_MAY_LOOSEN',
      'STOP_FREE_BOUNDED',
      'BOUND_INERT_ON_FIXED',
      'FIXED_ON_LIVE_ANCHOR',
      'FIXED_ON_ENTRY',
      'TARGET_ONLY_CLOSER',
      'TARGET_RUNS_WITH_INDICATOR',
      'TARGET_WIDENS_WITH_VOLATILITY',
      'TARGET_FREE_BOUNDED',
      'TARGET_FREE',
    ];

    expect([...reached].sort()).toEqual([...declared].sort());
  });

  it('gives no advice at all when there is no entry', () => {
    expect(adviseProtection(undefined)).toBeNull();
    expect(adviseProtection(null)).toBeNull();
  });

  describe('ce qui se dérobe', () => {
    it('names the market anchor, not the side, when the anchor tracks the price', () => {
      // Le cas vaut pour un stop comme pour une cible : c'est le couple
      // (ancre, mode) qui est en cause, pas le côté.
      for (const tpsl of SIDES) {
        const advice = adviseProtection(
          entry({ tpsl, anchor: anchorOf('MARKET'), followMode: 'WIDEN_ONLY' }),
        )!;

        expect(advice.level).toBe('runaway');
        expect(advice.code).toBe('MARKET_ANCHOR_RUNS_AWAY');
        expect(advice.message).toContain('between two passes');
      }
    });

    it('gives a stop that only loosens its own sentence', () => {
      // Distinct du precedent : ici l'ancre n'y est pour rien, c'est le stop.
      const advice = adviseProtection(
        entry({ tpsl: 'sl', followMode: 'WIDEN_ONLY' }),
      )!;

      expect(advice.level).toBe('runaway');
      expect(advice.code).toBe('STOP_ONLY_LOOSENS');
      expect(advice.message).toContain('loosen');
      expect(advice.message).not.toContain('between two passes');
    });

    it('stops running away once the bound is on', () => {
      expect(
        levelOf({
          tpsl: 'sl',
          anchor: anchorOf('MARKET'),
          followMode: 'WIDEN_ONLY',
          boundedByEntry: true,
        }),
      ).not.toBe('runaway');
    });
  });

  describe('ce que font les bots professionnels', () => {
    it('recognises the Freqtrade stop: ratchet plus floor', () => {
      const advice = adviseProtection(
        entry({ tpsl: 'sl', followMode: 'TIGHTEN_ONLY', boundedByEntry: true }),
      )!;

      expect(advice.level).toBe('standard');
      expect(advice.code).toBe('STOP_RATCHET_AND_FLOOR');
      expect(advice.message).toContain('Freqtrade');
    });

    it('does not scold the bound on a ratcheting stop', () => {
      // La regle generale « ce plancher ne sert a rien » passe apres celle-ci :
      // decourager la meilleure configuration qui soit serait absurde.
      expect(
        levelOf({
          tpsl: 'sl',
          followMode: 'TIGHTEN_ONLY',
          boundedByEntry: true,
        }),
      ).toBe('standard');
    });

    it('calls a plain ratcheting stop standard too', () => {
      expect(codeOf({ tpsl: 'sl', followMode: 'TIGHTEN_ONLY' })).toBe(
        'STOP_RATCHET',
      );
    });
  });

  describe('ce qui ne change rien', () => {
    it('says the bound cancels a widening protection', () => {
      const advice = adviseProtection(
        entry({ tpsl: 'tp', followMode: 'WIDEN_ONLY', boundedByEntry: true }),
      )!;

      expect(advice.code).toBe('BOUND_CANCELS_WIDENING');
      expect(advice.message).toContain('FIXED');
      // Inerte, pas dangereux : ça ne doit pas s'afficher comme un risque.
      expect(advice.level).toBe('legitimate');
    });

    it('says the bound is inert on a fixed protection', () => {
      const advice = adviseProtection(
        entry({ followMode: 'FIXED', boundedByEntry: true }),
      )!;

      expect(advice.code).toBe('BOUND_INERT_ON_FIXED');
      expect(advice.level).toBe('legitimate');
    });
  });

  describe('ce qui demande de la prudence', () => {
    it('warns that a free stop may loosen', () => {
      const advice = adviseProtection(
        entry({ tpsl: 'sl', followMode: 'FREE' }),
      )!;

      expect(advice.level).toBe('caution');
      expect(advice.code).toBe('STOP_MAY_LOOSEN');
    });

    it('stops warning once that stop is bounded', () => {
      expect(
        levelOf({ tpsl: 'sl', followMode: 'FREE', boundedByEntry: true }),
      ).toBe('legitimate');
    });

    it('never warns about a target: a target cannot grow the accepted loss', () => {
      for (const source of SOURCES) {
        for (const followMode of FOLLOW_MODES) {
          for (const boundedByEntry of [false, true]) {
            expect(
              levelOf({
                tpsl: 'tp',
                anchor: anchorOf(source),
                followMode,
                boundedByEntry,
              }),
            ).not.toBe('caution');
          }
        }
      }
    });
  });

  describe('les défauts', () => {
    it('treats a missing mode as FIXED', () => {
      expect(codeOf({ followMode: undefined })).toBe('FIXED_ON_ENTRY');
    });

    it('treats a missing anchor as the entry', () => {
      expect(codeOf({ anchor: undefined, followMode: 'FIXED' })).toBe(
        'FIXED_ON_ENTRY',
      );
    });

    it('recognises a fixed protection frozen on a live anchor', () => {
      // Ce que `FIXED` rend possible, et qui merite sa propre phrase.
      for (const source of ['MARKET', 'INDICATOR'] as const) {
        const advice = adviseProtection(
          entry({ anchor: anchorOf(source), followMode: 'FIXED' }),
        )!;

        expect(advice.code).toBe('FIXED_ON_LIVE_ANCHOR');
        expect(advice.message).toContain('on entry');
      }
    });
  });

  describe('les cibles', () => {
    it('tells the indicator-anchored runner from the entry-anchored one', () => {
      const runner = adviseProtection(
        entry({
          tpsl: 'tp',
          anchor: anchorOf('INDICATOR'),
          followMode: 'WIDEN_ONLY',
        }),
      )!;
      const widening = adviseProtection(
        entry({ tpsl: 'tp', followMode: 'WIDEN_ONLY' }),
      )!;

      expect(runner.code).toBe('TARGET_RUNS_WITH_INDICATOR');
      expect(runner.message).toContain('lags the price');

      expect(widening.code).toBe('TARGET_WIDENS_WITH_VOLATILITY');
      expect(widening.message).not.toContain('lags the price');
    });

    it('separates a bounded free target from an unbounded one', () => {
      expect(codeOf({ tpsl: 'tp', followMode: 'FREE' })).toBe('TARGET_FREE');
      expect(
        codeOf({ tpsl: 'tp', followMode: 'FREE', boundedByEntry: true }),
      ).toBe('TARGET_FREE_BOUNDED');
    });
  });

  it('gives every case a sentence of its own', () => {
    // Deux cas distincts qui partageraient une phrase rendraient l'avis inutile
    // là où il compte le plus : expliquer ce qui différencie deux réglages.
    const messages = new Map<string, ProtectionAdviceCode>();

    for (const combination of allCombinations()) {
      const advice = adviseProtection(combination)!;
      const seen = messages.get(advice.message);
      expect(seen ?? advice.code).toBe(advice.code);
      messages.set(advice.message, advice.code);
    }

    expect(messages.size).toBe(15);
  });

  it('does not need to know which way the trade goes', () => {
    // Le mode se lit par rapport au prix courant : l'avis vaut pour un long
    // comme pour un short, et l'appelant n'a pas à le dire.
    expect(adviseProtection.length).toBe(1);
  });

  it.each(FOLLOW_MODES)('always returns a known level for %s', (followMode) => {
    for (const tpsl of SIDES) {
      expect(['standard', 'legitimate', 'caution', 'runaway']).toContain(
        levelOf({ tpsl, followMode }),
      );
    }
  });
});
