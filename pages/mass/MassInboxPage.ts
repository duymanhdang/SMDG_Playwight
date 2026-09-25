import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../BasePage';

/**
 * MassInboxPage — Tab My Inbox > Mass (Approver view)
 *
 * ═══════════════════════════════════════════════════════════════
 * FLOW TỔNG QUAN (Mass Approver)
 * ═══════════════════════════════════════════════════════════════
 *   goto() → searchCR() → verifyStatus() → openCRDetail()
 *   → acceptAndApprove() → verifyCRLeft()
 *
 * ═══════════════════════════════════════════════════════════════
 * SO SÁNH: Mass vs Single Approver (MyInboxPage)
 * ═══════════════════════════════════════════════════════════════
 *   ┌────────────────┬────────────────────┬──────────────────┐
 *   │   Yếu tố       │ Mass               │ Single           │
 *   ├────────────────┼────────────────────┼──────────────────┤
 *   │ Search field   │ id$="myInboxSearch │ getByRoleUI5     │
 *   │                │ -I" (dùng id$ vì   │ ('SearchField')  │
 *   │                │ có 2 search fields │                  │
 *   │                │ trong detail view) │                  │
 *   ├────────────────┼────────────────────┼──────────────────┤
 *   │ Search button  │ id$="myInboxSearch │ getByRoleUI5     │
 *   │                │ -search"           │ ('Button',{text: │
 *   │                │ (click để search)  │ 'Search'})       │
 *   ├────────────────┼────────────────────┼──────────────────┤
 *   │ Approve action │ Accept & Approve   │ Approve          │
 *   │                │ → All Items        │ → Confirm dialog │
 *   │                │ (mass action)      │ (single action)  │
 *   ├────────────────┼────────────────────┼──────────────────┤
 *   │ Verify left    │ "No data" table    │ getByRoleUI5     │
 *   │                │ (mass ko có CR)    │ ('ObjectStatus', │
 *   │                │                    │ {text:'APPROVED'})│
 *   └────────────────┴────────────────────┴──────────────────┘
 *
 * ═══════════════════════════════════════════════════════════════
 * LƯU Ý LOCATORS
 * ═══════════════════════════════════════════════════════════════
 *   - [id$="myInboxSearch-I"]: dùng id$= thay vì getByRoleUI5
 *     vì trong detail view có 2 SearchField — chỉ id$ mới
 *     phân biệt được search ở list view
 *   - getByRoleUI5('Link', { text: crNumber }): link CR number
 *   - getByRoleUI5('Button', { text: 'Accept & Approve' }):
 *     nằm trong detail view header
 *   - getByRoleUI5('MenuItem', { text: 'All Items' }): submenu
 *     của Accept & Approve dropdown
 *   - getByRoleUI5('Table', { noDataText: 'No data' }): dùng
 *     để verify CR đã rời khỏi inbox
 *
 * ═══════════════════════════════════════════════════════════════
 * LƯU Ý KHI CUSTOM
 * ═══════════════════════════════════════════════════════════════
 *   - acceptAndApprove(): Action này chỉ có trong Mass view
 *     Single Approver dùng nút "Approve" riêng lẻ
 *   - verifyCRLeft(): Phải goto() lại list view trước khi search
 *     vì đang ở detail view — nếu ko search sẽ sai
 *   - "No data" table cần timeout lớn (30s) vì backend mất thời
 *     gian process approve rồi mới clear CR khỏi inbox
 */
