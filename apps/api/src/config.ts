import type { RunOptions } from '@repo/types';

/**
 * Single place where environment turns into typed, validated config.
 *
 * Fails fast at boot rather than at first request: a bad PORT or a nonsense
 * duration range should stop the process, not surface as a broken run an hour
 * later.
 */

interface AppConfig {
  port: number;
  host: string;
  nodeEnv: string;
  logLevel: string;
  /** Origins allowed to call this API cross-origin. Empty = same-origin only. */
  corsOrigins: string[];
  maxBodyBytes: number;
  /** How long a finished run stays readable before it's swept. */
  runTtlMs: number;
  /** Hard cap on retained runs, so a long-lived dev server can't grow forever. */
  maxRuns: number;
  shutdownGraceMs: number;
  /** Defaults for the simulated execution; a request may override them. */
  defaultRunOptions: RunOptions;
}

type Env = Record<string, string | undefined>;

function intFromEnv(env: Env, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;

  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer in [${min}, ${max}], got "${raw}"`);
  }
  return value;
}

function rateFromEnv(env: Env, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;

  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be a number in [0, 1], got "${raw}"`);
  }
  return value;
}

export function loadConfig(env: Env = process.env): AppConfig {
  const minDurationMs = intFromEnv(env, 'RUN_MIN_DURATION_MS', 500, 0, 60_000);
  const maxDurationMs = intFromEnv(env, 'RUN_MAX_DURATION_MS', 3_000, 0, 60_000);

  if (maxDurationMs < minDurationMs) {
    throw new Error(`RUN_MAX_DURATION_MS (${maxDurationMs}) must be >= RUN_MIN_DURATION_MS (${minDurationMs})`);
  }

  return {
    port: intFromEnv(env, 'PORT', 8787, 1, 65_535),
    host: env.HOST ?? '127.0.0.1',
    nodeEnv: env.NODE_ENV ?? 'development',
    logLevel: env.LOG_LEVEL ?? 'info',

    corsOrigins:
      env.CORS_ORIGINS?.split(',')
        .map((origin) => origin.trim())
        .filter(Boolean) ?? [],

    // A 1000-node graph of 2KB configs is comfortably under this.
    maxBodyBytes: intFromEnv(env, 'MAX_BODY_BYTES', 2 * 1024 * 1024, 1_024, 16 * 1024 * 1024),

    runTtlMs: intFromEnv(env, 'RUN_TTL_MS', 15 * 60_000, 10_000, 24 * 3_600_000),
    maxRuns: intFromEnv(env, 'MAX_RUNS', 50, 1, 10_000),
    shutdownGraceMs: intFromEnv(env, 'SHUTDOWN_GRACE_MS', 5_000, 0, 120_000),

    defaultRunOptions: {
      // The brief's number: each node fails ~10% of the time.
      failureRate: rateFromEnv(env, 'RUN_FAILURE_RATE', 0.1),
      minDurationMs,
      maxDurationMs,
    },
  };
}

export const config: AppConfig = loadConfig();
