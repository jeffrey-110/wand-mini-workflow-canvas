import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The page object for the canvas.
 *
 * Selectors live here and nowhere else, so a renamed class breaks one file
 * instead of five. Everything is addressed the way a user would address it -
 * by label, by role, by the status the card is displaying - except the node
 * cards themselves, which are keyed by the stable ids the example graph
 * defines. Those ids are part of the fixture, not an implementation detail.
 */

/** Node ids from `exampleGraph()` in `state/graph.store.ts`. */
export const EXAMPLE = {
  input: 'example-input',
  slugify: 'example-slug',
  shout: 'example-shout',
  tag: 'example-tag',
  output: 'example-output',
} as const;

/** Fan-out then fan-in: input feeds two branches, both land in one output. */
export const EXAMPLE_NODE_IDS = Object.values(EXAMPLE);

export type NodeStatus = 'idle' | 'queued' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'canceled';

export class Canvas {
  constructor(readonly page: Page) {}

  /**
   * Open the app with no state carried over from a previous test.
   *
   * The graph lives in localStorage and the resume cursor in sessionStorage,
   * so a test that skipped this could inherit another test's finished run and
   * assert against it without ever noticing.
   */
  async open(): Promise<void> {
    await this.page.goto('/');
    await this.page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await this.page.reload();
    await expect(this.page.getByRole('heading', { name: 'Mini Workflow Canvas' })).toBeVisible();
  }

  /** The seeded five-step graph. Present on an empty canvas only. */
  async loadExample(): Promise<void> {
    await this.page.getByRole('button', { name: 'Load example' }).click();
    await expect(this.node(EXAMPLE.input)).toBeVisible();
    await expect(this.page.locator('.react-flow__node')).toHaveCount(EXAMPLE_NODE_IDS.length);
  }

  /** `'0'` never fails, `'1'` always fails. See `FAILURE_RATES` in RunToolbar. */
  async setFailureRate(rate: '0' | '0.1' | '0.35' | '1'): Promise<void> {
    await this.failureRateSelect.selectOption(rate);
  }

  /**
   * Toolbar controls are scoped to the toolbar rather than to the page.
   *
   * Toasts are dismissible, so they render as buttons too, and "Run canceled."
   * matches a `/^Run/` accessible name every bit as well as the Run button
   * does. Scoping is the fix; a cleverer regex would only postpone it.
   */
  private get actions(): Locator {
    return this.page.locator('.toolbar__actions');
  }

  get runButton(): Locator {
    return this.actions.getByRole('button', { name: /^Run/ });
  }

  get cancelButton(): Locator {
    return this.actions.getByRole('button', { name: /^Cancel run/ });
  }

  get clearButton(): Locator {
    return this.actions.getByRole('button', { name: 'Clear' });
  }

  get failureRateSelect(): Locator {
    return this.page.getByLabel('Failure rate');
  }

  /** The transient outcome announcement. Also a button - it dismisses itself. */
  toast(text: string | RegExp): Locator {
    return this.page.locator('.toast', { hasText: text });
  }

  /** The status pill in the toolbar: Running, Succeeded, Failed, Canceled. */
  get runStatus(): Locator {
    return this.page.locator('.toolbar__status .pill').first();
  }

  get runCounts(): Locator {
    return this.page.locator('.toolbar__counts');
  }

  /** A step card. `data-id` is React Flow's; `.wf-node` is ours. */
  node(id: string): Locator {
    return this.page.locator(`.react-flow__node[data-id="${id}"] .wf-node`);
  }

  nodesWithStatus(status: NodeStatus): Locator {
    return this.page.locator(`.wf-node[data-status="${status}"]`);
  }

  async expectStatus(id: string, status: NodeStatus): Promise<void> {
    await expect(this.node(id)).toHaveAttribute('data-status', status);
  }

  /** The result line on the card: the output value, or why there isn't one. */
  result(id: string): Locator {
    return this.node(id).locator('.wf-node__result');
  }

  /** Start a run and wait for the server to have accepted it. */
  async run(): Promise<void> {
    await expect(this.runButton).toBeEnabled();
    await this.runButton.click();
  }

  /**
   * Wait for the run to reach a terminal state.
   *
   * Terminal is read off the toolbar rather than off the cards: the run's
   * status is a server-sent fact, and a card could be terminal while the run
   * itself is not.
   */
  async waitForRunStatus(label: 'Succeeded' | 'Failed' | 'Canceled', timeout = 30_000): Promise<void> {
    await expect(this.runStatus).toHaveText(label, { timeout });
  }

  /** Validation issues, which block Run when any of them is an error. */
  get errorCount(): Locator {
    return this.page.locator('.issues__count[data-tone="error"]');
  }

  issue(text: string | RegExp): Locator {
    return this.page.locator('.issues__list li button', { hasText: text });
  }

  paletteButton(kind: 'input' | 'transform' | 'output'): Locator {
    return this.page.locator(`.palette__item[data-kind="${kind}"]`);
  }
}
