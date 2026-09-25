import { Page, expect } from '@playwright/test';
import { submitCRWithConfirm } from '../../helpers/workflow';

/**
 * RequestorActions - Actions thực hiện bởi Requestor role
 * Tab: My Request
 */
export class RequestorActions {
  constructor(private page: Page) {}

  /**
   * Submit CR từ form (New Request hoặc Copy Request)
   * Flow: Click submit → Dialog → fill comment → Submit → extract CR# → OK
   * @param comment - Comment cho submission
   * @returns CR number mới (vd: 'CR0000015487')
   */
  async submit(comment = 'Requestor has submitted this request !'): Promise<string> {
    console.log('[Requestor] Submitting CR...');
    const newCR = await submitCRWithConfirm(this.page, comment);
    console.log(`[Requestor]  CR submitted successfully: ${newCR}`);
    return newCR;
  }

  /**
   * Cancel CR đang ở status SUBMITTED
   * Flow: Search CR → Menu → Cancel request → Comments dialog → Fill reason → Confirm
   * @param crNumber - CR cần cancel
   */
  async cancel(crNumber: string): Promise<void> {
    console.log(`[Requestor] Cancelling CR: ${crNumber}`);

    const searchField = this.page.getByRoleUI5('SearchField');
    const menuButton = this.page.getByRoleUI5('Button', { text: '...' }).first();

    await searchField.fill(crNumber);
    await this.page.locator('[id$="requestHistorySearchField-search"]').click();
    await expect(menuButton).toBeVisible({ timeout: 15000 });

    await menuButton.click();
    await this.page.getByRoleUI5('MenuItem', { text: 'Cancel request' }).click();

    // New flow: Comments dialog → Fill reason → Confirm
    const dialog = this.page.locator('.sapMDialog').last();
    await expect(dialog).toBeVisible({ timeout: 10000 });
    const reasonTextarea = dialog.locator('textarea');
    await expect(reasonTextarea).toBeVisible({ timeout: 5000 });
    await reasonTextarea.click();
    await reasonTextarea.fill(`Cancel CR ${crNumber}`);
    await dialog.getByRoleUI5('Button', { text: 'Confirm' }).click();
    console.log(`[Requestor]  CR ${crNumber} cancelled`);
  }

