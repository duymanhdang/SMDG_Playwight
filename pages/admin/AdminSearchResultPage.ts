import { Page, expect } from '@playwright/test';
import { BasePage } from '../BasePage';

export class AdminSearchResultPage extends BasePage {
  private BASE_URL = process.env.BASE_URL || '';

  constructor(page: Page) {
    super(page);
  }

  async gotoSearchResultSettings(): Promise<void> {
    console.log('[AdminSearchResultPage] Navigating to Search Result Settings...');
    await this.page.getByRoleUI5('StandardListItem', { title: 'Search Result Settings' }).click();
    await this.waitForBusy(2000);
    console.log('[AdminSearchResultPage]  Search Result Settings page loaded');
  }

  async searchMethod(methodId: string): Promise<void> {
    console.log(`[AdminSearchResultPage] Searching method: ${methodId}`);
    const search = this.page.getByRoleUI5('SearchField', { placeholder: 'Method ID' }).last();
    await expect(search).toBeVisible({ timeout: 5000 });
    await search.click();
    await search.fill(methodId);
    await search.press('Enter');
    await this.waitForBusy(3000);
  }

  async selectMethodFromList(methodName: string): Promise<void> {
    console.log(`[AdminSearchResultPage] Selecting method: ${methodName}`);
    await this.page.getByRoleUI5('StandardListItem', { title: methodName }).last().click();
    await this.waitForBusy(2000);
  }

  async openValueHelp(): Promise<void> {
    console.log('[AdminSearchResultPage] Opening value help...');
    // Strict-mode safe: several value-help icons can exist on the page,
    // target the one belonging to the result-field input (inputFieldID).
    const valueHelpIcon = this.page.locator('[id$="inputFieldID-vhi"]').first();
    await expect(valueHelpIcon).toBeVisible({ timeout: 5000 });
    await valueHelpIcon.click();
    await this.waitForBusy(3000);
    await expect(this.page.locator('.sapMDialog')).toBeVisible({ timeout: 5000 });
    await this.page.waitForTimeout(500);
    console.log('[AdminSearchResultPage]  Value help dialog opened');
  }

  async searchFieldInValueHelp(fieldName: string): Promise<void> {
    console.log(`[AdminSearchResultPage] Searching field in value help: ${fieldName}`);
    const searchField = this.page.getByRoleUI5('SearchField').first();
    await expect(searchField).toBeVisible({ timeout: 5000 });
    await searchField.click();
    await searchField.fill(fieldName);
    await searchField.press('Enter');
    await this.waitForBusy(2000);
    await this.page.waitForTimeout(500);
    console.log(`[AdminSearchResultPage]  Searched for: ${fieldName}`);
  }

  async selectFirstRowInValueHelp(fieldName: string): Promise<void> {
    console.log(`[AdminSearchResultPage] Selecting first data row in value help: ${fieldName}`);
    // Use .sapMLIB to target list/table rows, avoiding hidden input highlights
    const row = this.page.locator('.sapMDialog .sapMLIB').filter({ hasText: fieldName }).first();
    await expect(row).toBeVisible({ timeout: 5000 });
    await row.click();
    await this.waitForBusy(1000);
    await this.page.waitForTimeout(500);
    console.log(`[AdminSearchResultPage]  Selected first row for: ${fieldName}`);
  }

  async saveAndCloseValueHelp(): Promise<void> {
    console.log('[AdminSearchResultPage] Saving and closing value help...');
    const saveButton = this.page.getByRoleUI5('Button', { text: 'Save' }).nth(1);
    await expect(saveButton).toBeVisible({ timeout: 5000 });
    await saveButton.click();
    await this.waitForBusy(3000);
    await this.page.waitForTimeout(500);
    console.log('[AdminSearchResultPage]  Value help saved and closed');
  }

  async clickResultFieldInList(fieldName: string): Promise<void> {
    console.log(`[AdminSearchResultPage] Selecting result field in list: ${fieldName}`);
    await this.page.getByText(fieldName, { exact: true }).last().click();
    await this.waitForBusy(1000);
  }

  // =========================================
  // Edit / Reorder Fields
  // =========================================

  async clickEditResultFields(): Promise<void> {
    console.log('[AdminSearchResultPage] Clicking Edit Fields...');
    await this.page.getByRoleUI5('Button', { text: 'Edit Fields' }).last().click();
    await this.waitForBusy(2000);
  }

  async changeFieldIndex(fieldName: string, newIndex: string): Promise<void> {
    console.log(`[AdminSearchResultPage] Changing index for ${fieldName} to ${newIndex}`);
    // After Edit Fields, the table cells are hidden by block layer.
    // Set the index input value directly via evaluate
    const row = this.page.locator('[role="row"]')
      .filter({ has: this.page.getByText(fieldName, { exact: true }) })
      .first();
    await expect(row).toHaveCount(1, { timeout: 5000 });
    const indexInput = row.locator('[aria-colindex="7"] input').first();
    await expect(indexInput).toHaveCount(1, { timeout: 5000 });
    await indexInput.evaluate((el, value) => {
      const input = el as HTMLInputElement;
      input.removeAttribute('disabled');
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      )?.set;
      nativeInputValueSetter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, newIndex);
    await this.page.waitForTimeout(500);
  }

  async saveResultFieldEdit(): Promise<void> {
    console.log('[AdminSearchResultPage] Saving result field edit...');
    await this.page.getByRoleUI5('Button', { text: 'Update' }).click();
    await this.waitForBusy(3000);
  }

  async removeResultField(fieldName: string): Promise<void> {
    console.log(`[AdminSearchResultPage] Removing result field: ${fieldName}`);
    // Step 1: Enter edit mode
    await this.clickEditResultFields();
    await this.page.waitForTimeout(2000);
    // Step 2: Find the correct row — use last() to skip Search Method Settings rows
    const fieldRow = this.page.locator('[role="row"]')
      .filter({ has: this.page.getByText(fieldName, { exact: true }) })
      .last();
    await expect(fieldRow).toBeVisible({ timeout: 5000 });
    // Click the checkbox inside the row (SAP UI5 uses div[role="checkbox"])
    const cb = fieldRow.locator('[role="checkbox"]').first();
    await expect(cb).toBeVisible({ timeout: 5000 });
    await cb.click();
    await this.page.waitForTimeout(500);
    // Step 3: Click Remove button (nth(1) = Search Result Settings, nth(0) = Search Method Settings)
    await this.page.getByRoleUI5('Button', { text: 'Remove' }).nth(1).click();
    await this.page.waitForTimeout(2000);
    await this.waitForBusy(3000);
    // Step 4: Try Update if visible, otherwise changes may be auto-saved
    const updateBtn = this.page.getByRoleUI5('Button', { text: 'Update' });
    if (await updateBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await updateBtn.click();
      await this.waitForBusy(3000);
    }
    // Step 5: Verify field not present
    await expect(this.page.getByText(fieldName, { exact: true }).first()).not.toBeAttached({ timeout: 5000 });
    console.log(`[AdminSearchResultPage]  Result field removed: ${fieldName}`);
  }
}
