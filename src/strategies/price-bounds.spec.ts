import { describe, expect, it } from '@jest/globals';

import {
  describeUnsatisfiableComparison,
  describeUnsatisfiableCross,
} from './price-bounds.js';
import type { Operand, PriceField } from './strategy-engine.type.js';

const price = (field: PriceField, offset?: number): Operand => ({
  type: 'price',
  field,
  ...(offset === undefined ? {} : { offset }),
});

const donchian = (
  subField: 'upper' | 'lower' | 'middle' | 'width',
  offset?: number,
): Operand =>
  ({
    type: 'indicator',
    name: 'donchian',
    period: 21,
    subField,
    ...(offset === undefined ? {} : { offset }),
  }) as Operand;

const number = (value: number): Operand => ({ type: 'number', value });

describe('describeUnsatisfiableComparison', () => {
  it('refuses a price strictly above the upper band of the same candle', () => {
    // La fenêtre du canal inclut la bougie courante, donc `upper >= high >=
    // close`. Mesuré sur 68 656 comparaisons : zéro franchissement strict.
    const reason = describeUnsatisfiableComparison(
      price('close'),
      'GT',
      donchian('upper'),
    );

    expect(reason).toContain('can never be strictly greater');
    expect(reason).toContain('donchian.upper');
  });

  it('refuses a price strictly below the lower band of the same candle', () => {
    expect(
      describeUnsatisfiableComparison(price('low'), 'LT', donchian('lower')),
    ).toContain('donchian.lower');
  });

  it('refuses the same two relations with the operands swapped', () => {
    // `upper < close` est la même impossibilité écrite dans l'autre sens.
    expect(
      describeUnsatisfiableComparison(donchian('upper'), 'LT', price('close')),
    ).not.toBeNull();
    expect(
      describeUnsatisfiableComparison(donchian('lower'), 'GT', price('close')),
    ).not.toBeNull();
  });

  it('accepts the possible direction out of the channel', () => {
    // Sortir d'un canal par le bas quand on compare au haut n'a rien
    // d'impossible : c'est le cas courant.
    expect(
      describeUnsatisfiableComparison(price('close'), 'LT', donchian('upper')),
    ).toBeNull();
    expect(
      describeUnsatisfiableComparison(price('close'), 'GT', donchian('lower')),
    ).toBeNull();
  });

  it('never refuses a non-strict operator, because the price touches its bounds', () => {
    // Mesuré : `high >= upper` arrive 1 851 fois et `close >= upper` 9 fois sur
    // l'échantillon. Refuser la version non stricte rejetterait des règles
    // parfaitement légitimes — c'est la frontière de cette détection.
    for (const operator of ['GTE', 'LTE', 'EQ'] as const) {
      expect(
        describeUnsatisfiableComparison(
          price('high'),
          operator,
          donchian('upper'),
        ),
      ).toBeNull();
      expect(
        describeUnsatisfiableComparison(
          price('low'),
          operator,
          donchian('lower'),
        ),
      ).toBeNull();
    }
  });

  it('accepts the comparison once the bound no longer knows the current candle', () => {
    // C'est le correctif que le message recommande : à `offset: 1` le
    // franchissement redevient possible (mesuré 1 790 fois pour `high > upper`).
    expect(
      describeUnsatisfiableComparison(
        price('close'),
        'GT',
        donchian('upper', 1),
      ),
    ).toBeNull();
  });

  it('still refuses when both sides look at the same older candle', () => {
    // Décaler les **deux** côtés ne corrige rien : la relation est la même une
    // bougie plus tôt.
    const reason = describeUnsatisfiableComparison(
      price('close', 2),
      'GT',
      donchian('upper', 2),
    );

    expect(reason).toContain('offset 2');
  });

  it('leaves volume alone: a price channel does not bound it', () => {
    // `volume` appartient à `PriceField` mais n'est pas un prix. Le signaler
    // rejetterait une règle valable — le faux positif qu'on ne veut pas.
    expect(
      describeUnsatisfiableComparison(price('volume'), 'GT', donchian('upper')),
    ).toBeNull();
  });

  it('ignores the bands that are meant to be crossed', () => {
    // `middle` et `width` ne bornent rien : seules `upper` et `lower` le font.
    expect(
      describeUnsatisfiableComparison(price('close'), 'GT', donchian('middle')),
    ).toBeNull();
    expect(
      describeUnsatisfiableComparison(price('close'), 'GT', donchian('width')),
    ).toBeNull();
  });

  it('ignores an indicator that is not a rolling extreme', () => {
    const bollinger = {
      type: 'indicator',
      name: 'bb',
      period: 20,
      subField: 'upper',
    } as Operand;

    expect(
      describeUnsatisfiableComparison(price('close'), 'GT', bollinger),
    ).toBeNull();
  });

  it('says nothing when neither side is a price field', () => {
    expect(
      describeUnsatisfiableComparison(number(5), 'GT', donchian('upper')),
    ).toBeNull();
  });

  it('gives up on a malformed offset instead of piling onto a structural issue', () => {
    /**
     * Un `offset` invalide est déjà signalé par `INVALID_OFFSET` ; ajouter une
     * plainte sémantique par-dessus brouillerait le diagnostic.
     *
     * ⚠️ Le défaut est porté **des deux côtés**, et c'est le point. Une
     * première version ne le mettait que sur un opérande : les deux offsets
     * différaient alors, et la garde d'égalité rendait `null` avant celle du
     * format. Le test était vert sans éprouver ce qu'il annonçait — révélé par
     * mutation en neutralisant la garde de format, qui a survécu.
     */
    expect(
      describeUnsatisfiableComparison(
        { type: 'price', field: 'close', offset: 'two' },
        'GT',
        { type: 'indicator', name: 'donchian', subField: 'upper', offset: 'two' },
      ),
    ).toBeNull();
    expect(
      describeUnsatisfiableComparison(
        { type: 'price', field: 'close', offset: -1 },
        'GT',
        { type: 'indicator', name: 'donchian', subField: 'upper', offset: -1 },
      ),
    ).toBeNull();
    expect(
      describeUnsatisfiableComparison(
        { type: 'price', field: 'close', offset: 1.5 },
        'GT',
        { type: 'indicator', name: 'donchian', subField: 'upper', offset: 1.5 },
      ),
    ).toBeNull();
  });

  it('survives data that is not an operand at all', () => {
    // Cette détection tourne sur du JSON non validé : une donnée corrompue ne
    // doit pas faire lever la validation elle-même.
    for (const garbage of [null, undefined, 42, 'close', [], {}]) {
      expect(() =>
        describeUnsatisfiableComparison(garbage, 'GT', donchian('upper')),
      ).not.toThrow();
      expect(
        describeUnsatisfiableComparison(garbage, 'GT', donchian('upper')),
      ).toBeNull();
    }
  });

  it('carries the fix, not just the diagnosis', () => {
    const reason = describeUnsatisfiableComparison(
      price('close'),
      'GT',
      donchian('upper'),
    );

    expect(reason).toContain('"offset": 1');
  });
});

