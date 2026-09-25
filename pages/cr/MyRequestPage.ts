import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { closeBlockingPopup } from '../../helpers/ui';
import { fillUI5Field, getFieldByLabelText } from '../../helpers/ui';
import { searchAndClick } from '../../helpers/search';
import { waitForCRStatus, verifyCRStatus } from '../../helpers/workflow';
import { CRHeaderParams } from '../types';

export type { CRHeaderParams };

/**
 * MyRequestPage — Tab My Request
 * Xử lý: search CR, copy request, verify status
 */

export class MyRequestPage extends BasePage {
  // Locators
  readonly searchField: Locator;

  constructor(page: Page) {
    super(page);
    this.searchField = page.locator('[id$="requestHistorySearchField-I"]');
  }

  /**
   * Navigate đến tab My Request
   */
  async goto(): Promise<void> {
    await this.navigateTo('My Request');
    await closeBlockingPopup(this.page);
    await this.waitForBusy(15000);
    await expect(this.searchField).toBeVisible({ timeout: 15000 });
  }

  /**
   * Search CR và đợi kết quả load
   */
  async searchCR(crNumber: string): Promise<void> {
    await this.waitForBusy(15000);
    await closeBlockingPopup(this.page);
    await searchAndClick(this.page, this.searchField, crNumber);
    const crLink = this.page.getByRoleUI5('Link', { text: crNumber }).first();
    await expect(crLink).toBeVisible({ timeout: 15000 });
  }

  /**
   * Search CR for cross-verify (no menu button check needed)
   * Use this when verifying ACTIVATED CRs where menu button may be hidden
   */
  async searchCRForVerify(crNumber: string): Promise<void> {
    console.log(`[MyRequest] Searching for CR (verify mode): ${crNumber}`);
    await searchAndClick(this.page, this.searchField, crNumber);
    // Wait for search results to load - just wait for row visibility
    const crRow = this.page.getByRoleUI5('ColumnListItem').filter({ hasText: crNumber }).first();
    await expect(crRow).toBeVisible({ timeout: 15000 });
    console.log(`[MyRequest] CR row found: ${crNumber}`);
  }

