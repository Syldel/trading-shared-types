import { describe, expect, it } from '@jest/globals';
import { FUNCTION_KINDS } from './strategy-engine.type.js';
import {
  AVAILABLE_FUNCTIONS_METADATA,
  FUNCTION_REGISTRY,
  isFunctionKind,
} from './function-registry.js';

describe('FUNCTION_REGISTRY', () => {
  it('has exactly one entry per known function kind, with a matching `kind` field', () => {
    expect(Object.keys(FUNCTION_REGISTRY).sort()).toEqual(
      [...FUNCTION_KINDS].sort(),
    );
    for (const kind of FUNCTION_KINDS) {
      expect(FUNCTION_REGISTRY[kind].kind).toBe(kind);
    }
  });

  it('declares "min" and "max" as variadic with at least 2 arguments', () => {
    expect(FUNCTION_REGISTRY.min.minArgs).toBe(2);
    expect(FUNCTION_REGISTRY.min.maxArgs).toBeNull();
    expect(FUNCTION_REGISTRY.max.minArgs).toBe(2);
    expect(FUNCTION_REGISTRY.max.maxArgs).toBeNull();
  });
});

describe('AVAILABLE_FUNCTIONS_METADATA', () => {
  it('contains one entry per function kind, in FUNCTION_KINDS order', () => {
    expect(AVAILABLE_FUNCTIONS_METADATA.map((m) => m.kind)).toEqual([
      ...FUNCTION_KINDS,
    ]);
  });
});

describe('isFunctionKind', () => {
  it.each(FUNCTION_KINDS)('accepts "%s"', (kind) => {
    expect(isFunctionKind(kind)).toBe(true);
  });

  it.each([undefined, null, 42, '', 'MAX', 'avg'])('rejects %p', (value) => {
    expect(isFunctionKind(value)).toBe(false);
  });
});
