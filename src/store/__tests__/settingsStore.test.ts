/**
 * Settings store cycle tests (RULES-AND-SETTINGS-ARCHITECTURE §1.4).
 *
 * Uses memoryAdapter (no localStorage in node). Covers edit/apply/reset/validate
 * plus the INITIALIZATION test the review requested: a pre-populated adapter
 * boots with draft+persisted equal to the stored config; an empty adapter boots
 * with both equal to V1_RULES. A load-order fault that silently drops a saved
 * config is exactly the bug no validator catches — this test closes it.
 */
import { describe, it, expect } from 'vitest';
import { createSettingsStore, memoryAdapter } from '../settingsStore';
import { V1_RULES } from '../../oracle/config/rulesPreset';
import type { RulesConfig } from '../../oracle/types';

function rules(patch: Partial<RulesConfig>): RulesConfig {
  return { ...V1_RULES, ...patch };
}

describe('createSettingsStore — initialization (the load-order test)', () => {
  it('boots from a pre-populated adapter: draft AND persisted equal the stored config', () => {
    const saved = rules({ entryRoll: 'any', firstToN: 2 });
    const adapter = memoryAdapter(saved);
    const store = createSettingsStore(adapter);
    expect(store.getState().draft).toEqual(saved);
    expect(store.getState().persisted).toEqual(saved);
    expect(store.getState().draft).not.toBe(V1_RULES); // not the default
  });

  it('boots from an empty adapter with draft AND persisted equal to V1_RULES', () => {
    const adapter = memoryAdapter(null);
    const store = createSettingsStore(adapter);
    expect(store.getState().draft).toEqual(V1_RULES);
    expect(store.getState().persisted).toEqual(V1_RULES);
  });
});

describe('edit — mutates draft only', () => {
  it('edit changes draft but not persisted', () => {
    const store = createSettingsStore(memoryAdapter(null));
    store.getState().edit({ entryRoll: 'any' });
    expect(store.getState().draft.entryRoll).toBe('any');
    expect(store.getState().persisted.entryRoll).toBe('six'); // unchanged
  });
});

describe('apply — valid config', () => {
  it('persists a valid draft and returns ok:true', () => {
    const adapter = memoryAdapter(null);
    const store = createSettingsStore(adapter);
    store.getState().edit({ entryRoll: 'sixOrOne' });
    const result = store.getState().apply();
    expect(result).toEqual({ ok: true });
    expect(store.getState().persisted.entryRoll).toBe('sixOrOne');
    // Round-trip through the adapter:
    expect(adapter.load()?.entryRoll).toBe('sixOrOne');
  });
});

describe('apply — invalid config', () => {
  it('returns ok:false and does NOT persist (persisted unchanged)', () => {
    const adapter = memoryAdapter(null);
    const store = createSettingsStore(adapter);
    store.getState().edit({ forcedCapture: true, optionalPass: true });
    const result = store.getState().apply();
    expect(result.ok).toBe(false);
    // persisted stays at V1_RULES — the invalid draft was rejected.
    expect(store.getState().persisted.forcedCapture).toBe(false);
    expect(store.getState().persisted.optionalPass).toBe(false);
    // adapter never received the invalid config.
    expect(adapter.load()?.optionalPass).toBeFalsy();
  });
});

describe('reset — returns to V1_RULES', () => {
  it('clears storage and resets both draft and persisted', () => {
    const adapter = memoryAdapter(rules({ entryRoll: 'any' }));
    const store = createSettingsStore(adapter);
    expect(store.getState().draft.entryRoll).toBe('any'); // loaded
    store.getState().reset();
    expect(store.getState().draft).toEqual(V1_RULES);
    expect(store.getState().persisted).toEqual(V1_RULES);
    expect(adapter.load()).toBeNull();
  });
});

describe('validate / warnings — read from draft', () => {
  it('validate reflects an edited draft (not persisted)', () => {
    const store = createSettingsStore(memoryAdapter(null));
    store.getState().edit({ forcedCapture: true, optionalPass: true });
    expect(store.getState().validate().ok).toBe(false);
  });

  it('warnings returns soft warns for an edited draft', () => {
    const store = createSettingsStore(memoryAdapter(null));
    store.getState().edit({ blowBack: 3 });
    const warnings = store.getState().warnings();
    expect(warnings.length).toBe(1);
    expect(warnings[0].toLowerCase()).toContain('yard');
  });
});
