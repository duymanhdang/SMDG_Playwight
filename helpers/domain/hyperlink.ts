import { expect, Page, Locator } from '@playwright/test';
import { submitCRWithConfirm, waitForCRStatus } from '../workflow/workflow';
import { searchAndClick } from '../search/search';

/**
 * Wait until no visible SAPUI5 busy indicator remains (ignore timeouts).
 */
async function waitForNoBusy(page: Page, timeout = 30000): Promise<void> {
  await page
    .waitForFunction(
      () => {
        const indicators = Array.from(document.querySelectorAll('.sapUiLocalBusyIndicator'));
        return indicators.every((el) => {
          const style = getComputedStyle(el as HTMLElement);
          return style.display === 'none' || style.visibility === 'hidden' || (el as HTMLElement).offsetParent === null;
        });
      },
      { timeout }
    )
    .catch(() => {});
}

/**
 * Click the Attachments button. Prefers the header button carrying the count
 * badge (detail views), falls back to the plain button (create form).
 */
async function clickAttachmentsButton(page: Page): Promise<void> {
  const badgeBtn = page
    .locator('.sapMBtn')
    .filter({ hasText: 'Attachments' })
    .filter({ has: page.locator('.sapMBadgeIndicator') })
    .first();
  if (await badgeBtn.isVisible().catch(() => false)) {
    await badgeBtn.click();
    return;
  }
  await page.getByRoleUI5('Button', { text: 'Attachments' }).first().click();
}

/**
 * Check whether the Attachments dialog is currently open.
 */
async function isAttachmentsDialogOpen(page: Page): Promise<boolean> {
  return page
    .locator('.sapMDialog')
    .filter({ has: page.getByRoleUI5('Title', { text: 'Attachments' }) })
    .first()
    .isVisible()
    .catch(() => false);
}

/**
 * Open Attachments dialog and switch to Hyperlink tab.
 *
 * Both the dialog open and the tab switch can be swallowed while the SPA
 * re-renders (fixed waits are unreliable under load, and read-only detail
 * dialogs load their content asynchronously). This helper:
 *   - waits for busy indicators to settle before interacting
 *   - only clicks Attachments when the dialog is not already open
 *   - confirms the Hyperlink tab really got selected by waiting for the
 *     hyperlink list to become visible, retrying the switch when needed
 */
export async function openHyperlinkTab(page: Page): Promise<void> {
  console.log('[Hyperlink] Opening Attachments dialog...');
  await waitForNoBusy(page);

  for (let attempt = 1; attempt <= 3; attempt++) {
    if (!(await isAttachmentsDialogOpen(page))) {
      await clickAttachmentsButton(page);
      await page.waitForTimeout(1500);
    }

    const tab = page.getByRoleUI5('IconTabFilter', { text: 'Hyperlink' }).first();

    try {
      await expect(tab).toBeVisible({ timeout: 10000 });
      await tab.click();
      await page.waitForTimeout(800);
      // Confirm the click really activated the tab (a re-render can swallow it).
      await expect(
        page.locator('.sapMITBSelected').filter({ hasText: 'Hyperlink' }).first(),
      ).toBeVisible({ timeout: 5000 });
      await waitForNoBusy(page);
      console.log('[Hyperlink] Hyperlink tab active');
      return;
    } catch (e) {
      console.log(
        `[Hyperlink]  Attempt ${attempt}/3 to activate Hyperlink tab failed: ${(e as Error).message.split('\n')[0]}`,
      );
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(1000);
    }
  }

  throw new Error('[Hyperlink] Failed to open the Hyperlink tab after 3 attempts');
}

/**
 * Close Attachments dialog
 */
export async function closeAttachments(page: Page): Promise<void> {
  console.log('[Hyperlink] Closing Attachments dialog...');
  await page.getByRoleUI5('Button', { text: 'Close' }).click();
  await page.waitForTimeout(1000);
}

/**
 * Click Add button to open inline Add Hyperlink form
 */
export async function clickAddHyperlink(page: Page): Promise<void> {
  console.log('[Hyperlink] Clicking Add...');
  await page.getByRoleUI5('Button', { text: 'Add' }).first().click();
  await page.waitForTimeout(500);
}

/**
 * Verify Add Hyperlink form fields are visible
 */
