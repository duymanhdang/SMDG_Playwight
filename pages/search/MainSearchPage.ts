import { Page, expect } from '@playwright/test';
import { BasePage } from '../BasePage';

export class MainSearchPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async gotoMasterDataTab(): Promise<void> {
    console.log('[MainSearchPage] Navigating to Master Data tab...');
    await this.page.getByRoleUI5('IconTabFilter', { text: 'Master Data' }).click();
    await this.page.waitForTimeout(1000);
    await this.waitForBusy(3000);
  }

  async selectObjectType(objectType: string): Promise<void> {
    console.log(`[MainSearchPage] Selecting object type: ${objectType}`);
    const arrow = this.page.locator('[id$="--objecttype-arrow"]');
    const option = this.page.getByRole('option', { name: objectType, exact: true });
    await expect(arrow).toBeVisible({ timeout: 10000 });
    await this.waitForBusy(5000);

    // The Master Data view may still be loading its data and re-render/closes the
    // just-opened picker — retry until the option is actually visible.
    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= 4; attempt++) {
      if (!(await option.isVisible().catch(() => false))) {
        await arrow.click();
        await this.page.waitForTimeout(1500);
      }
      try {
        await expect(option).toBeVisible({ timeout: 8000 });
        await option.click();
        await this.page.waitForTimeout(1000);
        await this.waitForBusy(3000);
        console.log(`[MainSearchPage] Object type selected: ${objectType}`);
        return;
      } catch (e) {
        lastError = e as Error;
        await this.page.keyboard.press('Escape').catch(() => {});
        await this.waitForBusy(5000);
        await this.page.waitForTimeout(1000);
      }
    }
    throw new Error(
      `[MainSearchPage] Could not select object type '${objectType}' after 4 attempts: ${lastError?.message}`
    );
  }

  async selectSearchMethod(methodName: string): Promise<void> {
    console.log(`[MainSearchPage] Selecting search method: ${methodName}`);
    const arrow = this.page.locator('[id$="--variantMana-arrow"]');
    const option = this.page.getByRole('option', { name: methodName, exact: true });
    await expect(arrow).toBeVisible({ timeout: 10000 });
    await this.waitForBusy(5000);

    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= 4; attempt++) {
      if (!(await option.isVisible().catch(() => false))) {
        await arrow.click();
        await this.page.waitForTimeout(1500);
      }
      try {
        await expect(option).toBeVisible({ timeout: 8000 });
        await option.click();
        await this.page.waitForTimeout(1000);
        await this.waitForBusy(3000);
        console.log(`[MainSearchPage] Search method selected: ${methodName}`);
        return;
      } catch (e) {
        lastError = e as Error;
        await this.page.keyboard.press('Escape').catch(() => {});
        await this.waitForBusy(5000);
        await this.page.waitForTimeout(1000);
      }
    }
    throw new Error(
      `[MainSearchPage] Could not select search method '${methodName}' after 4 attempts: ${lastError?.message}`
    );
  }

  async verifyFieldLabel(labelText: string): Promise<void> {
    console.log(`[MainSearchPage] Verifying field label: ${labelText}`);
    await this.page.waitForTimeout(500);
    await expect(this.page.getByRoleUI5('Label', { text: labelText }).first()).toBeVisible({ timeout: 5000 });
  }

  async fillSearchValue(value: string): Promise<void> {
    console.log(`[MainSearchPage] Filling search value: ${value}`);
    await this.page.getByRoleUI5('Input', { type: 'Text' }).nth(1).click();
    await this.page.waitForTimeout(500);
    await this.page.getByRoleUI5('Input', { type: 'Text' }).nth(1).fill(value);
    await this.page.waitForTimeout(500);
  }

  async fillSearchFieldValue(fieldLabel: string, value: string): Promise<void> {
    console.log(`[MainSearchPage] Filling field "${fieldLabel}" with: ${value}`);
    const content = this.page.locator('li.sapMLIB .sapMLIBContent')
      .filter({ has: this.page.locator('.sapMLabel').filter({ hasText: new RegExp(`^${fieldLabel}$`) }) })
      .first();
    await expect(content).toBeVisible({ timeout: 5000 });
    await this.page.waitForTimeout(500);
    const input = content.locator('.sapMInputBaseInner').first();
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.click();
    await this.page.waitForTimeout(300);
    await input.fill(value);
    await this.page.waitForTimeout(500);
  }

  async clickSearch(): Promise<void> {
    console.log('[MainSearchPage] Clicking Search button...');
    await this.page.getByRoleUI5('Button', { text: 'Search' }).click();
    await this.page.waitForTimeout(1000);
    // A multi-field search runs a heavier backend query than a single-field
    // one (more filter criteria to evaluate) — 5s was enough for the simpler
    // single-field searches in this suite but too short under load for this
    // one, leaving the result table not yet refreshed when the very next
    // verify*() call (also a short fixed timeout) checks it. Match this
    // codebase's convention for backend calls that can run heavier/slower.
    await this.waitForBusy(30000);
  }

  async verifyResultStatus(statusText: string): Promise<void> {
    console.log(`[MainSearchPage] Verifying result status: ${statusText}`);
    await expect(this.page.getByRoleUI5('ObjectStatus', { text: statusText }).first()).toBeVisible({ timeout: 20000 });
  }

  async verifyResultColumn(labelText: string, nthIndex?: number): Promise<void> {
    console.log(`[MainSearchPage] Verifying result column: ${labelText}${nthIndex !== undefined ? ` nth(${nthIndex})` : ''}`);
    const locator = this.page.getByRoleUI5('Label', { text: labelText });
    if (nthIndex !== undefined) {
      await expect(locator.nth(nthIndex)).toBeVisible({ timeout: 20000 });
    } else {
      await expect(locator.first()).toBeVisible({ timeout: 20000 });
    }
  }

  async verifyResultValue(value: string): Promise<void> {
    console.log(`[MainSearchPage] Verifying result value: ${value}`);
    await expect(this.page.getByText(value, { exact: true }).first()).toBeVisible({ timeout: 20000 });
  }

  async clickFieldValueHelp(fieldLabel: string): Promise<void> {
    console.log(`[MainSearchPage] Clicking value help for field: ${fieldLabel}`);
    const content = this.page.locator('li.sapMLIB .sapMLIBContent')
      .filter({ has: this.page.locator('.sapMLabel').filter({ hasText: new RegExp(`^${fieldLabel}$`) }) })
      .first();
    await expect(content).toBeVisible({ timeout: 5000 });
    const valueHelp = content.getByRoleUI5('Icon', { src: 'sap-icon://value-help' });
    await expect(valueHelp).toBeVisible({ timeout: 5000 });
    await valueHelp.click();
    await this.waitForBusy(3000);
  }

  async searchInF4Dialog(searchValue: string): Promise<void> {
    console.log(`[MainSearchPage] Searching in F4 dialog: ${searchValue}`);
    const searchField = this.page.getByRoleUI5('SearchField').first();
    await expect(searchField).toBeVisible({ timeout: 5000 });
    await searchField.click();
    await searchField.fill(searchValue);
    await searchField.press('Enter');
    await this.waitForBusy(2000);
  }

  async selectFirstF4Item(): Promise<void> {
    console.log('[MainSearchPage] Selecting first F4 item...');
    // Wait for the F4 value help dialog to appear
    const dialog = this.page.locator('.sapMDialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    // Click the first data row (skip header row at index 0)
    const firstRow = dialog.locator('[role="row"]').nth(1);
    await expect(firstRow).toBeVisible({ timeout: 5000 });
    await firstRow.click();
    await this.waitForBusy(1000);
    // Click Select (or OK) to confirm the selection
    const selectBtn = dialog.getByRoleUI5('Button', { text: 'Select' });
    const okBtn = dialog.getByRoleUI5('Button', { text: 'OK' });
    if (await selectBtn.isVisible().catch(() => false)) {
      await selectBtn.click();
    } else if (await okBtn.isVisible().catch(() => false)) {
      await okBtn.click();
    }
    await this.waitForBusy(2000);
  }

  async selectDropdownValue(fieldLabel: string, optionValue: string): Promise<void> {
    console.log(`[MainSearchPage] Selecting dropdown value for ${fieldLabel}: ${optionValue}`);
    // Locate the ComboBox inside the field row scoped by the label
    const content = this.page.locator('li.sapMLIB .sapMLIBContent')
      .filter({ has: this.page.locator('.sapMLabel').filter({ hasText: new RegExp(`^${fieldLabel}$`) }) })
      .first();
    await expect(content).toBeVisible({ timeout: 5000 });
    const combo = content.locator('.sapMComboBox input[role="combobox"]').first();
    await expect(combo).toBeVisible({ timeout: 5000 });
    await combo.fill(optionValue);
    await this.page.waitForTimeout(500);
    await combo.press('Enter');
    await this.page.waitForTimeout(1000);
  }

  async verifySearchError(expectedMessage: string): Promise<void> {
    console.log(`[MainSearchPage] Verifying search error: ${expectedMessage}`);
    const dialog = this.page.locator('.sapMDialog').last();
    await expect(dialog).toBeVisible({ timeout: 7500 });
    const msgBox = dialog.locator('.sapMMsgBoxText');
    await expect(msgBox).toContainText(expectedMessage, { timeout: 5000 });
    console.log('[MainSearchPage]  Search error verified');
  }

  async closeErrorDialog(): Promise<void> {
    console.log('[MainSearchPage] Closing error dialog...');
    await this.page.getByRoleUI5('Button', { text: 'Close' }).last().click();
    await this.page.waitForTimeout(1000);
    await expect(this.page.locator('.sapMDialog').last()).not.toBeVisible({ timeout: 5000 }).catch(() => {});
    console.log('[MainSearchPage]  Error dialog closed');
  }

  async verifyFieldOperators(fieldLabel: string, expectedOperators: string[]): Promise<void> {
    console.log(`[MainSearchPage] Verifying operators for field: ${fieldLabel}`);
    // Find the field row (sapMLIBContent) containing a sapMLabel with exact text match,
    // then locate the flexBox (operator + input) within that row
    const content = this.page.locator('li.sapMLIB .sapMLIBContent')
      .filter({ has: this.page.locator('.sapMLabel').filter({ hasText: new RegExp(`^${fieldLabel}$`) }) })
      .first();
    await expect(content).toBeVisible({ timeout: 5000 });
    const flexBox = content.locator('.sapMFlexBox').first();
    await expect(flexBox).toBeVisible({ timeout: 5000 });

    // Open the operator dropdown
    await flexBox.locator('.sapMSlt').click();
    await this.page.waitForTimeout(1000);

    // Verify all expected operators — use .last() to pick the most recently opened dropdown's items
    for (const op of expectedOperators) {
      await expect(this.page.getByRoleUI5('Item', { text: op }).last()).toBeVisible({ timeout: 5000 });
      console.log(`[MainSearchPage]    Operator: ${op}`);
    }

    // Close dropdown
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(500);
  }

  async verifyNoResults(): Promise<void> {
    console.log('[MainSearchPage] Verifying no results displayed...');
    const noData = this.page.getByText('No data', { exact: false });
    const noResults = this.page.getByText('No results found', { exact: false });
    const emptyTable = this.page.locator('[role="row"]').filter({ hasNot: this.page.locator('[role="cell"]') });

    const noDataVisible = await noData.isVisible().catch(() => false);
    const noResultsVisible = await noResults.isVisible().catch(() => false);
    const tableEmpty = (await emptyTable.count()) === 0;

    expect(noDataVisible || noResultsVisible || tableEmpty).toBeTruthy();
    console.log('[MainSearchPage] No results verified');
  }
}
