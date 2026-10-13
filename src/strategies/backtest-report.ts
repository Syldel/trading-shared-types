import type { AnalysisCandle } from '../analysis/analysis-candle.type.js';
import {
  POSITION_SIDES,
  type PositionSide,
  type TimelineSignal,
} from './strategy-engine.type.js';

/**
 * Rapport de backtest d'une stratégie, dérivé de sa timeline et des bougies sur
 * lesquelles elle a été calculée.
 *
 * Rendement de chaque trade à taille constante, en pourcentage du prix
 * d'entrée, **additionné** d'un trade à l'autre — ni levier, ni
 * réinvestissement. Aucun arrondi n'est appliqué : c'est à l'affichage
 * d'arrondir, jamais au calcul (une somme d'arrondis accumule une erreur que
 * rien ne signale).
 *
 * **Les frais sont comptés depuis le 2026-10-09, et c'est une correction de
 * fond.** Ce rapport est ce que l'app affiche, et il rendait un brut qui se
 * lisait comme un résultat : mesuré, les frais valaient jusqu'à **27 points de
 * rendement sur 302 trades**. Chaque chiffre existe donc en deux versions,
 * `Gross` et `Net`, pour qu'on puisse lire ce qu'ils coûtent — et `feePerSide`
 * est **requis**, parce qu'un palier supposé est un coût inventé.
 *
 * ⚠️ Toujours hors du rapport : le **funding**, le slippage, et l'exécution
 * réelle. Le funding dépend de la durée de détention et d'un historique horaire
 * que ce module n'a pas ; les frais, eux, sont connus d'avance et exacts.
 *
 * ⚠️ Le palier assumé est celui que l'appelant passe. Un remplissage de ce
 * rapport est un ordre au marché — il exécute à la clôture de la bougie du
 * signal et ne simule ni TP ni SL —, donc le **taker** est la lecture fidèle.
 *
 * Remplace `BacktestSummary`, qui couvrait toute la fenêtre calculée —
 * amorçage des indicateurs compris — et mélangeait long et short.
 */

export interface BacktestReportInput {
  /**
   * Frais **par côté**, en fraction (0,00045 pour 0,045 %). Un aller-retour en
   * coûte deux ; une position encore ouverte n'en a payé qu'un.
   *
   * **Requis, et non optionnel avec un défaut.** Un défaut serait un palier
   * supposé, donc un coût inventé — et le palier réel dépend du volume sur 14
   * jours et du staking HYPE de l'appelant. `HYPERLIQUID_FEES` donne les
   * paliers publiés pour qui n'en a pas de meilleur.
   */
  feePerSide: number;
  signals: readonly TimelineSignal[];
  /** Les bougies de calcul, amorçage compris. Seules celles dès `from` entrent dans le rapport. */
  candles: readonly AnalysisCandle[];
  /**
   * Début (ms, inclus) de la fenêtre rapportée — celle que l'utilisateur voit.
   * Un trade compte s'il est **ouvert** dans la fenêtre ; une position ouverte
   * avant et encore ouverte à `from` est signalée à part (`carriedIn`).
   */
  from: number;
}

export interface BacktestTrade {
  side: PositionSide;
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  /** Positif = gain. Frais exclus. */
  grossReturnPercent: number;
  /**
   * Positif = gain, **frais des deux côtés déduits**.
   *
   * ⚠️ Renommé depuis `returnPercent` le 2026-10-09, et c'est délibéré :
   * garder le nom en changeant son sens aurait déplacé chaque chiffre de chaque
   * consommateur sans qu'un compilateur n'en dise rien.
   */
  netReturnPercent: number;
}

/** Position ouverte dans la fenêtre et jamais refermée, valorisée à la dernière clôture. */
export interface BacktestOpenPosition {
  side: PositionSide;
  entryTime: number;
  entryPrice: number;
  /** `null` si aucune bougie de la fenêtre ne permet de la valoriser. */
  markTime: number | null;
  markPrice: number | null;
  unrealizedGrossPercent: number | null;
  /**
   * Frais **d'un seul côté** déduits : l'entrée est payée, la sortie ne l'est
   * pas encore. En compter deux surévaluerait le coût d'une position qu'on n'a
   * pas refermée.
   */
  unrealizedNetPercent: number | null;
}

/**
 * Position ouverte **avant** la fenêtre et encore ouverte à son début. Elle
 * n'entre dans aucun chiffre : son entrée n'est pas visible, et la compter
 * attribuerait à la fenêtre une performance commencée ailleurs.
 */
export interface BacktestCarriedPosition {
  side: PositionSide;
  entryTime: number;
  entryPrice: number;
  exitTime: number | null;
  exitPrice: number | null;
}

