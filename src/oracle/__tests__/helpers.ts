/**
 * Test helpers for the rules-engine suites. Builds GameState and Token objects
 * with overrides, so each test reads as "given this board, expect this."
 */

import { BASE } from '../board/track';
import { createInitialState, colorsForPlayerCount } from '../engine';
import { V1_RULES } from '../config/rulesPreset';
import type { Color, GameState, Token } from '../types';

/** All four token ids for a color. */
export function idsOf(color: Color): string[] {
  return [0, 1, 2, 3].map((slot) => `${color}-${slot}`);
}

/** Build a token with overrides. Defaults to red-0 in the yard. */
export function makeToken(overrides: Partial<Token> & { id: string }): Token {
  return {
    color: 'red',
    progress: BASE,
    slot: 0,
    ...overrides,
  } as Token;
}

/**
 * Build a GameState with specific token placements. Pass a map of
 * tokenId → progress; everything else stays in the yard.
 */
export function stateWithPlacements(
  placements: Record<string, { color: Color; progress: number; slot?: number }>,
  overrides: Partial<GameState> = {},
): GameState {
  const base = createInitialState(colorsForPlayerCount(V1_RULES.playerCount), V1_RULES);
  const tokens = { ...base.tokens };

  // Default every token to yard, then apply placements.
  for (const id of Object.keys(tokens)) {
    tokens[id] = { ...tokens[id], progress: BASE };
  }
  const slotCount: Record<Color, number> = { red: 0, green: 0, yellow: 0, blue: 0 };
  for (const [id, info] of Object.entries(placements)) {
    const slot = info.slot ?? slotCount[info.color]++;
    tokens[id] = { id, color: info.color, progress: info.progress, slot };
  }

  return { ...base, tokens, ...overrides };
}
