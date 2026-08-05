import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests live beside the code they cover.
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // The API logs a line per request; at 45 HTTP tests that buries the report.
    env: { LOG_LEVEL: 'silent' },
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // server.ts is the composition root — it binds a port and wires modules
      // that are each covered directly, so unit-testing it would only assert
      // that the wiring is the wiring.
      exclude: ['src/**/*.test.ts', 'src/server.ts', 'src/logger.ts'],
    },
  },
});