export interface BacktestDrawdown {
  /**
   * Plus forte baisse depuis un sommet, **en pourcentage de ce sommet** (0 à
   * 100) — la définition standard d'un drawdown maximal.
   *
   * ⚠️ **Corrigé le 2026-10-08, et les valeurs changent.** Ce champ rendait
   * `sommet − valeur` sur une courbe de points cumulés : il manquait le
   * dénominateur, si bien qu'il décrivait le recul du pnl rapporté au capital
   * **initial** et non au sommet. L'écart n'est pas cosmétique — mesuré sur six
   * ans de BTC, un achat-conservation donnait « 562 » là où son drawdown réel
   * est de **76,67 %**. Et l'app l'affichait via `formatPercent`.
   *
   * La documentation Hyperliquid décrit sa page portefeuille comme
   * `max over end > start de (pnl(end) − pnl(start)) / account_value(start)`, en
   * précisant que ce n'est **pas** le drawdown absolu divisé par une valeur de
   * compte. Cette formule se réduit à celle employée ici : `(x − b) / (C + x)`
   * est croissante en `x`, donc le pire intervalle part toujours du sommet
   * courant, et son dénominateur est la valeur de compte à ce sommet.
   *
   * `100` signifie **capital épuisé** : la courbe a atteint zéro, et la suite ne
   * décrit plus rien d'atteignable.
   */
  depthPercent: number;
  /**
   * Bougie du sommet dont part la pire baisse, ou `null` quand ce sommet est le
   * **début de la fenêtre** : depuis la version 0.30.0 le sommet est planché au
   * capital intact (voir `measureDrawdowns`), et une courbe qui n'y est jamais
   * remontée n'a donc aucune bougie à ce niveau.
   *
   * ⚠️ `null` ne veut donc **pas** dire « aucune baisse », et accompagne
   * couramment un `depthPercent` non nul : toute position ouverte sur la
   * première bougie met la courbe sous le capital intact avant qu'aucun point
   * ne l'ait valu. Le champ qui répond « y a-t-il eu une baisse » est
   * `troughTime` ; un appelant qui **affiche** cette borne substitue
   * `BacktestReport.from` au `null`, sinon un formateur de date la daterait de
   * 1970.
   *
   * Cette lecture a changé deux fois, et un code écrit entre-temps peut porter
   * l'autre : « début de la fenêtre » avant le 2026-10-08, « aucune baisse »
   * jusqu'à la version 0.30.0, de nouveau « début de la fenêtre » depuis.
   */
  peakTime: number | null;
  /** Bougie du creux ; `null` quand la courbe ne baisse jamais. */
  troughTime: number | null;
}

/**
 * Où la courbe en est **à son dernier point**, par rapport à son sommet.
 *
 * Une autre question que le drawdown maximal, et Freqtrade la pose à part
 * (« Current drawdown ») : un creux de 25 % refermé il y a six mois ne demande
 * pas la même décision que le même creux, toujours ouvert. Le maximum seul ne
 * permet pas de les distinguer — il vaut 25 % dans les deux cas.
 *
 * Pas de `troughTime` ici : le point de mesure est la fin de la fenêtre, et
 * l'appeler « creux » prétendrait que la courbe y a touché son plus bas.
 */
export interface BacktestCurrentDrawdown {
  /** `0` quand le dernier point **est** le sommet. */
  depthPercent: number;
  /**
   * Bougie du sommet sous lequel la courbe se trouve encore ; `null` quand ce
   * sommet est le début de la fenêtre, comme pour `BacktestDrawdown.peakTime`.
   * Sans recul (`depthPercent` nul), c'est le dernier point lui-même.
   */
  peakTime: number | null;
}

export interface BacktestDrawdowns {
  max: BacktestDrawdown;
  current: BacktestCurrentDrawdown;
}

export interface BacktestStats {
  /** Trades refermés, ouverts dans la fenêtre. */
  trades: number;
  wins: number;
  losses: number;
  /** Trades à rendement exactement nul : ni gain ni perte. */
  breakeven: number;
  /**
   * `null` sans trade : un taux de réussite n'a pas de sens sur zéro trade.
   *
   * ⚠️ Compté **net**, et l'écart n'est pas théorique : un trade à +0,02 % brut
   * est une perte en taker. Un taux de réussite brut flatterait exactement les
   * trades que les frais emportent.
   */
  winRatePercent: number | null;
  realizedGrossPercent: number;
  realizedNetPercent: number;
  /** Positions encore ouvertes en fin de fenêtre, à la dernière clôture. */
  unrealizedGrossPercent: number;
  unrealizedNetPercent: number;
  /** Sur la courbe à chaque bougie, pertes latentes comprises. */
  maxDrawdown: BacktestDrawdown;
  /**
   * Le recul où la courbe se trouve **encore**, à sa dernière bougie.
   *
   * Il peut égaler `maxDrawdown` — c'est même le cas quand le pire creux est le
   * dernier point, donc quand la stratégie est au plus mal au moment où on la
   * regarde. Sans ce champ, cet état-là est indiscernable d'un creux refermé
   * depuis longtemps.
   */
  currentDrawdown: BacktestCurrentDrawdown;
  /**
   * Le même drawdown maximal, mesuré au **pire instant** de chaque bougie : le
   * plus bas pour un long, le plus haut pour un short.
   *
   * TradingView publie les deux côte à côte, et pour une raison qui vaut ici :
   * un creux traversé puis refermé à l'intérieur d'une bougie est invisible sur
   * les clôtures, alors que le compte y est bien passé. Mesuré sur nos cinq jeux
   * de données le 2026-10-13, l'écart allait de 0,76 à 2,79 points sur
   * l'achat-conservation, toujours dans le même sens.
   *
   * ⚠️ **C'est une borne inférieure, pas la vérité.** Le sommet est lu sur cette
   * même courbe adverse et non sur l'extrême favorable de la bougie : apparier
   * un plus haut et un plus bas à l'intérieur d'une seule bougie supposerait un
   * ordre que l'OHLC ne donne pas. Le vrai creux intra-bougie peut donc être
   * plus profond encore — jamais moins.
   *
   * Pas d'équivalent courant : `currentDrawdown` dit où le compte **est**, à la
   * dernière clôture, et un « où il est au pire instant » ne désignerait aucun
   * moment présent.
   */
  maxDrawdownIntrabar: BacktestDrawdown;
}

