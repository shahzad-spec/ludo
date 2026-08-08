/**
 * validateRules tests — the 4 §3.1 hard rejects (RULES-AND-SETTINGS-ARCHITECTURE).
 *
 * The gate demands the conflict strings themselves appear in output, not just
 * a green count. Each reject asserts ok:false AND a human-readable message.
 */
import { describe, it, expect } from 'vitest';
import { validateRules } from '../validateRules';
import { V1_RULES } from '../rulesPreset';
import type { RulesConfig } from '../../types';

/** Helper: override V1_RULES with a partial patch. */
function rules(patch: Partial<RulesConfig>): RulesConfig {
  return { ...V1_RULES, ...patch };
}

describe('validateRules — V1_RULES is valid', () => {
  it('accepts the default config', () => {
    expect(validateRules(V1_RULES)).toEqual({ ok: true });
  });
});

describe('validateRules — §3.1 hard rejects', () => {
  it("rejects forcedCapture × optionalPass with 'mutually exclusive'", () => {
    const result = validateRules(rules({ forcedCapture: true, optionalPass: true }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.conflicts.length).toBe(1);
      expect(result.conflicts[0].toLowerCase()).toContain('mutually exclusive');
      expect(result.conflicts[0]).toMatch(/forced capture/i);
      expect(result.conflicts[0]).toMatch(/optional pass/i);
    }
  });

  it("rejects stacking:'block' × safeCellSet:'none' with 'unwinnable'", () => {
    const result = validateRules(
      rules({ stacking: 'block', safeCellSet: 'none' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.conflicts.length).toBe(1);
      expect(result.conflicts[0].toLowerCase()).toContain('unwinnable');
    }
  });

  it("rejects teams × playerCount:3 with 'even'", () => {
    const result = validateRules(
      rules({
        playerCount: 3,
        teams: [['red', 'yellow'], ['green', 'blue']],
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.conflicts.length).toBe(1);
      expect(result.conflicts[0].toLowerCase()).toContain('even');
    }
  });

  it("rejects challengeMode × forcedCapture with 'trigger'", () => {
    const result = validateRules(
      rules({ challengeMode: true, forcedCapture: true }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.conflicts.length).toBe(1);
      expect(result.conflicts[0].toLowerCase()).toContain('trigger');
    }
  });

  it('reports multiple conflicts at once when several apply', () => {
    const result = validateRules(
      rules({
        forcedCapture: true,
        optionalPass: true,
        challengeMode: true,
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // forcedCapture×optionalPass AND challengeMode×forcedCapture both fire.
      expect(result.conflicts.length).toBe(2);
    }
  });
});
