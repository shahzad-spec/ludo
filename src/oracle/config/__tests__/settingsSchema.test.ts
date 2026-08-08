/**
 * Schema snapshot tests (RULES-AND-SETTINGS-ARCHITECTURE §1.2).
 *
 * The schema MUST cover every RulesConfig key, and each field's default MUST
 * match V1_RULES. Drift here means the Settings UI silently drops or mislabels
 * a field — caught at test time, not shipped.
 */
import { describe, it, expect } from 'vitest';
import { SETTING_FIELDS, fieldsForScope, CURRENT_SCOPE } from '../settingsSchema';
import { V1_RULES } from '../rulesPreset';
import type { RulesConfig } from '../../types';

describe('settingsSchema — covers every RulesConfig key', () => {
  it('schema key set ⊇ RulesConfig key set (no missing fields)', () => {
    const configKeys = Object.keys(V1_RULES) as (keyof RulesConfig)[];
    const schemaKeys = SETTING_FIELDS.map((f) => f.key);
    for (const k of configKeys) {
      expect(schemaKeys, `missing schema entry for "${k}"`).toContain(k);
    }
  });

  it('schema has no duplicate keys', () => {
    const keys = SETTING_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('settingsSchema — defaults match V1_RULES', () => {
  // 'custom'-type fields (bots, teams) use 'none' as an informational default
  // and are rendered by bespoke UI components; their V1_RULES values ([]/null)
  // are array/object types that don't map to a scalar. Skip them here — they're
  // covered by the "covers every key" test above.
  const scalarFields = SETTING_FIELDS.filter((f) => f.type !== 'custom');

  it.each(scalarFields)('default for "$key" matches V1_RULES', (field) => {
    const v1Value = V1_RULES[field.key];
    // Normalize null/undefined handling: schema stores 0 for "untimed"/"off".
    const actual = field.key === 'turnTimerSec' || field.key === 'sixesLimit'
      ? (v1Value ?? 0)
      : v1Value;
    expect(field.default, `default for ${field.key}`).toEqual(actual);
  });
});

describe('fieldsForScope — filters by since', () => {
  it("scope 'v1' excludes v1.5/v2 fields (no forcedCapture, teams, blowBack, challengeMode)", () => {
    const v1 = fieldsForScope('v1');
    const keys = v1.map((f) => f.key);
    expect(keys).not.toContain('forcedCapture');
    expect(keys).not.toContain('optionalPass');
    expect(keys).not.toContain('safeCellSet');
    expect(keys).not.toContain('blowBack');
    expect(keys).not.toContain('teams');
    expect(keys).not.toContain('challengeMode');
    expect(keys).not.toContain('extraTurnOnFinish');
  });

  it("scope 'v1.5' includes Batch A/B fields but excludes v2 (blowBack, teams, challengeMode)", () => {
    const v15 = fieldsForScope('v1.5');
    const keys = v15.map((f) => f.key);
    expect(keys).toContain('forcedCapture');
    expect(keys).toContain('safeCellSet');
    expect(keys).not.toContain('blowBack');
    expect(keys).not.toContain('teams');
    expect(keys).not.toContain('challengeMode');
  });

  it("scope 'v2' includes everything", () => {
    expect(fieldsForScope('v2').length).toBe(SETTING_FIELDS.length);
  });

  it('CURRENT_SCOPE is currently v1', () => {
    expect(CURRENT_SCOPE).toBe('v1');
  });
});