/**
 * Performance cumulée à la clôture d'une bougie : réalisé + latent, **nette**.
 *
 * Nette et non brute, parce que c'est cette courbe qui porte le drawdown : un
 * drawdown brut décrirait un creux que le compte n'a pas traversé.
 */
export interface BacktestEquityPoint {
  time: number;
  long: number;
  short: number;
  /** `null` quand long et short se chevauchent dans la fenêtre — voir `BacktestReport.total`. */
  total: number | null;
}

export interface BacktestOverlap {
  /** Bougies de la fenêtre où une position longue et une courte sont ouvertes ensemble. */
  candles: number;
  firstTime: number | null;
}

export const BACKTEST_ANOMALY_CODES = [
  'INVALID_SIGNAL',
  'ENTER_WHILE_OPEN',
  'EXIT_WITHOUT_ENTRY',
  'SIGNAL_WITHOUT_CANDLE',
] as const;
export type BacktestAnomalyCode = (typeof BACKTEST_ANOMALY_CODES)[number];

/**
 * Ce que la timeline contient d'incohérent. Le rapport ne corrige rien en
 * silence : un signal inexploitable est écarté **et** listé ici.
 */
export interface BacktestAnomaly {
  code: BacktestAnomalyCode;
  time: number | null;
  side: PositionSide | null;
  message: string;
}

export interface BacktestReport {
  from: number;
  /** Temps d'ouverture de la dernière bougie de la fenêtre ; `null` si la fenêtre est vide. */
  to: number | null;
  /**
   * Le palier appliqué, **renvoyé tel qu'il a été reçu**.
   *
   * Un rapport qui annonce des chiffres nets sans dire de quoi oblige son
   * lecteur à le deviner — et le mobile ne peut pas : `feePerSide` est une
   * constante privée du bot. S'il importait `HYPERLIQUID_FEES` pour nommer le
   * palier, il en ferait une **seconde source de vérité**, qui divergerait en
   * silence le jour où le bot passerait au palier réel de l'utilisateur
   * (volume sur 14 jours, staking HYPE). Le rapport se décrit donc lui-même.
   *
   * ⚠️ C'est un écho, pas une mesure : il dit l'hypothèse sous laquelle les
   * chiffres ont été produits, pas ce qu'un remplissage aurait réellement
   * coûté. Le funding et le slippage restent hors du rapport.
   */
  feePerSide: number;
  long: BacktestStats;
  short: BacktestStats;
  /**
   * `null` quand long et short sont ouverts en même temps sur au moins une
   * bougie. Le simulateur évalue les deux côtés indépendamment, mais le bot ne
   * tient qu'une position par paire : additionner les deux décrirait un
   * résultat qu'il ne peut pas obtenir.
   */
  total: BacktestStats | null;
  trades: BacktestTrade[];
  openPositions: BacktestOpenPosition[];
  carriedIn: BacktestCarriedPosition[];
  equity: BacktestEquityPoint[];
  overlap: BacktestOverlap;
  anomalies: BacktestAnomaly[];
}

interface Position {
  side: PositionSide;
  entryTime: number;
  entryPrice: number;
  exitTime: number | null;
  exitPrice: number | null;
}

/**
 * Paliers perpétuels publiés par Hyperliquid, relevés sur la documentation
 * officielle le 2026-10-07. Par côté.
 *
 * ⚠️ Ce sont les paliers de **base** du dex principal. Ils ne tiennent compte
 * ni du volume sur 14 jours, ni du staking HYPE, ni du barème propre à un
 * marché HIP-3. Un appelant qui connaît mieux son palier passe le sien.
 *
 * ⚠️ **Sur un marché HIP-3, l'écart n'est pas un petit supplément, et il ne va
 * pas toujours dans le même sens.** La formule officielle multiplie le taux par
 * `deployerFeeScale × 2` (quand l'échelle vaut au moins 1) puis par `0,1` si le
 * marché est en growth mode. Mesuré le 2026-10-11 sur les 134 marchés du dex
 * `xyz` : `deployerFeeScale` vaut `'1.0'` partout, et `growthMode` est actif
 * sur 109 des 114 marchés vivants. Ces paliers y **surestiment donc le coût
 * d'un facteur 5**, et le sous-estiment d'un facteur 2 sur les 5 autres.
 * Les appliquer tels quels à un `xyz:` ne donne pas un net prudent : il donne
 * un net faux, dans un sens qu'on ne peut pas deviner sans lire le marché.
 */
