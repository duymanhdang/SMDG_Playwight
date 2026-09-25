/**
 * helpers/logo.ts
 *
 * Logo-upload and logo-verification helpers for the COMMENT_LOGO test suite.
 * Handles the SAP-fork Playwright (getByRoleUI5) quirks and DOM quirks
 * (LightBox duplicates, aria-hidden on Title, hidden images).
 *
 * Two verify modes:
 *   - verifyLogoDialog         → Requestor / Steward view (getByRoleUI5 Avatar)
 *   - verifyLogoDialogAsApprover → Approver view  (role="button" name="Image")
 */

import { Page, expect } from '@playwright/test';
import path from 'path';

const LOGO_DIR = path.resolve(process.cwd(), 'test-data', 'S4_QAS_MM01_COMMENT_LOGO', 'LOGO');

/**
 * Upload logo via Camera icon -> hidden input[type="file"].
 * Steps:
 *   1. Click add-photo avatar to trigger file dialog.
 *   2. Set file via hidden input.
 *   3. Wait for upload to complete.
 *
 * @param page     - Playwright Page
 * @param fileName - Name of the file in test-data/LOGO/ (e.g. 'valid.jpg')
 */
export async function uploadLogo(page: Page, fileName: string): Promise<void> {
  console.log(`[Logo] Uploading: ${fileName}`);

  const filePath = path.join(LOGO_DIR, fileName);

  // Avatar click triggers native file dialog -> intercept via fileChooser event
  const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 10000 });
  await page.getByRoleUI5('Avatar', { src: 'sap-icon://add-photo' }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(filePath);

  await page.waitForTimeout(2000);
  console.log(`[Logo] Uploaded: ${fileName}`);
}

/**
 * Click the logo-image avatar to open its context menu.
 * Uses .sapFAvatarImage[role="button"][title="Image"] — robust across CR states.
 */
export async function clickLogoAvatar(page: Page): Promise<void> {
  await page.locator('.sapFAvatarImage[role="button"][title="Image"]').first().click();
  await page.waitForTimeout(1000);
}

/**
 * Open logo menu -> View -> verify dialog -> close.
 * Used by Requestor and Steward (same locator pattern).
 *
 * @param page     - Playwright Page
 * @param fileName - Expected file name to verify in dialog
 */
export async function verifyLogoDialog(page: Page, fileName: string): Promise<void> {
  console.log(`[Logo] Verifying logo dialog: ${fileName}`);

  await clickLogoAvatar(page);
  await page.getByRoleUI5('MenuItem', { text: 'View' }).click();
  await page.waitForTimeout(2000);

  await expect(page.locator('img[alt="Logo image"]').first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByRoleUI5('Title').filter({ hasText: fileName }).first()).toBeVisible({ timeout: 10000 });

  await page.getByRoleUI5('Button', { text: 'Close' }).click();
  await page.waitForTimeout(500);
  console.log(`[Logo] Verified: ${fileName}`);
}

/**
 * Open logo menu (approver variant) -> View -> verify dialog -> close.
 * Approver uses a different locator (getByRole button name Image).
 *
 * @param page     - Playwright Page
 * @param fileName - Expected file name to verify in dialog (partial match ok)
 */
export async function verifyLogoDialogAsApprover(page: Page, fileName: string): Promise<void> {
  console.log(`[Logo][Approver] Verifying logo dialog: ${fileName}`);

  await page.getByRole('button', { name: 'Image' }).click();
  await page.getByRoleUI5('MenuItem', { text: 'View' }).click();
  await page.waitForTimeout(3000);

  // .last() targets the most recent LightBox (older ones persist in DOM, marked hidden by UI5 engine)
  const lightBox = page.locator('.sapMLightBox').last();
  await expect(lightBox).toBeAttached({ timeout: 10000 });

  await expect(lightBox.locator('.sapMLightBoxTitle')).toContainText(fileName);
  await lightBox.locator('button:has-text("Close")').click({ force: true });
  await page.waitForTimeout(500);
  console.log(`[Logo][Approver] Verified: ${fileName}`);
}

/**
 * Convenience wrapper: upload + verify in one call.
 * Same as calling uploadLogo() + verifyLogoDialog() sequentially.
 *
 * @param page     - Playwright Page
 * @param fileName - File name in test-data/LOGO/ (e.g. 'valid.jpg')
 */
export async function uploadAndVerifyLogo(page: Page, fileName: string): Promise<void> {
  await uploadLogo(page, fileName);
  await verifyLogoDialog(page, fileName);
}
