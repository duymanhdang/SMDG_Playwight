import { Page, Locator } from '@playwright/test';
import { fillUI5Field, closeBlockingPopup } from '../ui/ui5';

/**
 * Fill SearchField và click Search button — My Request tab
 * id suffix: requestHistorySearchField-search
 *
 * ❌ '#__xmlview2--requestHistorySearchField-search' — dynamic prefix
 * ✅ '[id$="requestHistorySearchField-search"]'      — stable suffix
 */
export async function searchAndClick(
  page: Page,
  searchField: Locator,
  keyword: string
): Promise<void> {
  await fillUI5Field(searchField, keyword);
  await page.locator('[id$="requestHistorySearchField-search"]').click();
}

/**
 * Search trong My Inbox tab
 * id suffix: myInboxSearch-search
 */
export async function searchInMyInbox(
  page: Page,
  searchField: Locator,
  keyword: string
): Promise<void> {
  await fillUI5Field(searchField, keyword);
  await page.locator('[id$="myInboxSearch-search"]').click();
}

/**
 * Search trong Activation tab
 * id suffix: activateRequestSearchFields-search
 */
export async function searchInActivation(
  page: Page,
  searchField: Locator,
  keyword: string
): Promise<void> {
  // A dialog closed right before this call (e.g. Steward's "Accept and activate" confirm) can
  // leave the modal blocklayer behind for a moment — clear it first so the click below doesn't
  // hang for the full timeout waiting on an overlay that's already on its way out.
  await closeBlockingPopup(page);
  // Clear field first to force SAPUI5 binding change on re-search
  await searchField.click();
  await searchField.press('Control+A');
  await searchField.press('Backspace');
  await page.waitForTimeout(300);

  await fillUI5Field(searchField, keyword);
  await page.locator('[id$="activateRequestSearchFields-search"]').click();
}