export const HYPERLIQUID_FEES = {
  /** Palier de base, preneur de liquidité. */
  taker: 0.00045,
  /** Palier de base, apporteur de liquidité. */
  maker: 0.00015,
  /** Pour isoler ce que les frais coûtent. */
  none: 0,
} as const;

/**
 * Ce qui transforme un palier publié en taux réellement facturé sur un marché.
 *
 * Les deux premiers champs sont servis tels quels par `perp-markets`
 * (`deployerFeeScale` est une chaîne décimale côté API — c'est à l'appelant de
 * la convertir, en refusant ce qui n'est pas un nombre plutôt qu'en laissant
 * `Number('')` rendre `0`).
 */
export interface PerpFeeInput {
  /** Palier publié, par côté, en fraction. Positif. */
  baseRatePerSide: number;
  /**
   * `deployerFeeScale` du marché. Absent sur le dex principal — et c'est bien
   * une absence, pas un zéro : une échelle de `0` est un déployeur qui ne
   * prend rien, ce qui n'est pas la même chose que « pas de déployeur ».
   */
  deployerFeeScale?: number | null;
  /** `growthMode` actif sur ce marché. */
  growthMode?: boolean;
  /** `activeReferralDiscount` du point de terminaison `userFees`, entre 0 et 1. */
  referralDiscount?: number;
}

/**
 * Le taux par côté réellement facturé sur un **perp**, d'après la formule
 * publiée par Hyperliquid (« Fee formula for developers », page Fees, relevée
 * le 2026-10-11).
 *
 * Pourquoi cette fonction existe : `HYPERLIQUID_FEES` seul a produit un
 * mensonge durable. Le harnais appliquait le palier du dex principal à
 * `xyz:BRENTOIL` et annonçait que le net était « optimiste », alors qu'il était
 * **cinq fois trop pessimiste**. Des constantes séparées de la transformation
 * qui les rend utilisables, c'est une invitation à les employer crues.
 *
 * La transcription, champ par champ :
 *
 * ```
 * scaleIfHip3 = deployerFeeScale < 1 ? deployerFeeScale + 1 : deployerFeeScale * 2
 * ```
 *
 * Ce n'est pas arbitraire, et le reste de la page le recoupe : le déployeur
 * prend `deployerFeeScale` fois le barème de base, et « if the share is above
 * 100 %, the protocol fee is also increased to be equal to the deployer fee ».
 * À `0,5` : le déployeur prend 0,5×, le protocole 1× → 1,5× au total. À `1,0` :
 * 1× et 1× → 2×. Les deux branches disent la même chose.
 *
 * ⚠️ **Ce qui n'est pas transcrit, et pourquoi :**
 *
 * - `scaleIfStablePair` est propre au **spot**, que ce dépôt ne simule pas ;
 * - la branche `isAlignedQuoteToken` est omise parce qu'aucune donnée des trois
 *   dépôts ne permet de savoir si un marché y a droit. L'ajouter avec un
 *   défaut à `false` donnerait une apparence de complétude à une entrée que
 *   personne ne peut renseigner.
 *
 *   ⚠️ **Ce n'est pas une branche théorique, et elle ne vaut pas −20 %.** Le
 *   facteur brut est bien `× 0,8`, mais la formule le mélange à la part du
 *   déployeur : `(1 − deployerShare) × 0,8 + deployerShare`. Donc −20 % sur le
 *   dex principal (`deployerShare` nul), mais **−10 %** sur un marché HIP-3 à
 *   `deployerFeeScale` 1,0, où `deployerShare` vaut 0,5. Mesuré le 2026-10-12
 *   sur de vrais remplissages : le taker du dex `vntl` porte ce ×0,9, le maker
 *   non — ce qui recoupe « 20 % lower taker fees, 50 % better maker
 *   **rebates** », un maker positif n'étant pas un rebate. Voir
 *   `nest-trading-bot/docs/known-gaps.md`, point 11 ;
 * - la branche **rebate** du maker (`makerPercentage <= 0`) ne l'est pas non
 *   plus. Pour un taux maker **positif**, la page applique exactement la même
 *   chaîne que pour le taker — `scaleIfHip3 × growthModeScale ×
 *   (1 − referralDiscount)` — donc cette fonction vaut pour les deux. Elle
 *   cesse de valoir dès que le taux passe sous zéro, et c'est pour ça qu'elle
 *   le refuse.
 */
export function perpFeePerSide({
  baseRatePerSide,
  deployerFeeScale,
  growthMode = false,
  referralDiscount = 0,
}: PerpFeeInput): number {
  if (!Number.isFinite(baseRatePerSide) || baseRatePerSide < 0) {
    throw new Error(
      `perpFeePerSide: "baseRatePerSide" must be a finite fraction of at least 0, got ${baseRatePerSide}.`,
    );
  }
  if (deployerFeeScale != null && (!Number.isFinite(deployerFeeScale) || deployerFeeScale < 0)) {
    throw new Error(
      `perpFeePerSide: "deployerFeeScale" must be a finite number of at least 0, got ${deployerFeeScale}.`,
    );
  }
  if (!Number.isFinite(referralDiscount) || referralDiscount < 0 || referralDiscount > 1) {
    throw new Error(
      `perpFeePerSide: "referralDiscount" must be between 0 and 1, got ${referralDiscount}.`,
    );
  }

  const scaleIfHip3 =
    deployerFeeScale == null
      ? 1
      : deployerFeeScale < 1
        ? deployerFeeScale + 1
        : deployerFeeScale * 2;
  const growthModeScale = growthMode ? 0.1 : 1;

  return baseRatePerSide * scaleIfHip3 * growthModeScale * (1 - referralDiscount);
}

