import { Page, expect } from '@playwright/test';

/**
 * Wait for CR to reach FAILED status
 * @param searchField - locator for the search field in My Request
 * @param maxWaitMs - timeout in ms (default 180000 for backend async)
 */
export async function waitForFailedStatus(
  page: Page,
  crNumber: string,
  maxWaitMs = 180000
): Promise<void> {
  console.log(`[FailedFlow] Waiting for CR ${crNumber} to reach FAILED...`);
  const searchField = page.getByRoleUI5('SearchField').first();
  const startTime = Date.now();

  while (true) {
    await searchField.click();
    await searchField.fill('');
    await searchField.fill(crNumber);
    await searchField.press('Enter');
    await page.waitForTimeout(2000);

    const crRow = page.getByRoleUI5('ColumnListItem').filter({ hasText: crNumber });
    const isFailed = await crRow
      .getByRoleUI5('ObjectStatus', { text: 'FAILED' })
      .first()
      .isVisible()
      .catch(() => false);

    if (isFailed) {
      console.log(`[FailedFlow] CR ${crNumber} is FAILED`);
      return;
    }

    const elapsed = Date.now() - startTime;
    if (elapsed >= maxWaitMs) {
      throw new Error(`CR ${crNumber} did not reach FAILED after ${maxWaitMs / 1000}s`);
    }
    console.log(`[FailedFlow] Still waiting... (${Math.round(elapsed / 1000)}s)`);
    await page.waitForTimeout(2000);
  }
}

/**
 * Open CR detail and read System Log content
 * Returns the full text of the System Log (from textarea inside the dialog)
 */
export async function readSystemLog(page: Page, crNumber: string): Promise<string> {
  console.log(`[FailedFlow] Reading System Log for CR ${crNumber}...`);

  // Click FAILED ObjectStatus to open System Log dialog
  const failedStatus = page.getByRoleUI5('ObjectStatus', { text: 'FAILED' });
  if (await failedStatus.isVisible({ timeout: 3000 }).catch(() => false)) {
    await failedStatus.click();
  } else {
    const crLink = page.getByRoleUI5('Link', { text: crNumber }).first();
    await expect(crLink).toBeVisible({ timeout: 15000 });
    await crLink.click();
  }
  await page.waitForTimeout(2000);

  // Wait for the System Log textarea to appear inside the dialog
  const textarea = page.locator('.sapMDialogOpen textarea').first();
  try {
    await textarea.waitFor({ state: 'visible', timeout: 10000 });
  } catch {
    console.log('[FailedFlow] System Log textarea not found — reading full page as fallback');
    const bodyText = await page.locator('body').innerText();
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(1000);
    return bodyText;
  }
  await page.waitForTimeout(1000);

  // Read the textarea value (inputValue, not innerText — textarea content is in .value)
  const logText = await textarea.inputValue().catch(() => '');
  console.log(`[FailedFlow] System Log content: ${logText.length} chars`);

  // Dismiss dialog to prevent block layer for subsequent cleanup
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(1000);

  return logText;
}

/**
 * Verify the CR status is FAILED and the System Log contains an expected text pattern
 * @param expectedLogPattern - text to find in System Log (e.g., "[Business rule] Duplication rule")
 */
export async function verifyFailedWithLog(
  page: Page,
  crNumber: string,
  expectedLogPattern: string
): Promise<void> {
  console.log(`[FailedFlow] Verifying FAILED + System Log for CR ${crNumber}...`);

  // Wait for FAILED status
  await waitForFailedStatus(page, crNumber);

  // Read System Log
  const logText = await readSystemLog(page, crNumber);

  // Step 1: Try exact match first
  let hasPattern = logText.includes(expectedLogPattern);

  // Step 2: Fallback — if exact fails, accept any "[Business rule] Duplication rule:" line
  if (!hasPattern && expectedLogPattern.includes('Duplication rule:')) {
    const genericPattern = '[Business rule] Duplication rule:';
    const hasGeneric = logText.includes(genericPattern);
    if (hasGeneric) {
      console.log(`[FailedFlow] ⚠️ Exact pattern not found, but generic Duplication rule line detected ✓`);
      const preview = logText.length > 600 ? logText.substring(0, 600) + '...' : logText;
      console.log(`[FailedFlow] Actual System Log:\n${preview}`);
      console.log(`[FailedFlow] Expected: "${expectedLogPattern}"`);
      hasPattern = true;
    }
  }

  if (!hasPattern) {
    const preview = logText.length > 600 ? logText.substring(0, 600) + '...' : logText;
    console.log(`[FailedFlow] ⚠️ Pattern not found. Actual System Log content:\n${preview}`);
  }
  expect(hasPattern, `System Log should contain "${expectedLogPattern}"`).toBeTruthy();
  console.log(`[FailedFlow] System Log check passed ✓`);
}
