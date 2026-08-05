import type { RunEvent } from '@repo/types';

/**
 * The EventSource lifecycle, wrapped so the store never touches the browser API
 * directly.
 *
 * Almost all of the reconnection work is *not here* — that's the point of
 * choosing SSE. `EventSource` retries on its own and resends the last `id:` it
 * saw as `Last-Event-ID`, and the server replays the log after that cursor. So
 * this file's whole job is: open, parse, report connection state, and close.
 *
 * The one thing it does add is the `lastEventId` query parameter. `EventSource`
 * has no API for setting a request header on a *fresh* connection, so a manual
 * re-attach after a page reload — where the cursor came out of sessionStorage
 * rather than out of the browser's own memory — has to pass it in the URL.
 */

export type StreamConnectionState = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface RunStreamHandlers {
  onEvent: (event: RunEvent) => void;
  onStateChange: (state: StreamConnectionState) => void;
}

export interface RunStream {
  close: () => void;
}

export function openRunStream(runId: string, fromSeq: number | null, handlers: RunStreamHandlers): RunStream {
  const base = `/api/runs/${encodeURIComponent(runId)}/events`;
  const url = fromSeq !== null && fromSeq > 0 ? `${base}?lastEventId=${fromSeq}` : base;

  const source = new EventSource(url);
  let closed = false;

  handlers.onStateChange('connecting');

  source.onopen = () => handlers.onStateChange('open');

  source.onmessage = (message) => {
    try {
      handlers.onEvent(JSON.parse(message.data) as RunEvent);
    } catch {
      // A malformed frame must not tear down the stream — the next event is
      // still perfectly good, and the log replay would recover the gap anyway.
    }
  };

  source.onerror = () => {
    if (closed) return;
    // CLOSED means the browser has given up (or the server hung up cleanly
    // after `run.finished`). CONNECTING means it's already retrying with the
    // cursor, so there is nothing to do but say so.
    handlers.onStateChange(source.readyState === EventSource.CLOSED ? 'closed' : 'reconnecting');
  };

  return {
    close() {
      if (closed) return;
      closed = true;
      source.close();
      handlers.onStateChange('closed');
    },
  };
}
