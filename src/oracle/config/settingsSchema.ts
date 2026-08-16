/**
 * Settings schema — declarative metadata so the Settings UI renders from data,
 * never from hardcoded controls (RULES-AND-SETTINGS-ARCHITECTURE §1.2).
 *
 * Invariants enforced by the snapshot test (settingsSchema.test.ts):
 *  - Every key in RulesConfig has exactly one SettingField.
 *  - Each field's default matches V1_RULES.
 *
 * `since` filters fields by scope: fieldsForScope(CURRENT_SCOPE) returns only
 * the fields the running app should surface. Bumping scope is a one-line change
 * to CURRENT_SCOPE, not grep-and-pray across Stage.
 *
 * Pure module: no React, no three, no localStorage. Oracle/config layer.
 */

import type { RulesConfig } from '../types';
import { V1_RULES } from './rulesPreset';

export type SettingCategory =
  | 'Dice & Turn Flow'
  | 'Entry & Movement'
  | 'Finish & Winning'
  | 'Capture & Safety'
  | 'Players & Teams';

export interface SettingField {
  key: keyof RulesConfig;
  label: string;
  description: string;
  type: 'boolean' | 'enum' | 'number' | 'custom';
  options?: readonly string[];
  min?: number;
  max?: number;
  default: boolean | string | number;
  category: SettingCategory;
  /** When this field became available. UI hides fields newer than CURRENT_SCOPE. */
  since: 'v1' | 'v1.1' | 'v1.5' | 'v2';
}

/**
 * Single source of truth for which scope the running app surfaces.
 * v1 Settings screens call fieldsForScope(CURRENT_SCOPE). The 'v1.1' level
 * (PHASE-5D A1) exists so multi-dice can ship contained — it exposes the
 * diceCount field alone, without unlocking the unbuilt v1.5 batch flags.
 */
export const CURRENT_SCOPE: 'v1' | 'v1.1' | 'v1.5' | 'v2' = 'v1';

