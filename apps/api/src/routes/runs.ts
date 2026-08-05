import type { RequestHandler } from 'express';

import type { CancelRunResponse, CreateRunResponse, RunSnapshot } from '@repo/types';
import { parseWorkflow, validateWorkflow } from '@repo/workflow';

import { config } from '../config.ts';
import { HttpError, invalidWorkflow } from '../http/errors.ts';
import { pathParam } from '../http/params.ts';
import { log } from '../logger.ts';
import { executeRun, type ResolvedRunOptions, type Run, type RunStore } from '../runs/index.ts';

/**
 * Run lifecycle: create, read, cancel.
 *
 * Creating a run does *not* await it. The response carries the run id and an
 * initial snapshot; everything after that arrives on the event stream. That
 * split is deliberate — it keeps the POST fast and honest (it reports whether
 * the run was *accepted*, not whether it succeeded), and it means the client
 * holds an id it can reconnect with before the first node has even started.
 *
 * Handlers are `async` and simply throw; Express 5 routes a rejected promise to
 * the error middleware, so there is no try/catch and no `next(error)` here.
 */

export function createRunHandler(store: RunStore): RequestHandler {
  return async (req, res) => {
    const body = req.body as { workflow?: unknown; options?: unknown };

    // Two stages on purpose: parse answers "is this a workflow?" (400), and
    // validate answers "is it runnable?" (422, with a list the editor renders).
    const workflow = parseWorkflow(body.workflow);
    const validation = validateWorkflow(workflow);
    if (!validation.valid) throw invalidWorkflow(validation.issues);

    const run = store.create(workflow, resolveOptions(body.options));

    void executeRun(store, run).catch((error: unknown) => {
      // The scheduler handles per-node failure itself, so reaching here means a
      // bug in the scheduler rather than a failed step. Fail the run loudly
      // instead of leaving it running forever.
      log.error('run crashed', { runId: run.id, requestId: req.requestId, error: error instanceof Error ? error.message : String(error) });
      if (run.finishedAt === undefined) store.setStatus(run, 'failed');
    });

    log.info('run accepted', { runId: run.id, requestId: req.requestId, nodes: workflow.nodes.length, edges: workflow.edges.length });

    const payload: CreateRunResponse = { runId: run.id, snapshot: store.snapshot(run) };
    res.status(201).location(`/api/runs/${run.id}`).json(payload);
  };
}

export function getRunHandler(store: RunStore): RequestHandler {
  return (req, res) => {
    const payload: RunSnapshot = store.snapshot(requireRun(store, pathParam(req, 'runId')));
    res.json(payload);
  };
}

export function cancelRunHandler(store: RunStore): RequestHandler {
  return (req, res) => {
    const run = requireRun(store, pathParam(req, 'runId'));

    if (!store.cancel(run)) {
      // 409 rather than an error: the run finishing first is a race the client
      // can legitimately lose, and the UI treats this as a non-event.
      throw new HttpError(409, 'run_already_finished', `Run already ${run.status}; there is nothing to cancel.`);
    }

    log.info('run cancel requested', { runId: run.id, requestId: req.requestId });

    // 202, not 200: the cancel has been accepted, but which nodes actually
    // stopped is decided by the scheduler and reported on the stream.
    const payload: CancelRunResponse = { runId: run.id, status: 'canceling' };
    res.status(202).json(payload);
  };
}

export function requireRun(store: RunStore, runId: string | undefined): Run {
  const run = runId ? store.get(runId) : undefined;
  if (!run) throw new HttpError(404, 'run_not_found', 'No such run — it may have expired.');
  return run;
}

/**
 * Merge caller-supplied simulation knobs over the configured defaults.
 *
 * Exposed so a reviewer can force the failure path on demand instead of
 * rerunning until the dice cooperate. `failNodeIds` is deliberately *not* read
 * here — it's a test-only escape hatch on the store, and accepting it over HTTP
 * would make "simulated" behaviour scriptable from the browser.
 */
function resolveOptions(input: unknown): ResolvedRunOptions {
  const defaults = config.defaultRunOptions;
  if (typeof input !== 'object' || input === null) return { ...defaults };

  const options = input as Record<string, unknown>;
  const resolved: ResolvedRunOptions = {
    failureRate: rate(options.failureRate, defaults.failureRate, 'options.failureRate'),
    minDurationMs: duration(options.minDurationMs, defaults.minDurationMs, 'options.minDurationMs'),
    maxDurationMs: duration(options.maxDurationMs, defaults.maxDurationMs, 'options.maxDurationMs'),
  };

  // Tolerate an inverted range rather than rejecting it: the caller's intent is
  // unambiguous, and a 400 here would be pedantry.
  if (resolved.maxDurationMs < resolved.minDurationMs) resolved.maxDurationMs = resolved.minDurationMs;

  return resolved;
}

function rate(value: unknown, fallback: number, path: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new HttpError(400, 'malformed_request', `${path} must be a number between 0 and 1.`);
  }
  return value;
}

function duration(value: unknown, fallback: number, path: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 60_000) {
    throw new HttpError(400, 'malformed_request', `${path} must be an integer between 0 and 60000.`);
  }
  return value;
}
