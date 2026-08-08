/**
 * Settings store (RULES-AND-SETTINGS-ARCHITECTURE §1.4).
 *
 * Holds a draft + persisted RulesConfig, backed by an injectable StorageAdapter.
 * Decoupled from useGame because settings exist BETWEEN games, not during them.
 * The persisted config feeds createInitialState(colorsForPlayerCount(n), rules)
 * when a new game starts.
 *
 * Contract:
 *  - edit() mutates the draft only (never persisted).
 *  - validate() runs the §3.1 hard rejects against the draft.
 *  - warnings() returns the §3.2 soft warns against the draft.
 *  - apply() validates; on success persists + writes through storage; returns result.
 *  - reset() returns draft + persisted to V1_RULES.
 *
 * StorageAdapter is injectable so node tests (no localStorage) use an in-memory
 * map. The default adapter no-ops when typeof localStorage === 'undefined'.
 */

import { create } from 'zustand';
import type { RulesConfig } from '../oracle/types';
import { V1_RULES } from '../oracle/config/rulesPreset';
import {
  validateRules,
  getWarnings,
  type ValidationResult,
} from '../oracle/config/validateRules';

export interface StorageAdapter {
  load(): RulesConfig | null;
  save(rules: RulesConfig): void;
  clear(): void;
}

/** In-memory adapter for tests (node has no localStorage). */
export function memoryAdapter(initial: RulesConfig | null = null): StorageAdapter {
  let stored: RulesConfig | null = initial;
  return {
    load: () => stored,
    save: (r) => {
      stored = r;
    },
    clear: () => {
      stored = null;
    },
  };
}

/** Default adapter: localStorage in browser, no-op in node. */
function localStorageAdapter(): StorageAdapter {
  const KEY = 'ludo-3d:rules';
  if (typeof localStorage === 'undefined') {
    return memoryAdapter(); // no-op in node
  }
  return {
    load: () => {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      try {
        return { ...V1_RULES, ...(JSON.parse(raw) as Partial<RulesConfig>) };
      } catch {
        return null; // corrupt JSON → fall back to defaults
      }
    },
    save: (r) => localStorage.setItem(KEY, JSON.stringify(r)),
    clear: () => localStorage.removeItem(KEY),
  };
}

interface SettingsStore {
  draft: RulesConfig;
  persisted: RulesConfig;
  edit: (patch: Partial<RulesConfig>) => void;
  validate: () => ValidationResult;
  warnings: () => string[];
  apply: () => ValidationResult;
  reset: () => void;
}

export function createSettingsStore(
  storage: StorageAdapter = localStorageAdapter(),
) {
  const initial = storage.load() ?? V1_RULES;
  return create<SettingsStore>((set, get) => ({
    draft: initial,
    persisted: initial,

    edit: (patch) =>
      set((s) => ({ draft: { ...s.draft, ...patch } })),

    validate: () => validateRules(get().draft),

    warnings: () => getWarnings(get().draft),

    apply: () => {
      const result = validateRules(get().draft);
      if (result.ok) {
        const rules = get().draft;
        storage.save(rules);
        set({ persisted: rules });
      }
      return result;
    },

    reset: () => {
      storage.clear();
      set({ draft: V1_RULES, persisted: V1_RULES });
    },
  }));
}

/** App-wide singleton. Tests construct their own via createSettingsStore(). */
export const useSettings = createSettingsStore();
