/**
 * Token skin catalog — pure data, importable by both Stage and Director.
 *
 * Per-skin tuning constants × 3 (user requested 3× larger).
 */

import type { Color } from '../oracle/board/track';

export interface TokenSkin {
  id: string;
  label: string;
  url: string | null;
  scale: number;
  rotationY: number;
  offsetY: number;
}

export const TOKEN_SKINS: Record<string, TokenSkin> = {
  pawn:      { id: 'pawn',      label: 'Classic',   url: null, scale: 1,    rotationY: 0, offsetY: 0 },
  knight:    { id: 'knight',    label: 'Knight',    url: '/assets/models/tokens/knight.glb',    scale: 0.318, rotationY: 0, offsetY: 1.089 },
  farmer:    { id: 'farmer',    label: 'Farmer',    url: '/assets/models/tokens/farmer.glb',    scale: 0.822, rotationY: 0, offsetY: 0 },
  wizard:    { id: 'wizard',    label: 'Wizard',    url: '/assets/models/tokens/wizard.glb',    scale: 0.771, rotationY: 0, offsetY: 0.009 },
  astronaut: { id: 'astronaut', label: 'Astronaut', url: '/assets/models/tokens/astronaut.glb', scale: 0.807, rotationY: 0, offsetY: 0 },
  human:     { id: 'human',     label: 'Human',     url: '/assets/models/tokens/human.glb',     scale: 0.312, rotationY: 0, offsetY: 0 },
  robot:     { id: 'robot',     label: 'Robot',     url: '/assets/models/tokens/robot.glb',     scale: 0.324, rotationY: 0, offsetY: 0.006 },
  skeleton:  { id: 'skeleton',  label: 'Skeleton',  url: '/assets/models/tokens/skeleton.glb',  scale: 1.461, rotationY: 0, offsetY: 0.144 },
  zombie:    { id: 'zombie',    label: 'Zombie',    url: '/assets/models/tokens/zombie.glb',    scale: 0.366, rotationY: 0, offsetY: 0.012 },
};

export const DEFAULT_SKINS: Record<Color, string> = {
  red: 'knight',
  green: 'farmer',
  yellow: 'wizard',
  blue: 'astronaut',
};
