import { Page, Locator, expect } from '@playwright/test';
import { loginToSimpleMDG, loginAs } from '../helpers/auth';

/**
 * BasePage — class cơ sở cho tất cả Page Objects
 * Chứa các methods dùng chung giữa các page
 */
export class BasePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Login với Requestor account (default)
   */
  async login(): Promise<void> {
    await loginToSimpleMDG(this.page);
  }

  /**
   * Login với account tùy chỉnh (Approver, Steward)
   */
  async loginAs(user: string, pass: string): Promise<void> {
    await loginAs(this.page, user, pass);
  }

  /**
   * Navigate đến tab bằng text
   */
  async navigateTo(tabText: string): Promise<void> {
    await this.waitForBusy();
    const tab = this.page.getByRoleUI5('IconTabFilter', { text: tabText }).first();
    await expect(tab).toBeVisible({ timeout: 5000 });

    // Retry loop: a modal popup blocklayer (#sap-ui-blocklayer-popup) may still be
    // closing (e.g. right after an Approve/Reject dialog) and reappears between
    // waitForPopupClosed and the click, intercepting pointer events (flaky).
    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= 5; attempt++) {
      // Wait for any modal popup blocklayer to clear before switching tabs —
      // otherwise #sap-ui-blocklayer-popup intercepts the tab click (flaky).
      await this.waitForPopupClosed(30000);
      await this.waitForBusy(15000);
      try {
        await tab.click({ timeout: 10000 });
        await this.waitForBusy();
        return;
      } catch (e) {
        lastError = e as Error;
        console.log(
          `[BasePage] Tab "${tabText}" click intercepted (${lastError?.message?.slice(0, 80)}) — retrying...`
        );
      }
    }
    throw new Error(
      `[BasePage] Could not navigate to tab "${tabText}" after 5 attempts: ${lastError?.message}`
    );
  }

  /**
   * Đợi popup blocklayer (#sap-ui-blocklayer-popup) biến mất
   * Blocklayer này chặn pointer events khi còn popup/dialog đang mở
   */
  async waitForPopupClosed(timeout = 30000): Promise<void> {
    await this.page
      .waitForFunction(
        () => {
          const bly = document.getElementById('sap-ui-blocklayer-popup');
          if (!bly) return true;
          const style = getComputedStyle(bly);
          return (
            style.display === 'none' ||
            style.visibility === 'hidden' ||
            (bly as HTMLElement).offsetParent === null
          );
        },
        { timeout }
      )
      .catch(() => {}); // Ignore nếu không có blocklayer
  }

  /**
   * Đợi tất cả BusyIndicator biến mất
   * Dùng waitForFunction để chờ đến khi KHÔNG còn busy indicator nào hiển thị
   * (tránh strict-mode violation khi có nhiều indicator cùng lúc)
   */
  async waitForBusy(timeout = 30000): Promise<void> {
    await this.page
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
      .catch(() => {}); // Ignore nếu không có BusyIndicator
  }
}
