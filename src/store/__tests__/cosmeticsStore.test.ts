/**
 * Cosmetics store tests — 4 tests per the 4F gate (PLAN-PHASE-4 §9.3).
 */

import { describe, it, expect } from 'vitest';
import { createCosmeticsStore, memoryCosmeticsAdapter } from '../cosmeticsStore';
import { DEFAULT_SKINS } from '../../theme/tokenSkins';
import type { Color } from '../../oracle/board/track';

describe('cosmeticsStore — initialization', () => {
  it('boots with DEFAULT_SKINS from an empty adapter', () => {
    const store = createCosmeticsStore(memoryCosmeticsAdapter(null));
    expect(store.getState().skins).toEqual(DEFAULT_SKINS);
  });

  it('boots with saved overrides merged over defaults from a pre-populated adapter', () => {
    const saved = { red: 'dinosaur', blue: 'human' };
    const store = createCosmeticsStore(memoryCosmeticsAdapter(saved));
    expect(store.getState().skins.red).toBe('dinosaur');
    expect(store.getState().skins.blue).toBe('human');
    expect(store.getState().skins.green).toBe('farmer'); // default kept
    expect(store.getState().skins.yellow).toBe('wizard'); // default kept
  });
});

describe('cosmeticsStore — setSkin', () => {
  it('persists via the adapter on valid skin id', () => {
    const adapter = memoryCosmeticsAdapter(null);
    const store = createCosmeticsStore(adapter);
    store.getState().setSkin('red', 'knight');
    expect(store.getState().skins.red).toBe('knight');
    expect(adapter.load()?.red).toBe('knight');
  });

  it('no-ops on unknown skin id (does not change state or persist)', () => {
    const adapter = memoryCosmeticsAdapter(null);
    const store = createCosmeticsStore(adapter);
    const before = { ...store.getState().skins };
    store.getState().setSkin('red' as Color, 'not-a-skin');
    expect(store.getState().skins).toEqual(before);
    expect(adapter.load()).toBeNull(); // nothing saved
  });
});
