/**
 * Rules validator (RULES-AND-SETTINGS-ARCHITECTURE §1.3, §3).
 *
 * Two pure functions:
 *  - validateRules: HARD rejects — the settings UI may NOT apply these. Encodes
 *    the four §3.1 conflicts. Called at settings-apply time, never mid-game.
 *  - getWarnings: SOFT warns — UI shows these; player may override. Encodes the
 *    three §3.2 conflicts.
 *
 * Separating them keeps apply()-flow clean: hard rejects block apply, soft
 * warns permit apply with a confirmation step. Mixing them would force the UI
 * to disambiguate return values.
 *
 * Every flag pair that can produce a contradictory or ambiguous game has an
 * explicit ruling here. No flag conflict is ever discovered mid-game.
 *
 * Pure module: no React, no three, no localStorage.
 */

import type { RulesConfig } from '../types';

export type ValidationResult = { ok: true } | { ok: false; conflicts: string[] };

/** Hard rejects (§3.1). Empty conflicts = valid. */
export function validateRules(rules: RulesConfig): ValidationResult {
  const conflicts: string[] = [];

  // 1. forcedCapture × optionalPass — opposite pressures, mutually exclusive.
  if (rules.forcedCapture && rules.optionalPass) {
    conflicts.push(
      'Forced capture and optional pass are mutually exclusive — one forces captures, the other permits declining moves.',
    );
  }

  // 2. stacking:'block' × safeCellSet:'none' — game becomes unwinnable for opponents.
  if (rules.stacking === 'block' && rules.safeCellSet === 'none') {
    conflicts.push(
      'Blockades with no safe cells make the game unwinnable — opponents cannot land, pass, or capture a barrier with no safe path.',
    );
  }

  // 3. teams × playerCount:3 — teams require an even player count.
  if (rules.teams !== null && rules.playerCount === 3) {
    conflicts.push('Teams require an even player count — 3 players cannot form partner pairs.');
  }

  // 4. challengeMode × forcedCapture — the challenge has no trigger when capture is forced.
  if (rules.challengeMode && rules.forcedCapture) {
    conflicts.push(
      'Challenge mode has no trigger when capture is forced — there is never a missed capture to challenge.',
    );
  }

  return conflicts.length === 0 ? { ok: true } : { ok: false, conflicts };
}

/** Soft warnings (§3.2). Empty array = no warnings. Never blocks apply. */
export function getWarnings(rules: RulesConfig): string[] {
  const warnings: string[] = [];

  // 1. bounce finish × forcedCapture — captures only at the resting cell, not mid-bounce.
  if (rules.finishRule === 'bounce' && rules.forcedCapture) {
    warnings.push(
      'Bounce finish checks captures only at the final resting cell, not mid-bounce path.',
    );
  }

  // 2. blowBack > 0 — victim clamps to the yard if sent past their entry cell.
  if (rules.blowBack > 0) {
    warnings.push(
      'Blow-back capture clamps the victim to the yard if it would send them past their entry cell.',
    );
  }

  // 3. firstToN:1 — first token home wins immediately; very fast.
  if (rules.firstToN === 1) {
    warnings.push('First token home wins immediately — very fast games.');
  }

  return warnings;
}
