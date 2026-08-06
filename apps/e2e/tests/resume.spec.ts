import { expect, test } from '@playwright/test';

import { Canvas, EXAMPLE_NODE_IDS } from './canvas.ts';

/**
 * Reload recovery.
 *
 * The run lives on the server, and the event log is append-only, so a refresh
 * should re-attach to a run in flight rather than orphan it. The cursor is
 * kept in sessionStorage, replayed as a `fromSeq`, and the client folds the
 * missed events exactly as it folded the live ones.
 *
 * This is only observable in a browser: it needs a real page lifecycle, real
 * storage, and a real `EventSource` reconnect. There is no unit-test shape for
 * "the tab went away and came back".
 */
test.describe('surviving a reload', () => {
  test('re-attaches to a run that is still in flight', async ({ page }) => {
    const canvas = new Canvas(page);
    await canvas.open();
    await canvas.loadExample();
    await canvas.setFailureRate('0');
    await canvas.run();

    await expect(canvas.nodesWithStatus('running').first()).toBeVisible();
    await page.reload();

    // The run is not restarted, it is rejoined: the toolbar comes back showing
    // a run already in progress, and it goes on to finish.
    await expect(canvas.runStatus).not.toHaveText('Not run yet');
    await canvas.waitForRunStatus('Succeeded');

    for (const id of EXAMPLE_NODE_IDS) {
      await canvas.expectStatus(id, 'succeeded');
    }
  });

  test('shows the result of a run that finished while the tab was away', async ({ page }) => {
    const canvas = new Canvas(page);
    await canvas.open();
    await canvas.loadExample();
    await canvas.setFailureRate('0');
    await canvas.run();
    await expect(canvas.nodesWithStatus('running').first()).toBeVisible();

    // Leave while the run is in flight. Navigating away rather than waiting for
    // it to finish is what makes this the interesting case: the cursor is
    // cleared the moment a run settles in an open tab, so a run that finishes
    // in front of you leaves nothing to restore. This one finishes on the
    // server with nobody watching.
    await page.goto('about:blank');
    await page.waitForTimeout(5_000);
    await page.goto('/');

    // Restored from the snapshot, not the stream: the client fetches the run
    // first and only reconnects if it is genuinely still going.
    await canvas.waitForRunStatus('Succeeded');
    for (const id of EXAMPLE_NODE_IDS) {
      await canvas.expectStatus(id, 'succeeded');
    }

    // And it does not announce an outcome the user never saw begin. The toast
    // fires on a transition into a terminal state, not on finding one.
    await expect(canvas.toast(/Run finished/)).toBeHidden();
  });

  test('keeps the authored graph across a reload', async ({ page }) => {
    const canvas = new Canvas(page);
    await canvas.open();
    await canvas.loadExample();

    await page.reload();

    // The graph is the user's work and lives in localStorage; run state is the
    // server's and does not.
    await expect(page.locator('.react-flow__node')).toHaveCount(EXAMPLE_NODE_IDS.length);
    await expect(canvas.runStatus).toHaveText('Not run yet');
  });
});
