import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { DialogHelper, createDialogHelper } from '../../helpers/ui';

export class MyInboxPage extends BasePage {
  private dialog: DialogHelper;

  constructor(page: Page) {
    super(page);
    this.dialog = createDialogHelper(page);
  }

  async goto(): Promise<void> {
    console.log('[MyInbox] Navigating to My Inbox tab...');
    // Previously this retried the tab click by bouncing between "My Request"
    // and "My Inbox" up to 5 times when the search field didn't appear within
    // 20s. Observed live (headed run, S4_QAS project): that bouncing itself
    // was the problem — each switch-away interrupts whatever "My Inbox" was
    // still in the middle of rendering, so it can never finish loading and
    // every attempt "fails" identically regardless of how long we'd otherwise
    // wait. Click once and give it one long, uninterrupted wait instead.
    await this.navigateTo('My Inbox');
    const searchField = this.page.locator('[id$="myInboxSearch-I"]');
    await expect(searchField).toBeVisible({ timeout: 60000 });
    console.log('[MyInbox] My Inbox tab loaded');
  }

  async searchCR(crNumber: string): Promise<void> {
    console.log(`[MyInbox] Searching for CR: ${crNumber}`);
    const searchField = this.page.locator('[id$="myInboxSearch-I"]');
    await expect(searchField).toBeVisible({ timeout: 10000 });
    await searchField.fill(crNumber);
    // The search icon is a UI5-rendered div that swaps/re-renders right after fill()
    // (empty -> clear icon), so clicking it races that re-render and is flaky under
    // headless/CI load. Pressing Enter on the input triggers the same search event
    // without depending on that element's transient visibility/stability.
    await this.page.waitForTimeout(300);
    await searchField.press('Enter');
    console.log(`[MyInbox] Search executed for: ${crNumber}`);
  }

  async waitForCR(crNumber: string): Promise<void> {
    console.log(`[MyInbox] Waiting for CR ${crNumber} to appear in inbox...`);
    await expect
      .poll(
        async () => {
          return await this.page.getByRoleUI5('Link', { text: crNumber }).count();
        },
        {
          message: `Waiting for CR ${crNumber} to appear in My Inbox`,
          timeout: 15000,
        }
      )
      .toBeGreaterThan(0);
    console.log(`[MyInbox] CR ${crNumber} found in inbox`);
  }

  async verifyStatusInInbox(crNumber: string, status: string): Promise<void> {
    console.log(`[MyInbox] Verifying CR ${crNumber} has status ${status} in inbox`);
    await expect
      .poll(
        async () => {
          return await this.page
            .getByRoleUI5('ColumnListItem')
            .filter({ hasText: crNumber })
            .count();
        },
        { message: `Waiting for CR ${crNumber} row`, timeout: 10000 }
      )
      .toBeGreaterThan(0);
    const crRow = this.page.getByRoleUI5('ColumnListItem').filter({ hasText: crNumber });
    await expect(crRow).toBeVisible({ timeout: 10000 });
    await this.page.waitForTimeout(500);
    await expect(crRow.getByRoleUI5('ObjectStatus', { text: status })).toBeVisible();
    console.log(`[MyInbox]  CR ${crNumber} verified with status: ${status}`);
  }

  async openCRDetail(crNumber: string, objectType = 'BusinessPartner', confirmLabel = 'Business Partner'): Promise<void> {
    const label = this.page.locator('bdi').filter({ hasText: confirmLabel }).first();
    const maxAttempts = 3;

    // A raw page.goto() to the detail hash route is a no-op/unreliable boot of
    // the SPA (seen as 30s timeouts waiting for the confirm label even though
    // the URL shows the target route). Click the CR link from the search
    // results instead. NOTE: the My Inbox results table is NOT a ColumnListItem
    // (that assumption made attempt #1 of this fix fail identically — the
    // scoped locator matched nothing every time); use a plain page-wide Link
    // locator, the same pattern already proven by MassInboxPage.openCRDetail()
    // and MainDuplicationRuleVerifyPage.openCRDetail(), both of which are
    // actually exercised by passing specs.
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`[MyInbox] Opening CR detail (attempt ${attempt}/${maxAttempts}): ${crNumber} (objectType: ${objectType})`);
      if (attempt > 1) {
        console.log(`[MyInbox]  Retry ${attempt}/${maxAttempts} — re-searching CR ${crNumber}...`);
        await this.page.waitForTimeout(2000);
        await this.searchCR(crNumber);
      }
      await this.waitForBusy(30000).catch(() => {});
      await this.page.waitForTimeout(1000);

      const crLink = this.page.getByRoleUI5('Link', { text: crNumber }).first();

      try {
        await expect(crLink).toBeVisible({ timeout: 15000 });
        await crLink.click();
        await this.waitForBusy(30000);
        console.log(`[MyInbox] Waiting for "${confirmLabel}" label...`);
        await expect(label).toBeVisible({ timeout: 30000 });
        console.log(`[MyInbox] CR detail page loaded — ${confirmLabel} label visible`);
        return;
      } catch (e) {
        const labelCount = await label.count().catch(() => 0);
        console.log(
          `[MyInbox] "${confirmLabel}" not visible (attempt ${attempt}/${maxAttempts}) ` +
            `— labelCount=${labelCount}, url=${this.page.url()}, error=${(e as Error).message.split('\n')[0]}`
        );
      }
    }
    throw new Error(`[MyInbox] Failed to open CR detail for ${crNumber} after ${maxAttempts} attempts`);
  }

  async verifyCRLeft(crNumber: string, maxWaitMs = 90000): Promise<void> {
    console.log(`[MyInbox] Verifying CR ${crNumber} has left My Inbox...`);

    // Navigate back to list view first (currently in detail view after approval)
    await this.goto();
    await this.page.waitForTimeout(2000);

    const inboxSearch = this.page.locator('[id$="myInboxSearch-I"]');
    await expect(inboxSearch).toBeVisible({ timeout: 10000 });

    const noDataTable = this.page.getByRoleUI5('Table', { noDataText: 'No data' }).first();
    const startTime = Date.now();

    while (true) {
      await inboxSearch.fill(crNumber);

      await this.page
        .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 15000 })
        .catch(() => {});

      // Press Enter instead of clicking the search icon — that icon re-renders
      // right after fill() (empty -> clear icon), which is flaky under headless/CI load.
      await inboxSearch.press('Enter');
      await this.page.waitForTimeout(3000);

      if (await noDataTable.isVisible().catch(() => false)) {
        console.log(`[MyInbox]  CR ${crNumber} has left My Inbox — approval processed`);
        return;
      }

      const elapsed = Date.now() - startTime;
      if (elapsed >= maxWaitMs) {
        throw new Error(
          `[MyInbox] CR ${crNumber} did not leave My Inbox after ${maxWaitMs / 1000}s`
        );
      }

      console.log(
        `[MyInbox] CR ${crNumber} still in inbox, retrying... ${Math.round((maxWaitMs - elapsed) / 1000)}s remaining`
      );
      await this.page.waitForTimeout(3000);
    }
  }
}
