/**
 * Dice pip textures — generates 6 CanvasTextures with classic pip layouts.
 *
 * Each face is a 128×128 canvas: white background, black pips in the standard
 * 1–6 arrangement. Returns a material array in the boxGeometry order:
 * [+x, -x, +y, -y, +z, -z] = [right, left, top, bottom, front, back].
 *
 * Standard die convention (opposite faces sum to 7):
 *   top(+y)=1, bottom(-y)=6, front(+z)=2, back(-z)=5, right(+x)=3, left(-x)=4
 *
 * The FACE_ROTATION map in diceRoll.ts must be audited against this order:
 * to show face N on top, rotate the die so that face's material faces +y.
 */

import { CanvasTexture, MeshStandardMaterial } from 'three';

const SIZE = 128;
const PIP_RADIUS = 12;
const PIP_COLOR = '#222';
const FACE_COLOR = '#f8f8f8';

/** Pip positions (normalized 0..1) for each face value. */
const PIP_LAYOUTS: Record<number, Array<[number, number]>> = {
  1: [[0.5, 0.5]],
  2: [[0.25, 0.25], [0.75, 0.75]],
  3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
  4: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]],
  5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
  6: [[0.25, 0.2], [0.75, 0.2], [0.25, 0.5], [0.75, 0.5], [0.25, 0.8], [0.75, 0.8]],
};

/** Create a single face texture with the given pip count. */
function createPipTexture(value: number): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = FACE_COLOR;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Rounded border
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, SIZE - 4, SIZE - 4);

  // Pips
  ctx.fillStyle = PIP_COLOR;
  for (const [nx, ny] of PIP_LAYOUTS[value]) {
    ctx.beginPath();
    ctx.arc(nx * SIZE, ny * SIZE, PIP_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Build the 6-material array for a boxGeometry, in order:
 * [+x, -x, +y, -y, +z, -z]
 *
 * Convention: opposite faces sum to 7.
 *   +x (right)  = 3
 *   -x (left)   = 4
 *   +y (top)    = 1  ← this is "face 1 up" at identity rotation
 *   -y (bottom) = 6
 *   +z (front)  = 2
 *   -z (back)   = 5
 */
export function createDiceMaterials(): MeshStandardMaterial[] {
  const faceForSide: Record<string, number> = {
    '+x': 3, '-x': 4,
    '+y': 1, '-y': 6,
    '+z': 2, '-z': 5,
  };
  const sides = ['+x', '-x', '+y', '-y', '+z', '-z'] as const;
  return sides.map((side) => {
    const tex = createPipTexture(faceForSide[side]);
    return new MeshStandardMaterial({ map: tex, roughness: 0.3, metalness: 0.1 });
  });
}
