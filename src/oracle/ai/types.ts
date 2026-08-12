/**
 * AI module types — difficulty tiers + search options.
 */

export type Difficulty = 'easy' | 'medium' | 'hard' | 'pro';

export interface SearchOptions {
  /** Wall-clock budget in ms (runtime only). Default 80. */
  budgetMs?: number;
  /** Pin exact search depth for deterministic tests. Overrides budgetMs. */
  fixedDepth?: number;
  /** Transposition table on/off. Default true. Tests may disable to prove the
   *  TT is transparent (same result with and without it). */
  tt?: boolean;
}
