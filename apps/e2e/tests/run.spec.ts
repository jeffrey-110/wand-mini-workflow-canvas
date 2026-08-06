import { expect, test } from '@playwright/test';

import { Canvas, EXAMPLE, EXAMPLE_NODE_IDS } from './canvas.ts';

/**
 * The happy path, and the one test this suite exists for.
 *
 * A run that starts and then streams to completion in a real browser is the
 * assertion that the SSE `event:` bug made impossible. Note what it checks
 * beyond "the run finished": that nodes reach `running` before they reach
 * `succeeded`. A frozen canvas whose final state arrives from the `POST`
 * snapshot would satisfy a naive end-state assertion. It cannot satisfy this
 * one, because intermediate states only ever arrive over the stream.
 */
test.describe('running a workflow', () => {
  test('streams every step through to succeeded', async ({ page }) => {
    const canvas = new Canvas(page);
    await canvas.open();
    await canvas.loadExample();
    await canvas.setFailureRate('0');

    await expect(canvas.runStatus).toHaveText('Not run yet');
    await canvas.run();

    // Proof of streaming: an intermediate state observed in the DOM. This can
    // only have come from a `node.updated` frame.
    await expect(canvas.node(EXAMPLE.input)).toHaveAttribute('data-status', 'running');
    await expect(canvas.runStatus).toHaveText('Running');

    await canvas.waitForRunStatus('Succeeded');

    for (const id of EXAMPLE_NODE_IDS) {
      await canvas.expectStatus(id, 'succeeded');
    }
    await expect(canvas.runCounts).toHaveText(/5\/5 steps/);
  });

  test('runs independent branches at the same time', async ({ page }) => {
    const canvas = new Canvas(page);
    await canvas.open();
    await canvas.loadExample();
    await canvas.setFailureRate('0');
    await canvas.run();

    // Slugify and Shout both depend only on the input, so once it lands they
    // start together. If the scheduler had a level barrier, or ran serially,
    // this count would never reach two.
    await expect(canvas.nodesWithStatus('running')).toHaveCount(2, { timeout: 15_000 });

    await canvas.waitForRunStatus('Succeeded');
  });

  test('carries each step output through to the next', async ({ page }) => {
    const canvas = new Canvas(page);
    await canvas.open();
    await canvas.loadExample();
    await canvas.setFailureRate('0');
    await canvas.run();
    await canvas.waitForRunStatus('Succeeded');

    // The example input is "  Wand Studio Workflows  ", so the two branches
    // produce different, checkable values. Asserting the actual data is what
    // separates "the lights came on" from "the wiring is right".
    await expect(canvas.result(EXAMPLE.slugify)).toContainText('wand-studio-workflows');
    await expect(canvas.result(EXAMPLE.shout)).toContainText('WAND STUDIO WORKFLOWS');
    await expect(canvas.result(EXAMPLE.tag)).toContainText('note/wand-studio-workflows');
  });

  test('locks editing while a run is in flight, and releases it after', async ({ page }) => {
    const canvas = new Canvas(page);
    await canvas.open();
    await canvas.loadExample();
    await canvas.setFailureRate('0');
    await canvas.run();

    // There is no honest answer to "you deleted a node that is currently
    // running", so the graph is read-only until the run settles.
    await expect(canvas.paletteButton('transform')).toBeDisabled();
    await expect(canvas.failureRateSelect).toBeDisabled();
    await expect(canvas.clearButton).toBeDisabled();

    await canvas.waitForRunStatus('Succeeded');

    await expect(canvas.paletteButton('transform')).toBeEnabled();
    await expect(canvas.failureRateSelect).toBeEnabled();
  });
});
