# @syldel/trading-shared-types

Types TypeScript partagés entre l'API NestJS (trading engine) et l'app Ionic/Capacitor/Angular.
Zéro dépendance runtime, zéro décorateur Nest/Angular : uniquement des `type` / `interface`.
 
## Contenu
 
- `strategy-engine.type.ts` — AST des règles de stratégie (`RuleNode`, `Operand`, `ComparisonCondition`, `TrendCondition`, `LogicalGroup`...)
- `exchange-config.interface.ts` — config exchange/pair/stratégie (`IExchange`, `IExchangeStrategy`, `LatentOrderStrategy`, `ProtectiveOrderStrategy`...)
- `chart.type.ts` — `ChartInterval`, `Candle`
## Installer ce package (option C : repo séparé, non publié)
 
### Depuis Git (recommandé, versionné par tag)
 
```bash
npm install "git+ssh://git@github.com/Syldel/trading-shared-types.git#v0.1.0"
# ou en HTTPS si tu préfères :
npm install "git+https://github.com/Syldel/trading-shared-types.git#v0.1.0"
```
 
npm exécute automatiquement le script `prepare` (= `npm run build`) après le clone,
donc le `dist/` sera généré même s'il n'est pas commité (voir `.gitignore`).
 
⚠️ Toujours pointer sur un tag (`#v0.1.0`) plutôt que sur une branche (`#main`) :
sinon un `npm install` peut résoudre une version différente selon le moment, dans
Nest et Ionic séparément → exactement le drift qu'on veut éviter.
 
### En local, pendant le dev (les deux repos sur ta machine)
 
```bash
npm install file:../trading-shared-types
```
 
Pratique pour itérer vite, mais **ne commite jamais** un `package.json` qui pointe
vers un chemin `file:` local — ça casse l'install pour quiconque n'a pas exactement
la même arborescence. Réserve `file:` à ta machine de dev, utilise Git (tag) ailleurs (CI, autre poste).
 
## Utilisation côté Nest
 
```ts
import { RuleNode, IExchangeStrategy } from '@syldel/trading-shared-types';
```
 
## Utilisation côté Angular / Ionic
 
```ts
import { RuleNode, Operand, ChartInterval } from '@syldel/trading-shared-types';
```
 
Angular (esbuild) et Nest (ts-node / webpack) consomment tous les deux le build
`dist/` (ESM + CJS + `.d.ts`) généré par `tsup` — aucune config bundler spécifique
à ajouter côté consommateur.
 
## Développement
 
```bash
npm install
npm run dev        # build en watch
npm run typecheck
npm run lint
```
 
## Initialiser le repo
 
```bash
git init -b main
npm install                     # génère package-lock.json (nécessaire pour npm ci en CI)
npm run husky:init              # active le hook pre-commit (nécessite un .git déjà initialisé)
git add -A
git commit -m "chore: initial scaffold for shared trading types package"
git tag -a v0.1.0 -m "v0.1.0 — initial strategy/exchange/chart types"
git remote add origin git@github.com:Syldel/trading-shared-types.git
git push -u origin main --follow-tags
```
 
### Vérification avant commit (typecheck + lint + build)
 
`npm run husky:init` active un hook Git `pre-commit` qui lance automatiquement :
 
```bash
npm run verify   # = typecheck && lint && build
```
 
Si l'un des trois échoue, le commit est bloqué. Tu peux aussi lancer `npm run verify`
manuellement à tout moment, notamment avant de bump une version ou de pousser un tag.
 
⚠️ `husky:init` (= la commande `husky`) n'est **jamais** exécutée automatiquement à
l'installation du package (ni via `prepare`, ni via `postinstall`) : c'est volontaire.
Si elle l'était, l'installation de ce package chez un consommateur (Nest ou Ionic, via
`git+ssh` ou `file:`) échouerait, car `husky` est une devDependency qui ne fait pas
partie de ce que ces projets installent. `prepare` reste réservé au `build` (utile aux
consommateurs), et `husky:init` reste une étape manuelle réservée au dev de ce repo.
 
Points qui changent par rapport à un simple `git init && git add -A && git commit -m "init"` :
- **`-b main`** : évite de dépendre du nom de branche par défaut de ta config Git globale (`master` vs `main`).
- **`npm install` avant le commit** : génère `package-lock.json`, que tu dois committer — la CI (`npm ci`) en a besoin, sinon le premier run échoue.
- **Message de commit conventionnel** (`chore: ...`) : utile dès maintenant si tu comptes automatiser le changelog plus tard (ex: avec `changesets` ou `semantic-release`).
- **Tag annoté (`-a` + `-m`)** plutôt qu'un tag léger : il porte un message et un auteur, utile en `git log --decorate` / `git show v0.1.0`.
- **`--follow-tags`** : pousse le tag en même temps que le commit, en un seul push.
## Versionner un changement
 
1. Modifier les types dans `src/`.
2. `npm run typecheck` + `npm run build` pour vérifier localement.
3. Bump de version dans `package.json` (semver — voir règle ci-dessous).
4. `git tag v0.x.y && git push --tags`.
5. Dans Nest et Ionic : `npm install "git+ssh://...#v0.x.y"` (bump explicite des deux côtés).
### Règle de semver à respecter ici
 
- **PATCH** (`0.1.0` → `0.1.1`) : ajout d'un champ optionnel, JSDoc, nouveau type additif qui ne casse rien.
- **MINOR** (`0.1.x` → `0.2.0`) : nouveau type/interface exporté, nouveau champ optionnel sur une interface existante.
- **MAJOR** (`0.x.y` → `1.0.0`) : renommage ou suppression d'un champ, changement de forme d'un type existant
  (ex: le futur passage de `{ type: 'indicator'; name; period }` vers `{ type: 'indicator'; indicator: { name; parameters } }`
  évoqué en discussion — **ça, c'est un breaking change**, donc un bump major, et les deux apps
  doivent migrer dans la même fenêtre pour éviter qu'une stratégie sérialisée par une version
  ne soit plus lisible par l'autre).
## Migration future vers npm privé
 
Quand ça se justifie (3e consommateur, équipe qui grandit, besoin de ne plus dépendre
d'un accès Git au repo pour installer) :
 
1. Créer un registry privé (GitHub Packages, npm private, ou Verdaccio self-hosted).
2. Ajouter dans `package.json` : `"publishConfig": { "registry": "https://npm.pkg.github.com" }`.
3. `npm publish` (le script `prepublishOnly` fait déjà `typecheck` + `build` avant).
4. Remplacer les dépendances `git+ssh://...` par `"@syldel/trading-shared-types": "^0.2.0"` classique
   dans les deux consommateurs.
Aucun changement de code n'est nécessaire dans `src/` pour cette migration — seul le mode
de distribution change.
 