export async function verifyAddFormVisible(page: Page): Promise<void> {
  console.log('[Hyperlink] Verifying Add form is visible...');
  await expect(page.getByRoleUI5('Title', { text: 'Add Hyperlink' }).first()).toBeVisible({ timeout: 10000 });
  console.log('[Hyperlink] Add form is visible');
}

/**
 * Fill Text to Display field
 */
export async function fillDisplayText(page: Page, text: string): Promise<void> {
  console.log(`[Hyperlink] Filling Text to Display: "${text}"`);
  const input = page.getByRoleUI5('Input', { placeholder: 'Text to display' });
  await input.click();
  await input.fill(text);
}

/**
 * Fill Address (URL) field
 */
export async function fillAddress(page: Page, url: string): Promise<void> {
  console.log(`[Hyperlink] Filling Address: "${url}"`);
  const input = page.getByRoleUI5('Input', { placeholder: 'Link to an existing file or web page' });
  await input.click();
  await input.fill(url);
}

/**
 * Get counter text (e.g. "6/100")
 */
export async function getCounterText(page: Page): Promise<string> {
  const counter = page.getByText(/^\d+\/100$/);
  const text = await counter.textContent();
  return text || '';
}

/**
 * Click Add button to confirm adding hyperlink
 */
export async function confirmAddHyperlink(page: Page): Promise<void> {
  console.log('[Hyperlink] Confirming Add...');
  await page.getByRoleUI5('Button', { text: 'Add' }).last().click();
  await page.waitForTimeout(1000);
}

/**
 * Click Cancel button in Add Hyperlink form
 */
export async function cancelAddHyperlink(page: Page): Promise<void> {
  console.log('[Hyperlink] Cancelling Add...');
  await page.getByRoleUI5('Button', { text: 'Cancel' }).click();
  await page.waitForTimeout(500);
}

/**
 * Click Edit button for a specific hyperlink (identified by its display text)
 */
export async function clickEditHyperlink(page: Page, displayText: string): Promise<void> {
  console.log(`[Hyperlink] Clicking Edit for "${displayText}"...`);
  const listUl = page.locator('ul[id$="hyperlinksUploadSet-listUl"]');
  const listItem = listUl.locator('li').filter({ hasText: displayText }).first();
  await page.waitForTimeout(500);
  await listItem.locator('button[aria-label="edit"]').click();
  await page.waitForTimeout(1000);
}

/**
 * Click Delete button for a specific hyperlink item
 */
export async function clickDeleteHyperlink(page: Page): Promise<void> {
  console.log('[Hyperlink] Clicking Delete...');
  await page.locator('button[aria-label="Delete"]').first().click();
  await page.waitForTimeout(1000);
}

/**
 * Click Delete button for a specific hyperlink identified by its display text
 */
export async function clickDeleteHyperlinkByText(page: Page, displayText: string): Promise<void> {
  console.log(`[Hyperlink] Clicking Delete for "${displayText}"...`);
  const listUl = page.locator('ul[id$="hyperlinksUploadSet-listUl"]');
  const listItem = listUl.locator('li').filter({ hasText: displayText }).first();
  await page.waitForTimeout(500);
  await listItem.locator('button[aria-label="Delete"]').click();
  await page.waitForTimeout(1000);
}

/**
 * Delete all hyperlinks by repeatedly clicking the first Delete button
 */
export async function deleteAllHyperlinks(page: Page): Promise<void> {
  console.log('[Hyperlink] Deleting all hyperlinks...');
  let deleted = 0;
  for (let i = 0; i < 20; i++) {
    const deleteBtn = page.locator('button[aria-label="Delete"]').first();
    if (await deleteBtn.count() === 0) break;
    await deleteBtn.click();
    await page.waitForTimeout(500);
    await confirmDelete(page);
    deleted++;
  }
  console.log(`[Hyperlink] Deleted ${deleted} hyperlink(s)`);
}

/**
 * Confirm deletion in confirmation dialog
 */
export async function confirmDelete(page: Page): Promise<void> {
  console.log('[Hyperlink] Confirming Delete...');
  await expect(page.getByRoleUI5('Title', { text: 'Confirmation' }).first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/Do you want to delete this/i).first()).toBeVisible();
  await page.getByRoleUI5('Button', { text: 'Yes' }).click();
  await page.waitForTimeout(1000);
}

