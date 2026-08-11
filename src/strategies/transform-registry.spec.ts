import { describe, expect, it } from '@jest/globals';
import { TRANSFORM_KINDS } from './strategy-engine.type.js';
import {
  AVAILABLE_TRANSFORMS_METADATA,
  getDefaultTransformPeriod,
  isTransformKind,
  resolveTransformPeriod,
  TRANSFORM_REGISTRY,
} from './transform-registry.js';

describe('TRANSFORM_REGISTRY', () => {
  it('has exactly one entry per known transform kind, with a matching `kind` field', () => {
    expect(Object.keys(TRANSFORM_REGISTRY).sort()).toEqual(
      [...TRANSFORM_KINDS].sort(),
    );
    for (const kind of TRANSFORM_KINDS) {
      expect(TRANSFORM_REGISTRY[kind].kind).toBe(kind);
    }
  });

  it('declares exactly one parameter ("period") per transform, with a positive integer default >= 2', () => {
    for (const kind of TRANSFORM_KINDS) {
      const { parameters } = TRANSFORM_REGISTRY[kind];
      expect(parameters).toHaveLength(1);
      expect(parameters[0].name).toBe('period');
      expect(parameters[0].type).toBe('number');
      expect(Number.isInteger(parameters[0].defaultValue)).toBe(true);
      expect(parameters[0].defaultValue).toBeGreaterThanOrEqual(2);
    }
  });

  it('only "slope" is scale-dependent on its source (sameAsSource)', () => {
    expect(TRANSFORM_REGISTRY.zscore.outputScale).toBe('zscore');
    expect(TRANSFORM_REGISTRY.percentile.outputScale).toBe('percent');
    expect(TRANSFORM_REGISTRY.ratioToMa.outputScale).toBe('ratio');
    expect(TRANSFORM_REGISTRY.slope.outputScale).toBe('sameAsSource');
  });
});

describe('AVAILABLE_TRANSFORMS_METADATA', () => {
  it('contains one entry per transform kind, in TRANSFORM_KINDS order', () => {
    expect(AVAILABLE_TRANSFORMS_METADATA.map((m) => m.kind)).toEqual([
      ...TRANSFORM_KINDS,
    ]);
  });
});

describe('isTransformKind', () => {
  it.each(TRANSFORM_KINDS)('accepts "%s"', (kind) => {
    expect(isTransformKind(kind)).toBe(true);
  });

  it.each([undefined, null, 42, '', 'ZSCORE', 'sma'])(
    'rejects %p',
    (value) => {
      expect(isTransformKind(value)).toBe(false);
    },
  );
});

describe('getDefaultTransformPeriod / resolveTransformPeriod', () => {
  it('matches the registry default for each kind', () => {
    for (const kind of TRANSFORM_KINDS) {
      expect(getDefaultTransformPeriod(kind)).toBe(
        TRANSFORM_REGISTRY[kind].parameters[0].defaultValue,
      );
    }
  });

  it('resolves to the provided period when given', () => {
    expect(resolveTransformPeriod('zscore', 50)).toBe(50);
  });

  it('falls back to the registry default when omitted or null', () => {
    expect(resolveTransformPeriod('zscore', undefined)).toBe(200);
    expect(resolveTransformPeriod('zscore', null)).toBe(200);
    expect(resolveTransformPeriod('ratioToMa')).toBe(100);
    expect(resolveTransformPeriod('slope')).toBe(20);
    expect(resolveTransformPeriod('percentile')).toBe(200);
  });
});