export function returnPercent(side: PositionSide, entryPrice: number, exitPrice: number): number {
  const delta = side === 'LONG' ? exitPrice - entryPrice : entryPrice - exitPrice;
  return (delta / entryPrice) * 100;
}

export function buildBacktestReport({
  signals,
  candles,
  from,
  feePerSide,
}: BacktestReportInput): BacktestReport {
  if (!Number.isFinite(from)) {
    throw new Error(`buildBacktestReport: "from" must be a finite timestamp, got ${from}.`);
  }
  if (!Number.isFinite(feePerSide) || feePerSide < 0) {
    /**
     * Un frais négatif gonflerait chaque rendement sans que rien ne le dise.
     *
     * ⚠️ La justification d'origine — « Hyperliquid n'en publie aucun » — était
     * fausse, corrigée le 2026-10-11 : la page des frais publie une table
     * « Maker rebates » qui va jusqu'à **−0,003 %** pour un gros apporteur de
     * liquidité. Un frais par côté négatif existe donc bel et bien.
     *
     * Le refus tient quand même, pour une autre raison : ce rapport remplit
     * **au marché**, à la clôture de la bougie du signal. C'est un fill taker
     * des deux côtés, et un taker ne touche jamais de rebate. Accepter un frais
     * négatif ici reviendrait à créditer une rémunération qu'aucun des ordres
     * simulés n'a pu gagner. Le jour où le simulateur saura poser des limites,
     * ce sera à rouvrir — pas avant.
     */
    throw new Error(
      `buildBacktestReport: "feePerSide" must be a finite fraction of at least 0, got ${feePerSide}.`,
    );
  }

  /** Un aller-retour paie les deux côtés. */
  const roundTripFee = feePerSide * 2 * 100;
  /** Une position encore ouverte n'a payé que son entrée. */
  const entryFee = feePerSide * 100;

  const anomalies: BacktestAnomaly[] = [];
  const orderedCandles = [...candles].sort((a, b) => a.time - b.time);
  const candleTimes = new Set(orderedCandles.map((candle) => candle.time));
  const windowCandles = orderedCandles.filter((candle) => candle.time >= from);
  const lastCandle = windowCandles.at(-1) ?? null;

  const positions = replayPositions(signals, candleTimes, anomalies);

  const inWindow = positions.filter((p) => p.entryTime >= from);
  const trades: BacktestTrade[] = inWindow
    .filter((p): p is Position & { exitTime: number; exitPrice: number } => p.exitTime !== null)
    .map((p) => ({
      side: p.side,
      entryTime: p.entryTime,
      entryPrice: p.entryPrice,
      exitTime: p.exitTime,
      exitPrice: p.exitPrice,
      grossReturnPercent: returnPercent(p.side, p.entryPrice, p.exitPrice),
      netReturnPercent:
        returnPercent(p.side, p.entryPrice, p.exitPrice) - roundTripFee,
    }))
    .sort((a, b) => a.entryTime - b.entryTime);

  const openPositions: BacktestOpenPosition[] = inWindow
    .filter((p) => p.exitTime === null)
    .map((p) => {
      const markable = lastCandle !== null && lastCandle.time >= p.entryTime;
      return {
        side: p.side,
        entryTime: p.entryTime,
        entryPrice: p.entryPrice,
        markTime: markable ? lastCandle.time : null,
        markPrice: markable ? lastCandle.close : null,
        unrealizedGrossPercent: markable
          ? returnPercent(p.side, p.entryPrice, lastCandle.close)
          : null,
        unrealizedNetPercent: markable
          ? returnPercent(p.side, p.entryPrice, lastCandle.close) - entryFee
          : null,
      };
    });

  const carriedIn: BacktestCarriedPosition[] = positions
    .filter((p) => p.entryTime < from && (p.exitTime === null || p.exitTime >= from))
    .map((p) => ({ ...p }));

  const overlap = measureOverlap(positions, windowCandles);
  const overlapping = overlap.candles > 0;

  const equity: BacktestEquityPoint[] = windowCandles.map((candle) => {
    const long = equityAt('LONG', candle, trades, inWindow, entryFee);
    const short = equityAt('SHORT', candle, trades, inWindow, entryFee);
    return {
      time: candle.time,
      long,
      short,
      total: overlapping ? null : long + short,
    };
  });

  /**
   * La même courbe, mais au **pire instant** de chaque bougie : le plus bas pour
   * un long, le plus haut pour un short. C'est elle qui porte le drawdown
   * intra-bougie, celui que TradingView publie à côté du close-to-close.
   *
   * `Math.min` avec la courbe de clôture parce que la bougie de **sortie** y
   * échappe autrement : la valeur adverse y compte la position encore ouverte,
   * donc sans son frais de sortie, et pourrait dépasser la clôture d'un cheveu.
   * Une courbe « au pire » qui passerait au-dessus de l'autre ne serait plus le
   * pire de rien.
   */
  const adverse: BacktestEquityPoint[] = windowCandles.map((candle, index) => {
    const closed = equity[index]!;
    const long = Math.min(closed.long, adverseEquityAt('LONG', candle, trades, inWindow, entryFee));
    const short = Math.min(
      closed.short,
      adverseEquityAt('SHORT', candle, trades, inWindow, entryFee),
    );
    return {
      time: candle.time,
      long,
      short,
      total: overlapping ? null : long + short,
    };
  });

  const statsFor = (side: PositionSide | null): BacktestStats => {
    const sideTrades = trades.filter((t) => side === null || t.side === side);
    const sideOpen = openPositions.filter((p) => side === null || p.side === side);
    const valueOf = (point: BacktestEquityPoint) =>
      side === 'LONG' ? point.long : side === 'SHORT' ? point.short : (point.total ?? 0);
    const curve = equity.map((point) => ({
      time: point.time,
      value: valueOf(point),
    }));
    const adverseCurve = adverse.map((point) => ({
      time: point.time,
      value: valueOf(point),
    }));
    return summarize(sideTrades, sideOpen, curve, adverseCurve);
  };

  return {
    from,
    to: lastCandle?.time ?? null,
    feePerSide,
    long: statsFor('LONG'),
    short: statsFor('SHORT'),
    total: overlapping ? null : statsFor(null),
    trades,
    openPositions,
    carriedIn,
    equity,
    overlap,
    anomalies,
  };
}

