import { expect, test } from '@playwright/test';

import { Canvas } from './canvas.ts';

/**
 * Validation, which is an error surface rather than an error.
 *
 * Two severities: errors block Run because the run could not produce a
 * meaningful result, warnings never block because the author might well have
 * meant it. Collapsing those into one wall of red is the easy mistake, and the
 * point of testing it here is that the *blocking* half is enforced in the UI
 * and not only in the API.
 */
test.describe('validation', () => {
  test('blocks Run while the graph has errors, and says how many', async ({ page }) => {
    const canvas = new Canvas(page);
    await canvas.open();

    // A lone Transform: no Input to start from, no Output to land in, and
    // nothing feeding it. Three errors, all of them blocking.
    await canvas.paletteButton('transform').click();

    await expect(canvas.errorCount).toBeVisible();
    await expect(canvas.runButton).toBeDisabled();
    await expect(canvas.issue(/needs at least one Input step/)).toBeVisible();
    await expect(canvas.issue(/needs at least one Output step/)).toBeVisible();
    await expect(canvas.issue(/has nothing feeding into it/)).toBeVisible();
  });

  test('enables Run once the errors are resolved', async ({ page }) => {
    const canvas = new Canvas(page);
    await canvas.open();
    await canvas.paletteButton('transform').click();
    await expect(canvas.runButton).toBeDisabled();

    // The example graph is valid, so loading it clears every error at once.
    await canvas.clearButton.click();
    await canvas.loadExample();

    await expect(canvas.errorCount).toBeHidden();
    await expect(canvas.runButton).toBeEnabled();
  });

  test('shows warnings without blocking the run', async ({ page }) => {
    const canvas = new Canvas(page);
    await canvas.open();
    await canvas.loadExample();

    // An extra Input is unwired: one warning, no errors. It has to be an Input
    // rather than a Transform, because a Transform with nothing upstream can
    // never run, and that is an error by design.
    await canvas.paletteButton('input').click();

    await expect(canvas.issue(/isn.t connected to anything downstream/)).toBeVisible();
    await expect(canvas.errorCount).toBeHidden();
    await expect(canvas.runButton).toBeEnabled();
  });
});
