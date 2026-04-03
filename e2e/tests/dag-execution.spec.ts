import { test, expect, setOnline, setBackendMode } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('[data-testid="dag-panel"]');
});

test.describe('DAG Execution Engine', () => {
  test('creates Item→SubItem→SubSubItem chain and enqueues all actions', async ({ page }) => {
    await setOnline(page, false);
    await page.getByTestId('dag-create-chain-btn').click();
    await page.waitForTimeout(300);

    const logEntries = await page.getByTestId('dag-log-entry').allTextContents();
    expect(logEntries.some((e) => e.includes('Enqueueing Item'))).toBe(true);
    expect(logEntries.some((e) => e.includes('Enqueueing SubItem'))).toBe(true);
    expect(logEntries.some((e) => e.includes('Enqueueing SubSubItem'))).toBe(true);

    const queueRows = await page.locator('[data-testid^="queue-row-"]').count();
    expect(queueRows).toBeGreaterThanOrEqual(3);
  });

  test('syncs chain in correct dependency order with temp ID resolution', async ({ page }) => {
    await setOnline(page, false);
    await page.getByTestId('dag-create-chain-btn').click();
    await page.waitForTimeout(300);

    // Set online and immediately DAG-sync in one atomic call to prevent
    // the network subscriber from auto-syncing with the flat SyncManager.
    await page.evaluate(async () => {
      window.__test__.network.setOnline(true);
      await window.__test__.engine.syncWithDeps();
    });
    await page.waitForTimeout(200);

    // Click the UI sync button to read results into the panel state
    await page.getByTestId('dag-sync-btn').click();
    await page.waitForTimeout(300);

    await expect(page.getByTestId('dag-result')).toBeVisible();

    const logEntries = await page.getByTestId('dag-log-entry').allTextContents();
    expect(logEntries.some((e) => e.includes('Temp ID mappings:'))).toBe(true);

    // Check that the resolver has mappings via page.evaluate
    const mappings = await page.evaluate(() => {
      const map = window.__test__.engine.executionEngine.getResolver().getMap();
      return Object.fromEntries(map);
    });
    expect(mappings['tmp-item-1']).toBeDefined();
    expect(mappings['tmp-sub-1']).toBeDefined();
    expect(mappings['tmp-subsub-1']).toBeDefined();
    expect(mappings['tmp-item-1']).toMatch(/^srv-/);
  });

  test('blocks dependent actions when parent fails', async ({ page }) => {
    await setOnline(page, false);
    await page.getByTestId('dag-create-chain-btn').click();
    await page.waitForTimeout(300);

    await setBackendMode(page, 'error');
    await setOnline(page, true);
    await page.getByTestId('dag-sync-btn').click();
    await page.waitForTimeout(500);

    await expect(page.getByTestId('dag-result')).toBeVisible();

    const blockedText = await page.getByTestId('dag-blocked').textContent();
    expect(parseInt(blockedText?.match(/\d+/)?.[0] ?? '0')).toBeGreaterThan(0);
  });

  test('queue shows actions while offline', async ({ page }) => {
    await setOnline(page, false);
    await page.getByTestId('dag-create-chain-btn').click();
    await page.waitForTimeout(300);

    const badge = await page.getByTestId('queue-badge').textContent();
    expect(parseInt(badge ?? '0')).toBeGreaterThanOrEqual(3);
  });

  test('temp ID mappings persist after sync', async ({ page }) => {
    await setOnline(page, false);
    await page.getByTestId('dag-create-chain-btn').click();
    await page.waitForTimeout(300);

    await page.evaluate(async () => {
      window.__test__.network.setOnline(true);
      await window.__test__.engine.syncWithDeps();
    });
    await page.waitForTimeout(200);

    const mappings = await page.evaluate(() => {
      const map = window.__test__.engine.executionEngine.getResolver().getMap();
      return Object.fromEntries(map);
    });

    expect(Object.keys(mappings).length).toBeGreaterThanOrEqual(3);
    expect(mappings['tmp-item-1']).toMatch(/^srv-/);
    expect(mappings['tmp-sub-1']).toMatch(/^srv-/);
    expect(mappings['tmp-subsub-1']).toMatch(/^srv-/);
  });

  test('queue is cleared after successful DAG sync', async ({ page }) => {
    await setOnline(page, false);
    await page.getByTestId('dag-create-chain-btn').click();
    await page.waitForTimeout(300);

    const beforeCount = await page.locator('[data-testid^="queue-row-"]').count();
    expect(beforeCount).toBeGreaterThanOrEqual(3);

    await page.evaluate(async () => {
      window.__test__.network.setOnline(true);
      await window.__test__.engine.syncWithDeps();
    });
    await page.waitForTimeout(300);

    const afterCount = await page.locator('[data-testid^="queue-row-"]').count();
    expect(afterCount).toBeLessThan(beforeCount);
  });

  test('clear button resets DAG panel state', async ({ page }) => {
    await setOnline(page, false);
    await page.getByTestId('dag-create-chain-btn').click();
    await page.waitForTimeout(200);

    await page.getByTestId('dag-clear-btn').click();

    const entries = await page.getByTestId('dag-log-entry').count();
    expect(entries).toBe(0);
  });
});
