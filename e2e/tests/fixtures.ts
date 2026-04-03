import { test as base, expect, type Page } from '@playwright/test';

export const test = base;
export { expect };

export async function setOnline(page: Page, value: boolean) {
  await page.evaluate((v) => window.__test__.network.setOnline(v), value);
  await page.waitForTimeout(100);
}

export async function setBackendMode(page: Page, mode: 'none' | 'error' | 'conflict') {
  await page.evaluate((m) => window.__test__.backend.setFailMode(m), mode);
}

export async function createTask(page: Page, title: string) {
  await page.getByTestId('entity-title-input').fill(title);
  await page.getByTestId('entity-create-btn').click();
  await page.waitForTimeout(100);
}

export async function clickSyncNow(page: Page) {
  await page.getByTestId('sync-now-btn').click();
  await page.waitForTimeout(300);
}

export async function getQueueRowCount(page: Page): Promise<number> {
  const rows = page.locator('[data-testid^="queue-row-"]');
  return rows.count();
}

export async function getNetworkStatus(page: Page): Promise<string> {
  return (await page.getByTestId('network-status').textContent()) ?? '';
}

export async function getSyncStatus(page: Page): Promise<string> {
  return (await page.getByTestId('sync-status').textContent()) ?? '';
}

export async function getEventLogEntries(page: Page): Promise<string[]> {
  const entries = page.getByTestId('event-log-entry');
  return entries.allTextContents();
}

export async function getQueueBadge(page: Page): Promise<string> {
  return (await page.getByTestId('queue-badge').textContent()) ?? '0';
}
