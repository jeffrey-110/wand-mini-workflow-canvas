import { expect, test } from '@playwright/test';

import { Canvas, EXAMPLE } from './canvas.ts';

/**
 * The failure path.
 *
 * The distinction being tested is `failed` versus `skipped`. One step broke;
 * the rest were collateral, and a person reading the canvas needs to know
 * which is which before anything else. The scheduler's unit tests already
 * prove the propagation rule. What they cannot prove is that the browser
 * *shows* it, which is the half that was broken once already.
 *
 * Determinism comes from the 100% failure rate. `failNodeIds`, which would let
 * a test nominate the node that fails, is deliberately not accepted over HTTP
 * - a browser must not be able to script which steps break - so the one
 * scenario left to the unit tests is a failure in one branch while an
 * unrelated branch runs to completion. See `apps/api/src/runs/scheduler.test.ts`.
 */
test.describe('a failing run', () => {
  test('fails the step and skips everything downstream of it', async ({ page }) => {
    const canvas = new Canvas(page);
    await canvas.open();
    await canvas.loadExample();
    await canvas.setFailureRate('1');
    await canvas.run();

    await canvas.waitForRunStatus('Failed');

    // The input is the only node that gets to run: nothing downstream of a
    // failure can ever receive an input, so the rest are retired unrun.
    await canvas.expectStatus(EXAMPLE.input, 'failed');
    for (const id of [EXAMPLE.slugify, EXAMPLE.shout, EXAMPLE.tag, EXAMPLE.output]) {
      await canvas.expectStatus(id, 'skipped');
    }

    await expect(canvas.nodesWithStatus('failed')).toHaveCount(1);
    await expect(canvas.nodesWithStatus('skipped')).toHaveCount(4);
  });

  test('says why each step ended the way it did', async ({ page }) => {
    const canvas = new Canvas(page);
    await canvas.open();
    await canvas.loadExample();
    await canvas.setFailureRate('1');
    await canvas.run();
    await canvas.waitForRunStatus('Failed');

    await expect(canvas.result(EXAMPLE.input)).toContainText('failed while executing');
    // Not "failed". The wording is the feature.
    await expect(canvas.result(EXAMPLE.output)).toHaveText('Upstream step failed');
  });

  test('counts the failures and skips in the toolbar', async ({ page }) => {
    const canvas = new Canvas(page);
    await canvas.open();
    await canvas.loadExample();
    await canvas.setFailureRate('1');
    await canvas.run();
    await canvas.waitForRunStatus('Failed');

    await expect(canvas.runCounts).toHaveText(/5\/5 steps/);
    await expect(canvas.runCounts).toHaveText(/1 failed/);
    await expect(canvas.runCounts).toHaveText(/4 skipped/);
  });

  test('announces the outcome once the run settles', async ({ page }) => {
    const canvas = new Canvas(page);
    await canvas.open();
    await canvas.loadExample();
    await canvas.setFailureRate('1');
    await canvas.run();

    await expect(canvas.toast(/Run failed/)).toBeVisible({ timeout: 30_000 });
  });

  test('lets the graph be edited again after a failure', async ({ page }) => {
    const canvas = new Canvas(page);
    await canvas.open();
    await canvas.loadExample();
    await canvas.setFailureRate('1');
    await canvas.run();
    await canvas.waitForRunStatus('Failed');

    // A failed run is a settled run: the lock is on execution, not on failure.
    await expect(canvas.paletteButton('transform')).toBeEnabled();
    await expect(canvas.runButton).toBeEnabled();
  });
});
