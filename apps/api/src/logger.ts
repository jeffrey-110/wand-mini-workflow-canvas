import { config } from './config.ts';

/**
 * Structured logging to stdout, one JSON object per line.
 *
 * JSON rather than pretty text because the fields — `requestId`, `runId` — are
 * the point: they're what lets you follow one run through a log that has a
 * dozen interleaved. Small enough to not warrant a dependency.
 */

// `silent` exists so the test suite isn't drowned in request lines; it sits
// above every real level, so nothing clears it.
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 } as const;
type Level = keyof typeof LEVELS;

const threshold = LEVELS[(config.logLevel as Level) in LEVELS ? (config.logLevel as Level) : 'info'];

function emit(level: Level, message: string, fields?: Record<string, unknown>): void {
  if (LEVELS[level] < threshold) return;

  const line = JSON.stringify({ level, time: new Date().toISOString(), message, ...fields });
  // Anything at warn or above goes to stderr, so `pnpm dev 2>errors.log` works.
  if (LEVELS[level] >= LEVELS.warn) process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export const log = {
  debug: (message: string, fields?: Record<string, unknown>) => emit('debug', message, fields),
  info: (message: string, fields?: Record<string, unknown>) => emit('info', message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => emit('warn', message, fields),
  error: (message: string, fields?: Record<string, unknown>) => emit('error', message, fields),
};
