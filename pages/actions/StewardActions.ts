import { Page, Locator, expect } from '@playwright/test';
import { DialogHelper, createDialogHelper, closeBlockingPopup } from '../../helpers/ui';
import { searchInActivation } from '../../helpers/search';

/**
 * StewardActions - Actions thực hiện bởi Steward role
 * Tab: Activation
 */
export class StewardActions {
  private searchField: Locator;
  private menuButton: Locator;
  private dialog: DialogHelper;

  constructor(private page: Page) {
    this.searchField = this.page.locator('[id$="activateRequestSearchFields-I"]');
    this.menuButton = this.page.getByRoleUI5('Button', { text: '...' }).first();
    this.dialog = createDialogHelper(page);
  }

  /**
   * Search CR trong Activation tab
   * @param crNumber - CR cần tìm
   */
  async search(crNumber: string): Promise<void> {
    console.log(`[Steward] Searching for CR: ${crNumber}`);
    await this.page
      .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 })
      .catch(() => {});
    await searchInActivation(this.page, this.searchField, crNumber);
    await this.page
      .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 })
      .catch(() => {});
    // Wait for results to render (status is verified in verifyStatus() using ObjectStatus, which is unique per view)
    await this.page.waitForTimeout(2000);
    console.log(`[Steward] Search performed for: ${crNumber}`);
  }

  /**
   * Verify status của CR (page-level, may match hidden elements from other views)
   * @param status - Status cần verify (UNASSIGNED, ASSIGNED, INPROGRESS, ACTIVATED, REJECTED)
   */
  async verifyStatus(status: string): Promise<void> {
    console.log(`[Steward] Verifying CR status: ${status}`);
    await expect(this.page.getByRoleUI5('ObjectStatus', { text: status }).first()).toBeVisible({
      timeout: 20000,
    });
    console.log(`[Steward]  Status verified: ${status}`);
  }

  /**
   * Verify status của CR trong Activation tab (scoped to visible CR row)
   * Sử dụng tr:visible để tránh match ObjectStatus từ các view khác (hidden)
   * @param crNumber - CR cần verify
   * @param status - Status cần verify (UNASSIGNED, ASSIGNED, INPROGRESS, ACTIVATED, REJECTED)
   */
  async verifyRowStatus(crNumber: string, status: string, maxWaitMs = 240000): Promise<void> {
    console.log(`[Steward] Verifying CR ${crNumber} status: ${status}`);
    const startTime = Date.now();
    while (true) {
      await this.page
        .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 })
        .catch(() => {});
      const crRow = this.page.locator('tr:visible').filter({ hasText: crNumber });
      const rowVisible = await crRow.first().isVisible({ timeout: 5000 }).catch(() => false);
      if (rowVisible) {
        const statusMatch = await crRow.first().locator('.sapMObjStatus', { hasText: status }).first().isVisible({ timeout: 5000 }).catch(() => false);
        if (statusMatch) {
          console.log(`[Steward]  CR ${crNumber} status verified: ${status}`);
          return;
        }
        console.log(`[Steward]  CR ${crNumber} row found but status "${status}" not yet visible, re-searching...`);
      } else {
        console.log(`[Steward]  CR ${crNumber} row not found yet, re-searching...`);
      }
      const elapsed = Date.now() - startTime;
      if (elapsed >= maxWaitMs) {
        throw new Error(`[Steward] CR ${crNumber} did not reach status "${status}" after ${maxWaitMs / 1000}s`);
      }
      const remaining = Math.round((maxWaitMs - elapsed) / 1000);
      console.log(`[Steward]  ${remaining}s remaining`);
      await this.page.waitForTimeout(3000);
      await searchInActivation(this.page, this.searchField, crNumber);
    }
  }

  /**
   * Assign CR cho current user (Steward)
   * Flow: Click menu → Select "Assign to me" → Wait ASSIGNED
   * @param crNumber - CR cần assign
   */
  async assign(crNumber: string): Promise<void> {
    console.log(`[Steward] Assigning CR ${crNumber} to current user...`);
    await this.page.waitForTimeout(2000);
    await this.page
      .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 })
      .catch(() => {});
    console.log(`[Steward] Locating menu button in CR row...`);
    // Find the CR row then the "..." button within it (avoids hidden buttons from other views)
    const crRow = this.page.locator('tr').filter({ has: this.page.getByText(crNumber) }).first();
    await expect(crRow).toBeVisible({ timeout: 10000 });
    const menuBtn = crRow.getByRoleUI5('Button', { text: '...' }).first();
    await expect(menuBtn).toBeVisible({ timeout: 10000 });
    console.log(`[Steward] Clicking menu button...`);
    await menuBtn.click();
    await this.page.waitForTimeout(1000);
    console.log(`[Steward] Looking for 'Assign to me' menu item...`);
    const menuItem = this.page.getByRoleUI5('MenuItem', { text: 'Assign to me' }).first();
    await expect(menuItem).toBeVisible({ timeout: 20000 });
    console.log(`[Steward] Clicking 'Assign to me'...`);
    await menuItem.click();

    await expect
      .poll(
        async () => {
          return await this.page
            .getByRoleUI5('ObjectStatus', { text: 'ASSIGNED' })
            .first()
            .isVisible();
        },
        {
          message: 'Waiting for status to change to ASSIGNED',
          timeout: 60000,
          intervals: [2000, 3000, 5000],
        }
      )
      .toBe(true);

    console.log(`[Steward]  CR ${crNumber} assigned to current user — status: ASSIGNED`);
  }

  /**
   * Assign CR cho current user (Steward) — row-scoped (dùng tr:visible)
   * Tránh match hidden row/view khác; dùng trong single-account test
   * Flow: Click menu → Select "Assign to me" → Wait ASSIGNED
   * @param crNumber - CR cần assign
   */
  async assignRow(crNumber: string): Promise<void> {
    console.log(`[Steward] Assigning CR ${crNumber} to current user (row-scoped)...`);
    await this.page.waitForTimeout(2000);
    await this.page
      .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 })
      .catch(() => {});
    console.log(`[Steward] Locating visible CR row and menu button...`);
    const crRow = this.page.locator('tr:visible').filter({ hasText: crNumber });
    await expect(crRow.first()).toBeVisible({ timeout: 10000 });
    // Use button:visible to avoid matching hidden placeholder buttons in the same row
    const menuBtn = crRow.first().locator('button:visible').filter({ hasText: '...' }).first();
    await expect(menuBtn).toBeVisible({ timeout: 10000 });
    console.log(`[Steward] Clicking menu button...`);
    await menuBtn.click();
    await this.page.waitForTimeout(1000);
    console.log(`[Steward] Looking for 'Assign to me' menu item...`);
    const menuItem = this.page.getByRoleUI5('MenuItem', { text: 'Assign to me' }).first();
    await expect(menuItem).toBeVisible({ timeout: 20000 });
    console.log(`[Steward] Clicking 'Assign to me'...`);
    await menuItem.click();

    // Poll for ASSIGNED status using row-scoped check
    await expect(async () => {
      const row = this.page.locator('tr:visible').filter({ hasText: crNumber });
      await expect(
        row.first().locator('.sapMObjStatus', { hasText: 'ASSIGNED' }).first()
      ).toBeVisible({ timeout: 500 });
    }).toPass({ timeout: 60000, intervals: [2000, 3000, 5000] });

    console.log(`[Steward]  CR ${crNumber} assigned to current user — status: ASSIGNED`);
  }

  /**
   * Approve CR (Steward) — row-scoped
   * Tránh match hidden "..." button từ view khác
   * Flow: Click menu → Select "Approve" → Confirm OK
   * @param crNumber - CR cần approve
   */
  async approveRow(crNumber: string): Promise<void> {
    console.log(`[Steward] Approving CR ${crNumber} (row-scoped)...`);

    await this.page
      .waitForSelector('.sapUiLocalBusyIndicator', {
        state: 'hidden',
        timeout: 30000,
      })
      .catch(() => {});

    await this.page.waitForTimeout(1000);
    const crRow = this.page.locator('tr:visible').filter({ hasText: crNumber });
    await expect(crRow.first()).toBeVisible({ timeout: 10000 });
    // Use button:visible to avoid matching hidden placeholder buttons in the same row
    const menuBtn = crRow.first().locator('button:visible').filter({ hasText: '...' }).first();
    await expect(menuBtn).toBeVisible({ timeout: 5000 });
    await menuBtn.click();
    const menuItem = this.page.getByRoleUI5('MenuItem', { text: 'Approve' }).first();
    await expect(menuItem).toBeVisible({ timeout: 20000 });
    await menuItem.click();

    await this.dialog.confirmOnly('OK', { waitForDialog: false });
    console.log(`[Steward]  CR ${crNumber} approved`);
  }

  /**
   * Approve CR (Steward)
   * Flow: Click menu → Select "Approve" → Confirm OK
   * @param crNumber - CR cần approve
   */
  async approve(crNumber: string): Promise<void> {
    console.log(`[Steward] Approving CR: ${crNumber}`);

    await this.page
      .waitForSelector('.sapUiLocalBusyIndicator', {
        state: 'hidden',
        timeout: 30000,
      })
      .catch(() => {});

    await this.page.waitForTimeout(1000);
    await expect(this.menuButton).toBeVisible({ timeout: 5000 });
    await this.menuButton.click();
    const menuItem = this.page.getByRoleUI5('MenuItem', { text: 'Approve' }).first();
    await expect(menuItem).toBeVisible({ timeout: 20000 });
    await menuItem.click();

    await this.dialog.confirmOnly('OK', { waitForDialog: false });
    console.log(`[Steward]  CR ${crNumber} approved`);
  }

  /**
   * Reject CR (Steward)
   * Flow: Menu → Reject → (Optional comment) → Confirm Reject
   * @param crNumber - CR cần reject
   * @param comment - Lý do reject (optional)
   */
  async reject(crNumber: string, comment: string = ''): Promise<void> {
    console.log(`[Steward] Rejecting CR: ${crNumber}`);

    await this.page
      .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 })
      .catch(() => {});
    await this.page.waitForTimeout(1000);
    await expect(this.menuButton).toBeVisible({ timeout: 5000 });
    await this.menuButton.click();
    const menuItem = this.page.getByRoleUI5('MenuItem', { text: 'Reject' }).first();
    await expect(menuItem).toBeVisible({ timeout: 20000 });
    await menuItem.click();

    if (comment) {
      await this.page.locator('textarea[id$="reasonTextarea"]').fill(comment);
    }

    await this.page.getByLabel('Footer actions').getByRole('button', { name: 'Reject' }).click();

    console.log(`[Steward]  CR ${crNumber} rejected`);
  }

  /**
   * Rework CR (Steward) - Gửi lại cho Requestor
   * Flow: Menu → Rework → Select Requestor → Fill comment → Confirm Rework
   * @param crNumber - CR cần rework
   * @param comment - Lý do rework (optional)
   */
  async rework(crNumber: string, comment: string = ''): Promise<void> {
    console.log(`[Steward] Reworking CR: ${crNumber}`);

    await this.page.waitForTimeout(1000);
    await expect(this.menuButton).toBeVisible({ timeout: 5000 });
    await this.menuButton.click();
    const menuItem = this.page.getByRoleUI5('MenuItem', { text: 'Rework' }).first();
    await expect(menuItem).toBeVisible({ timeout: 20000 });
    await menuItem.click();
    console.log('[Steward] Clicked Rework menu item');

    await this.page
      .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 15000 })
      .catch(() => {});
    await this.page.getByRole('button', { name: 'Requestor' }).click();
    console.log('[Steward] Selected Requestor');

    const textArea = this.page.locator('.sapMDialog').last().getByRole('textbox');
    await textArea.click();

    if (comment) {
      await textArea.fill(comment);
      console.log('[Steward] Filled comment');
    }

    await this.page.getByLabel('Footer actions').getByRole('button', { name: 'Rework' }).click();
    console.log('[Steward] Clicked Rework button');

    await this.dialog.waitForDialogToClose(15000);
    console.log(`[Steward]  CR ${crNumber} reworked to Requestor`);
  }

  /**
   * Rework CR (Steward) - Gửi lại cho Approver (Last Approver)
   * Flow: Menu → Rework → Select Approver → Last Approver → Fill comment → Confirm Rework
   * @param crNumber - CR cần rework
   * @param comment - Lý do rework (optional)
   */
  async reworkToApprover(crNumber: string, comment: string = ''): Promise<void> {
    console.log('[Steward] Reworking CR ' + crNumber + ' to Approver (row-scoped)...');

    // Under parallel test load the backend/UI can be slower to settle: a click can land while
    // the row is still covered by the busy overlay and silently no-op (button visible ≠ interactive).
    // We verify each step actually took effect and retry the whole click-chain if it didn't,
    // instead of finding out 4 minutes later that the CR is still stuck at ASSIGNED.
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (attempt > 1) {
        console.log(`[Steward] Retry ${attempt}/${maxAttempts}: re-searching CR ${crNumber} before retrying Rework...`);
        await searchInActivation(this.page, this.searchField, crNumber);
      }

      await this.page.waitForTimeout(2000);
      await this.page
        .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 })
        .catch(() => {});
      // Extra settle so the busy overlay is fully gone before the click lands
      await this.page.waitForTimeout(500);

      const crRow = this.page.locator('tr:visible').filter({ hasText: crNumber });
      await expect(crRow.first()).toBeVisible({ timeout: 10000 });
      const menuBtn = crRow.first().locator('button:visible').filter({ hasText: '...' }).first();
      await expect(menuBtn).toBeVisible({ timeout: 10000 });
      await expect(menuBtn).toBeEnabled({ timeout: 10000 });
      await menuBtn.click();

      const menuItem = this.page.getByRoleUI5('MenuItem', { text: 'Rework' }).first();
      const menuOpened = await menuItem.isVisible({ timeout: 20000 }).catch(() => false);
      if (!menuOpened) {
        console.log(`[Steward] Rework menu item did not appear (attempt ${attempt}/${maxAttempts}), retrying...`);
        continue;
      }
      await menuItem.click();
      console.log('[Steward] Clicked Rework menu item');

      await this.page
        .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 15000 })
        .catch(() => {});

      const approverBtn = this.page.getByRole('button', { name: 'Approver' });
      const dialogOpened = await approverBtn.isVisible({ timeout: 10000 }).catch(() => false);
      if (!dialogOpened) {
        console.log(`[Steward] Rework dialog did not open (attempt ${attempt}/${maxAttempts}), retrying...`);
        continue;
      }
      await approverBtn.click();
      console.log('[Steward] Selected Approver');

      await this.page.getByText('Last Approver').click();
      console.log('[Steward] Selected Last Approver');

      const textbox = this.page.locator('.sapMDialog').last().getByRole('textbox');
      await textbox.click();

      if (comment) {
        await textbox.fill(comment);
        console.log('[Steward] Filled comment');
      }

      const reworkFooterBtn = this.page.getByLabel('Footer actions').getByRole('button', { name: 'Rework' });
      await expect(reworkFooterBtn).toBeEnabled({ timeout: 10000 });
      await reworkFooterBtn.click();
      console.log('[Steward] Clicked Rework button');

      await this.dialog.waitForDialogToClose(15000);

      // Verify the action actually took effect — if the row still shows ASSIGNED, the click
      // was swallowed (stale overlay) rather than actually triggering the Rework transition.
      const stillAssigned = await this.page
        .locator('tr:visible')
        .filter({ hasText: crNumber })
        .first()
        .locator('.sapMObjStatus', { hasText: 'ASSIGNED' })
        .first()
        .isVisible({ timeout: 8000 })
        .catch(() => false);

      if (!stillAssigned) {
        console.log('[Steward]  CR ' + crNumber + ' reworked to Approver');
        return;
      }

      console.log(`[Steward]  CR ${crNumber} still shows ASSIGNED after Rework click (attempt ${attempt}/${maxAttempts}), retrying...`);
    }

    throw new Error(`[Steward] CR ${crNumber} did not leave ASSIGNED status after ${maxAttempts} Rework-to-Approver attempts`);
  }

  /**
   * Wait cho CR đạt status ACTIVATED
   * @param crNumber - CR cần đợi
   * @param maxWaitMs - Timeout tối đa (default: 240000ms)
   */
  async waitForActivated(crNumber: string, maxWaitMs = 240000): Promise<void> {
    const POLL_INTERVAL_MS = 5000;
    const startTime = Date.now();
    console.log(`[Steward] Waiting for CR ${crNumber} to reach ACTIVATED status...`);
    console.log(
      `[Steward] Max wait time: ${maxWaitMs / 1000}s, Poll interval: ${POLL_INTERVAL_MS / 1000}s`
    );

    while (true) {
      await this.page
        .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 })
        .catch(() => {});
      await searchInActivation(this.page, this.searchField, crNumber);
      await this.page
        .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 })
        .catch(() => {});
      await expect(this.menuButton).toBeVisible({ timeout: 15000 });

      const isActivated = await this.page
        .getByRoleUI5('ObjectStatus', { text: 'ACTIVATED' })
        .first()
        .isVisible();

      if (isActivated) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`[Steward]  CR ${crNumber} reached ACTIVATED after ${elapsed}s`);
        return;
      }

      const elapsed = Date.now() - startTime;
      if (elapsed >= maxWaitMs) {
        throw new Error(
          `[Steward] CR ${crNumber} did not reach ACTIVATED after ${maxWaitMs / 1000}s`
        );
      }

      const remaining = Math.round((maxWaitMs - elapsed) / 1000);
      console.log(`[Steward] Still waiting... ${remaining}s remaining`);
      await this.page.waitForTimeout(POLL_INTERVAL_MS);
    }
  }

  /**
   * Wait cho CR đạt status ACTIVATED — row-scoped (dùng tr:visible)
   * Tránh match hidden button/ObjectStatus từ view khác
   * @param crNumber - CR cần đợi
   * @param maxWaitMs - Timeout tối đa (default: 240000ms)
   */
  async waitForActivatedRow(crNumber: string, maxWaitMs = 240000): Promise<void> {
    const POLL_INTERVAL_MS = 5000;
    const startTime = Date.now();
    console.log(`[Steward] Waiting for CR ${crNumber} to reach ACTIVATED (row-scoped)...`);

    while (true) {
      await this.page
        .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 })
        .catch(() => {});
      await searchInActivation(this.page, this.searchField, crNumber);
      await this.page
        .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 })
        .catch(() => {});

      const crRow = this.page.locator('tr:visible').filter({ hasText: crNumber });
      const hasRow = await crRow.last().isVisible();
      if (!hasRow) {
        console.log(`[Steward] CR row not found, re-searching...`);
        await this.page.waitForTimeout(POLL_INTERVAL_MS);
        continue;
      }

      const isActivated = await crRow.last()
        .locator('.sapMObjStatus', { hasText: 'ACTIVATED' })
        .first()
        .isVisible();

      if (isActivated) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`[Steward]  CR ${crNumber} reached ACTIVATED after ${elapsed}s`);
        return;
      }

      const elapsed = Date.now() - startTime;
      if (elapsed >= maxWaitMs) {
        throw new Error(
          `[Steward] CR ${crNumber} did not reach ACTIVATED after ${maxWaitMs / 1000}s`
        );
      }

      console.log(`[Steward] Still waiting... ${Math.round((maxWaitMs - elapsed) / 1000)}s remaining`);
      await this.page.waitForTimeout(POLL_INTERVAL_MS);
    }
  }

  /**
   * Change priority của CR (Steward)
   * Flow: Menu → Change Priority → Select priority → Fill reason → Save
   * @param priority - Priority mới (vd: 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW')
   * @param reason - Lý do thay đổi priority
   */
  async changePriority(priority: string, reason: string): Promise<void> {
    console.log(`[Steward] Changing priority to ${priority}...`);

    await this.page
      .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 })
      .catch(() => {});
    await this.page.waitForTimeout(1000);
    await expect(this.menuButton).toBeVisible({ timeout: 5000 });
    await this.menuButton.click();
    const menuItem = this.page.getByRoleUI5('MenuItem', { text: 'Change Priority' }).first();
    await expect(menuItem).toBeVisible({ timeout: 20000 });
    await menuItem.click();
    console.log('[Steward] Clicked Change Priority');

    await this.page.getByLabel('Select Options').click();
    await this.page.getByText(priority, { exact: true }).click();
    console.log(`[Steward] Selected priority: ${priority}`);

    await this.page.getByRole('textbox', { name: 'Reason' }).click();
    await this.page.getByRole('textbox', { name: 'Reason' }).fill(reason);
    console.log(`[Steward] Filled reason: "${reason}"`);

    await this.page.getByRole('button', { name: 'Save' }).click();
    console.log(`[Steward]  Priority changed to ${priority}`);
  }

  /**
   * Accept Duplication Check (Steward phase)
   * Được gọi khi CR có status DUPLICATE sau khi steward approve/assign
   * Flow: Search CR → Click DUPLICATE status → Close dialog → "..." → "Accept and activate" → OK
   * @param crNumber - CR number đang ở status DUPLICATE
   * @param comment - Comment cho duplication accept (optional)
   */
  async acceptDuplication(crNumber: string, comment?: string): Promise<void> {
    console.log(`[Steward] Accepting duplication check for CR: ${crNumber}`);

    const maxWait = 240000;
    const startTime = Date.now();

    // ── POLLING: re-search until DUPLICATE ObjectStatus appears ──
    while (true) {
      await this.page
        .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 })
        .catch(() => {});
      await searchInActivation(this.page, this.searchField, crNumber);
      await this.page
        .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 })
        .catch(() => {});
      await expect(this.menuButton).toBeVisible({ timeout: 30000 });
      console.log(`[Steward] Searched for CR: ${crNumber}`);

      await this.page.waitForTimeout(3000);

      const dupStatus = this.page.getByRoleUI5('ObjectStatus', { text: 'DUPLICATE' });
      if (await dupStatus.isVisible().catch(() => false)) {
        console.log(`[Steward] DUPLICATE status found for CR: ${crNumber}`);
        await dupStatus.click();
        console.log('[Steward] Clicked DUPLICATE status to view dialog');
        break;
      }

      const elapsed = Date.now() - startTime;
      if (elapsed >= maxWait) {
        throw new Error(
          `[Steward] CR ${crNumber} did not reach DUPLICATE status in activation after ${maxWait / 1000}s`
        );
      }

      console.log(
        `[Steward] DUPLICATE not yet visible, re-searching... ${Math.round((maxWait - elapsed) / 1000)}s remaining`
      );
      await this.page.waitForTimeout(3000);
    }

    // Close the dialog (following codegen)
    await this.page.waitForTimeout(1000);
    await this.page.getByRoleUI5('Button', { text: 'Close' }).first().click();
    console.log('[Steward] Closed DUPLICATE status dialog');

    // Under parallel test load a click can land while the row is still covered by the busy
    // overlay and silently no-op (button visible ≠ interactive), leaving CR stuck at DUPLICATE.
    // Retry the menu → Accept and activate → OK chain if that happens instead of relying on the
    // caller's downstream waitForActivated() to time out 4 minutes later.
    const maxAttempts = 3;
    let accepted = false;

    for (let attempt = 1; attempt <= maxAttempts && !accepted; attempt++) {
      if (attempt > 1) {
        console.log(`[Steward] Retry ${attempt}/${maxAttempts}: re-checking menu for CR ${crNumber}...`);
        await this.page
          .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 })
          .catch(() => {});
        await this.page.waitForTimeout(1000);
      }

      // Click "..." menu button
      await this.page
        .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 })
        .catch(() => {});
      await this.page.waitForTimeout(500);
      await expect(this.menuButton).toBeVisible({ timeout: 30000 });
      await expect(this.menuButton).toBeEnabled({ timeout: 10000 });
      await this.menuButton.click();
      console.log('[Steward] Clicked "..." menu');

      const menuItem = this.page.getByRoleUI5('MenuItem', { text: 'Accept and activate' }).first();
      const menuOpened = await menuItem.isVisible({ timeout: 20000 }).catch(() => false);
      if (!menuOpened) {
        console.log(`[Steward] "Accept and activate" menu item did not appear (attempt ${attempt}/${maxAttempts}), retrying...`);
        continue;
      }
      await menuItem.click();
      console.log('[Steward] Clicked "Accept and activate"');

      // Wait for dialog and handle textarea (similar to Requestor/Approver)
      await this.page.waitForTimeout(1000);
      const dialogTextArea = this.page.locator('textarea').first();
      const hasDialog = await dialogTextArea.isVisible({ timeout: 5000 }).catch(() => false);

      if (hasDialog) {
        await dialogTextArea.click();
        console.log('[Steward] Clicked TextArea in dialog');

        // Fill comment if provided
        if (comment) {
          await dialogTextArea.fill(comment);
          console.log(`[Steward] Filled comment: ${comment}`);
        }

        // Click Approve/Submit in dialog (if needed)
        const dialogApproveBtn = this.page.getByRoleUI5('Button', { text: 'Approve' }).first();
        const hasApproveBtn = await dialogApproveBtn.isVisible({ timeout: 2000 }).catch(() => false);
        if (hasApproveBtn) {
          await dialogApproveBtn.click();
          console.log('[Steward] Clicked Approve/Submit in dialog');
          await this.page.waitForTimeout(1000);
        }
      }

      // Click OK to confirm (following codegen)
      const okBtn = this.page.getByRoleUI5('Button', { text: 'OK' }).first();
      const hasOkBtn = await okBtn.isVisible({ timeout: 5000 }).catch(() => false);
      if (hasOkBtn) {
        await okBtn.click();
      }
      await this.page.waitForTimeout(1000);
      await this.page
        .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 })
        .catch(() => {});

      // Verify the action actually took effect — if the row still shows DUPLICATE, the click
      // chain was swallowed (stale overlay) rather than actually triggering activation.
      const stillDuplicate = await this.page
        .getByRoleUI5('ObjectStatus', { text: 'DUPLICATE' })
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      if (stillDuplicate) {
        console.log(`[Steward]  CR ${crNumber} still shows DUPLICATE after accept (attempt ${attempt}/${maxAttempts}), retrying...`);
        continue;
      }

      accepted = true;
    }

    if (!accepted) {
      throw new Error(`[Steward] CR ${crNumber} did not leave DUPLICATE status after ${maxAttempts} accept-duplication attempts`);
    }

    // The activation confirm dialog can leave the modal blocklayer behind for a moment after it
    // closes; clear it now so the caller's immediate follow-up (e.g. waitForActivated's search)
    // doesn't hang waiting on an overlay that's already on its way out.
    await closeBlockingPopup(this.page);

    console.log(`[Steward]  Duplication accepted for CR ${crNumber}`);
  }
}

export function createStewardActions(page: Page): StewardActions {
  return new StewardActions(page);
}
