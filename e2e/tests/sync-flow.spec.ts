import {
  test,
  expect,
  setOnline,
  setBackendMode,
  createTask,
  clickSyncNow,
  getQueueRowCount,
  getSyncStatus,
} from './fixtures';

test.describe('Sync Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="sync-panel"]');
  });

  test('should show idle sync status initially', async ({ page }) => {
    const status = await getSyncStatus(page);
    expect(status).toBe('idle');
  });

  test('should sync actions when going from offline to online', async ({ page }) => {
    await setOnline(page, false);
    await createTask(page, 'Offline Sync Task');
    expect(await getQueueRowCount(page)).toBe(1);

    await setOnline(page, true);
    await page.waitForTimeout(500);

    expect(await getQueueRowCount(page)).toBe(0);
  });

  test('should sync actions via Sync Now button', async ({ page }) => {
    await setOnline(page, false);
    await createTask(page, 'Manual Sync Task');
    expect(await getQueueRowCount(page)).toBe(1);

    await setOnline(page, true);
    await clickSyncNow(page);

    expect(await getQueueRowCount(page)).toBe(0);
  });

  test('should show failed status when sync fails', async ({ page }) => {
    await setOnline(page, false);
    await createTask(page, 'Fail Task');

    await setBackendMode(page, 'error');
    await setOnline(page, true);
    await clickSyncNow(page);

    const row = page.locator('[data-testid^="queue-row-"]').first();
    await expect(row.locator('.status-badge')).toContainText('failed');
  });

  test('should increment retry count on failure', async ({ page }) => {
    await setOnline(page, false);
    await createTask(page, 'Retry Task');

    await setBackendMode(page, 'error');
    await setOnline(page, true);
    await clickSyncNow(page);

    const row = page.locator('[data-testid^="queue-row-"]').first();
    const retryText = await row.locator('td').nth(5).textContent();
    // retryCount >= 1 (auto-sync on reconnect + manual sync both fail)
    expect(retryText).toMatch(/[1-3]\/3/);
  });

  test('should retry failed actions when Retry Failed clicked', async ({ page }) => {
    await setOnline(page, false);
    await createTask(page, 'Retry Me');

    await setBackendMode(page, 'error');
    await setOnline(page, true);
    await clickSyncNow(page);

    const row = page.locator('[data-testid^="queue-row-"]').first();
    await expect(row.locator('.status-badge')).toContainText('failed');

    await setBackendMode(page, 'none');
    await page.getByTestId('queue-retry-btn').click();
    // Backoff delay is exponential: 1000 * 2^retryCount; need enough time
    await page.waitForTimeout(6000);

    expect(await getQueueRowCount(page)).toBe(0);
  });

  test('should log sync events', async ({ page }) => {
    await setOnline(page, false);
    await createTask(page, 'Event Log Task');

    await setOnline(page, true);
    await clickSyncNow(page);

    const entries = await page.getByTestId('event-log-entry').allTextContents();
    const hasSyncStart = entries.some((e) => e.includes('Sync started'));
    const hasSyncComplete = entries.some((e) => e.includes('Sync complete'));
    expect(hasSyncStart).toBe(true);
    expect(hasSyncComplete).toBe(true);
  });

  test('should show Never for last sync initially', async ({ page }) => {
    await expect(page.getByTestId('sync-last-time')).toHaveText('Never');
  });

  test('should update last sync time after successful sync', async ({ page }) => {
    await setOnline(page, false);
    await createTask(page, 'Time Task');
    await setOnline(page, true);
    await clickSyncNow(page);

    const lastSync = await page.getByTestId('sync-last-time').textContent();
    expect(lastSync).not.toBe('Never');
  });
});