/** The full schema. The snapshot test asserts this covers every RulesConfig key. */
export const SETTING_FIELDS: readonly SettingField[] = [
  // --- Players & Teams (v1) ---
  {
    key: 'playerCount',
    label: 'Players',
    description: 'Number of players in the game (2 = opposite corners, 3 = three corners, 4 = all).',
    type: 'enum',
    options: ['2', '3', '4'],
    default: V1_RULES.playerCount,
    category: 'Players & Teams',
    since: 'v1',
  },
  {
    key: 'bots',
    label: 'Bot seats',
    description: 'Which colors are AI-controlled. Empty = all-human hot-seat.',
    // 'custom' type: a multi-select of colors, not a scalar control. The UI
    // renders this with a bespoke component; the default is informational only.
    // since: 'v1.5' — bot seats only matter once the bots phase ships; pure v1
    // (hot-seat only) has no bot selection, so fieldsForScope('v1') excludes it.
    type: 'custom',
    default: 'none',
    category: 'Players & Teams',
    since: 'v1.5',
  },

  // --- Dice & Turn Flow (v1) ---
  {
    key: 'entryRoll',
    label: 'Entry roll',
    description: 'Roll required for a token to leave the yard.',
    type: 'enum',
    options: ['six', 'sixOrOne', 'any'],
    default: V1_RULES.entryRoll,
    category: 'Dice & Turn Flow',
    since: 'v1',
  },
  {
    key: 'diceCount',
    label: 'Dice per turn',
    description: 'Dice rolled each turn. 1 = classic. 2+ rolls a set resolved one die at a time (largest first) — dice can be stacked on one token or split across tokens.',
    type: 'enum',
    options: ['1', '2', '3', '4'],
    default: V1_RULES.diceCount,
    category: 'Dice & Turn Flow',
    since: 'v1.1',
  },
  {
    key: 'sixGrantsExtraTurn',
    label: 'Six grants extra turn',
    description: 'Rolling a 6 lets the same player roll again (subject to the sixes limit).',
    type: 'boolean',
    default: V1_RULES.sixGrantsExtraTurn,
    category: 'Dice & Turn Flow',
    since: 'v1',
  },
  {
    key: 'extraTurnOnCapture',
    label: 'Extra turn on capture',
    description: 'Capturing an opponent grants another turn.',
    type: 'boolean',
    default: V1_RULES.extraTurnOnCapture,
    category: 'Dice & Turn Flow',
    since: 'v1',
  },
  {
    key: 'extraTurnOnFinish',
    label: 'Extra turn on finish',
    description: 'A token reaching home grants another turn.',
    type: 'boolean',
    default: V1_RULES.extraTurnOnFinish,
    category: 'Dice & Turn Flow',
    since: 'v1.5',
  },
  {
    key: 'sixesLimit',
    label: 'Sixes limit',
    description: 'Max consecutive sixes before forfeiting the turn. blank = no limit.',
    type: 'number',
    min: 1,
    default: V1_RULES.sixesLimit ?? 0,
    category: 'Dice & Turn Flow',
    since: 'v1',
  },
  {
    key: 'turnTimerSec',
    label: 'Turn timer (sec)',
    description: 'Seconds per turn. 0 = untimed.',
    type: 'number',
    min: 0,
    default: V1_RULES.turnTimerSec ?? 0,
    category: 'Dice & Turn Flow',
    since: 'v1',
  },

  // --- Entry & Movement (v1/v2) ---
  {
    key: 'stacking',
    label: 'Stacking',
    description: 'How same-color tokens on a cell behave. v1: none. block/stack arrive in v2.',
    type: 'enum',
    options: ['none', 'block', 'stack'],
    default: V1_RULES.stacking,
    category: 'Entry & Movement',
    since: 'v1',
  },

  // --- Finish & Winning (v1/v1.5) ---
  {
    key: 'finishRule',
    label: 'Finish rule',
    description: 'exact = must land on 56; bounce = overshoot bounces back; overflow = any roll that reaches 56 finishes.',
    type: 'enum',
    options: ['exact', 'bounce', 'overflow'],
    default: V1_RULES.finishRule,
    category: 'Finish & Winning',
    since: 'v1',
  },
  {
    key: 'firstToN',
    label: 'First to N tokens',
    description: 'Win when this many tokens finish. 4 = all (classic); 2 = fast games.',
    type: 'number',
    min: 1,
    max: 4,
    default: V1_RULES.firstToN,
    category: 'Finish & Winning',
    since: 'v1',
  },

  // --- Capture & Safety (v1.5 Batch A/B) ---
  {
    key: 'forcedCapture',
    label: 'Forced capture',
    description: 'If a capture is possible, only capture moves are legal.',
    type: 'boolean',
    default: V1_RULES.forcedCapture,
    category: 'Capture & Safety',
    since: 'v1.5',
  },
  {
    key: 'optionalPass',
    label: 'Optional pass',
    description: 'Player may decline to move. Adds a PASS action.',
    type: 'boolean',
    default: V1_RULES.optionalPass,
    category: 'Capture & Safety',
    since: 'v1.5',
  },
  {
    key: 'safeCellSet',
    label: 'Safe cells',
    description: 'Which shared-loop cells grant safety from capture.',
    type: 'enum',
    options: ['starts', 'stars', 'both', 'none'],
    default: V1_RULES.safeCellSet,
    category: 'Capture & Safety',
    since: 'v1.5',
  },

  // --- v2 ---
  {
    key: 'blowBack',
    label: 'Blow-back',
    description: '0 = off; N = victim sent back N cells instead of to the yard. (v2)',
    type: 'number',
    min: 0,
    default: V1_RULES.blowBack,
    category: 'Capture & Safety',
    since: 'v2',
  },
  {
    key: 'teams',
    label: 'Teams',
    description: 'null = free-for-all; otherwise partner pairs. (v2)',
    // 'custom' type: a pair-configurator, not a scalar control.
    type: 'custom',
    default: 'none',
    category: 'Players & Teams',
    since: 'v2',
  },
  {
    key: 'challengeMode',
    label: 'Challenge mode',
    description: 'Experimental meta-phase: opponents may challenge a missed capture. Bundled with Undo. (v2)',
    type: 'boolean',
    default: V1_RULES.challengeMode,
    category: 'Dice & Turn Flow',
    since: 'v2',
  },
];

/** Fields the UI should show, filtered by the current scope. */
export function fieldsForScope(scope: 'v1' | 'v1.1' | 'v1.5' | 'v2'): SettingField[] {
  const order: Record<'v1' | 'v1.1' | 'v1.5' | 'v2', number> = {
    v1: 0,
    'v1.1': 1,
    'v1.5': 2,
    v2: 3,
  };
  return SETTING_FIELDS.filter((f) => order[f.since] <= order[scope]);
}
