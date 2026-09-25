import { Page, Locator, expect } from '@playwright/test';
import { DialogHelper, createDialogHelper } from '../../helpers/ui';
import { fillUI5Field, getFieldByLabel, getFieldByLabelText } from '../../helpers/ui';

/**
 * ApproverActions - Actions thực hiện bởi Approver role
 * Tab: My Inbox
 */
export class ApproverActions {
  private dialog: DialogHelper;

  constructor(private page: Page) {
    this.dialog = createDialogHelper(page);
  }

  /**
   * Search CR trong My Inbox
   * @param crNumber - CR cần tìm
   */
  async search(crNumber: string): Promise<void> {
    console.log(`[Approver] Searching for CR: ${crNumber}`);
    const searchField = this.page.locator('[id$="myInboxSearch-I"]');
    await expect(searchField).toBeVisible({ timeout: 10000 });
    await searchField.fill(crNumber);
    // Press Enter instead of clicking the search icon — that icon re-renders
    // right after fill() (empty -> clear icon), which is flaky under headless/CI load.
    await this.page.waitForTimeout(300);
    await searchField.press('Enter');
    console.log(`[Approver] Search executed for: ${crNumber}`);
  }

  /**
   * Wait cho CR xuất hiện trong My Inbox
   * @param crNumber - CR cần đợi
   */
  async waitForCR(crNumber: string): Promise<void> {
    console.log(`[Approver] Waiting for CR ${crNumber} to appear in inbox...`);
    await expect
      .poll(
        async () => {
          return await this.page.getByRoleUI5('Link', { text: crNumber }).count();
        },
        {
          message: `Waiting for CR ${crNumber} to appear in My Inbox`,
          timeout: 180000,
        }
      )
      .toBeGreaterThan(0);
    console.log(`[Approver] CR ${crNumber} found in inbox`);
  }

  /**
   * Mở CR detail page
   * @param crNumber - CR cần mở
   */
  async openDetail(crNumber: string, objectType = 'BusinessPartner', confirmLabel = 'Business Partner'): Promise<void> {
    const BASE_URL = process.env.BASE_URL || '';
    console.log(`[Approver] Opening CR detail: ${crNumber} (objectType: ${objectType})`);
    await this.page.goto(`${BASE_URL}/main/index.html#/myInboxDetail/${objectType}/${crNumber}`);
    await this.page.waitForLoadState('domcontentloaded');

    // Wait for confirmLabel — signals page content fully rendered
    console.log(`[Approver] Waiting for '${confirmLabel}' label...`);
    const label = this.page.locator('bdi').filter({ hasText: confirmLabel }).first();
    await expect(label).toBeVisible({ timeout: 60000 });

    // Wait for Approve button to confirm page loaded
    await expect(this.page.locator('[id$="ApproveButton"]')).toBeVisible({ timeout: 30000 });
    console.log(`[Approver] CR detail loaded for: ${crNumber}`);
  }

