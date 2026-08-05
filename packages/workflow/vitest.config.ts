import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests live beside the code they cover.
    include: ['src/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
  },
});
