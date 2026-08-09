/**
 * Cosmetics store — per-device skin choices persisted to localStorage.
 *
 * NOT in RulesConfig (which travels in GameState and gets server-validated).
 * Cosmetics are personal preferences; they live here and are consumed only by
 * the Director (Token rendering) and Stage (SkinPicker UI).
 *
 * Same injectable-adapter pattern as settingsStore for testability.
 */

import { create } from 'zustand';
import type { Color } from '../oracle/board/track';
import { TOKEN_SKINS, DEFAULT_SKINS } from '../theme/tokenSkins';

export interface CosmeticsAdapter {
  load(): Partial<Record<Color, string>> | null;
  save(skins: Partial<Record<Color, string>>): void;
  clear(): void;
}

/** In-memory adapter for tests. */
export function memoryCosmeticsAdapter(
  initial: Partial<Record<Color, string>> | null = null,
): CosmeticsAdapter {
  let stored = initial;
  return {
    load: () => stored,
    save: (s) => { stored = s; },
    clear: () => { stored = null; },
  };
}

/** Default localStorage adapter (no-op in node). */
function localStorageCosmeticsAdapter(): CosmeticsAdapter {
  const KEY = 'ludo-3d:cosmetics';
  if (typeof localStorage === 'undefined') return memoryCosmeticsAdapter();
  return {
    load: () => {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      try { return JSON.parse(raw); } catch { return null; }
    },
    save: (s) => localStorage.setItem(KEY, JSON.stringify(s)),
    clear: () => localStorage.removeItem(KEY),
  };
}

interface CosmeticsStore {
  skins: Record<Color, string>;
  setSkin: (color: Color, skinId: string) => void;
  reset: () => void;
}

export function createCosmeticsStore(
  storage: CosmeticsAdapter = localStorageCosmeticsAdapter(),
) {
  const saved = storage.load() ?? {};
  const initial = { ...DEFAULT_SKINS, ...saved } as Record<Color, string>;
  return create<CosmeticsStore>((set, get) => ({
    skins: initial,
    setSkin: (color, skinId) => {
      if (!TOKEN_SKINS[skinId]) return; // unknown id → no-op
      const next = { ...get().skins, [color]: skinId };
      set({ skins: next });
      storage.save(next);
    },
    reset: () => {
      set({ skins: { ...DEFAULT_SKINS } });
      storage.save({ ...DEFAULT_SKINS });
    },
  }));
}

/** App-wide singleton. */
export const useCosmetics = createCosmeticsStore();
