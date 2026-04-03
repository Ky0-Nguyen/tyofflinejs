import { test, expect, setOnline, getNetworkStatus } from './fixtures';

test.describe('Network Toggle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="network-panel"]');
  });

  test('should show Online on initial load', async ({ page }) => {
    const status = await getNetworkStatus(page);
    expect(status).toBe('Online');
    await expect(page.getByTestId('network-dot')).toHaveClass(/online/);
  });

  test('should switch to Offline when toggle clicked', async ({ page }) => {
    await page.getByTestId('network-toggle').click();
    await expect(page.getByTestId('network-status')).toHaveText('Offline');
    await expect(page.getByTestId('network-dot')).toHaveClass(/offline/);
  });

  test('should switch back to Online when toggled again', async ({ page }) => {
    await page.getByTestId('network-toggle').click();
    await expect(page.getByTestId('network-status')).toHaveText('Offline');

    await page.getByTestId('network-toggle').click();
    await expect(page.getByTestId('network-status')).toHaveText('Online');
    await expect(page.getByTestId('network-dot')).toHaveClass(/online/);
  });

  test('should handle rapid toggles without breaking', async ({ page }) => {
    for (let i = 0; i < 6; i++) {
      await page.getByTestId('network-toggle').click();
      await page.waitForTimeout(50);
    }
    // After 6 toggles (even number), should be back to Online
    await expect(page.getByTestId('network-status')).toHaveText('Online');
  });

  test('should log network events', async ({ page }) => {
    await page.getByTestId('network-toggle').click();
    await page.waitForTimeout(100);

    const entries = await page.getByTestId('event-log-entry').allTextContents();
    const hasOfflineEvent = entries.some((e) => e.includes('Network: offline'));
    expect(hasOfflineEvent).toBe(true);
  });

  test('should update toggle button text', async ({ page }) => {
    await expect(page.getByTestId('network-toggle')).toHaveText('Go Offline');

    await page.getByTestId('network-toggle').click();
    await expect(page.getByTestId('network-toggle')).toHaveText('Go Online');
  });

  test('should be controllable via window.__test__', async ({ page }) => {
    await setOnline(page, false);
    await expect(page.getByTestId('network-status')).toHaveText('Offline');

    await setOnline(page, true);
    await expect(page.getByTestId('network-status')).toHaveText('Online');
  });
});
