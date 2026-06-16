import { defineConfig } from 'vitest/config';

// Vitest configuration for the Champions Team Builder.
//
// We split test environments by directory:
//   - tests/unit/**   → jsdom  (UI components rely on the DOM)
//   - tests/smoke/**  → node   (load static JSON fixtures, no DOM needed)
//   - tests/property/** → node (pure domain / data-layer property tests)
//
// `environmentMatchGlobs` is the documented Vitest hook for
// per-folder environment selection without splitting the test runner
// into multiple projects.
export default defineConfig({
  test: {
    environment: 'node',
    environmentMatchGlobs: [
      ['tests/unit/**', 'jsdom'],
      ['tests/smoke/**', 'node'],
      ['tests/property/**', 'node'],
    ],
    include: ['tests/**/*.test.mjs'],
    globals: false,
    clearMocks: true,
    restoreMocks: true,
  },
});