describe('describeUnsatisfiableCross', () => {
  it('refuses an upward cross out of the top of the channel', () => {
    // `crossedUp` exige `currLeft > currRight` à la bougie du croisement, qui
    // est exactement la relation impossible.
    expect(
      describeUnsatisfiableCross(price('close'), donchian('upper'), 'UP'),
    ).toContain('can never be strictly greater');
  });

  it('refuses a downward cross out of the bottom of the channel', () => {
    expect(
      describeUnsatisfiableCross(price('close'), donchian('lower'), 'DOWN'),
    ).not.toBeNull();
  });

  it('accepts a downward cross against the upper band', () => {
    // Un `high` qui touchait la bande haute puis repasse dessous est un
    // croisement descendant réel : `prevLeft >= prevRight` est satisfiable,
    // mesuré 1 851 fois.
    expect(
      describeUnsatisfiableCross(price('high'), donchian('upper'), 'DOWN'),
    ).toBeNull();
  });

  it('never refuses ANY, since one of the two directions stays possible', () => {
    expect(
      describeUnsatisfiableCross(price('close'), donchian('upper'), 'ANY'),
    ).toBeNull();
    expect(
      describeUnsatisfiableCross(price('close'), donchian('lower'), 'ANY'),
    ).toBeNull();
  });

  it('names the direction it refuses', () => {
    expect(
      describeUnsatisfiableCross(price('close'), donchian('upper'), 'UP'),
    ).toContain('"UP" cross');
  });

  it('refuses the swapped operands too', () => {
    expect(
      describeUnsatisfiableCross(donchian('lower'), price('close'), 'UP'),
    ).not.toBeNull();
    expect(
      describeUnsatisfiableCross(donchian('upper'), price('close'), 'DOWN'),
    ).not.toBeNull();
  });
});
