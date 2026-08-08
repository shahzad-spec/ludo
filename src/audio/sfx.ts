/**
 * SFX map — Howl instances for each sound effect (PLAN-PHASE-4 §3.2).
 *
 * Preloaded on first import. Each Howl auto-pools; Howler handles browser
 * autoplay unlock (first sound plays after a user gesture — the Roll click).
 */

import { Howl } from 'howler';

const BASE = '/assets/audio/';

/** Map of sound id → Howl. Access via SFX.diceRoll.play() etc. */
export const SFX: Record<string, Howl> = {
  diceRoll: new Howl({ src: [`${BASE}dice_roll.mp3`] }),
  collide: new Howl({ src: [`${BASE}collide.mp3`] }),
  pileMove: new Howl({ src: [`${BASE}pile_move.mp3`] }),
  safeSpot: new Howl({ src: [`${BASE}safe_spot.mp3`] }),
  homeWin: new Howl({ src: [`${BASE}home_win.mp3`] }),
  cheer: new Howl({ src: [`${BASE}cheer.mp3`] }),
  ui: new Howl({ src: [`${BASE}ui.mp3`] }),
  gameStart: new Howl({ src: [`${BASE}game_start.mp3`] }),
};

/**
 * Play a sound by id, respecting mute/volume from the given settings.
 * No-op if the sound doesn't exist or is muted.
 */
export function playSfx(id: string, volume: number = 1, muted: boolean = false): void {
  if (muted) return;
  const howl = SFX[id];
  if (!howl) return;
  howl.volume(volume);
  howl.play();
}
