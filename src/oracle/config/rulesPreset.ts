/**
 * Locked v1 house rules (IMPLEMENTATION-PLAN-v1 §1).
 *
 * These are the only values used in v1. The Settings screen (v2) may swap
 * presets, but the engine never sees undefined flags — every rule is explicit.
 */

import type { Color, RulesConfig } from '../types';

/** Standard 4-player turn order. */
export const DEFAULT_TURN_ORDER: Color[] = ['red', 'green', 'yellow', 'blue'];

/** All-human hot-seat preset. No bots. v1 behavior preserved. */
export const V1_RULES: RulesConfig = {
  playerCount: 4,
  bots: [],

  // Dice & Turn Flow
  entryRoll: 'six',           // was enterOnSix: true
  sixGrantsExtraTurn: true,
  extraTurnOnCapture: false,  // was captureGrantsExtraTurn: false
  extraTurnOnFinish: false,   // declare-only (v1.5 Batch B)
  sixesLimit: 3,              // was consecutiveSixesLimit: 3
  turnTimerSec: null,         // untimed in v1

  // Entry & Movement
  stacking: 'none',           // v1 locked; 'block'/'stack' are v2

  // Finish & Winning
  finishRule: 'exact',        // was exactFinishRequired: true
  firstToN: 4,                // v1: all 4 tokens

  // Capture & Safety (v1.5 Batch A/B; declared now)
  forcedCapture: false,
  optionalPass: false,
  safeCellSet: 'both',

  // v2 (declared now; engine ignores; UI hides via schema `since`)
  blowBack: 0,                // off
  teams: null,                // free-for-all
  challengeMode: false,
};

/**
 * Preset for solo play vs bots (Phase 5). Human is red; the other three seats
 * are Easy bots. Difficulty selection swaps which bot ai.ts uses; the preset
 * only declares which seats are automated.
 */
export function soloRules(humanColor: Color = 'red'): RulesConfig {
  return {
    ...V1_RULES,
    bots: DEFAULT_TURN_ORDER.filter((c) => c !== humanColor),
  };
}
