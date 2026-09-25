import type {
  FollowMode,
  IOrderAnchor,
  ProtectiveOrderEntry,
} from './exchange-config.interface.js';
import { DEFAULT_FOLLOW_MODE } from './exchange-config.interface.js';

/**
 * ============================================================================
 * 🎨 CE QUE FAIT VRAIMENT UNE CONFIGURATION DE PROTECTION
 *
 * Quatre modes de suivi, trois ancres, un plancher optionnel, deux côtés : 48
 * combinaisons. Toutes sont **permises** — c'est une décision, pas un oubli :
 * l'utilisateur doit pouvoir exprimer ce qu'il veut, y compris l'absurde. Mais
 * il doit savoir ce qu'il exprime.
 *
 * Cette fonction rend un avis : un niveau, un code stable, et **une phrase
 * propre à ce cas précis**. « MARKET + WIDEN_ONLY » et « stop + WIDEN_ONLY sans
 * plancher » sont tous deux fuyants, mais pour des raisons différentes, et la
 * phrase doit dire laquelle.
 *
 * Elle vit ici, dans les types partagés, et non dans l'app : l'app la rend, le
 * bot pourrait la journaliser. Deux jugements écrits séparément dériveraient —
 * c'est exactement ce qui était arrivé à la vérification et au placement des
 * protections, qui calculaient chacun leur réponse.
 *
 * **Indépendante du sens du trade.** Le mode se lit par rapport au prix courant,
 * pas par rapport au trade : un même avis vaut donc pour un long et pour un
 * short, sans que l'appelant ait à dire lequel.
 * ============================================================================
 */

export type ProtectionAdviceLevel =
  /** Ce que font les bots professionnels. */
  | 'standard'
  /** Défendable. Inclut les réglages qui, ici, ne changent rien. */
  | 'legitimate'
  /** Permis, mais laisse grandir la perte acceptée à l'entrée. */
  | 'caution'
  /** La distance au prix ne se réduit jamais : l'ordre se dérobe. */
  | 'runaway';

export type ProtectionAdviceCode =
  | 'MARKET_ANCHOR_RUNS_AWAY'
  | 'STOP_ONLY_LOOSENS'
  | 'STOP_RATCHET_AND_FLOOR'
  | 'STOP_RATCHET'
  | 'BOUND_CANCELS_WIDENING'
  | 'STOP_MAY_LOOSEN'
  | 'STOP_FREE_BOUNDED'
  | 'BOUND_INERT_ON_FIXED'
  | 'FIXED_ON_LIVE_ANCHOR'
  | 'FIXED_ON_ENTRY'
  | 'TARGET_ONLY_CLOSER'
  | 'TARGET_RUNS_WITH_INDICATOR'
  | 'TARGET_WIDENS_WITH_VOLATILITY'
  | 'TARGET_FREE_BOUNDED'
  | 'TARGET_FREE';

export interface ProtectionAdvice {
  level: ProtectionAdviceLevel;
  /**
   * Identifiant stable. C'est **lui** que l'app teste et traduit, jamais le
   * texte : reformuler une phrase ne doit casser ni un test ni une traduction.
   */
  code: ProtectionAdviceCode;
  /** Une phrase, en anglais comme le reste de l'interface. */
  message: string;
}

/** L'ancre effective : sans ancre déclarée, le bot retombe sur l'entrée. */
function anchorSourceOf(anchor: IOrderAnchor | undefined): IOrderAnchor['source'] {
  return anchor?.source ?? 'ENTRY';
}

type Rule = {
  when: (c: Context) => boolean;
  level: ProtectionAdviceLevel;
  code: ProtectionAdviceCode;
  message: string;
};

interface Context {
  isStop: boolean;
  mode: FollowMode;
  source: IOrderAnchor['source'];
  bounded: boolean;
}

/**
 * Les règles, **dans l'ordre**, la première qui correspond gagne.
 *
 * L'ordre porte du sens : les deux cas fuyants passent avant tout, et le cliquet
 * d'un stop passe avant la règle générale sur un plancher inerte — parce qu'un
 * stop à cliquet **et** planché, c'est précisément ce que fait Freqtrade, et le
 * signaler comme « cette case ne sert à rien » serait décourager la meilleure
 * configuration qui soit.
 */