  /**
   * Cancel CR từ detail view (dùng cho status REWORK)
   * Flow: Search CR → Open CR detail → Wait for form → Click Cancel → Comments dialog → Fill reason → Confirm
   * @param crNumber - CR cần cancel
   */
  async cancelFromDetail(crNumber: string, confirmLabel = 'Business Partner'): Promise<void> {
    console.log(`[Requestor] Cancelling CR from detail: ${crNumber}`);

    // Use the My Request history search field explicitly. The generic
    // getByRoleUI5('SearchField').first() can resolve to a hidden app-level
    // search (e.g. __field0) after tab switches, making re-search attempts fail.
    const searchField = this.page.locator('[id$="requestHistorySearchField-I"]');

    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        console.log(`[Requestor] cancelFromDetail attempt ${attempt}/5...`);

        if (attempt > 1) {
          // Re-search the CR (like waitForCRStatus does) to recover from a bad state
          await this.page
            .getByRoleUI5('IconTabFilter', { text: 'My Request' })
            .first()
            .click()
            .catch(() => {});
          await searchField.click();
          await searchField.press('Control+A');
          await searchField.press('Backspace');
          await this.page.waitForTimeout(300);
          await searchField.fill(crNumber);
          await searchField.press('Enter');
          await this.page
            .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 15000 })
            .catch(() => {});
          await this.page.waitForTimeout(1000);
        }

        // The CR link itself is the "results loaded" signal. The "..." row-menu
        // locator must be avoided: UI5 keeps hidden clone buttons in the DOM, so
        // getByRoleUI5('Button', { text: '...' }) strict-mode fails with many
        // matches — and this flow only needs the link, never the menu.
        const crLink = this.page.getByRoleUI5('Link', { text: crNumber }).first();
        await expect(crLink).toBeVisible({ timeout: 20000 });

        // Click CR link once and wait for form to load
        console.log('[Requestor] Clicking CR link...');
        await crLink.click();

        // Wait for form to load — confirmLabel is the reliable signal. The SPA detail
        // route render is intermittent (same as MyInboxPage.openCRDetail): use a shorter
        // timeout so a stuck render fails fast into the reload fallback below instead of
        // burning a full 60s per attempt.
        await expect(this.page.getByRoleUI5('Label', { text: confirmLabel }).first()).toBeVisible(
          { timeout: 30000 }
        );
        console.log(`[Requestor] Form loaded - "${confirmLabel}" label visible`);
        break;
      } catch (err) {
        console.log(
          `[Requestor] cancelFromDetail attempt ${attempt}/5 failed: ${(err as Error).message}`
        );
        if (attempt === 5) {
          throw err;
        }
        // A hash-only click is a no-op when the SPA is already stuck on the same route —
        // reload forces a clean re-render before the next attempt re-searches and re-clicks.
        await this.page.reload().catch(() => {});
        await this.page.waitForTimeout(2000);
      }
    }

    // Wait for block layer overlay to disappear, then click Cancel immediately
    await this.page.locator('.sapUiBLy').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});

    // Click Cancel button — exact: true so the "Cancelled (1870)" status chip
    // in the list behind the form (substring name match) is not matched.
    const cancelBtn = this.page.getByRoleUI5('Button', { text: 'Cancel' }, { exact: true });
    await expect(cancelBtn).toBeVisible({ timeout: 20000 });
    await cancelBtn.click({ force: true });
    console.log('[Requestor] Clicked Cancel button');

    // New flow: Comments dialog → Fill reason → Confirm
    const cancelDialog = this.page.locator('.sapMDialog').last();
    await expect(cancelDialog).toBeVisible({ timeout: 10000 });
    const reasonTextarea = cancelDialog.locator('textarea');
    await expect(reasonTextarea).toBeVisible({ timeout: 5000 });
    await reasonTextarea.click();
    await reasonTextarea.fill(`Cancel CR ${crNumber}`);
    await cancelDialog.getByRoleUI5('Button', { text: 'Confirm' }).click();
    console.log('[Requestor] Confirmed cancellation');

    console.log(`[Requestor]  CR ${crNumber} cancellation confirmed`);
  }

  /**
   * Accept Duplication Check (Requestor phase)
   * Được gọi khi CR có status DUPLICATE sau khi submit
   * Flow: Wait DUPLICATE → Click "..." menu → "Accept and submit" → Dialog fill → Submit → OK
   * @param crNumber - CR number đang ở status DUPLICATE
   * @param comment - Comment cho duplication accept (optional)
   */
  async acceptDuplication(crNumber: string, comment?: string): Promise<void> {
    console.log(`[Requestor] Accepting duplication check for CR: ${crNumber}`);

    // Wait for DUPLICATE status to appear
    await this.page.waitForTimeout(3000);

    // Navigate to My Request tab
    await this.page.getByRoleUI5('IconTabFilter', { text: 'My Request' }).click();
    await this.page.waitForTimeout(3000);

// Search for the CR
    const searchField = this.page.getByRole('searchbox').first();
    await searchField.fill(crNumber);
    await searchField.press('Enter');
    
    // Wait for page to reload after search (page reloads 2 times)
    await this.page.waitForTimeout(5000);

    // Find the specific row containing the CR number and click its "..." button
    // Using row that contains the CR number - filter for visible row
    const crRow = this.page.locator('tr').filter({ has: this.page.getByText(crNumber, { exact: true }) });
    await crRow.first().waitFor({ state: 'visible', timeout: 15000 });
    
    // Click the "..." button inside this row - use filter for visible button
    const menuButton = crRow.locator('button').filter({ hasNot: this.page.locator('.sapUiHidden') }).first();
    await menuButton.waitFor({ state: 'visible', timeout: 15000 });
    await menuButton.click();
    console.log('[Requestor] Clicked "..." menu for CR: ' + crNumber);

    // Wait for menu popover to render
    await this.page.waitForTimeout(2000);

    // Click "Accept and submit" menu item
    const menuItem = this.page.getByRoleUI5('MenuItem', { text: 'Accept and submit' });
    await expect(menuItem).toBeVisible({ timeout: 10000 });
    await menuItem.click();
    console.log('[Requestor] Clicked "Accept and submit"');

    // Wait for dialog and handle textarea
    await this.page.waitForTimeout(1000);

    // Click on TextArea in dialog (following codegen: locateUI5('//TextArea[1]'))
    const dialogTextArea = this.page.locator('textarea').first();
    await expect(dialogTextArea).toBeVisible({ timeout: 5000 });
    await dialogTextArea.click();
    console.log('[Requestor] Clicked TextArea in dialog');

    // Fill comment if provided
    if (comment) {
      await dialogTextArea.fill(comment);
      console.log(`[Requestor] Filled comment: ${comment}`);
    }

    // Click Submit button in dialog
    await this.page.getByRoleUI5('Button', { text: 'Submit' }).first().click();
    console.log('[Requestor] Clicked Submit in dialog');

    // Click OK to confirm
    await this.page.getByRoleUI5('Button', { text: 'OK' }).first().click();
    await this.page.waitForTimeout(1000);

    console.log(`[Requestor]  Duplication accepted for CR ${crNumber}`);
  }

  /**
   * Mở form Copy Request từ CR number
   * Flow: Search CR → Menu → Copy request → Wait form load
   * @param crNumber - CR nguồn để copy
   */
  async copyRequest(crNumber: string): Promise<void> {
    console.log(`[Requestor] Copying CR: ${crNumber}`);

    const searchField = this.page.getByRoleUI5('SearchField');
    const menuButton = this.page.getByRoleUI5('Button', { text: '...' }).first();

    await searchField.fill(crNumber);
    await this.page.locator('[id$="requestHistorySearchField-search"]').click();
    await expect(menuButton).toBeVisible({ timeout: 15000 });

    await menuButton.click();
    await this.page.getByRoleUI5('MenuItem', { text: 'Copy request' }).click();

    // Đợi form load — Label Business Partner là signal
    // Wait for slow rendering (60s timeout)
    await expect(this.page.getByRoleUI5('Label', { text: 'Business Partner' }).first()).toBeVisible(
      {
        timeout: 60000,
      }
    );

    console.log(`[Requestor]  Copy form opened for CR ${crNumber}`);
  }

  /**
   * Copy from Master Data (on premise) — Business Partner.
   * Flow: Master Data menu → Select object type → Search BP → Copy → Switch template (optional)
   * @param bpNumber - On-premise BP number (e.g. '3130')
   * @param templateName - Template name to switch to (optional)
   */
  async copyFromMasterData(bpNumber: string, templateName?: string): Promise<void> {
    console.log(`[Requestor] Copying from Master Data: BP ${bpNumber}`);

    await this.page.getByRoleUI5('IconTabFilter', { text: 'Master Data' }).click();
    // Wait for Search Help panel to load
    await this.page.waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 }).catch(() => {});
    await this.page.waitForTimeout(2000);

    await this.page.locator('[id$="objecttype-arrow"]').click();
    await this.page.getByRole('option', { name: 'Business Partner' }).click();
    console.log('[Requestor] Selected object type: Business Partner');

    // Select Search Method = AUTO SEARCH
    await this.page.waitForTimeout(1000);
    await this.page.locator('[id$="variantMana-arrow"]').click();
    await this.page.getByRole('option', { name: 'AUTO SEARCH', exact: true }).click();
    console.log('[Requestor] Selected Search Method: AUTO SEARCH');

    // Wait for filter fields to appear after selecting AUTO SEARCH
    await this.page.waitForTimeout(2000);

    // Fill BP number in the filter input under "Business Partner" label
    const bpInput = this.page.locator('[id$="filterBarID"] input[type="text"]').first();
    await expect(bpInput).toBeVisible({ timeout: 15000 });
    await bpInput.click();
    await bpInput.fill(bpNumber);

    await this.page.getByRoleUI5('Button', { text: 'Search' }).first().click();

    const menuButton = this.page.getByRoleUI5('Button', { text: '...' }).first();
    await expect(menuButton).toBeVisible({ timeout: 30000 });
    console.log('[Requestor] Search results ready');

    await expect(this.page.getByRoleUI5('Text', { text: bpNumber })).toBeVisible({
      timeout: 10000,
    });
    console.log(`[Requestor] Verified Business Partner: ${bpNumber}`);

    await expect(this.page.getByRoleUI5('ObjectStatus', { text: 'ACTIVATED' })).toBeVisible({
      timeout: 10000,
    });

    await menuButton.click();

    await this.page.getByRole('menuitem', { name: 'Copy' }).click();

    if (templateName) {
      console.log(`[Requestor] Switching to template: ${templateName}`);

      const switchBtn = this.page.getByRoleUI5('Button', { text: 'Switch templates' });
      await expect(switchBtn).toBeVisible({ timeout: 30000 });
      await expect(switchBtn).toBeEnabled({ timeout: 60000 });
      await switchBtn.click();

      const templateSearch = this.page.getByRole('searchbox', { name: 'Search' });
      await expect(templateSearch).toBeVisible({ timeout: 10000 });
      await templateSearch.fill(templateName);

      await this.page.locator('[id$="templateChangeListTab-searchField-search"]').click();

      await this.page.getByText(templateName, { exact: true }).click();

      await expect(
        this.page.locator('label').filter({ hasText: 'Business Partner' }).first()
      ).toBeVisible({ timeout: 60000 });

      await this.page
        .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 60000 })
        .catch(() => {});
      await this.page.waitForTimeout(5000);
    }

    console.log(`[Requestor] Copied from Master Data: BP ${bpNumber}`);
  }

  /**
   * Copy from Master Data (on premise) — Product.
   * Flow: Master Data menu → Select Product → Fill Product ID → Search → Copy → Switch template
   * @param productNumber - On-premise Product number (e.g. '87712')
   * @param templateName - Template name to switch to (optional)
   * @param confirmLabel - Label text to wait for after form loads (default: 'Material Number')
   */
  async copyFromMasterDataProduct(
    productNumber: string,
    templateName?: string,
    confirmLabel = 'Material Number'
  ): Promise<void> {
    console.log(`[Requestor] Copying from Master Data: Product ${productNumber}`);

    await this.page.getByRoleUI5('IconTabFilter', { text: 'Master Data' }).click();

    await this.page.waitForTimeout(3000);

    await this.page.locator('[id$="objecttype-arrow"]').click();

    await this.page.waitForTimeout(2000);

    await this.page.getByRole('option', { name: 'Product', exact: true }).click();
    console.log('[Requestor] Selected object type: Product');

    await this.page.waitForTimeout(2000);

    const searchInput = this.page.getByRoleUI5('Input', { type: 'Text' }).nth(2);
    await expect(searchInput).toBeVisible({ timeout: 15000 });
    await searchInput.click();
    await searchInput.fill(productNumber);

    await this.page.getByRoleUI5('Button', { text: 'Search' }).click();

    await this.page
      .getByRole('button', { name: '...' })
      .waitFor({ state: 'visible', timeout: 30000 });
    console.log('[Requestor] Search results ready');

    await expect(this.page.getByRoleUI5('Text', { text: productNumber })).toBeVisible({
      timeout: 10000,
    });
    console.log(`[Requestor] Verified Product: ${productNumber}`);

    await expect(this.page.getByRoleUI5('ObjectStatus', { text: 'ACTIVATED' })).toBeVisible({
      timeout: 10000,
    });

    await this.page.getByRole('button', { name: '...' }).click();

    await this.page.getByRole('menuitem', { name: 'Copy' }).click();

    if (templateName) {
      console.log(`[Requestor] Switching to template: ${templateName}`);

      const switchBtn = this.page.getByRoleUI5('Button', { text: 'Switch templates' });
      await expect(switchBtn).toBeVisible({ timeout: 30000 });
      await expect(switchBtn).toBeEnabled({ timeout: 60000 });
      await switchBtn.click();

      const templateSearch = this.page.getByRole('searchbox', { name: 'Search' });
      await expect(templateSearch).toBeVisible({ timeout: 10000 });
      await templateSearch.fill(templateName);

      await this.page.locator('[id$="templateChangeListTab-searchField-search"]').click();

      await this.page.getByText(templateName, { exact: true }).click();

      await expect(
        this.page.locator('label').filter({ hasText: confirmLabel }).first()
      ).toBeVisible({ timeout: 60000 });

      await this.page
        .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 60000 })
        .catch(() => {});
      await this.page.waitForTimeout(5000);
    }

    console.log(`[Requestor] Copied from Master Data: Product ${productNumber}`);
  }
}

export function createRequestorActions(page: Page): RequestorActions {
  return new RequestorActions(page);
}
