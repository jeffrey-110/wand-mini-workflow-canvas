import type { Request, Response } from 'express';

import type { RunEvent } from '@repo/types';

/**
 * Server-sent events, written straight to the response.
 *
 * **Why SSE and not WebSocket.** This stream is strictly one-way: the server
 * narrates, the client listens. Commands (create, cancel) stay ordinary POSTs,
 * where they're easy to reason about and trivial to test with curl. SSE is
 * plain HTTP, so it inherits auth, proxies and the dev server's routing for
 * free — and `EventSource` reconnects on its own, resending the last id it saw
 * as `Last-Event-ID`. That header *is* the resume cursor the run's event log
 * already exposes, so reconnection costs almost nothing to support. A WebSocket
 * would mean hand-writing reconnect, heartbeat and backoff for a channel that
 * never needs a client→server frame.
 *
 * **Why no library.** An SSE frame is four lines of text. What actually matters
 * here — flushing per event, defeating intermediary buffering, and cleaning up
 * when the socket dies — is behaviour a wrapper would hide rather than solve.
 * Express needs no special handling: this writes to `res` directly and simply
 * never calls `next()`, so the response stays open.
 */

/** Interval between comment frames that keep idle connections from being reaped. */
const HEARTBEAT_MS = 15_000;
/** How long the browser should wait before reconnecting after a drop. */
const RETRY_MS = 1_500;

export interface SseChannel {
  send: (event: RunEvent) => void;
  comment: (text: string) => void;
  close: () => void;
  readonly closed: boolean;
}

export function openSseChannel(req: Request, res: Response, onClose: () => void): SseChannel {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    // Nginx and friends buffer proxied responses by default, which would hold
    // every event until the run ended and defeat the entire point.
    'x-accel-buffering': 'no',
  });

  // Tell EventSource how long to wait before dialling back.
  res.write(`retry: ${RETRY_MS}\n\n`);

  let closed = false;

  function teardown(): void {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    onClose();
  }

  const heartbeat = setInterval(() => {
    if (!closed) res.write(': ping\n\n');
  }, HEARTBEAT_MS);
  // Never hold the process open for a stream nobody is reading.
  heartbeat.unref();

  // Covers the tab closing, a network drop, and the client calling `.close()`.
  req.on('close', teardown);
  res.on('error', teardown);

  return {
    get closed() {
      return closed;
    },
    send(event) {
      if (closed) return;

      // Two deliberate details in these three lines:
      //
      // `id:` is the resume cursor — the browser echoes the last one it saw
      // back as `Last-Event-ID` on reconnect, and that is the whole mechanism.
      //
      // There is **no `event:` line**, and that is not an omission. Writing
      // `event: node.updated` makes EventSource dispatch a *typed* event, which
      // is delivered only to `addEventListener('node.updated', …)` — never to
      // `onmessage`. A client with a single `onmessage` handler silently
      // receives nothing, while curl shows a perfectly well-formed stream. The
      // discriminant lives in the JSON payload's `type` instead, where the
      // client's reducer already switches on it.
      res.write(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`);
    },
    comment(text) {
      if (!closed) res.write(`: ${text}\n\n`);
    },
    close() {
      if (closed) return;
      teardown();
      res.end();
    },
  };
}

/**
 * The resume cursor: `Last-Event-ID` on an automatic reconnect, or the
 * `lastEventId` query parameter when the client is re-attaching by hand after a
 * page reload (`EventSource` has no API for setting a header on a fresh
 * connection). Null means "no usable cursor — send a snapshot instead".
 */
export function readCursor(req: Request): number | null {
  const header = req.get('last-event-id');
  const fallback = req.query.lastEventId;
  const raw = header ?? (typeof fallback === 'string' ? fallback : '');
  if (raw === '') return null;

  const seq = Number(raw);
  return Number.isSafeInteger(seq) && seq >= 0 ? seq : null;
}