const RULES: Rule[] = [
  {
    when: (c) => c.source === 'MARKET' && c.mode === 'WIDEN_ONLY' && !c.bounded,
    level: 'runaway',
    code: 'MARKET_ANCHOR_RUNS_AWAY',
    message:
      'Anchored on the market and only allowed to move away from it: every pass pushes ' +
      'this order back to the same distance from the price. Nothing ever brings it closer, ' +
      'so it can only be reached by a move that happens between two passes.',
  },
  {
    when: (c) => c.isStop && c.mode === 'WIDEN_ONLY' && !c.bounded,
    level: 'runaway',
    code: 'STOP_ONLY_LOOSENS',
    message:
      'A stop allowed to move only away from the price can do one thing: loosen. The loss ' +
      'you accepted on entry keeps growing, pass after pass. No trading bot we have read ' +
      'lets a stop move backwards — consider TIGHTEN_ONLY, or the entry bound.',
  },
  {
    when: (c) => c.isStop && c.mode === 'TIGHTEN_ONLY' && c.bounded,
    level: 'standard',
    code: 'STOP_RATCHET_AND_FLOOR',
    message:
      'Exactly what Freqtrade does with a stop: a ratchet toward the price, and a hard floor ' +
      'at the loss accepted on entry. The floor is largely redundant with the ratchet here, ' +
      'and having both is the point.',
  },
  {
    when: (c) => c.isStop && c.mode === 'TIGHTEN_ONLY',
    level: 'standard',
    code: 'STOP_RATCHET',
    message:
      'The ratchet professional bots impose on a stop: it may only move toward the price, ' +
      'never back. What it secures, it keeps.',
  },
  {
    when: (c) => c.mode === 'WIDEN_ONLY' && c.bounded,
    level: 'legitimate',
    code: 'BOUND_CANCELS_WIDENING',
    message:
      'These two options cancel each other: the order starts on its entry bound and may only ' +
      'move away from the price, which the bound forbids. It behaves like FIXED — unless its ' +
      'condition only becomes true some passes after the entry.',
  },
  {
    when: (c) => c.isStop && c.mode === 'FREE' && !c.bounded,
    level: 'caution',
    code: 'STOP_MAY_LOOSEN',
    message:
      'A free stop follows its anchor in both directions, so it may move back away from the ' +
      'price and let the loss accepted on entry grow. The entry bound caps that without ' +
      'stopping the stop from following.',
  },
  {
    when: (c) => c.isStop && c.mode === 'FREE',
    level: 'legitimate',
    code: 'STOP_FREE_BOUNDED',
    message:
      'The stop follows its anchor in both directions, but can never go beyond the loss ' +
      'accepted on entry. Freqtrade would also forbid it to loosen at all; the bound is what ' +
      'keeps this reasonable.',
  },
  {
    when: (c) => c.mode === 'FIXED' && c.bounded,
    level: 'legitimate',
    code: 'BOUND_INERT_ON_FIXED',
    message:
      'The entry bound changes nothing here: a FIXED protection never moves, so it can never ' +
      'pass the bound. Harmless, and you can leave it off.',
  },
  {
    when: (c) => c.mode === 'FIXED' && c.source !== 'ENTRY',
    level: 'standard',
    code: 'FIXED_ON_LIVE_ANCHOR',
    message:
      'Frozen at what the anchor was worth on entry, not at what it is worth now. The price ' +
      'stays reproducible pass after pass, so the order can be put back exactly where it was ' +
      'if it disappears from the book or is only partly filled.',
  },
  {
    when: (c) => c.mode === 'FIXED',
    level: 'standard',
    code: 'FIXED_ON_ENTRY',
    message:
      'Computed once from the entry price and the volatility of that moment, then never ' +
      'moved. The simplest behaviour there is.',
  },
  {
    when: (c) => c.mode === 'TIGHTEN_ONLY',
    level: 'legitimate',
    code: 'TARGET_ONLY_CLOSER',
    message:
      'The target may only come closer to the price: as conditions change you take profit ' +
      'sooner, never later. Safe, and it keeps the trade reachable.',
  },
  {
    when: (c) => c.mode === 'WIDEN_ONLY' && c.source === 'INDICATOR',
    level: 'legitimate',
    code: 'TARGET_RUNS_WITH_INDICATOR',
    message:
      'Letting the winner run: the target follows its indicator away from the price and never ' +
      'comes back. An indicator lags the price, so in a sustained trend the remaining distance ' +
      'still shrinks and the target stays reachable.',
  },
  {
    when: (c) => c.mode === 'WIDEN_ONLY',
    level: 'legitimate',
    code: 'TARGET_WIDENS_WITH_VOLATILITY',
    message:
      'The target is anchored on the entry and widens as volatility rises, never narrowing ' +
      'again. It stays reachable, but it will not come back down if volatility falls.',
  },
  {
    when: (c) => c.bounded,
    level: 'legitimate',
    code: 'TARGET_FREE_BOUNDED',
    message:
      'The target follows its anchor in both directions, but never drops below the one set on ' +
      'entry: you never aim for less than you originally did.',
  },
  {
    when: () => true,
    level: 'legitimate',
    code: 'TARGET_FREE',
    message:
      'The target follows its anchor in both directions, adapting to the market of the moment. ' +
      'It may end up closer than the one set on entry.',
  },
];

/**
 * L'avis sur une protection telle qu'elle est configurée.
 *
 * Ne juge que la **combinaison** — côté, ancre, mode, plancher. Ni le
 * multiplicateur ni la taille n'entrent en compte : ils n'ont pas de valeur
 * intrinsèquement bonne ou mauvaise.
 */
export function adviseProtection(
  entry: ProtectiveOrderEntry | undefined | null,
): ProtectionAdvice | null {
  if (!entry) return null;

  const context: Context = {
    isStop: entry.tpsl === 'sl',
    mode: entry.followMode ?? DEFAULT_FOLLOW_MODE,
    source: anchorSourceOf(entry.anchor),
    bounded: entry.boundedByEntry === true,
  };

  // `RULES` se termine par une règle toujours vraie : il y a toujours un avis.
  const rule = RULES.find((candidate) => candidate.when(context))!;

  return { level: rule.level, code: rule.code, message: rule.message };
}
