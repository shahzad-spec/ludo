/**
 * Token skin catalog — pure data, importable by both Stage and Director.
 *
 * Per-skin tuning constants from SkinnedMesh.computeBoundingBox() dev printer.
 * All 8 models are SkinnedMesh; constants are the production approach.
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
  knight:    { id: 'knight',    label: 'Knight',    url: '/assets/models/tokens/knight.glb',    scale: 0.106, rotationY: 0, offsetY: 0.363 },
  farmer:    { id: 'farmer',    label: 'Farmer',    url: '/assets/models/tokens/farmer.glb',    scale: 0.274, rotationY: 0, offsetY: 0 },
  wizard:    { id: 'wizard',    label: 'Wizard',    url: '/assets/models/tokens/wizard.glb',    scale: 0.257, rotationY: 0, offsetY: 0.003 },
  astronaut: { id: 'astronaut', label: 'Astronaut', url: '/assets/models/tokens/astronaut.glb', scale: 0.269, rotationY: 0, offsetY: 0 },
  human:     { id: 'human',     label: 'Human',     url: '/assets/models/tokens/human.glb',     scale: 0.104, rotationY: 0, offsetY: 0 },
  robot:     { id: 'robot',     label: 'Robot',     url: '/assets/models/tokens/robot.glb',     scale: 0.108, rotationY: 0, offsetY: 0.002 },
  skeleton:  { id: 'skeleton',  label: 'Skeleton',  url: '/assets/models/tokens/skeleton.glb',  scale: 0.487, rotationY: 0, offsetY: 0.048 },
  zombie:    { id: 'zombie',    label: 'Zombie',    url: '/assets/models/tokens/zombie.glb',    scale: 0.122, rotationY: 0, offsetY: 0.004 },
};

export const DEFAULT_SKINS: Record<Color, string> = {
  red: 'knight',
  green: 'farmer',
  yellow: 'wizard',
  blue: 'astronaut',
};
