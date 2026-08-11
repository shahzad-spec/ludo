/**
 * AI module types — difficulty tiers + search options.
 */

export type Difficulty = 'easy' | 'medium' | 'hard' | 'pro';

export interface SearchOptions {
  /** Wall-clock budget in ms (runtime only). Default 80. */
  budgetMs?: number;
  /** Pin exact search depth for deterministic tests. Overrides budgetMs. */
  fixedDepth?: number;
}
