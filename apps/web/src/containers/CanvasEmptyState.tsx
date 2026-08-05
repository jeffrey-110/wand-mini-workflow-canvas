import { Button } from '../components/index.ts';
import { useGraphStore } from '../state/index.ts';

/**
 * The empty state does the teaching.
 *
 * It names both ways to add a step and offers a working graph one click away,
 * so the very first thing a new user can do is press Run and watch the whole
 * thing move. An empty canvas with no instructions is the most common way a
 * builder loses someone in the first ten seconds.
 *
 * `pointer-events: none` on the wrapper (see styles) keeps it from swallowing
 * drags onto the canvas underneath — only the button is interactive.
 */
export function CanvasEmptyState() {
  const loadExample = useGraphStore((state) => state.loadExample);

  return (
    <div className="empty-canvas">
      <div className="empty-canvas__card">
        <div className="empty-canvas__art" aria-hidden>
          <span data-kind="input" />
          <i />
          <span data-kind="transform" />
          <i />
          <span data-kind="output" />
        </div>

        <h2>Build a workflow</h2>
        <p>Drag a step from the left onto the canvas — or just click one. Connect steps by dragging from a step&rsquo;s right edge to another step&rsquo;s left edge.</p>

        <Button variant="primary" onClick={loadExample}>
          Start from an example
        </Button>
      </div>
    </div>
  );
}
