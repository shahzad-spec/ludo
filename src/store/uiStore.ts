/**
 * UI-only interaction state — separate from the game store (ARCHITECTURE-v3 §1).
 *
 * Holds transient interaction state that doesn't belong in the Oracle:
 *  - selectedTokenId: the token a player has clicked to move (but not confirmed).
 *    Null = nothing selected. Clicking empty space or a non-movable token clears it.
 *
 * This is Director/Stage concern; the Oracle never sees it. Reset when the phase
 * leaves SELECTING_TOKEN.
 */
import { create } from 'zustand';

interface UIStore {
  selectedTokenId: string | null;
  select: (tokenId: string | null) => void;
  /** A3.1 (5D-7c): the die the player picked from the remaining pips.
   *  Null = no preference — the engine resolves unambiguous tokens directly. */
  selectedDie: number | null;
  selectDie: (die: number | null) => void;
}

export const useUI = create<UIStore>((set) => ({
  selectedTokenId: null,
  select: (tokenId) => set({ selectedTokenId: tokenId }),
  selectedDie: null,
  selectDie: (die) => set({ selectedDie: die }),
}));
