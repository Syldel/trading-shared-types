/**
 * ============================================================================
 * 🔖 PACKAGE VERSION
 * Version publiée de ce paquet, dupliquée depuis `package.json` (une donnée
 * hors `src/` ne peut pas être importée telle quelle : `rootDir` dans
 * tsconfig.json l'interdit). Régénérée automatiquement par
 * `scripts/sync-package-version.mjs`, exécuté par le hook `"version"` de
 * `npm version` (voir package.json "scripts") — jamais à éditer à la main.
 * `package-version.spec.ts` reste un filet de sécurité si ce fichier est
 * modifié ou committé en dehors de ce flux.
 *
 * Sert de handshake de version entre un serveur qui exécute ce paquet et un
 * client qui compare cette valeur à sa propre copie compilée, pour détecter
 * une dérive silencieuse (catalogue plus récent côté serveur que ce que le
 * client sait interpréter) plutôt que de la découvrir via un bug invisible.
 * Voir `docs/trading/mobile-app-integration.md` dans nest-trading-bot.
 * ============================================================================
 */
export const PACKAGE_VERSION = '0.21.0';