/**
 * Rejoue la timeline côté par côté. Les deux côtés sont indépendants, comme dans
 * le moteur : une entrée LONG ne referme pas un SHORT.
 */
function replayPositions(
  signals: readonly TimelineSignal[],
  candleTimes: ReadonlySet<number>,
  anomalies: BacktestAnomaly[],
): Position[] {
  const positions: Position[] = [];
  const open = new Map<PositionSide, Position>();
  // Tri stable : deux signaux au même instant gardent l'ordre du moteur.
  const ordered = [...signals].sort((a, b) => a.time - b.time);

  for (const signal of ordered) {
    const invalid = invalidReason(signal);
    if (invalid) {
      anomalies.push({
        code: 'INVALID_SIGNAL',
        time: Number.isFinite(signal.time) ? signal.time : null,
        side: isSide(signal.side) ? signal.side : null,
        message: `Signal ignored: ${invalid}.`,
      });
      continue;
    }

    if (!candleTimes.has(signal.time)) {
      anomalies.push({
        code: 'SIGNAL_WITHOUT_CANDLE',
        time: signal.time,
        side: signal.side,
        message: `${signal.side} ${signal.signal} at ${signal.time} matches no candle: signals and candles may not share a time unit.`,
      });
    }

    const current = open.get(signal.side);

    if (signal.signal === 'ENTER') {
      if (current) {
        anomalies.push({
          code: 'ENTER_WHILE_OPEN',
          time: signal.time,
          side: signal.side,
          message: `${signal.side} ENTER ignored: a ${signal.side} position opened at ${current.entryTime} is still open.`,
        });
        continue;
      }
      const position: Position = {
        side: signal.side,
        entryTime: signal.time,
        entryPrice: signal.price,
        exitTime: null,
        exitPrice: null,
      };
      open.set(signal.side, position);
      positions.push(position);
      continue;
    }

    if (!current) {
      anomalies.push({
        code: 'EXIT_WITHOUT_ENTRY',
        time: signal.time,
        side: signal.side,
        message: `${signal.side} EXIT ignored: no ${signal.side} position is open.`,
      });
      continue;
    }
    current.exitTime = signal.time;
    current.exitPrice = signal.price;
    open.delete(signal.side);
  }

  return positions;
}

function isSide(value: unknown): value is PositionSide {
  return (POSITION_SIDES as readonly unknown[]).includes(value);
}

/** La donnée vient d'une réponse réseau : le type ne garantit rien à l'exécution. */
function invalidReason(signal: TimelineSignal): string | null {
  if (!Number.isFinite(signal.time)) return `time ${String(signal.time)} is not a number`;
  if (signal.signal !== 'ENTER' && signal.signal !== 'EXIT') {
    return `unknown signal "${String(signal.signal)}"`;
  }
  if (!isSide(signal.side)) return `unknown side "${String(signal.side)}"`;
  if (!Number.isFinite(signal.price) || signal.price <= 0) {
    return `price ${String(signal.price)} is not a positive number`;
  }
  return null;
}

/** Une position est ouverte à la clôture d'une bougie si elle y est entrée et n'en est pas sortie. */
function isOpenAt(position: Position, time: number): boolean {
  return position.entryTime <= time && (position.exitTime === null || position.exitTime > time);
}

