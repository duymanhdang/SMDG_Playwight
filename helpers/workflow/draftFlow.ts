/**
 * helpers/draftFlow.ts
 *
 * Save-Draft and Reopen-Draft helpers for the COMMENT_LOGO suite (TC-04).
 * Extracted from cl-e2e-mm-02 inline logic to be reusable.
 *
 * The SAP UI5 fork intercepts locators with visibility checks, so we use
 * direct CSS locators for the BDI-content buttons and the table-body rows.
 */

import { Page } from '@playwright/test';

/**
 * Click "Save as Draft" in the CR form footer and confirm via "Yes" dialog.
 *
 * @param page - Playwright Page (on the Copy-Request form)
 */
export async function saveDraft(page: Page): Promise<void> {
  console.log('[Draft] Clicking Save as Draft...');

  const saveAsDraftBtn = page
    .locator('[id$="BDI-content"]')
    .filter({ hasText: /save.*draft/i });
  await saveAsDraftBtn.waitFor({ state: 'visible', timeout: 10000 });
  await saveAsDraftBtn.click();

  await page.getByRole('button', { name: 'Yes' }).click();
  await page.waitForTimeout(3000);
  console.log('[Draft] Confirmed Save as Draft');
}

/**
 * Click "See Drafts" and select the most recent (last) draft row.
 *
 * @param page - Playwright Page (after save-draft succeeded)
 */
export async function reopenLatestDraft(page: Page): Promise<void> {
  console.log('[Draft] Clicking See Drafts...');

  const seeDraftsBtn = page
    .locator('[id$="BDI-content"]')
    .filter({ hasText: /see.*drafts/i });
  await seeDraftsBtn.waitFor({ state: 'visible', timeout: 10000 });
  await seeDraftsBtn.click();
  await page.waitForTimeout(3000);

  // Select most recent draft (last row in the table)
  const tableBody = page.locator('[id$="-table-tblBody"]');
  const rows = tableBody.locator('tr.sapMLIB');
  const count = await rows.count();
  console.log(`[Draft] Found ${count} draft rows`);

  if (count > 0) {
    await rows.nth(count - 1).click();
  } else {
    await page.locator('[id$="cell0"]').last().click();
  }
  await page.waitForTimeout(3000);
  console.log('[Draft] Draft reopened successfully');
}
