/**
 * getWarnings tests — the 3 §3.2 soft warns (RULES-AND-SETTINGS-ARCHITECTURE).
 *
 * Soft warns never block apply(); the UI shows them with a confirmation step.
 */
import { describe, it, expect } from 'vitest';
import { getWarnings } from '../validateRules';
import { V1_RULES } from '../rulesPreset';
import type { RulesConfig } from '../../types';

function rules(patch: Partial<RulesConfig>): RulesConfig {
  return { ...V1_RULES, ...patch };
}

describe('getWarnings — V1_RULES has no warnings', () => {
  it('returns [] for the default config', () => {
    expect(getWarnings(V1_RULES)).toEqual([]);
  });
});

describe('getWarnings — §3.2 soft warns', () => {
  it("warns on bounce finish × forcedCapture with 'resting cell'", () => {
    const warnings = getWarnings(
      rules({ finishRule: 'bounce', forcedCapture: true }),
    );
    expect(warnings.length).toBe(1);
    expect(warnings[0].toLowerCase()).toContain('resting cell');
  });

  it("warns on blowBack > 0 with 'yard'", () => {
    const warnings = getWarnings(rules({ blowBack: 3 }));
    expect(warnings.length).toBe(1);
    expect(warnings[0].toLowerCase()).toContain('yard');
  });

  it("warns on firstToN:1 with 'fast'", () => {
    const warnings = getWarnings(rules({ firstToN: 1 }));
    expect(warnings.length).toBe(1);
    expect(warnings[0].toLowerCase()).toContain('fast');
  });

  it('does NOT warn when blowBack is 0 (off)', () => {
    expect(getWarnings(rules({ blowBack: 0 }))).toEqual([]);
  });

  it('does NOT warn on bounce alone (no forcedCapture)', () => {
    expect(getWarnings(rules({ finishRule: 'bounce' }))).toEqual([]);
  });
});

describe('getWarnings — PHASE-5D multi-dice row', () => {
  it('warns on 3+ dice with a turn timer (sets may expire mid-choice)', () => {
    const warnings = getWarnings(rules({ diceCount: 3, turnTimerSec: 30 }));
    expect(warnings.length).toBe(1);
    expect(warnings[0].toLowerCase()).toContain('expire');
  });

  it('no warning at 2 dice even with a timer, and none at 3 dice untimed', () => {
    expect(getWarnings(rules({ diceCount: 2, turnTimerSec: 30 }))).toEqual([]);
    expect(getWarnings(rules({ diceCount: 3, turnTimerSec: null }))).toEqual([]);
  });
});
