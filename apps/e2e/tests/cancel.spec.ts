import { expect, test } from '@playwright/test';

import { Canvas, EXAMPLE_NODE_IDS, type NodeStatus } from './canvas.ts';

/**
 * Cancellation.
 *
 * Two distinct things have to happen, and only one of them is obvious. The
 * in-flight step has to stop - the simulated work is an abortable sleep, so it
 * lands within a tick rather than at the next node boundary - and the steps
 * that never started have to be retired rather than left `queued` forever.
 *
 * The client deliberately does not guess at any of this. Cancel sets a local
 * `isCanceling` flag and waits for the server to say which nodes actually
 * stopped, so everything asserted below arrived over the stream.
 */
test.describe('canceling a run', () => {
  test('stops the run and leaves nothing queued or running', async ({ page }) => {
    const canvas = new Canvas(page);
    await canvas.open();
    await canvas.loadExample();
    await canvas.setFailureRate('0');
    await canvas.run();

    await expect(canvas.nodesWithStatus('running').first()).toBeVisible();
    await canvas.cancelButton.click();

    await canvas.waitForRunStatus('Canceled');

    // Every node ends terminal. A step left `queued` after a cancel is the
    // failure mode this is really guarding: the run is over and the canvas
    // still claims work is pending.
    await expect(canvas.nodesWithStatus('queued')).toHaveCount(0);
    await expect(canvas.nodesWithStatus('running')).toHaveCount(0);

    const terminal: NodeStatus[] = ['succeeded', 'failed', 'skipped', 'canceled'];
    for (const id of EXAMPLE_NODE_IDS) {
      const status = await canvas.node(id).getAttribute('data-status');
      expect(terminal).toContain(status);
    }
  });

  test('marks the steps that were cut off as canceled', async ({ page }) => {
    const canvas = new Canvas(page);
    await canvas.open();
    await canvas.loadExample();
    await canvas.setFailureRate('0');
    await canvas.run();

    await expect(canvas.nodesWithStatus('running').first()).toBeVisible();
    await canvas.cancelButton.click();
    await canvas.waitForRunStatus('Canceled');

    // Canceled reads differently from failed on purpose: nothing was broken,
    // the user pulled the plug.
    await expect(canvas.nodesWithStatus('canceled').first()).toBeVisible();
    await expect(canvas.toast('Run canceled.')).toBeVisible();
  });

  test('swaps Cancel back for Run once the run has settled', async ({ page }) => {
    const canvas = new Canvas(page);
    await canvas.open();
    await canvas.loadExample();
    await canvas.setFailureRate('0');
    await canvas.run();

    await expect(canvas.cancelButton).toBeVisible();
    await expect(canvas.runButton).toBeHidden();

    await canvas.cancelButton.click();
    await canvas.waitForRunStatus('Canceled');

    await expect(canvas.cancelButton).toBeHidden();
    await expect(canvas.runButton).toBeEnabled();
  });

  test('cancels from the keyboard', async ({ page }) => {
    const canvas = new Canvas(page);
    await canvas.open();
    await canvas.loadExample();
    await canvas.setFailureRate('0');
    await canvas.run();

    await expect(canvas.nodesWithStatus('running').first()).toBeVisible();
    await page.keyboard.press('Meta+Period');

    await canvas.waitForRunStatus('Canceled');
  });
});