/**
 * Ouverte **pendant** la bougie, et non à sa clôture — deux bornes différentes
 * de `isOpenAt`, et c'est tout l'intérêt.
 *
 * La bougie d'entrée est exclue : la position s'ouvre à sa clôture (le
 * simulateur remplit au close du signal), elle n'a donc pas vécu le plus bas qui
 * l'a précédée. La bougie de sortie est incluse : la position l'a traversée en
 * entier, et n'est refermée qu'à sa clôture.
 */
function isLiveDuring(position: Position, time: number): boolean {
  return position.entryTime < time && (position.exitTime === null || position.exitTime >= time);
}

/**
 * L'équité d'un côté au **pire instant** d'une bougie : le plus bas pour un
 * long, le plus haut pour un short.
 *
 * Aucune hypothèse d'ordre à l'intérieur de la bougie n'est nécessaire, parce
 * qu'un seul extrême est lu — c'est ce qui sépare ce calcul de la simulation
 * d'un stop, qui exige de savoir si le plus bas est venu avant le plus haut, ce
 * qu'une bougie OHLC ne dit pas (voir docs/, « ce que le backtest ne dit pas »).
 *
 * Le réalisé s'arrête **avant** cette bougie : un trade qui s'y referme y est
 * encore une position vivante, comptée à son extrême. Et une position vivante
 * n'a payé que son entrée — le frais de sortie n'est pas encore dû à l'instant
 * où la courbe touche son pire point.
 */
function adverseEquityAt(
  side: PositionSide,
  candle: AnalysisCandle,
  trades: readonly BacktestTrade[],
  inWindow: readonly Position[],
  entryFee: number,
): number {
  const realized = trades
    .filter((t) => t.side === side && t.exitTime < candle.time)
    .reduce((sum, t) => sum + t.netReturnPercent, 0);

  const extreme = side === 'LONG' ? candle.low : candle.high;
  const live = inWindow
    .filter((p) => p.side === side && isLiveDuring(p, candle.time))
    .reduce((sum, p) => sum + returnPercent(side, p.entryPrice, extreme) - entryFee, 0);

  return realized + live;
}

/**
 * Chevauchement mesuré sur **toutes** les positions, héritées comprises : une
 * position ouverte avant la fenêtre n'entre pas dans les chiffres, mais elle
 * occupe bien le côté que le bot ne pourrait pas tenir en même temps que l'autre.
 */
function measureOverlap(positions: readonly Position[], windowCandles: readonly AnalysisCandle[]): BacktestOverlap {
  let count = 0;
  let firstTime: number | null = null;

  for (const candle of windowCandles) {
    const longOpen = positions.some((p) => p.side === 'LONG' && isOpenAt(p, candle.time));
    const shortOpen = positions.some((p) => p.side === 'SHORT' && isOpenAt(p, candle.time));
    if (longOpen && shortOpen) {
      count++;
      firstTime ??= candle.time;
    }
  }

  return { candles: count, firstTime };
}

/** Réalisé jusqu'à cette bougie comprise, plus le latent des positions encore ouvertes à sa clôture. */
/**
 * Équité **nette** d'un côté, à la clôture d'une bougie.
 *
 * Nette, parce que c'est cette courbe qui porte le drawdown : un drawdown brut
 * décrirait un creux que le compte n'a pas traversé. Les trades refermés
 * portent déjà leurs deux côtés de frais ; une position encore ouverte n'a payé
 * que son entrée, d'où `entryFee`.
 */
function equityAt(
  side: PositionSide,
  candle: AnalysisCandle,
  trades: readonly BacktestTrade[],
  inWindow: readonly Position[],
  entryFee: number,
): number {
  const realized = trades
    .filter((t) => t.side === side && t.exitTime <= candle.time)
    .reduce((sum, t) => sum + t.netReturnPercent, 0);

  const unrealized = inWindow
    .filter((p) => p.side === side && isOpenAt(p, candle.time))
    .reduce(
      (sum, p) =>
        sum + returnPercent(side, p.entryPrice, candle.close) - entryFee,
      0,
    );

  return realized + unrealized;
}

function summarize(
  trades: readonly BacktestTrade[],
  open: readonly BacktestOpenPosition[],
  curve: readonly { time: number; value: number }[],
  adverseCurve: readonly { time: number; value: number }[],
): BacktestStats {
  // Gagnants et perdants comptés **net** : un trade à +0,02 % brut est une
  // perte en taker, et un taux de réussite brut flatterait exactement les
  // trades que les frais emportent.
  const wins = trades.filter((t) => t.netReturnPercent > 0).length;
  const losses = trades.filter((t) => t.netReturnPercent < 0).length;

  const sum = (values: readonly number[]) =>
    values.reduce((total, value) => total + value, 0);

  return {
    trades: trades.length,
    wins,
    losses,
    breakeven: trades.length - wins - losses,
    winRatePercent: trades.length === 0 ? null : (wins / trades.length) * 100,
    realizedGrossPercent: sum(trades.map((t) => t.grossReturnPercent)),
    realizedNetPercent: sum(trades.map((t) => t.netReturnPercent)),
    unrealizedGrossPercent: sum(
      open.map((p) => p.unrealizedGrossPercent ?? 0),
    ),
    unrealizedNetPercent: sum(open.map((p) => p.unrealizedNetPercent ?? 0)),
    ...drawdowns(curve),
    maxDrawdownIntrabar: measureDrawdowns(adverseCurve).max,
  };
}

