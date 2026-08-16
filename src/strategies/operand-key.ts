import { buildIndicatorKeyFromOperand } from '../indicators/indicator-defaults.js';
import type { Operand } from './strategy-engine.type.js';

/**
 * ============================================================================
 * 🔑 OPERAND KEY
 * Clé unique et déterministe pour n'importe quel `Operand` — indicateur,
 * prix, constante, expression arithmétique ou transformation, imbriqués à
 * volonté. Généralise `buildIndicatorKeyFromOperand` (indicator-defaults.ts,
 * qui ne couvre que la branche `indicator`) au reste de l'AST.
 *
 * Contrat public à double usage :
 * - clé de cache interne au moteur (`StrategyEngineService`, nest-trading-bot) ;
 * - clé de réponse pour `AnalysisResponse.expressions` : une expression
 *   affichée sur un chart doit pouvoir être retrouvée par le frontend avec
 *   la même clé que celle qu'il a servi à construire la requête, sans
 *   recalculer cette logique de son côté.
 *
 * `offset` est volontairement exclu de la clé, à l'identique de
 * `buildIndicatorKeyFromOperand` : il ne change pas l'identité de la série
 * calculée, seulement la position lue dedans (voir
 * `StrategyEngineService.resolveOperandValue` dans nest-trading-bot).
 * ============================================================================
 */
export function buildOperandKey(operand: Operand): string {
  switch (operand.type) {
    case 'number':
      return `num_${operand.value}`;
    case 'price':
      return `price_${operand.field}`;
    case 'indicator':
      return buildIndicatorKeyFromOperand(operand);
    case 'arith':
      return `arith_${operand.operator}(${buildOperandKey(operand.left)},${buildOperandKey(operand.right)})`;
    case 'transform':
      return `transform_${operand.kind}_${operand.period ?? 'd'}(${buildOperandKey(operand.source)})`;
    case 'fn':
      return `fn_${operand.kind}(${operand.args.map(buildOperandKey).join(',')})`;
  }
}
