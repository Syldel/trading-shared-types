import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PACKAGE_VERSION } from './package-version.js';

describe('PACKAGE_VERSION', () => {
  it('matches package.json (auto-synced by the "version" npm hook, enforced here as a safety net)', () => {
    const pkg = JSON.parse(
      readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'),
    ) as { version: string };

    expect(PACKAGE_VERSION).toBe(pkg.version);
  });
});
