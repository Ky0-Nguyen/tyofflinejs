import {
  test,
  expect,
  setOnline,
  setBackendMode,
  createTask,
  clickSyncNow,
  getQueueRowCount,
  getEventLogEntries,
} from './fixtures';

test.describe('Conflict Resolution', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="sync-panel"]');
  });

  test('should detect conflict on 409 response', async ({ page }) => {
    await setOnline(page, false);
    await createTask(page, 'Conflict Task');

    await setBackendMode(page, 'conflict');
    await setOnline(page, true);
    await clickSyncNow(page);

    const entries = await getEventLogEntries(page);
    const hasConflict = entries.some((e) => e.includes('Conflict:'));
    expect(hasConflict).toBe(true);
  });

  test('should log conflict details in event log', async ({ page }) => {
    await setOnline(page, false);
    await createTask(page, 'Conflict Detail Task');

    await setBackendMode(page, 'conflict');
    await setOnline(page, true);
    await clickSyncNow(page);

    const entries = await getEventLogEntries(page);
    const conflictEntry = entries.find((e) => e.includes('Conflict:'));
    expect(conflictEntry).toBeDefined();
    expect(conflictEntry).toContain('tasks');
  });

  test('should remove action after conflict resolution with LWW (server newer)', async ({ page }) => {
    await setOnline(page, false);
    await createTask(page, 'LWW Task');
    expect(await getQueueRowCount(page)).toBe(1);

    await setBackendMode(page, 'conflict');
    await setOnline(page, true);
    await clickSyncNow(page);

    // LWW: mock backend returns remote timestamp = Date.now() which is >= local
    // so server wins and action is removed
    expect(await getQueueRowCount(page)).toBe(0);
  });

  test('should show backend mode indicator', async ({ page }) => {
    await page.getByTestId('backend-mode-conflict').click();
    await expect(page.getByTestId('backend-mode-label')).toContainText('conflict');

    await page.getByTestId('backend-mode-none').click();
    await expect(page.getByTestId('backend-mode-label')).toContainText('none');
  });

  test('should switch between backend modes', async ({ page }) => {
    await page.getByTestId('backend-mode-error').click();
    await expect(page.getByTestId('backend-mode-label')).toContainText('error');

    await page.getByTestId('backend-mode-conflict').click();
    await expect(page.getByTestId('backend-mode-label')).toContainText('conflict');

    await page.getByTestId('backend-mode-none').click();
    await expect(page.getByTestId('backend-mode-label')).toContainText('none');
  });

  test('should handle switching from conflict to normal mode', async ({ page }) => {
    await setOnline(page, false);
    await createTask(page, 'Recover Task');

    // First attempt: conflict
    await setBackendMode(page, 'conflict');
    await setOnline(page, true);
    await clickSyncNow(page);

    const entriesAfterConflict = await getEventLogEntries(page);
    expect(entriesAfterConflict.some((e) => e.includes('Conflict:'))).toBe(true);

    // LWW resolves by removing the action (server timestamp is newer)
    expect(await getQueueRowCount(page)).toBe(0);
  });
});
