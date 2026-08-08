/**
 * Audio settings store — volume + mute persisted to localStorage (PLAN-PHASE-4 §3.2).
 *
 * Separate from useGame (settings exist between sessions, not during a game).
 * Same localStorage-adapter pattern as settingsStore.
 */

import { create } from 'zustand';

const KEY = 'ludo-3d:audio';

interface AudioStore {
  volume: number; // 0..1
  muted: boolean;
  setVolume: (v: number) => void;
  toggleMute: () => void;
}

function load(): { volume: number; muted: boolean } {
  if (typeof localStorage === 'undefined') return { volume: 0.7, muted: false };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { volume: 0.7, muted: false };
    const parsed = JSON.parse(raw);
    return {
      volume: typeof parsed.volume === 'number' ? parsed.volume : 0.7,
      muted: typeof parsed.muted === 'boolean' ? parsed.muted : false,
    };
  } catch {
    return { volume: 0.7, muted: false };
  }
}

function save(volume: number, muted: boolean): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify({ volume, muted }));
}

export const useAudio = create<AudioStore>((set, get) => ({
  ...load(),

  setVolume: (v) => {
    const volume = Math.max(0, Math.min(1, v));
    save(volume, get().muted);
    set({ volume });
  },

  toggleMute: () => {
    const muted = !get().muted;
    save(get().volume, muted);
    set({ muted });
  },
}));
