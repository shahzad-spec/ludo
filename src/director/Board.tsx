/**
 * Board — the procedural minimalist Ludo board (ARCHITECTURE-v3 §7.2).
 *
 * No external model; built from R3F primitives. Premium look comes from materials
 * (wood base, matte colored tiles) + the lighting in Scene. One mesh per tile —
 * v1 doesn't need instancing yet (88 tiles is trivial).
 */
import { SHARED_TRACK_COORDS, HOME_COORDS, YARD_COORDS, ALL_COLORS } from './config/boardGeometry';
import { SAFE_TRACK_CELLS } from '../oracle/board/safeCells';
import { ENTRY_OFFSET } from '../oracle/board/track';
import type { Color } from '../oracle/board/track';

const COLOR_HEX: Record<Color, string> = {
  red: '#c0392b',
  green: '#27ae60',
  yellow: '#d4ac0d',
  blue: '#2980b9',
};

/** A single flat tile at a position. */
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
    <mesh position={position} receiveShadow>
      <boxGeometry args={[0.92, 0.1, 0.92]} />
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
      {/* Base slab — the wooden board */}
      <mesh position={[0, -0.1, 0]} receiveShadow>
        <boxGeometry args={[16, 0.3, 16]} />
        <meshStandardMaterial color="#3d2b1f" roughness={0.85} metalness={0} />
      </mesh>

      {/* Shared loop tiles */}
      {SHARED_TRACK_COORDS.map((coord, cell) => {
        const startColor = ALL_COLORS.find((c) => ENTRY_OFFSET[c] === cell);
        // Safe cells: the 4 colored starts (safe by being colored) + the 4 star
        // cells (8th from each start). Stars get a distinct amber base + glow so
        // they're clearly visible against the cream path tiles.
        const isStarSafe =
          SAFE_TRACK_CELLS.has(cell) && !startColor;
        return (
          <Tile
            key={`loop-${cell}`}
            position={[coord.x, 0, coord.z]}
            color={
              startColor
                ? COLOR_HEX[startColor]
                : isStarSafe
                  ? '#e6b800' // amber — clearly distinct from cream path
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

      {/* Yard areas — a flat colored square per corner, with 4 slot markers */}
      {ALL_COLORS.map((color) => (
        <group key={`yard-${color}`}>
          {/* Yard base */}
          <mesh position={[YARD_COORDS[color][0].x, -0.05, YARD_COORDS[color][0].z]}>
            <boxGeometry args={[4, 0.08, 4]} />
            <meshStandardMaterial
              color={COLOR_HEX[color]}
              roughness={0.6}
              transparent
              opacity={0.35}
            />
          </mesh>
        </group>
      ))}

      {/* Center finish triangle area */}
      <mesh position={[0, 0.01, 0]}>
        <boxGeometry args={[2.8, 0.12, 2.8]} />
        <meshStandardMaterial color="#2c2c2c" roughness={0.5} metalness={0.2} />
      </mesh>
    </group>
  );
}
