/**
 * Board — the procedural minimalist Ludo board (ARCHITECTURE-v3 §7.2).
 *
 * No external model; built from R3F primitives. Premium look from materials +
 * lighting. **Z-fighting prevention:** every surface type lives at its own Y
 * offset (renderLayers.ts); tiles are boxes with real height, overlays get
 * polygonOffset + distinct Y. See renderLayers.test.ts for the audit.
 */
import {
  SHARED_TRACK_COORDS,
  HOME_COORDS,
  YARD_COORDS,
  ALL_COLORS,
} from './config/boardGeometry';
import { Y, TILE_SIZE } from './config/renderLayers';
import { SAFE_TRACK_CELLS } from '../oracle/board/safeCells';
import { ENTRY_OFFSET } from '../oracle/board/track';
import type { Color } from '../oracle/board/track';

const COLOR_HEX: Record<Color, string> = {
  red: '#c0392b',
  green: '#27ae60',
  yellow: '#d4ac0d',
  blue: '#2980b9',
};

/**
 * A single path/home tile — a box with real height, top at Y.TILE_TOP.
 * Centered so bottom sits on the slab (position.y = H/2).
 */
function Tile({
  position,
  color,
  emissive,
}: {
  position: [number, number, number];
  color?: string;
  emissive?: string;
}) {
  return (
    <mesh position={[position[0], TILE_SIZE.H / 2, position[2]]} receiveShadow>
      <boxGeometry args={[TILE_SIZE.W, TILE_SIZE.H, TILE_SIZE.D]} />
      <meshStandardMaterial
        color={color ?? '#f4f1ea'}
        emissive={emissive ?? '#000000'}
        emissiveIntensity={emissive ? 0.3 : 0}
        roughness={0.7}
        metalness={0.05}
      />
    </mesh>
  );
}

export function Board() {
  return (
    <group>
      {/* Base slab — the wooden board. Top face at Y.SLAB_TOP (0). */}
      <mesh position={[0, -0.15, 0]} receiveShadow>
        <boxGeometry args={[16, 0.3, 16]} />
        <meshStandardMaterial color="#3d2b1f" roughness={0.85} metalness={0} />
      </mesh>

      {/* Shared loop tiles — boxes with height, top at TILE_TOP */}
      {SHARED_TRACK_COORDS.map((coord, cell) => {
        const startColor = ALL_COLORS.find((c) => ENTRY_OFFSET[c] === cell);
        const isStarSafe = SAFE_TRACK_CELLS.has(cell) && !startColor;
        return (
          <Tile
            key={`loop-${cell}`}
            position={[coord.x, 0, coord.z]}
            color={
              startColor
                ? COLOR_HEX[startColor]
                : isStarSafe
                  ? '#e6b800'
                  : '#f4f1ea'
            }
            emissive={isStarSafe ? '#d4ac0d' : undefined}
          />
        );
      })}

      {/* Home column tiles (colored per arm) */}
      {ALL_COLORS.map((color) =>
        HOME_COORDS[color].map((coord, i) => (
          <Tile
            key={`home-${color}-${i}`}
            position={[coord.x, 0, coord.z]}
            color={COLOR_HEX[color]}
          />
        )),
      )}

      {/* Yard plates — centered on the centroid of the 4 yard slots (not slot[0]). */}
      {ALL_COLORS.map((color) => {
        const slots = YARD_COORDS[color];
        const cx = slots.reduce((s, c) => s + c.x, 0) / slots.length;
        const cz = slots.reduce((s, c) => s + c.z, 0) / slots.length;
        return (
          <mesh
            key={`yard-${color}`}
            position={[cx, Y.YARD_PLATE, cz]}
          >
            <boxGeometry args={[4.2, 0.04, 4.2]} />
            <meshStandardMaterial
              color={COLOR_HEX[color]}
              roughness={0.6}
              transparent
              opacity={0.35}
              polygonOffset
              polygonOffsetFactor={-1}
            />
          </mesh>
        );
      })}

      {/* Center finish area — sits at OVERLAY, above tiles. */}
      <mesh position={[0, Y.OVERLAY, 0]}>
        <boxGeometry args={[2.8, 0.06, 2.8]} />
        <meshStandardMaterial color="#2c2c2c" roughness={0.5} metalness={0.2} />
      </mesh>
    </group>
  );
}
