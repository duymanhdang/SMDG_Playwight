import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../BasePage';

export class MainEditableRuleVerifyPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async navigateToTargetArea(target: string): Promise<void> {
    console.log(`[MainEditableRuleVerify]  Navigate to target area: "${target}"`);
    await this.page.waitForSelector('.sapUiBLy', { state: 'hidden', timeout: 5000 }).catch(() => {});
    const byIconTab = this.page.getByRoleUI5('IconTabFilter', { text: target });
    const byTitle = this.page.getByRoleUI5('Title', { text: target });
    const byHeading = this.page.getByRole('heading', { name: target });
    for (const loc of [byIconTab.first(), byTitle.first(), byHeading.first()]) {
      const isVis = await loc.isVisible({ timeout: 1000 }).catch(() => false);
      if (isVis) {
        await loc.click({ force: true });
        await this.waitForBusy(3000);
        console.log(`[MainEditableRuleVerify]  Navigated to "${target}"`);
        return;
      }
    }
    throw new Error(`Cannot find target area: "${target}"`);
  }

  async clickIconTab(text: string): Promise<void> {
    console.log(`[MainEditableRuleVerify]  Click IconTabFilter "${text}"`);
    const tab = this.page.getByRoleUI5('IconTabFilter', { text }).first();
    await expect(tab).toBeVisible({ timeout: 10000 });
    await tab.click();
    await this.waitForBusy(3000);
    console.log(`[MainEditableRuleVerify]  IconTabFilter "${text}" clicked`);
  }

  async verifyTitleVisible(text: string): Promise<void> {
    console.log(`[MainEditableRuleVerify]  Verify title: "${text}"`);
    await expect(this.page.getByRoleUI5('Title', { text }).first()).toBeVisible({ timeout: 10000 });
    console.log(`[MainEditableRuleVerify]  Title "${text}" visible`);
  }

  async verifyHeadingVisible(text: string): Promise<void> {
    console.log(`[MainEditableRuleVerify]  Verify heading: "${text}"`);
    await expect(this.page.getByRole('heading', { name: text }).first()).toBeVisible({ timeout: 10000 });
    console.log(`[MainEditableRuleVerify]  Heading "${text}" visible`);
  }

  async verifyLabelVisible(text: string): Promise<void> {
    console.log(`[MainEditableRuleVerify]  Verify label: "${text}"`);
    await expect(this.page.getByRoleUI5('Label', { text }).first()).toBeVisible({ timeout: 10000 });
    console.log(`[MainEditableRuleVerify]  Label "${text}" visible`);
  }

  async verifyTextVisible(text: string): Promise<void> {
    console.log(`[MainEditableRuleVerify]  Verify text: "${text}"`);
    await expect(this.page.getByText(text, { exact: true }).first()).toBeVisible({ timeout: 10000 });
    console.log(`[MainEditableRuleVerify]  Text "${text}" visible`);
  }

  async clickOpenSectionButton(nth: number): Promise<void> {
    console.log(`[MainEditableRuleVerify]  Click open section button nth=${nth}`);
    const btn = this.page.getByRoleUI5('Button', { icon: 'sap-icon://open-command-field' }).nth(nth);
    await expect(btn).toBeVisible({ timeout: 10000 });
    await btn.click();
    await this.waitForBusy(3000);
    console.log(`[MainEditableRuleVerify]  Section opened`);
  }

  async switchDialogTab(text: string): Promise<void> {
    console.log(`[MainEditableRuleVerify]  Switch dialog tab: "${text}"`);
    await this.page.getByRoleUI5('IconTabFilter', { text }).click();
    await this.waitForBusy(2000);
    console.log(`[MainEditableRuleVerify]  Switched to tab "${text}"`);
  }

  async closeDialog(nth?: number): Promise<void> {
    console.log(`[MainEditableRuleVerify]  Close dialog${nth !== undefined ? ` nth=${nth}` : ''}`);
    if (nth !== undefined) {
      await this.page.getByRoleUI5('Button', { text: 'Cancel' }).nth(nth).click();
    } else {
      await this.page.getByRoleUI5('Button', { text: 'Cancel' }).first().click();
    }
    await this.page.waitForTimeout(500);
    console.log('[MainEditableRuleVerify]  Dialog closed');
  }

  async clickAddButton(): Promise<void> {
    console.log('[MainEditableRuleVerify]  Click Add button');
    await this.page.getByRoleUI5('Button', { icon: 'sap-icon://add' }).first().click();
    await this.waitForBusy(2000);
    console.log('[MainEditableRuleVerify]  Add button clicked');
  }

  async clickF4Icon(nth: number): Promise<void> {
    console.log(`[MainEditableRuleVerify]  Click F4 icon nth=${nth}`);
    const icon = this.page.getByRoleUI5('Icon', { src: 'sap-icon://value-help' }).nth(nth);
    await expect(icon).toBeVisible({ timeout: 10000 });
    await icon.click();
    await this.waitForBusy(3000);
    console.log(`[MainEditableRuleVerify]  F4 icon nth=${nth} clicked`);
  }

  async searchF4(value: string): Promise<void> {
    console.log(`[MainEditableRuleVerify]  Search F4: "${value}"`);
    const f4Dialog = this.page.locator('.sapMTableSelectDialog.sapMDialogOpen');
    await expect(f4Dialog).toBeVisible({ timeout: 15000 });
    const searchField = f4Dialog.getByRoleUI5('SearchField').first();
    await expect(searchField).toBeVisible({ timeout: 10000 });
    await searchField.click();
    await searchField.fill(value);
    await searchField.press('Enter');
    await this.waitForBusy(5000);
    console.log(`[MainEditableRuleVerify]  F4 searched for "${value}"`);
  }

  async selectF4Text(text: string): Promise<void> {
    console.log(`[MainEditableRuleVerify]  Select F4 text: "${text}"`);
    const el = this.page.getByText(text, { exact: true }).first();
    await expect(el).toBeVisible({ timeout: 5000 });
    await el.click();
    await this.page.waitForTimeout(500);
    console.log(`[MainEditableRuleVerify]  Selected "${text}" from F4`);
  }

  async selectF4FirstRowColumn(columnIndex: number, searchValue?: string): Promise<void> {
    console.log(`[MainEditableRuleVerify]  Select F4 first row, column ${columnIndex}${searchValue ? ` (value: "${searchValue}")` : ''}`);
    const dialog = this.page.locator('[role="dialog"]').last();
    await expect(dialog).toBeVisible({ timeout: 10000 });
    if (searchValue) {
      const textEl = dialog.getByText(searchValue, { exact: true }).first();
      await expect(textEl).toBeVisible({ timeout: 10000 });
      await textEl.click();
    } else {
      const row = dialog.getByRole('row').nth(1);
      await expect(row).toBeVisible({ timeout: 10000 });
      const cell = row.locator('[role="gridcell"], td, .sapMListTblCell').nth(columnIndex - 1);
      await expect(cell).toBeVisible({ timeout: 5000 });
      await cell.click();
    }
    await this.page.waitForTimeout(1500);
    const remaining = this.page.locator('[role="dialog"]');
    if (await remaining.isVisible({ timeout: 500 }).catch(() => false)) {
      console.log('[MainEditableRuleVerify]  F4 dialog still open, dismissing with Escape');
      await this.page.keyboard.press('Escape');
      await this.page.waitForTimeout(1000);
    }
    await this.page.waitForSelector('.sapUiBLy', { state: 'hidden', timeout: 3000 }).catch(() => {});
    console.log(`[MainEditableRuleVerify]  F4 column ${columnIndex} selected`);
  }

  async fillInputByLabel(label: string, value: string): Promise<void> {
    console.log(`[MainEditableRuleVerify]  Fill input by label "${label}" → "${value}"`);
    const labelEl = this.page.locator(`label:has-text("${label}")`).first();
    await expect(labelEl).toBeVisible({ timeout: 10000 });
    const forAttr = await labelEl.getAttribute('for');
    if (forAttr) {
      const input = this.page.locator(`input#${forAttr}`);
      await input.click();
      await input.fill(value);
      await input.press('Enter');
    } else {
      const input = labelEl.locator('..').locator('input').first();
      await input.click();
      await input.fill(value);
      await input.press('Enter');
    }
    await this.page.waitForTimeout(500);
    console.log(`[MainEditableRuleVerify]  Filled "${label}" with "${value}"`);
  }

  async fillInput(nth: number, value: string): Promise<void> {
    console.log(`[MainEditableRuleVerify]  Fill input nth=${nth} → "${value}"`);
    const input = this.page.getByRoleUI5('Input', { type: 'Text' }).nth(nth);
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.click();
    await input.fill(value);
    await input.press('Enter');
    await this.page.waitForTimeout(500);
    console.log(`[MainEditableRuleVerify]  Filled input nth=${nth} with "${value}"`);
  }

  async fillInputByValue(value: string): Promise<void> {
    console.log(`[MainEditableRuleVerify]  Fill input by value "${value}"`);
    const input = this.page.getByRoleUI5('Input', { value }).first();
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.click();
    await input.fill(value);
    await input.press('Enter');
    await this.page.waitForTimeout(500);
    console.log(`[MainEditableRuleVerify]  Filled input with "${value}"`);
  }

  async verifyLabelWithText(text: string): Promise<void> {
    console.log(`[MainEditableRuleVerify]  Verify label text: "${text}"`);
    await expect(this.page.getByRoleUI5('Label', { text }).first()).toBeVisible({ timeout: 10000 });
    console.log(`[MainEditableRuleVerify]  Label "${text}" visible`);
  }

  async clickSubmitButton(): Promise<void> {
    console.log('[MainEditableRuleVerify]  Click Submit button');
    await this.page.waitForSelector('.sapUiBLy', { state: 'hidden', timeout: 3000 }).catch(() => {});
    const btn = this.page.getByRoleUI5('Button', { text: 'Submit' }).first();
    await expect(btn).toBeVisible({ timeout: 10000 });
    await btn.click();
    await this.waitForBusy(5000);
    console.log('[MainEditableRuleVerify]  Submit button clicked');
  }

  async verifyErrorDialog(expectedText?: string): Promise<void> {
    console.log('[MainEditableRuleVerify]  Verify error dialog');
    const alertDialog = this.page.locator('[role="alertdialog"]').last();
    if (await alertDialog.isVisible({ timeout: 3000 }).catch(() => false)) {
      if (expectedText) {
        await expect(alertDialog.getByText(expectedText).first()).toBeVisible({ timeout: 5000 });
      }
      console.log('[MainEditableRuleVerify]  Error dialog visible');
      return;
    }
    const title = this.page.getByRoleUI5('Title', { text: 'Error' });
    await expect(title).toBeVisible({ timeout: 5000 });
    if (expectedText) {
      await expect(this.page.getByText(expectedText).first()).toBeVisible({ timeout: 5000 });
    }
    console.log('[MainEditableRuleVerify]  Error dialog visible');
  }

  async dismissErrorDialog(): Promise<void> {
    console.log('[MainEditableRuleVerify]  Dismiss error dialog');
    const closeBtn = this.page.getByRoleUI5('Button', { text: 'Close' });
    if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeBtn.click();
    } else {
      await this.page.keyboard.press('Escape');
    }
    await this.page.waitForTimeout(500);
    console.log('[MainEditableRuleVerify]  Error dialog dismissed');
  }

  async verifyNotEditableByIndex(nth: number, inputType: 'Input' | 'MultiInput' = 'Input'): Promise<void> {
    console.log(`[MainEditableRuleVerify]  Verify NOT editable: ${inputType}[${nth}]`);
    const locator = this.page.getByRoleUI5(inputType, { type: 'Text' }).nth(nth);
    await this.assertNotEditable(locator);
    console.log(`[MainEditableRuleVerify]  ${inputType}[${nth}] is NOT editable`);
  }

  async verifyNotEditableByValue(value: string): Promise<void> {
    console.log(`[MainEditableRuleVerify]  Verify NOT editable: value="${value}"`);
    const locator = this.page.getByRoleUI5('Input', { value }).first();
    await this.assertNotEditable(locator);
    console.log(`[MainEditableRuleVerify]  Input[value="${value}"] is NOT editable`);
  }

  async verifyEditableByIndex(nth: number, inputType: 'Input' | 'MultiInput' = 'Input'): Promise<void> {
    console.log(`[MainEditableRuleVerify]  Verify editable: ${inputType}[${nth}]`);
    const locator = this.page.getByRoleUI5(inputType, { type: 'Text' }).nth(nth);
    await expect(locator).toBeVisible({ timeout: 5000 });
    await expect(locator).toBeEnabled({ timeout: 3000 });
    const ariaRO = await locator.getAttribute('aria-readonly').catch(() => null);
    if (ariaRO === 'true') {
      throw new Error(`Field [${inputType} nth=${nth}] has aria-readonly=true`);
    }
    console.log(`[MainEditableRuleVerify]  ${inputType}[${nth}] is editable`);
  }

  private async assertNotEditable(locator: Locator): Promise<void> {
    await expect(locator).toBeVisible({ timeout: 5000 });
    if (await locator.isDisabled().catch(() => false)) return;
    const readonly = await locator.getAttribute('readonly').catch(() => null);
    if (readonly !== null) return;
    const inner = locator.locator('input').first();
    if ((await inner.count().catch(() => 0)) > 0) {
      if (await inner.isDisabled().catch(() => false)) return;
      if ((await inner.getAttribute('readonly').catch(() => null)) !== null) return;
    }
    throw new Error(`Field expected NOT editable`);
  }
}
