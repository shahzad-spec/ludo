// ESLint flat config (ESLint 9+).
// Implements the layer-boundary guardrails from ARCHITECTURE-v3 §14 / IMPLEMENTATION-PLAN-v1 §4.4.
//
// Rules:
//   src/oracle/**  — pure TS. No react, react-dom, three, R3F, or CSS.
//   src/director/** — may import oracle/bus/store, never stage.
//   src/stage/**    — may import oracle/bus/store, never director.
//   director and stage may never import each other.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // --- Base: recommended TS rules across the project ---
  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    ignores: ['dist/**', 'node_modules/**', 'docs/**', 'public/**', 'tools/**'],
  },

  // --- Global: forbid direct GSAP usage outside director/anim ---
  // (Trap 1 — all GSAP timelines go through useGsapTimeline; IMPLEMENTATION-PLAN-v1 §8.1.1)
  // Applied to ALL src files, then overridden OFF for director/anim/ below.
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'gsap',
              message: 'Import gsap only inside src/director/anim/. All timelines must go through the useGsapTimeline hook (IMPLEMENTATION-PLAN-v1 §8.1.1).',
              allowTypeImports: false,
            },
          ],
        },
      ],
    },
  },
  // --- LAYER 1: the Oracle (pure TS, zero rendering deps) ---
  // Enforces ARCHITECTURE-v3 §1: "The Oracle knows nothing about rendering."
  {
    files: ['src/oracle/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'Oracle must not import React (ARCHITECTURE-v3 §1).' },
            { name: 'react-dom', message: 'Oracle must not import react-dom.' },
            { name: 'react/jsx-runtime', message: 'Oracle must not import JSX runtime.' },
            { name: 'three', message: 'Oracle must not import three — world-space Vector3 lives in the Director (ARCHITECTURE-v3 §9).' },
            { name: 'gsap', message: 'Oracle must not import gsap.' },
            { name: 'howler', message: 'Oracle must not import howler.' },
            { name: 'zustand', message: 'Oracle engine is pure; the store wraps it (src/store/).' },
          ],
          patterns: [
            { group: ['@react-three/*'], message: 'Oracle must not import R3F.' },
            { group: ['*.css', './**/*.css', '../**/*.css'], message: 'Oracle must not import CSS.' },
            { group: ['../director/*', '../director/**/*', '../../director/**/*'], message: 'Oracle must not import the Director layer.' },
            { group: ['../stage/*', '../stage/**/*', '../../stage/**/*'], message: 'Oracle must not import the Stage layer.' },
          ],
        },
      ],
    },
  },

  // --- LAYER 2: the Director (R3F). Must not reach into Stage. ---
  // NOTE: this block REPLACES the global no-restricted-imports for director files,
  // so the gsap funnel must be repeated here (flat config doesn't merge rule values).
  {
    files: ['src/director/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'gsap',
              message: 'Import gsap only inside src/director/anim/. All timelines must go through the useGsapTimeline hook (IMPLEMENTATION-PLAN-v1 §8.1.1).',
              allowTypeImports: false,
            },
          ],
          patterns: [
            { group: ['../stage/*', '../stage/**/*', '../../stage/**/*', '**/stage/**'], message: 'Director must not import the Stage layer (ARCHITECTURE-v3 §2). Communication is via the store + event bus only.' },
          ],
        },
      ],
    },
  },

  // --- LAYER 3: the Stage (React UI). Must not reach into Director. ---
  {
    files: ['src/stage/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['../director/*', '../director/**/*', '../../director/**/*', '**/director/**'], message: 'Stage must not import the Director layer (ARCHITECTURE-v3 §2). Communication is via the store + event bus only.' },
          ],
        },
      ],
    },
  },

  // --- FINAL override: director/anim/ IS allowed to import gsap ---
  // Must be LAST so it wins over the Director layer's gsap restriction.
  {
    files: ['src/director/anim/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
);