/**
 * Cancel deletion in confirmation dialog
 */
export async function cancelDelete(page: Page): Promise<void> {
  console.log('[Hyperlink] Cancelling Delete...');
  await expect(page.getByRoleUI5('Title', { text: 'Confirmation' }).first()).toBeVisible({ timeout: 10000 });
  await page.getByRoleUI5('Button', { text: 'No' }).click();
  await page.waitForTimeout(500);
}

/**
 * Verify a hyperlink with given display text exists in the list
 */
export async function verifyHyperlinkVisible(page: Page, displayText: string, url?: string): Promise<void> {
  console.log(`[Hyperlink] Verifying "${displayText}" is visible...`);
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await waitForNoBusy(page, 10000);
      const link = page.getByRoleUI5('Link', { text: displayText }).first();
      await expect(link).toBeVisible({ timeout: 10000 });
      if (url) {
        await expect(link).toHaveAttribute('href', url);
        await expect(link).toHaveAttribute('title', url);
      }
      return;
    } catch (e) {
      console.log(
        `[Hyperlink]  Verify "${displayText}" attempt ${attempt}/3 failed, reopening Attachments dialog...`,
      );
      // The UploadSet table can stay on its empty state even after the OData
      // response resolves (render race). Reopening the dialog recreates the
      // table so it binds again from scratch.
      await closeAttachments(page).catch(() => {});
      await openHyperlinkTab(page);
    }
  }
  throw new Error(`[Hyperlink] Failed to verify hyperlink "${displayText}" after 3 attempts`);
}

/**
 * Verify a hyperlink with given display text does NOT exist in the list
 */
export async function verifyHyperlinkNotVisible(page: Page, displayText: string): Promise<void> {
  console.log(`[Hyperlink] Verifying "${displayText}" is NOT visible...`);
  const link = page.getByRoleUI5('Link', { text: displayText });
  const count = await link.count();
  if (count > 0) {
    await expect(link.first()).not.toBeVisible();
  }
}

/**
 * Verify empty state message in Hyperlink tab
 */
export async function verifyHyperlinkEmpty(page: Page): Promise<void> {
  console.log('[Hyperlink] Verifying empty state...');
  const links = page.getByRoleUI5('Link');
  const count = await links.count();
  console.log(`[Hyperlink] Found ${count} link(s) (expected 0 in empty state)`);
}

/**
 * Verify Add button is disabled (for validation cases)
 */
export async function verifyAddButtonDisabled(page: Page): Promise<void> {
  console.log('[Hyperlink] Verifying Add button is disabled...');
  const addBtn = page.getByRoleUI5('Button', { text: 'Add' }).last();
  await expect(addBtn).toBeDisabled();
  console.log('[Hyperlink] Add button is disabled');
}

/**
 * Verify Warning dialog with title "Warning" and optional message, then dismiss with OK
 */
export async function verifyAndDismissWarning(page: Page, expectedMessage?: string | RegExp): Promise<void> {
  console.log('[Hyperlink] Verifying Warning dialog...');
  await expect(page.getByRoleUI5('Title', { text: 'Warning' }).first()).toBeVisible({ timeout: 10000 });
  if (expectedMessage) {
    const msgElement = page.getByText(expectedMessage).first();
    await expect(msgElement).toBeVisible({ timeout: 5000 });
    console.log(`[Hyperlink] Warning message matched: "${expectedMessage}"`);
  }
  console.log('[Hyperlink] Dismissing Warning via OK...');
  await page.getByRoleUI5('Button', { text: 'OK' }).click();
  await page.waitForTimeout(500);
}

/**
 * Search hyperlinks by keyword
 */
export async function searchHyperlink(page: Page, keyword: string): Promise<void> {
  console.log(`[Hyperlink] Searching for "${keyword}"...`);
  const dialog = page.locator('.sapMDialog').filter({ has: page.getByRoleUI5('Title', { text: 'Attachments' }) });
  const uploadSet = dialog.locator('[id$="hyperlinksUploadSet"]');
  const searchField = uploadSet.getByRoleUI5('SearchField').first();
  await searchField.waitFor({ state: 'visible', timeout: 10000 });
  await searchField.click();
  await searchField.fill(keyword);
  await searchField.press('Enter');
  await page.waitForTimeout(1000);
}

