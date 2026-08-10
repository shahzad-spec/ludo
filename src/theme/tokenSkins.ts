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
  knight: { id: 'knight', label: 'Knight', url: '/assets/models/tokens/knight.glb', scale: 0.3, rotationY: 0 },
  farmer: { id: 'farmer', label: 'Farmer', url: '/assets/models/tokens/farmer.glb', scale: 0.3, rotationY: 0 },
  wizard: { id: 'wizard', label: 'Wizard', url: '/assets/models/tokens/wizard.glb', scale: 0.3, rotationY: 0 },
  astronaut: { id: 'astronaut', label: 'Astronaut', url: '/assets/models/tokens/astronaut.glb', scale: 0.3, rotationY: 0 },
  robot: { id: 'robot', label: 'Robot', url: null, scale: 0.3, rotationY: 0 },
  skeleton: { id: 'skeleton', label: 'Skeleton', url: null, scale: 0.3, rotationY: 0 },
  zombie: { id: 'zombie', label: 'Zombie', url: null, scale: 0.3, rotationY: 0 },
};

export const DEFAULT_SKINS: Record<Color, string> = {
  red: 'knight',
  green: 'farmer',
  yellow: 'wizard',
  blue: 'astronaut',
};
