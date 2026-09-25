import { Page, Locator, expect } from '@playwright/test';
import { fillUI5Field } from './ui5';

export class DialogHelper {
  constructor(private page: Page) {}

  async waitForDialog(timeout = 10000): Promise<Locator> {
    const dialog = this.page.locator('.sapMDialog').last();
    await expect(dialog).toBeVisible({ timeout });
    return dialog;
  }

  async getDialogTextArea(): Promise<Locator> {
    const dialog = this.page.locator('.sapMDialog').last();
    return dialog.getByRoleUI5('TextArea').first();
  }

  async getDialogTextAreaLegacy(): Promise<Locator> {
    return this.page.locateUI5('//Dialog[1]/TextArea[1]');
  }

  async fillCommentAndConfirm(
    actionButtonText: string,
    comment: string,
    options: { waitForDialog?: boolean; timeout?: number } = {}
  ): Promise<void> {
    const { waitForDialog: shouldWait = true, timeout = 10000 } = options;

    if (shouldWait) {
      await this.waitForDialog(timeout);
    }

    const textArea = await this.getDialogTextArea();
    const count = await textArea.count().catch(() => 0);

    if (count > 0) {
      await expect(textArea).toBeVisible({ timeout });
      await fillUI5Field(textArea, comment);
    } else {
      const legacyTextArea = await this.getDialogTextAreaLegacy();
      await expect(legacyTextArea).toBeVisible({ timeout });
      await fillUI5Field(legacyTextArea, comment);
    }

    await this.page.getByRoleUI5('Button', { text: actionButtonText }).first().click();
    await this.page.getByRoleUI5('Button', { text: 'OK' }).click();
    console.log(`[Dialog] ✅ Action '${actionButtonText}' confirmed`);
  }

  async confirmOnly(buttonText: string, options: { waitForDialog?: boolean } = {}): Promise<void> {
    const { waitForDialog: shouldWait = true } = options;

    if (shouldWait) {
      await this.waitForDialog();
    }

    await this.page.getByRoleUI5('Button', { text: buttonText }).first().click();
    console.log(`[Dialog] ✅ Confirmed '${buttonText}'`);
  }

  async clickButton(buttonText: string): Promise<void> {
    await this.page.getByRoleUI5('Button', { text: buttonText }).first().click();
  }

  async clickOK(): Promise<void> {
    await this.page.getByRoleUI5('Button', { text: 'OK' }).click();
  }

  async waitForDialogToClose(timeout = 10000): Promise<void> {
    const dialog = this.page.locator('.sapMDialog').last();
    await expect(dialog)
      .not.toBeVisible({ timeout })
      .catch(() => {});
    await this.page.waitForTimeout(500);
  }
}

export function createDialogHelper(page: Page): DialogHelper {
  return new DialogHelper(page);
}
