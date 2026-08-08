/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Single config for both Vite (dev/build) and Vitest (test).
// Vitest auto-reads this file. The test block is ignored by `vite build`.
export default defineConfig({
  plugins: [react()],
  test: {
    // Oracle is pure TS and runs in Node — no DOM needed in Phase 0.5/1.
    // jsdom can be added later for Stage component tests.
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    globals: true,
  },
});