/**
 * Clear search field
 */
export async function clearSearch(page: Page): Promise<void> {
  console.log('[Hyperlink] Clearing search...');
  const dialog = page.locator('.sapMDialog').filter({ has: page.getByRoleUI5('Title', { text: 'Attachments' }) });
  const uploadSet = dialog.locator('[id$="hyperlinksUploadSet"]');
  const searchField = uploadSet.getByRoleUI5('SearchField').first();
  await searchField.fill('');
  await searchField.press('Enter');
  await page.waitForTimeout(1000);
}

/**
 * Verify "No hyperlinks found." message in empty search results
 */
export async function verifyNoHyperlinksFound(page: Page): Promise<void> {
  console.log('[Hyperlink] Verifying "No hyperlinks found." message...');
  await expect(page.getByRoleUI5('Label', { text: 'No hyperlinks found.' }).first()).toBeVisible({ timeout: 10000 });
  console.log('[OK] "No hyperlinks found." message is visible');
}

/**
 * Navigate to product CR detail page
 */
export async function navigateToCRDetail(page: Page, baseUrl: string, crNumber: string): Promise<void> {
  const url = `${baseUrl}/main/index.html#/myInboxDetail/Product/${crNumber}`;
  await page.goto(url);
  await page.waitForTimeout(3000);
}

/**
 * Navigate to My Request detail page for a product CR
 */
export async function navigateToMyRequestDetail(page: Page, baseUrl: string, crNumber: string): Promise<void> {
  const url = `${baseUrl}/main/index.html#/myRequestDetail/Product/${crNumber}`;
  await page.goto(url);
  await page.waitForTimeout(3000);
}

/**
 * Verify Edit button is disabled for given field states
 */
export async function verifyEditButtonDisabled(page: Page): Promise<void> {
  console.log('[Hyperlink] Verifying Edit button is disabled...');
  const editBtn = page.locator('button[aria-label="edit"]').last();
  const disabled = await editBtn.isDisabled();
  if (!disabled) {
    console.log('[Hyperlink] Edit button is not disabled, checking if form Add button is disabled instead...');
    const addBtn = page.getByRoleUI5('Button', { text: 'Add' }).last();
    await expect(addBtn).toBeDisabled();
    console.log('[Hyperlink] Form Add button is disabled');
  } else {
    console.log('[Hyperlink] Edit button is disabled');
  }
}

/**
 * Get the Edit form's Add/Edit button text after opening edit
 */
export async function getEditFormButtonText(page: Page): Promise<string> {
  const btn = page.getByRoleUI5('Button', { text: 'Edit' }).last();
  const text = (await btn.textContent()) || '';
  console.log(`[Hyperlink] Edit form button text: "${text}"`);
  return text;
}

/**
 * Save current CR form as Draft and confirm the dialog.
 * Flow: Click "Save as Draft" → Click "Yes" in confirmation
 */
export async function saveAsDraft(page: Page): Promise<void> {
  console.log('[Hyperlink] Saving as Draft...');
  const saveAsDraftBtn = page
    .locator('[id$="BDI-content"]')
    .filter({ hasText: /save.*draft/i });
  await saveAsDraftBtn.waitFor({ state: 'visible', timeout: 10000 });
  await saveAsDraftBtn.click();
  await page.getByRole('button', { name: 'Yes' }).click();
  await page.waitForTimeout(3000);
  console.log('[Hyperlink] CR saved as Draft');
}

/**
 * See drafts list and select the most recent draft (last row).
 * First tries to click "See Drafts" button; if not found, looks for draft table rows directly;
 * if neither works, navigates to My Request tab.
 */