/** Les deux drawdowns sous les noms qu'ils portent dans `BacktestStats`. */
function drawdowns(curve: readonly { time: number; value: number }[]): {
  maxDrawdown: BacktestDrawdown;
  currentDrawdown: BacktestCurrentDrawdown;
} {
  const measured = measureDrawdowns(curve);
  return { maxDrawdown: measured.max, currentDrawdown: measured.current };
}

/**
 * Les deux drawdowns d'une courbe, mesurés en un seul passage : le pire qu'elle
 * ait traversé, et celui dans lequel elle est **encore**.
 *
 * `max(sommet − valeur) / sommet` pour le premier. La courbe est en points de
 * pourcentage cumulés à notionnel fixe ; la valeur de compte est donc
 * `1 + points / 100`, en multiples du capital initial. C'est ce rapport qui
 * porte le dénominateur dont la version précédente manquait.
 *
 * Le second répond à une autre question, et Freqtrade la pose séparément
 * (« Current drawdown ») : un pire creux de 25 % refermé il y a six mois et le
 * même, toujours ouvert, ne demandent pas la même décision. Les deux partagent
 * le sommet courant, d'où une seule fonction — deux passages finiraient par
 * répondre depuis deux sommets différents.
 *
 * ⚠️ L'hypothèse de notionnel fixe sans réinvestissement est celle de tout ce
 * rapport (voir son en-tête). Avec un autre dimensionnement, la même suite de
 * trades donnerait un autre drawdown.
 *
 * **Exportée** pour que la même formule serve aussi aux courbes que ce rapport
 * ne connaît pas — au premier chef l'achat-conservation, la référence à battre.
 * Deux implémentations d'un même drawdown dériveraient, et c'est arrivé : le
 * harnais de backtest du bot en portait une copie jusqu'au 2026-10-08.
 *
 * ⚠️ S'appelait `relativeDrawdown` et ne rendait que le maximum. Renommée avec
 * le changement de forme : une fonction qui garde son nom en changeant ce
 * qu'elle rend laisse un appelant lire `undefined` sans rien casser à l'écran.
 */
export function measureDrawdowns(
  curve: readonly { time: number; value: number }[],
): BacktestDrawdowns {
  /**
   * Le sommet part du **capital intact**, et n'en descend jamais.
   *
   * Établi d'abord à `-Infinity`, c'est-à-dire « le plus haut point observé ».
   * Corrigé le 2026-10-13 : cette définition contredisait le contrat écrit
   * juste au-dessus, où la valeur de compte vaut `1 + points / 100` — le
   * capital au début de la fenêtre **fait partie** de l'historique du compte, et
   * l'ignorer efface une perte réelle. Une courbe ouvrant à −10 points puis
   * descendant à −20 rendait 11,11 % là où le compte a bien perdu 20 %.
   *
   * C'est aussi ce que fait Freqtrade, dont la formule est par ailleurs la
   * nôtre : son pic cumulé est borné par `.clip(lower=0)`, donc le solde de
   * pointe ne descend jamais sous le solde de départ.
   *
   * ⚠️ Conséquence sur `peakTime` : il vaut `null` tant que la courbe n'a pas
   * dépassé le capital intact. Ce n'est pas une absence de sommet, c'est un
   * sommet qui est le **début de la fenêtre** — un appelant qui l'affiche y
   * substitue `BacktestReport.from`.
   */
  let peak = 1;
  let peakTime: number | null = null;

  let worst: BacktestDrawdown = {
    depthPercent: 0,
    peakTime: null,
    troughTime: null,
  };
  // Réécrit à chaque point, donc il décrit le **dernier** quand la boucle sort.
  let current: BacktestCurrentDrawdown = { depthPercent: 0, peakTime: null };

  for (const point of curve) {
    const accountValue = 1 + point.value / 100;

    // `>=` et non `>` : il faut que le premier point d'une courbe partant du
    // capital intact puisse revendiquer le sommet, sinon le cas courant perdrait
    // son `peakTime`. L'effet de bord est souhaitable — sur un sommet touché
    // plusieurs fois, `peakTime` désigne le **dernier** passage, c'est-à-dire le
    // moment où la chute commence, qui est ce qu'une durée de drawdown mesure.
    if (accountValue >= peak) {
      peak = accountValue;
      peakTime = point.time;
    }
    if (accountValue <= 0) {
      // Capital épuisé : la perte est totale, et diviser par un sommet positif
      // décrirait la suite d'une courbe qui ne peut plus exister. Le compte est
      // donc aussi **encore** à −100 % : rien ne l'en sortira.
      return {
        max: { depthPercent: 100, peakTime, troughTime: point.time },
        current: { depthPercent: 100, peakTime },
      };
    }

    const depth = ((peak - accountValue) / peak) * 100;
    if (depth > worst.depthPercent) {
      worst = { depthPercent: depth, peakTime, troughTime: point.time };
    }
    current = { depthPercent: depth, peakTime };
  }

  return { max: worst, current };
}
