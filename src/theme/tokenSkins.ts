/**
 * Token skin catalog — pure data, importable by both Stage and Director.
 *
 * Lives in theme/ (not director/config/) because SkinPicker is Stage and
 * Stage→Director imports are ESLint-banned. theme/ is neutral territory.
 *
 * Each skin defines a GLB URL (or null for the procedural pawn fallback),
 * a uniform scale, and a base Y rotation. Material is tinted at runtime by
 * the player's color so one model serves all 4 colors.
 */

import type { Color } from '../oracle/board/track';

export interface TokenSkin {
  id: string;
  label: string;
  url: string | null; // null = always procedural pawn
  scale: number;
  rotationY: number;
}

export const TOKEN_SKINS: Record<string, TokenSkin> = {
  pawn: { id: 'pawn', label: 'Classic', url: null, scale: 1, rotationY: 0 },
  lion: { id: 'lion', label: 'Lion', url: null, scale: 1, rotationY: 0 },
  eagle: { id: 'eagle', label: 'Eagle', url: null, scale: 1, rotationY: 0 },
  elephant: { id: 'elephant', label: 'Elephant', url: null, scale: 0.95, rotationY: 0 },
  cheetah: { id: 'cheetah', label: 'Cheetah', url: null, scale: 1, rotationY: 0 },
  dinosaur: { id: 'dinosaur', label: 'Dino', url: null, scale: 1, rotationY: 0 },
  human: { id: 'human', label: 'Human', url: null, scale: 1, rotationY: 0 },
};

export const DEFAULT_SKINS: Record<Color, string> = {
  red: 'lion',
  green: 'eagle',
  yellow: 'elephant',
  blue: 'cheetah',
};