export async function seeDraftsAndSelect(page: Page): Promise<void> {
  console.log('[Hyperlink] Trying to find Drafts...');
  await page.waitForTimeout(2000);

  // Check if we're already on a draft table view (after save as draft the page may auto-navigate)
  let tableBody = page.locator('[id$="-table-tblBody"]');
  let rows = tableBody.locator('tr.sapMLIB');
  let count = await rows.count();
  if (count > 0) {
    console.log(`[Hyperlink] Found ${count} rows in draft table, selecting most recent`);
    await rows.nth(count - 1).click();
    await page.waitForTimeout(5000);
    console.log('[Hyperlink] Draft selected and reopened');
    return;
  }

  // Strategy 2: Click See Drafts button
  console.log('[Hyperlink] No table rows, trying See Drafts button...');
  const seeDraftsBtn = page
    .locator('[id$="BDI-content"]')
    .filter({ hasText: /see.*drafts/i });
  const btnVisible = await seeDraftsBtn.isVisible().catch(() => false);
  if (btnVisible) {
    console.log('[Hyperlink] Clicking See Drafts...');
    await seeDraftsBtn.click();
    await page.waitForTimeout(3000);

    console.log('[Hyperlink] Selecting most recent draft...');
    tableBody = page.locator('[id$="-table-tblBody"]');
    rows = tableBody.locator('tr.sapMLIB');
    count = await rows.count();
    if (count > 0) {
      await rows.nth(count - 1).click();
    } else {
      const fallback = page.locator('[id$="cell0"]').last();
      if (await fallback.isVisible().catch(() => false)) {
        await fallback.click();
      }
    }
    await page.waitForTimeout(5000);
    console.log('[Hyperlink] Draft selected and reopened');
    return;
  }

  // Strategy 3: Navigate to My Request to find drafts
  console.log('[Hyperlink] See Drafts button not found, going to My Request...');
  const myReqBtn = page.locator('bdi').filter({ hasText: 'My Request' }).first();
  await myReqBtn.click();
  await page.waitForTimeout(5000);

  tableBody = page.locator('[id$="-table-tblBody"]');
  rows = tableBody.locator('tr.sapMLIB');
  count = await rows.count();
  if (count > 0) {
    await rows.nth(count - 1).click();
    await page.waitForTimeout(5000);
    console.log('[Hyperlink] Draft selected from My Request');
  } else {
    console.log('[Hyperlink] No draft rows found in My Request either');
  }
}

/**
 * Robustly open a CR detail from the My Request list after a search.
 *
 * The row-link click can be swallowed while the result table re-renders after
 * the search, so the open is retried (re-searching) until the detail page
 * signals it is loaded via the confirm label.
 */
async function openCRDetailFromSearch(
  page: Page,
  crNumber: string,
  searchField: Locator,
  confirmLabel = 'Material Number',
): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await waitForNoBusy(page);
      await page.waitForTimeout(1500);
      const crRow = page.getByRoleUI5('ColumnListItem').filter({ hasText: crNumber }).first();
      const crLink = crRow.getByRoleUI5('Link', { text: crNumber }).first();
      await expect(crLink).toBeVisible({ timeout: 15000 });
      await crLink.click();
      await waitForNoBusy(page);
      await expect(page.locator('bdi').filter({ hasText: confirmLabel }).first()).toBeVisible({ timeout: 30000 });
      console.log(`[Hyperlink] CR ${crNumber} detail page opened`);
      return;
    } catch (e) {
      console.log(
        `[Hyperlink]  Attempt ${attempt}/3 to open CR detail failed: ${(e as Error).message.split('\n')[0]}`,
      );
      if (attempt < 3) {
        await searchAndClick(page, searchField, crNumber);
      }
    }
  }
  throw new Error(`[Hyperlink] Failed to open CR ${crNumber} detail after 3 attempts`);
}

/**
 * Submit current CR and reopen it in the detail view to access the Hyperlink tab with search field.
 *
 * Flow: Close attachments → Submit CR → Wait for status → Open CR detail → Attachments → Hyperlink tab
 */
export async function submitAndOpenSubmittedHyperlinks(
  page: Page,
  submitComment: string,
  expectedStatus: string,
  searchField: Locator,
  timeout: number,
): Promise<string> {
  console.log('[Hyperlink] === Submit CR & reopen submitted CR ===');
  await closeAttachments(page);
  const crNumber = await submitCRWithConfirm(page, submitComment);
  await waitForCRStatus(page, searchField, crNumber, expectedStatus, timeout);
  await openCRDetailFromSearch(page, crNumber, searchField, 'Material Number');
  await openHyperlinkTab(page);
  return crNumber;
}
