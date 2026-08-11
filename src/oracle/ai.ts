/**
 * Re-export from the ai/ module (PLAN-PHASE-5B §3.1).
 * Keeps existing imports (botDriver.ts, ai.test.ts) working unchanged.
 */
export { chooseBotMove } from './ai/policy';
export type { BotDifficulty } from './ai/types';