  /**
   * Approve CR
   * Flow: Click Approve button → Fill comment → Confirm → OK
   * @param crNumber - CR cần approve
   * @param comment - Comment cho approval
   */
  async approve(crNumber: string, comment = 'Approver has approved this request !', confirmLabel = 'Business Partner'): Promise<void> {
    console.log(`[Approver] Approving CR: ${crNumber}`);

    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        if (attempt > 1) {
          console.log(`[Approver] Stagger ${attempt * 3}s before retry...`);
          await this.page.waitForTimeout(attempt * 3000);
        }

        await this.page.waitForLoadState('domcontentloaded');
        await this.page.waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 }).catch(() => {});
        await this.page.locator('.sapUiBLy').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});

        // Wait for detail page to fully render — confirmLabel signals form is ready
        console.log(`[Approver] Waiting for "${confirmLabel}" label...`);
        const label = this.page.locator('bdi').filter({ hasText: confirmLabel }).first();
        await expect(label).toBeVisible({ timeout: 60000 });
        console.log(`[Approver] Detail page loaded — "${confirmLabel}" label visible`);

        // Check if CR was already approved (e.g. from a previous attempt)
        const approveBtn = this.page.locator('[id$="ApproveButton"]');
        const approveVisible = await approveBtn.isVisible({ timeout: 5000 }).catch(() => false);
        if (!approveVisible) {
          console.log(`[Approver]  Approve button not visible — CR ${crNumber} may already be approved`);
          return;
        }

        console.log(`[Approver] Waiting for Approve button...`);
        await expect(approveBtn).toBeVisible({ timeout: 30000 });
        await expect(approveBtn.locator('bdi[id$="BDI-content"]')).toBeVisible({ timeout: 10000 });
        await expect(approveBtn).toBeEnabled({ timeout: 10000 });

        // Click Approve button ONCE
        await approveBtn.click();
        console.log(`[Approver] Clicked Approve button — waiting for comment dialog...`);

        // After clicking Approve, dialog opens with its own block layer.
        // Wait for the textarea (inside the dialog) to appear — this confirms dialog is ready.
        // Do NOT wait for .sapUiBLy to hide here — it stays visible behind the dialog.
        const textarea = this.page.locator('textarea').first();
        await expect(textarea).toBeVisible({ timeout: 20000 });
        await textarea.fill(comment);

        console.log(`[Approver] Clicking Approve in footer...`);
        await this.page.getByLabel('Footer actions').getByRole('button', { name: 'Approve' }).click();

        // After footer Approve, dialog closes and system processes the approval.
        // Wait for textarea to disappear (dialog closed), then wait for processing to finish.
        await textarea.waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
        await this.page.waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 }).catch(() => {});

        // Try to click OK if toast/dialog appears, but don't fail if it's gone
        const okBtn = this.page.getByRole('button', { name: 'OK' });
        if (await okBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
          await okBtn.click();
        }

        console.log(`[Approver]  CR ${crNumber} approved`);
        return;
      } catch (e) {
        console.log(`[Approver] Approval attempt ${attempt}/4 failed, retrying...`);
        if (attempt === 4) throw e;
        await this.page.waitForTimeout(attempt * 5000);
        await this.page.goto(`${process.env.BASE_URL || ''}/main/index.html#/myInboxDetail/BusinessPartner/${crNumber}`);
        await this.page.waitForLoadState('domcontentloaded');
        await this.page.waitForTimeout(5000);
      }
    }
  }

  /**
   * Reject CR
   * Flow: Click Reject button → Fill comment → Confirm → OK
   * @param crNumber - CR cần reject
   * @param comment - Comment cho rejection
   */
  async reject(crNumber: string, comment = 'Approver has rejected this request !'): Promise<void> {
    console.log(`[Approver] Rejecting CR: ${crNumber}`);
    const rejectBtn = this.page.locator('[id$="RejectButton"]');
    await expect(rejectBtn).toBeVisible({ timeout: 15000 });
    console.log(`[Approver] RejectButton found, clicking...`);
    await rejectBtn.click();
    await this.dialog.waitForDialog(10000);
    await this.dialog.fillCommentAndConfirm('Reject', comment);
    console.log(`[Approver]  CR ${crNumber} rejected`);
  }

  /**
   * Verify CR đã rời khỏi My Inbox
   * @param crNumber - CR cần verify
   */
  async verifyCRLeft(crNumber: string, maxWaitMs = 240000): Promise<void> {
    console.log(`[Approver] Verifying CR ${crNumber} has left My Inbox...`);

    const inboxSearch = this.page.locator('[id$="myInboxSearch-I"]');
    await expect(inboxSearch).toBeVisible({ timeout: 10000 });

    const noDataTable = this.page.getByRoleUI5('Table', { noDataText: 'No data' }).first();
    const startTime = Date.now();

    while (true) {
      await inboxSearch.fill(crNumber);

      await this.page
        .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 })
        .catch(() => {});

      // Press Enter instead of clicking the search icon — that icon re-renders
      // right after fill() (empty -> clear icon), which is flaky under headless/CI load.
      await inboxSearch.press('Enter');
      await this.page.waitForTimeout(3000);

      if (await noDataTable.isVisible().catch(() => false)) {
        console.log(`[Approver]  CR ${crNumber} has left My Inbox`);
        return;
      }

      const elapsed = Date.now() - startTime;
      if (elapsed >= maxWaitMs) {
        throw new Error(
          `[Approver] CR ${crNumber} did not leave My Inbox after ${maxWaitMs / 1000}s`
        );
      }

      console.log(
        `[Approver] CR ${crNumber} still in inbox, retrying... ${Math.round((maxWaitMs - elapsed) / 1000)}s remaining`
      );
      await this.page.waitForTimeout(3000);
    }
  }

  /**
   * Rework CR - Gửi lại cho Requestor
   * Flow: Click Rework button → Select Requestor → Fill comment → Confirm Rework
   * @param crNumber - CR cần rework
   * @param comment - Lý do rework
   */
  async reworkToRequestor(crNumber: string, comment: string = ''): Promise<void> {
    console.log(`[Approver] Reworking CR ${crNumber} to Requestor...`);

    const reworkBtn = this.page.locator('[id$="ReworkButton"]');
    await expect(reworkBtn).toBeVisible({ timeout: 15000 });
    console.log(`[Approver] ReworkButton found, clicking...`);
    await reworkBtn.click();

    await this.dialog.waitForDialog(10000);
    console.log(`[Approver] Rework dialog opened`);

    await this.page.getByRole('button', { name: 'Requestor' }).click();
    console.log(`[Approver] Selected Requestor`);

    await this.page.waitForTimeout(500);

    const textArea = await this.dialog.getDialogTextArea();
    const count = await textArea.count().catch(() => 0);

    if (count > 0) {
      await expect(textArea).toBeVisible({ timeout: 10000 });
      await fillUI5Field(textArea, comment);
    } else {
      const legacyTextArea = await this.dialog.getDialogTextAreaLegacy();
      await expect(legacyTextArea).toBeVisible({ timeout: 10000 });
      await fillUI5Field(legacyTextArea, comment);
    }
    console.log(`[Approver] Filled comment: "${comment}"`);

    await this.page.getByRoleUI5('Button', { text: 'Rework' }).first().click();
    await this.dialog.waitForDialogToClose(10000);
    console.log(`[Approver]  CR ${crNumber} reworked to Requestor`);
  }

  /**
   * Edit CR data in detail view
   * Flow: Open CR detail → Edit field → Save
   * @param fieldLabel - Label của field cần edit
   * @param value - Giá trị mới
   */
  async editField(fieldLabel: string, value: string): Promise<void> {
    console.log(`[Approver] Editing field "${fieldLabel}" to "${value}"...`);
    const field = await getFieldByLabel(this.page, fieldLabel);
    await field.clear();
    await field.fill(value);
    console.log(`[Approver]  Field "${fieldLabel}" updated to "${value}"`);
  }

  /**
   * Change priority của CR
   * Flow: Open CR detail → Change priority → Save
   * @param priority - Priority mới (vd: 'HIGH', 'MEDIUM', 'LOW')
   */
  async changePriority(priority: string): Promise<void> {
    console.log(`[Approver] Changing priority to ${priority}...`);
    await this.page.locator('[id$="idPriorityCombo-arrow"]').click();
    await this.page.getByRole('option', { name: priority }).click();
    console.log(`[Approver]  Priority changed to ${priority}`);
  }

  /**
   * Accept Duplication Check (Approver phase)
   * Được gọi khi CR có status DUPLICATE sau khi approver approve
   * Flow: Search CR → Click DUPLICATE status → Close dialog → "..." → "Accept and approve" → Dialog fill → Approve → CR leaves inbox
   * @param crNumber - CR number đang ở status DUPLICATE
   * @param comment - Comment cho duplication accept (optional)
   */
  async acceptDuplication(crNumber: string, comment?: string): Promise<void> {
    console.log(`[Approver] Accepting duplication check for CR: ${crNumber}`);

    const searchField = this.page.locator('[id$="myInboxSearch-I"]');
    const maxWait = 240000;
    const startTime = Date.now();

    // ── POLLING: re-search until DUPLICATE ObjectStatus appears ──
    while (true) {
      await expect(searchField).toBeVisible({ timeout: 10000 });
      await searchField.fill(crNumber);
      // Press Enter instead of clicking the search icon — that icon re-renders
      // right after fill() (empty -> clear icon), which is flaky under headless/CI load.
      await searchField.press('Enter');
      console.log(`[Approver] Searched for CR: ${crNumber}`);

      await this.page.waitForTimeout(3000);

      const dupStatus = this.page.getByRoleUI5('ObjectStatus', { text: 'DUPLICATE' });
      if (await dupStatus.isVisible().catch(() => false)) {
        console.log(`[Approver] DUPLICATE status found for CR: ${crNumber}`);
        await dupStatus.click();
        console.log('[Approver] Clicked DUPLICATE status to view details');
        break;
      }

      const elapsed = Date.now() - startTime;
      if (elapsed >= maxWait) {
        throw new Error(
          `[Approver] CR ${crNumber} did not reach DUPLICATE status in inbox after ${maxWait / 1000}s`
        );
      }

      console.log(
        `[Approver] DUPLICATE not yet visible, re-searching... ${Math.round((maxWait - elapsed) / 1000)}s remaining`
      );
      await this.page.waitForTimeout(3000);
    }

    // ── Rest of flow (same as original) ──

    // Close the dialog
    await this.page.waitForTimeout(1000);
    await this.page.getByRoleUI5('Button', { text: 'Close' }).first().click();
    console.log('[Approver] Closed DUPLICATE status dialog');

    // Now click "..." menu button
    const menuButton = this.page.getByRoleUI5('Button', { text: '...' }).first();
    await expect(menuButton).toBeVisible({ timeout: 30000 });
    await menuButton.click();
    console.log('[Approver] Clicked "..." menu');

    // Click "Accept and approve" menu item
    await this.page.getByRoleUI5('MenuItem', { text: 'Accept and approve' }).click();
    console.log('[Approver] Clicked "Accept and approve"');

    // Wait for dialog and handle textarea
    await this.page.waitForTimeout(1000);

    // Click on TextArea in dialog
    const textArea = this.page.locator('textarea').first();
    const hasDialog = await textArea.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasDialog) {
      await textArea.click();
      console.log('[Approver] Clicked TextArea in dialog');

      // Fill comment if provided
      if (comment) {
        await textArea.fill(comment);
        console.log(`[Approver] Filled comment: ${comment}`);
      }

      // Click Approve button in dialog - CR leaves inbox after this
      await this.page.getByRoleUI5('Button', { text: 'Approve' }).first().click();
      console.log('[Approver] Clicked Approve in dialog - CR leaves inbox');
    }

    // Wait for CR to leave inbox (no OK button needed)
    await this.page.waitForTimeout(2000);
    console.log(`[Approver]  Duplication accepted for CR ${crNumber} - CR left inbox`);
  }
}

export function createApproverActions(page: Page): ApproverActions {
  return new ApproverActions(page);
}
