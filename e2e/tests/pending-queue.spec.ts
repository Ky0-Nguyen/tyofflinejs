import {
  test,
  expect,
  setOnline,
  createTask,
  getQueueRowCount,
  getQueueBadge,
} from './fixtures';

test.describe('Pending Queue', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="queue-panel"]');
    await setOnline(page, false);
  });

  test('should show empty queue initially', async ({ page }) => {
    await expect(page.getByTestId('queue-table')).toContainText('Queue is empty');
  });

  test('should add action to queue when creating entity while offline', async ({ page }) => {
    await createTask(page, 'Offline Task 1');

    const count = await getQueueRowCount(page);
    expect(count).toBe(1);
    const badge = await getQueueBadge(page);
    expect(badge).toBe('1');
  });

  test('should show correct action type in queue', async ({ page }) => {
    await createTask(page, 'Typed Task');

    const row = page.locator('[data-testid^="queue-row-"]').first();
    await expect(row.locator('.type-badge')).toContainText('create');
  });

  test('should queue multiple actions', async ({ page }) => {
    await createTask(page, 'Task A');
    await createTask(page, 'Task B');
    await createTask(page, 'Task C');

    const count = await getQueueRowCount(page);
    expect(count).toBe(3);
    const badge = await getQueueBadge(page);
    expect(badge).toBe('3');
  });

  test('should clear queue when Clear Queue clicked', async ({ page }) => {
    await createTask(page, 'Task to clear');
    const count = await getQueueRowCount(page);
    expect(count).toBe(1);

    await page.getByTestId('queue-clear-btn').click();
    await page.waitForTimeout(100);

    await expect(page.getByTestId('queue-table')).toContainText('Queue is empty');
    const badge = await getQueueBadge(page);
    expect(badge).toBe('0');
  });

  test('should show pending status for offline actions', async ({ page }) => {
    await createTask(page, 'Pending Task');

    const row = page.locator('[data-testid^="queue-row-"]').first();
    await expect(row.locator('.status-badge')).toContainText('pending');
  });

  test('should log queue events in event log', async ({ page }) => {
    await createTask(page, 'Logged Task');

    const entries = await page.getByTestId('event-log-entry').allTextContents();
    const hasQueueEvent = entries.some((e) => e.includes('Queued:'));
    expect(hasQueueEvent).toBe(true);
  });
});
