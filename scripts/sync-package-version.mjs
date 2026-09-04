#!/usr/bin/env node
// Régénère src/package-version.ts depuis package.json. Invoqué automatiquement
// par le hook "version" de `npm version` (voir package.json "scripts"."version")
// — jamais à lancer ni à éditer la valeur qu'il produit à la main.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8'));

const target = join(rootDir, 'src', 'package-version.ts');
const content = readFileSync(target, 'utf-8');

const updated = content.replace(
  /^export const PACKAGE_VERSION = '.*';$/m,
  `export const PACKAGE_VERSION = '${pkg.version}';`,
);

if (updated === content) {
  throw new Error(
    `sync-package-version: pattern "export const PACKAGE_VERSION = '...'" not found in ${target} — update this script to match.`,
  );
}

writeFileSync(target, updated);
console.log(`src/package-version.ts synced to ${pkg.version}`);
