import type { RequestHandler } from 'express';

import { isTerminalRunStatus } from '@repo/types';

import { pathParam } from '../http/params.ts';
import { openSseChannel, readCursor } from '../http/sse.ts';
import { log } from '../logger.ts';
import type { RunStore } from '../runs/index.ts';
import { requireRun } from './runs.ts';

/** How long to wait after the final event before hanging up, so it flushes. */
const CLOSE_DELAY_MS = 50;

/**
 * `GET /api/runs/:runId/events` — the live stream.
 *
 * The whole reconnection story is three lines: read the cursor, ask the store
 * for the backlog after it, replay. `EventSource` supplies the cursor itself on
 * an automatic reconnect (`Last-Event-ID`, echoed from the `id:` written on
 * every frame); the query parameter covers a manual re-attach after a page
 * reload. Without a usable cursor the store leads with a snapshot instead, so a
 * client that's been away a while converges in one message rather than
 * replaying hundreds of events.
 *
 * The subscribe-then-drain order matters, and is the reason the store hands
 * back the backlog rather than exposing the log: registering the subscriber and
 * reading the backlog happen in one synchronous block, so an event emitted
 * mid-attach lands in exactly one of the two — never neither.
 *
 * This handler never calls `next()`, which is what keeps the response open.
 */
export function runEventsHandler(store: RunStore): RequestHandler {
  return (req, res) => {
    const run = requireRun(store, pathParam(req, 'runId'));
    const afterSeq = readCursor(req);

    const channel = openSseChannel(req, res, () => subscription.unsubscribe());

    const subscription = store.subscribe(
      run,
      (event) => {
        channel.send(event);

        if (event.type === 'run.finished') {
          // Hang up once the last event has flushed. The client closes on this
          // event too; closing from both ends is what stops EventSource from
          // redialling a run that has nothing left to say.
          setTimeout(() => channel.close(), CLOSE_DELAY_MS).unref();
        }
      },
      afterSeq,
    );

    for (const event of subscription.backlog) channel.send(event);

    log.debug('stream attached', { runId: run.id, requestId: req.requestId, afterSeq, replayed: subscription.backlog.length });

    // A late joiner on an already-finished run gets the history and a close;
    // there is nothing further coming.
    if (isTerminalRunStatus(run.status)) setTimeout(() => channel.close(), CLOSE_DELAY_MS).unref();
  };
}