  /**
   * Open CR detail page for cross-verify, with retry.
   *
   * The My Request search table can re-render right after a search; a click
   * fired at that moment can be swallowed (no navigation happens, the page
   * stays on the list). To make the verify step robust:
   *   - wait for the table busy to settle and the link to be visible first
   *   - click the link scoped to the found row (never a stray app-shell link)
   *   - confirm navigation by waiting for the confirm label
   *   - retry search + click if the detail page did not load
   *
   * @param crNumber     - CR number to open
   * @param confirmLabel - Label to confirm page loaded (default: 'Material Number')
   */
  async openCRDetailForVerify(crNumber: string, confirmLabel = 'Material Number'): Promise<void> {
    console.log(`[MyRequest] Opening CR detail for verify: ${crNumber}`);
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (attempt > 1) {
          console.log(`[MyRequest]  Retry ${attempt}/${maxAttempts} — re-searching CR ${crNumber}...`);
          await this.page.waitForTimeout(2000);
        }

        await this.goto();
        await this.searchCRForVerify(crNumber);

        // Let the result table settle before clicking so the link press is
        // not lost to a re-render.
        await this.waitForBusy(30000);
        await this.page.waitForTimeout(1500);

        const crRow = this.page.getByRoleUI5('ColumnListItem').filter({ hasText: crNumber }).first();
        const crLink = crRow.getByRoleUI5('Link', { text: crNumber }).first();
        await expect(crLink).toBeVisible({ timeout: 15000 });
        await crLink.click();

        await this.waitForBusy(30000);
        await expect(this.page.locator('bdi').filter({ hasText: confirmLabel }).first()).toBeVisible({
          timeout: 30000,
        });
        console.log(`[MyRequest] CR detail page loaded — ${confirmLabel} label visible`);
        return;
      } catch (e) {
        console.log(`[MyRequest]  Attempt ${attempt}/${maxAttempts} failed to open CR detail: ${(e as Error).message}`);
      }
    }

    throw new Error(`[MyRequest] Failed to open CR detail for ${crNumber} after ${maxAttempts} attempts`);
  }

  /**
   * Open CR detail page from My Request view
   * Flow: navigate to My Request → search → click CR link → wait for bdi label
   * @param crNumber - CR number to open
   * @param confirmLabel - Label to confirm page loaded (default: 'Material Number')
   */
  async openCRDetail(crNumber: string, confirmLabel = 'Material Number'): Promise<void> {
    console.log(`[MyRequest] Opening CR detail: ${crNumber}`);
    // Ensure we're on My Request page with CR visible
    await this.goto();
    await this.searchCR(crNumber);
    await this.page.waitForTimeout(2000);
    // Click CR link (avoids full page.goto() which may not load detail correctly)
    const crLink = this.page.getByRoleUI5('Link', { text: crNumber }).first();
    await expect(crLink).toBeVisible({ timeout: 30000 });
    await crLink.click();
    // Wait for CR detail page to fully load using bdi (consistent with resubmit)
    await this.waitForBusy(30000);
    console.log(`[MyRequest] Waiting for "${confirmLabel}" label...`);
    await expect(this.page.locator('bdi').filter({ hasText: confirmLabel }).first()).toBeVisible({ timeout: 60000 });
    console.log(`[MyRequest] CR detail page loaded — ${confirmLabel} label visible`);
  }

  /**
   * Mở form Copy request từ CR number
   * @param crNumber - CR nguồn để copy
   * @param confirmLabel - Label xác nhận form đã load (default: 'Business Partner')
   */
  async openCopyRequest(crNumber: string, confirmLabel = 'Business Partner'): Promise<void> {
    await this.searchCR(crNumber);
    const crRow = this.page.locator('tr').filter({ has: this.page.getByText(crNumber, { exact: true }) }).first();
    const rowMenu = crRow.getByRole('button', { name: '...' });
    await expect(rowMenu).toBeVisible({ timeout: 15000 });
    await rowMenu.click();
    await this.page.getByRoleUI5('MenuItem', { text: 'Copy request' }).click();

    // Đợi form load — Label confirmLabel là signal (60s timeout for slow rendering)
    await expect(this.page.getByRoleUI5('Label', { text: confirmLabel }).first()).toBeVisible({
      timeout: 60000,
    });
  }

  /**
   * Cancel CR đang SUBMITTED
   */
  async cancelCR(crNumber: string): Promise<void> {
    console.log(`[MyRequest] Cancelling CR: ${crNumber}`);
    const cancelItem = this.page.getByRoleUI5('MenuItem', { text: 'Cancel request' });
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        console.log(`[MyRequest] Stagger ${attempt * 2}s before cancel attempt...`);
        await this.page.waitForTimeout(attempt * 2000);
        await this.goto();
        await this.waitForBusy(15000);
        await searchAndClick(this.page, this.searchField, crNumber);
        await this.page.waitForTimeout(3000);
        const crRow = this.page.locator('tr').filter({ hasText: crNumber }).first();
        await expect(crRow).toBeVisible({ timeout: 20000 });
        const rowMenu = crRow.getByRole('button', { name: '...' });
        await expect(rowMenu).toBeVisible({ timeout: 10000 });
        await rowMenu.click({ force: true });
        await this.page.waitForTimeout(2000);
        await expect(cancelItem).toBeVisible({ timeout: 10000 });
        await cancelItem.click();
        // New flow: Comments dialog → Fill reason → Confirm
        const dialog = this.page.locator('.sapMDialog').last();
        await expect(dialog).toBeVisible({ timeout: 10000 });
        const reasonTextarea = dialog.locator('textarea');
        await expect(reasonTextarea).toBeVisible({ timeout: 5000 });
        await reasonTextarea.click();
        await reasonTextarea.fill(`Cancel CR ${crNumber}`);
        await dialog.getByRoleUI5('Button', { text: 'Confirm' }).click();
        console.log(`[MyRequest]  CR ${crNumber} cancelled`);
        return;
      } catch {
        console.log(`[MyRequest] Cancel attempt ${attempt}/5 failed, retrying...`);
      }
    }
    throw new Error(`[MyRequest] Failed to cancel CR ${crNumber} after 5 attempts`);
  }

  /**
   * Fill header fields for CR (New Request or Copy Request)
   * @param params - Object containing: description, priority, reason (optional), notes
   */
  async fillHeader(params: CRHeaderParams): Promise<void> {
    console.log('[MyRequest] Filling header fields...');

    // Dismiss any blocking overlay from previous navigation
    await closeBlockingPopup(this.page);

    // Fill Description
    const descInput = this.page.locator('[id$="--idRqDescInput"]');
    await expect(descInput).toBeVisible({ timeout: 10000 });
    await fillUI5Field(descInput, params.description);
    console.log(`[MyRequest]  Filled Description: "${params.description}"`);

    // Fill Priority
    const priorityCombo = this.page.locator('[id$="--idPriorityCombo"]');
    await expect(priorityCombo).toBeVisible({ timeout: 10000 });
    await priorityCombo.click();
    await this.page.getByRole('option', { name: params.priority }).click();
    console.log(`[MyRequest]  Selected Priority: ${params.priority}`);

    // Fill Reason (optional - only for New Request)
    // Flow: Click dropdown → Select option (li with role="option")
    if (params.reason) {
      await this.page.locator('[id$="idReasonCombo"]').click();
      const reasonOption = this.page.getByRole('option', { name: params.reason });
      //await expect(reasonOption).toBeVisible({ timeout: 15000 });
      await reasonOption.click();
      console.log(`[MyRequest]  Selected Reason: ${params.reason}`);
    }

    // Fill Notes - always required
    const notesField = getFieldByLabelText(this.page, 'Other reason', 'textarea');
    await expect(notesField).toBeVisible({ timeout: 10000 });
    await fillUI5Field(notesField, params.notes);
    console.log(`[MyRequest]  Filled Notes: "${params.notes}"`);
  }

  /**
   * Đợi CR chuyển sang status mong đợi
   */
  async waitForStatus(crNumber: string, status: string, options?: { onDuplicate?: (crNumber: string) => Promise<void> }): Promise<void> {
    await waitForCRStatus(this.page, this.searchField, crNumber, status, 240000, 3000, options);
  }

  /**
   * Verify CR có đúng status
   */
  async verifyStatus(crNumber: string, status: string): Promise<void> {
    await verifyCRStatus(this.page, crNumber, status);
  }

  async verifyBothStatuses(
    crNumber: string,
    status: string,
    activationStatus: string
  ): Promise<void> {
    console.log(
      `[MyRequest] Verifying CR ${crNumber} — Status: ${status}, Activation Status: ${activationStatus}`
    );
    // First verify CR row exists - use tr locator like in acceptDuplication
    const crRow = this.page
      .locator('tr')
      .filter({ has: this.page.getByText(crNumber, { exact: true }) });
    await crRow.first().waitFor({ state: 'visible', timeout: 15000 });
    console.log(`[MyRequest] CR row found: ${crNumber}`);

    // Get all ObjectStatus elements in this row
    const allStatusInRow = crRow.first().locator('.sapMObjStatus');

    // Try each status element until we find the visible one matching our text
    // For status (e.g., APPROVED)
    const statusCount = await allStatusInRow.count();
    console.log(`[MyRequest] Found ${statusCount} status elements in row`);

    // Wait a bit for status to stabilize
    await this.page.waitForTimeout(1000);

    let foundStatus = false;
    for (let i = 0; i < statusCount; i++) {
      const el = allStatusInRow.nth(i);
      const text = await el.textContent();
      const isVisible = await el.isVisible();
      console.log(`[MyRequest] Checking status[${i}]: "${text}" visible=${isVisible}`);
      if (text?.includes(status) && isVisible) {
        console.log(`[MyRequest] Verified Status: ${status} at index ${i}`);
        foundStatus = true;
        break;
      }
    }
    expect(foundStatus).toBe(true);

    // For activation status (e.g., ACTIVATED)
    let foundActivationStatus = false;
    for (let i = 0; i < statusCount; i++) {
      const el = allStatusInRow.nth(i);
      const text = await el.textContent();
      const isVisible = await el.isVisible();
      console.log(`[MyRequest] Checking activationStatus[${i}]: "${text}" visible=${isVisible}`);
      if (text?.includes(activationStatus) && isVisible) {
        console.log(`[MyRequest] Verified Activation Status: ${activationStatus} at index ${i}`);
        foundActivationStatus = true;
        break;
      }
    }
    expect(foundActivationStatus).toBe(true);

    console.log(
      `[MyRequest]  CR ${crNumber} — Status: ${status}   Activation Status: ${activationStatus} `
    );
  }

  /**
   * Resubmit CR đang ở status REWORK
   * Flow: Search CR → Open CR detail → Edit Request → Wait form load → Submit → Dialog → Confirm
   * @param crNumber - CR cần resubmit
   * @param comment - Comment cho resubmit
   * @param confirmLabel - Label xác nhận form đã load (default: 'Business Partner')
   */
  async resubmit(
    crNumber: string,
    comment: string,
    confirmLabel = 'Business Partner',
    expectedStatus?: string
  ): Promise<void> {
    console.log(`[MyRequest] Resubmitting CR: ${crNumber}`);

    await this.waitForBusy(30000);
    await this.searchCR(crNumber);
    await this.waitForBusy(30000);

    // Optional: verify CR status before attempting navigation
    if (expectedStatus) {
      await this.verifyStatus(crNumber, expectedStatus);
    }

    // Wait for UI to stabilize after search
    await this.page.waitForTimeout(2000);

    // Click CR link to navigate to CR detail page
    const crLink = this.page.getByRoleUI5('Link', { text: crNumber }).first();
    await expect(crLink).toBeVisible({ timeout: 30000 });
    await crLink.click();
    console.log(`[MyRequest] Opened CR detail: ${crNumber}`);

    await this.waitForBusy(30000);

    // Wait for CR detail page to fully load (bdi used in detail header)
    await expect(this.page.locator('bdi').filter({ hasText: confirmLabel }).first()).toBeVisible({
      timeout: 60000,
    });
    console.log('[MyRequest] CR detail page loaded');

    // Wait for and click Edit Request button
    console.log('[MyRequest] Clicking Edit Request button...');
    const editBtn = this.page.locator('button').filter({ hasText: 'Edit Request' }).first();
    await expect(editBtn).toBeVisible({ timeout: 30000 });
    await editBtn.click();
    console.log('[MyRequest] Clicked Edit Request button');
    await this.waitForBusy(30000);

    await this.waitForBusy(30000);
    await expect(this.page.getByRoleUI5('Label', { text: confirmLabel }).first()).toBeVisible({
      timeout: 60000,
    });
    console.log('[MyRequest] Edit form loaded');

    // Wait for form Submit button to become enabled (form data fully loaded)
    const submitBtn = this.page.locator('button[id$="submitButton"]');
    await expect(submitBtn).toBeVisible({ timeout: 30000 });
    await expect(submitBtn).toBeEnabled({ timeout: 60000 });
    await submitBtn.click();
    console.log('[MyRequest] Clicked Submit button');

    await this.waitForBusy(30000);

    const dialog = this.page.locator('.sapMDialog').last();
    await expect(dialog).toBeVisible({ timeout: 15000 });

    const textArea = dialog.getByRoleUI5('TextArea').first();
    await expect(textArea).toBeVisible({ timeout: 15000 });
    await fillUI5Field(textArea, comment);
    console.log(`[MyRequest] Filled comment: "${comment}"`);

    await this.page.getByRoleUI5('Button', { text: 'Submit' }).first().click();

    await this.waitForBusy(15000);

    const toast = this.page.getByText(/CR\d{10} is being/);
    await expect(toast).toBeVisible({ timeout: 15000 });
    console.log('[MyRequest] Toast appeared');

    await this.page.getByRoleUI5('Button', { text: 'OK' }).first().click();
    console.log(`[MyRequest]  CR ${crNumber} resubmitted`);
  }
}
