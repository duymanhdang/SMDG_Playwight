import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { searchInActivation } from '../../helpers/search';
import { DialogHelper, createDialogHelper } from '../../helpers/ui';

export class ActivationPage extends BasePage {
  readonly searchField: Locator;
  readonly menuButton: Locator;
  private dialog: DialogHelper;

  constructor(page: Page) {
    super(page);
    this.searchField = this.page.locator('[id$="activateRequestSearchFields-I"]');
    this.menuButton = this.page.getByRoleUI5('Button', { text: '...' }).first();
    this.dialog = createDialogHelper(page);
  }

  async goto(): Promise<void> {
    console.log('[Activation] Navigating to Activation tab...');
    // Wait for page to settle before clicking tab (avoids failed tab switch after login/navigation)
    await this.page.waitForTimeout(3000);
    await this.navigateTo('Activation');
    await this.waitForBusy(60000);
    await expect(this.searchField).toBeVisible({ timeout: 15000 });
    await this.waitForBusy(60000);
    await this.page.waitForTimeout(3000);
    console.log('[Activation] Activation tab loaded');
  }

  async searchCR(crNumber: string): Promise<void> {
    console.log(`[Activation] Searching for CR: ${crNumber}`);
    await this.waitForBusy(30000);
    await searchInActivation(this.page, this.searchField, crNumber);
    await this.waitForBusy(30000);
    await expect(this.menuButton).toBeVisible({ timeout: 30000 });
    console.log(`[Activation] Search results loaded for: ${crNumber}`);
  }

  async verifyStatus(status: string): Promise<void> {
    console.log(`[Activation] Verifying CR status: ${status}`);
    await expect(this.page.getByRoleUI5('ObjectStatus', { text: status }).first()).toBeVisible({
      timeout: 20000,
    });
    console.log(`[Activation]  Status verified: ${status}`);
  }

  async assignToMe(crNumber: string): Promise<void> {
    console.log(`[Activation] Assigning CR ${crNumber} to current user...`);
    await this.waitForBusy(30000);
    await this.page.waitForTimeout(1000);
    await expect(this.menuButton).toBeVisible({ timeout: 5000 });
    await this.menuButton.click();
    const menuItem = this.page.getByRoleUI5('MenuItem', { text: 'Assign to me' }).first();
    await expect(menuItem).toBeVisible({ timeout: 20000 });
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
    console.log(`[Activation]  CR ${crNumber} assigned — status: ASSIGNED`);
  }

  async approve(crNumber: string): Promise<void> {
    console.log(`[Activation] Approving CR: ${crNumber}`);
    await this.waitForBusy(30000);
    await this.page.waitForTimeout(1000);
    await expect(this.menuButton).toBeVisible({ timeout: 5000 });
    await this.menuButton.click();
    const menuItem = this.page.getByRoleUI5('MenuItem', { text: 'Approve' }).first();
    await expect(menuItem).toBeVisible({ timeout: 20000 });
    await menuItem.click();
    await this.dialog.confirmOnly('OK', { waitForDialog: false });
    console.log(`[Activation]  CR ${crNumber} approved`);
  }

  async clickCRLink(crNumber: string): Promise<void> {
    console.log(`[Activation] Clicking CR link: ${crNumber}`);
    await this.waitForBusy(5000);
    await this.page.getByRoleUI5('ObjectStatus', { text: crNumber }).click();
    // The MM01 detail form is long and renders in sections (Global Data, Basic
    // Data, Dimensions/EANs, Units of Measure...) — 5s isn't enough for it to
    // fully settle under load, matching the 30s convention used for other
    // "detail page load" waits elsewhere (e.g. MyInboxPage.openCRDetail).
    await this.waitForBusy(30000);
    console.log('[Activation] CR detail opened');
  }

  async waitForActivated(crNumber: string, maxWaitMs = 180000): Promise<void> {
    const POLL_INTERVAL_MS = 5000;
    const startTime = Date.now();
    console.log(`[Activation] Waiting for CR ${crNumber} to reach ACTIVATED status...`);
    while (true) {
      await this.searchCR(crNumber);
      const isActivated = await this.page
        .getByRoleUI5('ObjectStatus', { text: 'ACTIVATED' })
        .isVisible();
      if (isActivated) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`[Activation]  CR ${crNumber} reached ACTIVATED after ${elapsed}s`);
        return;
      }
      const elapsed = Date.now() - startTime;
      if (elapsed >= maxWaitMs) {
        throw new Error(
          `[Activation] CR ${crNumber} did not reach ACTIVATED after ${maxWaitMs / 1000}s`
        );
      }
      const remaining = Math.round((maxWaitMs - elapsed) / 1000);
      console.log(`[Activation] Still waiting... ${remaining}s remaining`);
      await this.page.waitForTimeout(POLL_INTERVAL_MS);
    }
  }

  async acceptDuplication(crNumber: string, comment?: string): Promise<void> {
    console.log(`[Activation] Accepting duplication check for CR: ${crNumber}`);
    const maxWait = 180000;
    const startTime = Date.now();
    while (true) {
      await this.searchCR(crNumber);
      await this.waitForBusy(30000);
      const dupStatus = this.page.getByRoleUI5('ObjectStatus', { text: 'DUPLICATE' });
      if (await dupStatus.isVisible().catch(() => false)) {
        console.log(`[Activation] DUPLICATE status found for CR: ${crNumber}`);
        await dupStatus.click();
        break;
      }
      const elapsed = Date.now() - startTime;
      if (elapsed >= maxWait) {
        throw new Error(
          `[Activation] CR ${crNumber} did not reach DUPLICATE status after ${maxWait / 1000}s`
        );
      }
      await this.page.waitForTimeout(3000);
    }
    await this.page.waitForTimeout(1000);
    await this.page.getByRoleUI5('Button', { text: 'Close' }).click();
    await this.page.waitForTimeout(1000);
    await expect(this.menuButton).toBeVisible({ timeout: 30000 });
    await this.menuButton.click();
    const menuItem = this.page.getByRoleUI5('MenuItem', { text: 'Accept and activate' }).first();
    await expect(menuItem).toBeVisible({ timeout: 20000 });
    await menuItem.click();
    await this.page.waitForTimeout(1000);
    const dialogTextArea = this.page.locator('textarea').first();
    const hasDialog = await dialogTextArea.isVisible({ timeout: 5000 }).catch(() => false);
    if (hasDialog) {
      await dialogTextArea.click();
      if (comment) {
        await dialogTextArea.fill(comment);
      }
      const dialogApproveBtn = this.page.getByRoleUI5('Button', { text: 'Approve' }).first();
      const hasApproveBtn = await dialogApproveBtn.isVisible({ timeout: 2000 }).catch(() => false);
      if (hasApproveBtn) {
        await dialogApproveBtn.click();
        await this.page.waitForTimeout(1000);
      }
    }
    await this.page.getByRoleUI5('Button', { text: 'OK' }).first().click();
    await this.page.waitForTimeout(1000);
    console.log(`[Activation]  Duplication accepted for CR ${crNumber}`);
  }
}