export class MassInboxPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    console.log('[MassInbox] Navigating to My Inbox > Mass...');
    await this.navigateTo('My Inbox');
    await this.page.getByRoleUI5('IconTabFilter', { text: 'Mass' }).click();
    await this.page.waitForTimeout(1000);
    await expect(this.page.locator('[id$="myInboxSearch-I"]')).toBeVisible();
    console.log('[MassInbox] Mass Inbox tab loaded');
  }

  async searchCR(crNumber: string): Promise<void> {
    console.log(`[MassInbox] Searching for CR: ${crNumber}`);
    const searchField = this.page.locator('[id$="myInboxSearch-I"]').first();
    await expect(searchField).toBeVisible({ timeout: 10000 });
    await this.page
      .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 15000 })
      .catch(() => {});
    await searchField.click();
    await searchField.fill(crNumber);
    // Press Enter instead of clicking the search icon — that icon re-renders
    // right after fill() (empty -> clear icon), which is flaky under headless/CI load.
    await searchField.press('Enter');
    await this.page.waitForTimeout(2000);
    await this.page
      .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 15000 })
      .catch(() => {});
  }

  async verifyStatus(crNumber: string, status: string): Promise<void> {
    console.log(`[MassInbox] Verifying CR ${crNumber} has status ${status}...`);
    await expect(
      this.page.getByRoleUI5('ObjectStatus', { text: status }).first()
    ).toBeVisible({ timeout: 15000 });
    console.log(`[MassInbox] CR ${crNumber} status verified: ${status}`);
  }

  async openCRDetail(crNumber: string): Promise<void> {
    console.log(`[MassInbox] Opening CR detail: ${crNumber}`);
    const crLink = this.page.getByRoleUI5('Link', { text: crNumber });
    await expect(crLink).toBeVisible({ timeout: 15000 });
    await crLink.click();
    await this.page.waitForTimeout(3000);
    await this.page
      .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 })
      .catch(() => {});
    console.log('[MassInbox] CR detail page loaded');
  }

  async acceptAndApprove(): Promise<void> {
    console.log('[MassInbox] Clicking Accept & Approve...');
    const acceptBtn = this.page.getByRoleUI5('Button', { text: 'Accept & Approve' });
    await expect(acceptBtn).toBeVisible({ timeout: 15000 });
    await acceptBtn.click();
    await this.page.waitForTimeout(1000);

    console.log('[MassInbox] Selecting All Items...');
    const allItems = this.page.getByRoleUI5('MenuItem', { text: 'All Items' });
    await expect(allItems).toBeVisible({ timeout: 10000 });
    await allItems.click();

    console.log('[MassInbox] Waiting for processing to complete...');
    await this.page.waitForTimeout(3000);
    await this.page
      .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 60000 })
      .catch(() => {});
  }

  async rejectAllItems(): Promise<void> {
    console.log('[MassInbox] Clicking Reject...');
    const rejectBtn = this.page.getByRoleUI5('Button', { text: 'Reject' });
    await expect(rejectBtn).toBeVisible({ timeout: 15000 });
    await rejectBtn.click();
    await this.page.waitForTimeout(1000);

    console.log('[MassInbox] Selecting All Items...');
    const allItems = this.page.getByRoleUI5('MenuItem', { text: 'All Items' });
    await expect(allItems).toBeVisible({ timeout: 10000 });
    await allItems.click();

    console.log('[MassInbox] Waiting for processing to complete...');
    await this.page.waitForTimeout(3000);
    await this.page
      .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 60000 })
      .catch(() => {});
  }

  async verifyCRLeft(crNumber: string, maxWaitMs = 90000): Promise<void> {
    console.log(`[MassInbox] Verifying CR ${crNumber} has left inbox...`);
    await this.goto();
    await this.page.waitForTimeout(2000);

    const searchField = this.page.locator('[id$="myInboxSearch-I"]');
    await expect(searchField).toBeVisible({ timeout: 10000 });
    const noDataTable = this.page.getByRoleUI5('Table', { noDataText: 'No data' }).first();
    const startTime = Date.now();

    while (true) {
      await searchField.fill(crNumber);
      await this.page
        .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 15000 })
        .catch(() => {});
      // Press Enter instead of clicking the search icon — that icon re-renders
      // right after fill() (empty -> clear icon), which is flaky under headless/CI load.
      await searchField.press('Enter');
      await this.page.waitForTimeout(3000);

      if (await noDataTable.isVisible().catch(() => false)) {
        console.log(`[MassInbox] CR ${crNumber} has left inbox`);
        return;
      }

      const elapsed = Date.now() - startTime;
      if (elapsed >= maxWaitMs) {
        throw new Error(`[MassInbox] CR ${crNumber} did not leave inbox after ${maxWaitMs / 1000}s`);
      }
      console.log(`[MassInbox] CR ${crNumber} still in inbox, retrying... ${Math.round((maxWaitMs - elapsed) / 1000)}s remaining`);
      await this.page.waitForTimeout(3000);
    }
  }

  async acceptDuplicateApprover(crNumber: string): Promise<void> {
    console.log(`[MassInbox] Accepting duplicate as Approver for CR: ${crNumber}`);

    // 1. Click CR link → detail view
    await this.page.getByRoleUI5('Link', { text: crNumber }).click();
    await this.page.waitForTimeout(3000);
    await this.page
      .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 })
      .catch(() => {});

    // 2. Round 1: Accept & Approve → All Items (normal approval, triggers duplicate detection)
    await this.page.getByRoleUI5('Button', { text: 'Accept & Approve' }).click();
    await this.page.getByRoleUI5('MenuItem', { text: 'All Items' }).click();
    await this.page.waitForTimeout(3000);
    await this.page
      .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 60000 })
      .catch(() => {});

    // 3. Navigate back to inbox list view (app returns here after Round 1 processing)
    await this.goto();
    await this.searchCR(crNumber);

    // 4. Round 2: Verify IN_APPROVAL (poll/re-search) → click CR link → Duplicate(5) → Accept & Approve → All Items
    const searchField2 = this.page.locator('[id$="myInboxSearch-I"]');
    const inApprovalStatus = this.page.getByRoleUI5('ObjectStatus', { text: 'IN_APPROVAL' }).first();
    let foundApproval = await inApprovalStatus.isVisible().catch(() => false);
    const startTime2 = Date.now();
    const maxWait2 = 90000;

    while (!foundApproval) {
      const elapsed = Date.now() - startTime2;
      if (elapsed >= maxWait2) {
        throw new Error(`[MassInbox] IN_APPROVAL not found after ${maxWait2 / 1000}s for CR ${crNumber}`);
      }
      console.log(`[MassInbox] IN_APPROVAL not yet visible, re-searching... ${Math.round((maxWait2 - elapsed) / 1000)}s remaining`);
      await this.page.waitForTimeout(3000);
      await this.page.waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 15000 }).catch(() => {});
      await searchField2.fill(crNumber);
      await this.page.waitForTimeout(1000);
      // Press Enter instead of clicking the search icon — that icon re-renders
      // right after fill() (empty -> clear icon), which is flaky under headless/CI load.
      await searchField2.press('Enter');
      await this.page.waitForTimeout(3000);
      foundApproval = await inApprovalStatus.isVisible().catch(() => false);
    }

    await this.page.getByRoleUI5('Link', { text: crNumber }).click();
    await this.page.waitForTimeout(3000);
    await this.page
      .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 })
      .catch(() => {});

    await expect(
      this.page.getByRoleUI5('Button', { text: 'Duplicate (5)' })
    ).toBeVisible({ timeout: 30000 });
    await this.page.getByRoleUI5('Button', { text: 'Duplicate (5)' }).click();
    await this.page.getByRoleUI5('Button', { text: 'Accept & Approve' }).click();
    await this.page.getByRoleUI5('MenuItem', { text: 'All Items' }).click();

    // 5. Wait for processing and verify CR left inbox → No data (poll)
    await this.page.waitForTimeout(3000);
    await this.page
      .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 60000 })
      .catch(() => {});

    await this.goto();
    const searchField3 = this.page.locator('[id$="myInboxSearch-I"]');
    const noDataTable2 = this.page.getByRoleUI5('Table', { noDataText: 'No data' }).first();
    const startTime3 = Date.now();
    const maxWait3 = 90000;

    while (true) {
      await this.page.waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 15000 }).catch(() => {});
      await searchField3.fill(crNumber);
      await this.page.waitForTimeout(1000);
      // Press Enter instead of clicking the search icon — that icon re-renders
      // right after fill() (empty -> clear icon), which is flaky under headless/CI load.
      await searchField3.press('Enter');
      await this.page.waitForTimeout(3000);

      if (await noDataTable2.isVisible().catch(() => false)) {
        break;
      }

      const elapsed = Date.now() - startTime3;
      if (elapsed >= maxWait3) {
        throw new Error(`[MassInbox] CR ${crNumber} did not leave inbox after ${maxWait3 / 1000}s`);
      }
      console.log(`[MassInbox] CR ${crNumber} still in inbox, retrying... ${Math.round((maxWait3 - elapsed) / 1000)}s remaining`);
      await this.page.waitForTimeout(3000);
    }

    console.log(`[MassInbox] Duplicate accepted for CR ${crNumber} — left inbox`);
  }
}
