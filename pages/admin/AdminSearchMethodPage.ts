import { Page, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { fillUI5Field, getFieldByLabel } from '../../helpers/ui';

export class AdminSearchMethodPage extends BasePage {
  private BASE_URL = process.env.BASE_URL || '';

  constructor(page: Page) {
    super(page);
  }

  // =========================================
  // Navigation
  // =========================================

  async gotoSearchMethodSettings(templateName: string): Promise<void> {
    console.log(`[AdminSearchMethodPage] Navigating to Search Method Settings for template: ${templateName}`);

    await this.page.getByRoleUI5('IconTabFilter', { text: 'Process Designer' }).click();
    await this.page.waitForTimeout(3000);

    const searchField = this.page.locator('[id$="searchFieldTemplate-I"]');
    await expect(searchField).toBeVisible({ timeout: 20000 });
    await fillUI5Field(searchField, templateName);
    await this.page.waitForTimeout(1000);

    const searchButton = this.page.locator('[id$="searchFieldTemplate-search"]');
    await expect(searchButton).toBeVisible({ timeout: 5000 });
    await searchButton.click();
    await this.page.waitForTimeout(3000);
    console.log(`[AdminSearchMethodPage] Template search executed: ${templateName}`);

    const templateLink = this.page.getByRoleUI5('Link', { text: templateName });
    await expect(templateLink).toBeVisible({ timeout: 20000 });
    await templateLink.click();
    await this.page.waitForTimeout(3000);

    await this.page.getByRoleUI5('StandardListItem', { title: 'General Settings' }).click();
    await this.page.waitForTimeout(1000);
    await this.page.getByRoleUI5('StandardListItem', { title: 'Search Method Settings' }).click();
    await this.page.waitForTimeout(2000);

    console.log('[AdminSearchMethodPage]  Search Method Settings page loaded');
  }

  // =========================================
  // Add Method
  // =========================================

  async clickAddMethod(): Promise<void> {
    console.log('[AdminSearchMethodPage] Clicking Add Method...');
    await this.page.getByRoleUI5('OverflowToolbarButton', { text: 'Add Method' }).click();
    await this.waitForBusy(3000);
  }

  async fillMethodDialog(methodId: string, methodName: string): Promise<void> {
    console.log(`[AdminSearchMethodPage] Filling method: ${methodId} / ${methodName}`);

    const idInput = await getFieldByLabel(this.page, 'Search Method ID');
    await expect(idInput).toBeVisible({ timeout: 5000 });
    await fillUI5Field(idInput, methodId);

    const nameInput = await getFieldByLabel(this.page, 'Search Method Name');
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    await fillUI5Field(nameInput, methodName);
  }

  async confirmAddMethod(): Promise<void> {
    console.log('[AdminSearchMethodPage] Confirming add method...');
    await this.page.getByRoleUI5('Button', { text: 'Create' }).click();
    await this.waitForBusy(3000);
  }

  async cancelAddMethod(): Promise<void> {
    console.log('[AdminSearchMethodPage] Cancelling add method...');
    await this.page.waitForTimeout(1000);
    await this.page.getByRoleUI5('Button', { text: 'Cancel' }).click();
    await this.page.waitForTimeout(1000);
  }

  // =========================================
  // Search & Select Method
  // =========================================

  async searchMethod(methodId: string): Promise<void> {
    console.log(`[AdminSearchMethodPage] Searching method: ${methodId}`);
    const search = this.page.getByRoleUI5('SearchField', { placeholder: 'Method ID' }).first();
    await expect(search).toBeVisible({ timeout: 5000 });
    await search.click();
    await search.clear();
    await search.fill(methodId);
    await search.press('Enter');
    await this.waitForBusy(3000);
  }

  async selectMethod(methodName: string): Promise<void> {
    console.log(`[AdminSearchMethodPage] Selecting method: ${methodName}`);
    await this.page.getByRoleUI5('StandardListItem', { title: methodName }).click();
    await this.waitForBusy(3000);
  }

  // =========================================
  // Add Fields
  // =========================================

  async clickAddFields(): Promise<void> {
    console.log('[AdminSearchMethodPage] Clicking Add Fields...');
    await this.page.getByRoleUI5('Button', { text: 'Add Fields' }).click();
    await this.waitForBusy(2000);
  }

  async selectBusinessTable(tableName: string): Promise<void> {
    console.log(`[AdminSearchMethodPage] Selecting business table: ${tableName}`);

    const combo = this.page.locator('[id$="selectTable-inner"]');
    await expect(combo).toBeVisible({ timeout: 5000 });

    // Open combobox dropdown
    await this.page.getByRoleUI5('Icon', { src: 'sap-icon://slim-arrow-down' }).first().click();
    await this.waitForBusy(1000);

    await this.page.getByRoleUI5('StandardListItem', { title: tableName }).click();
    await this.waitForBusy(2000);
  }

  async selectFieldFromTable(fieldName: string): Promise<void> {
    console.log(`[AdminSearchMethodPage] Selecting field: ${fieldName}`);

    // Use the dialog's search input to filter the business fields table
    const searchInput = this.page.locator('#__xmlview2--businessFieldSearch-I, input[aria-label="Business Field"]');
    await expect(searchInput).toBeVisible({ timeout: 5000 });
    await searchInput.fill(fieldName);
    await searchInput.press('Enter');
    await this.page.waitForTimeout(1000);

    const fieldRow = this.page.locator('[role="row"]')
      .filter({ has: this.page.getByText(fieldName, { exact: true }) });
    await expect(fieldRow.first()).toBeVisible({ timeout: 5000 });

    const radio = fieldRow.locator('[role="radio"]');
    await expect(radio).toBeVisible({ timeout: 5000 });
    await radio.click();
  }

  async confirmAddField(): Promise<void> {
    console.log('[AdminSearchMethodPage] Confirming add field...');
    await this.page.getByRoleUI5('Button', { text: 'Confirm' }).click();
    await this.waitForBusy(3000);
  }

  // =========================================
  // Edit Fields / Control Type
  // =========================================

  async clickEditFields(): Promise<void> {
    console.log('[AdminSearchMethodPage] Clicking Edit Fields...');
    await this.page.getByRoleUI5('Button', { text: 'Edit Fields' }).click();
    await this.waitForBusy(3000);
  }

  async changeFieldControlType(fieldName: string, newControlType: string): Promise<void> {
    console.log(`[AdminSearchMethodPage] Changing control type for ${fieldName} to ${newControlType}`);
    // Find the specific field row and its control type dropdown icon
    const fieldRow = this.page.locator('[role="row"]')
      .filter({ has: this.page.getByText(fieldName, { exact: true }) })
      .first();
    await expect(fieldRow).toBeVisible({ timeout: 5000 });

    // In edit mode, control type dropdown is an icon with aria-label "Select Options"
    const ctrlTypeIcon = fieldRow.locator('.sapMInputBaseIcon[aria-label="Select Options"]');
    await expect(ctrlTypeIcon).toBeVisible({ timeout: 5000 });
    await ctrlTypeIcon.click();
    await this.waitForBusy(1000);

    await this.page.getByRoleUI5('StandardListItem', { title: newControlType }).click();
    await this.page.waitForTimeout(2000);
  }

  async clickFieldSourceData(fieldName: string): Promise<void> {
    console.log(`[AdminSearchMethodPage] Opening Source Data for field: ${fieldName}`);
    // The source data value-help icon appears only after setting control type to F4.
    // Scope to the field's own row (plain DOM locator, NOT getByRoleUI5, which resolves globally)
    // and filter to the visible icon to avoid matching hidden value-help icons from other inputs.
    const fieldRow = this.page.locator('[role="row"]')
      .filter({ has: this.page.getByText(fieldName, { exact: true }) })
      .first();
    await expect(fieldRow).toBeVisible({ timeout: 5000 });

    const valueHelp = fieldRow.locator('[aria-label="Show Value Help"]:visible').first();
    await expect(valueHelp).toBeVisible({ timeout: 7500 });
    await valueHelp.click();
    await this.waitForBusy(3000);
  }

  async configureF4SourceData(entity: string, keyField: string): Promise<void> {
    console.log(`[AdminSearchMethodPage] Configuring F4 Source Data: Entity=${entity}, KeyField=${keyField}`);

    // Entity ComboBox: fill and press Enter to accept
    const entityCombo = this.page.getByRole('combobox', { name: 'Entity' });
    await expect(entityCombo).toBeVisible({ timeout: 5000 });
    await entityCombo.fill(entity);
    await this.page.waitForTimeout(1000);
    await entityCombo.press('Enter');
    await this.page.waitForTimeout(500);

    // Key Field ComboBox: fill and press Enter to accept
    const keyFieldCombo = this.page.getByRole('combobox', { name: 'Key Field' });
    await expect(keyFieldCombo).toBeVisible({ timeout: 5000 });
    await keyFieldCombo.fill(keyField);
    await this.page.waitForTimeout(1000);
    await keyFieldCombo.press('Enter');
    await this.page.waitForTimeout(500);

    // Select Display Field (MultiComboBox): open dropdown and check items
    const displayFieldArrow = this.page.locator('#__xmlview10--comboBoxSelectDisplayField-arrow');
    await expect(displayFieldArrow).toBeVisible({ timeout: 5000 });
    await displayFieldArrow.click();
    await this.page.waitForTimeout(1000);
    // Click the first (productType) and third (description) checkboxes in popup
    await this.page.locateUI5('//Popover[last()]/List[1]/StandardListItem[1]/CheckBox[1]').click();
    await this.page.waitForTimeout(500);
    await this.page.locateUI5('//Popover[last()]/List[1]/StandardListItem[3]/CheckBox[1]').click();
    await this.page.waitForTimeout(500);
    // Close the popup by clicking the arrow again
    await displayFieldArrow.click();
    await this.page.waitForTimeout(1000);

    // Select Visible Fields checkboxes
    await this.page.locateUI5('//Grid[1]/List[1]/StandardListItem[1]/CheckBox[1]').click();
    await this.page.waitForTimeout(500);
    await this.page.locateUI5('//Grid[1]/List[1]/StandardListItem[3]/CheckBox[1]').click();
    await this.page.waitForTimeout(500);

    // Click Update to confirm Source Data config
    await this.page.getByRoleUI5('Button', { text: 'Update' }).click();
    await this.page.waitForTimeout(2000);
    // Wait for Source Data dialog to fully close
    await this.page.locator('.sapMDialog').last().waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    console.log('[AdminSearchMethodPage]  F4 Source Data configured');
  }

  async configureDropdownSourceData(
    entity: string,
    keyField: string,
    displayFieldIndices: number[],
    visibleFieldIndices: number[]
  ): Promise<void> {
    console.log(`[AdminSearchMethodPage] Configuring DROPDOWN Source Data: Entity=${entity}, KeyField=${keyField}`);

    const entityCombo = this.page.getByRole('combobox', { name: 'Entity' });
    await expect(entityCombo).toBeVisible({ timeout: 5000 });
    await entityCombo.fill(entity);
    await this.page.waitForTimeout(1000);
    await entityCombo.press('Enter');
    await this.page.waitForTimeout(500);

    const keyFieldCombo = this.page.getByRole('combobox', { name: 'Key Field' });
    await expect(keyFieldCombo).toBeVisible({ timeout: 5000 });
    await keyFieldCombo.fill(keyField);
    await this.page.waitForTimeout(1000);
    await keyFieldCombo.press('Enter');
    await this.page.waitForTimeout(500);

    const displayFieldArrow = this.page.locator('#__xmlview10--comboBoxSelectDisplayField-arrow');
    await expect(displayFieldArrow).toBeVisible({ timeout: 5000 });
    await displayFieldArrow.click();
    await this.page.waitForTimeout(1000);

    for (const idx of displayFieldIndices) {
      await this.page.locateUI5(`//Popover[last()]/List[1]/StandardListItem[${idx}]/CheckBox[1]`).click();
      await this.page.waitForTimeout(500);
    }
    await displayFieldArrow.click();
    await this.page.waitForTimeout(1000);

    for (const idx of visibleFieldIndices) {
      await this.page.locateUI5(`//Grid[1]/List[1]/StandardListItem[${idx}]/CheckBox[1]`).click();
      await this.page.waitForTimeout(500);
    }

    // "Allow Show Description" checkbox — outside the Visible Fields grid
    const allowShowDesc = this.page.getByRole('checkbox', { name: 'Allow Show Description' });
    if (await allowShowDesc.isVisible().catch(() => false)) {
      await allowShowDesc.click();
      await this.page.waitForTimeout(500);
    }

    await this.page.getByRoleUI5('Button', { text: 'Update' }).click();
    await this.page.waitForTimeout(2000);
    await this.page.locator('.sapMDialog').last().waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    console.log('[AdminSearchMethodPage]  DROPDOWN Source Data configured');
  }

  async changeFieldIndex(fieldName: string, newIndex: string): Promise<void> {
    console.log(`[AdminSearchMethodPage] Changing index for ${fieldName} to ${newIndex}`);
    const row = this.page.locator('[role="row"]')
      .filter({ has: this.page.getByText(fieldName, { exact: true }) })
      .first();
    await expect(row).toBeVisible({ timeout: 5000 });
    const fieldIndexCell = row.locator('[aria-colindex="7"]');
    await expect(fieldIndexCell).toBeVisible({ timeout: 5000 });
    await fieldIndexCell.click();
    await this.page.waitForTimeout(500);
    const indexInput = fieldIndexCell.locator('input').first();
    await expect(indexInput).toBeVisible({ timeout: 5000 });
    await indexInput.fill(newIndex);
    await this.page.waitForTimeout(500);
  }

  async saveSearchMethodSettings(): Promise<void> {
    console.log('[AdminSearchMethodPage] Saving Search Method Settings...');
    await this.page.getByRoleUI5('Button', { text: 'Save' }).nth(1).click();
    await this.waitForBusy(3000);
  }

  async verifyFieldHasControlType(fieldName: string, controlType: string): Promise<void> {
    console.log(`[AdminSearchMethodPage] Verifying ${fieldName} has control type: ${controlType}`);
    const fieldRow = this.page.locator('[role="row"]')
      .filter({ has: this.page.getByText(fieldName, { exact: true }) });
    await expect(fieldRow.getByText(controlType, { exact: true })).toBeVisible({ timeout: 5000 });
  }

  // =========================================
  // Remove Fields
  // =========================================

  async removeFields(fieldNames: string[]): Promise<void> {
    console.log(`[AdminSearchMethodPage] Removing fields: ${fieldNames.join(', ')}`);

    for (const fieldName of fieldNames) {
      const fieldRow = this.page.locator('[role="row"]')
        .filter({ has: this.page.getByText(fieldName, { exact: true }) })
        .first();
      await expect(fieldRow).toBeVisible({ timeout: 5000 });
      const checkbox = fieldRow.locator('[role="checkbox"]');
      await expect(checkbox).toBeVisible({ timeout: 5000 });
      await checkbox.click();
      await this.page.waitForTimeout(500);
    }

    // Click Remove Fields button
    await this.page.getByRoleUI5('Button', { text: 'Remove Fields' }).click();
    await this.waitForBusy(3000);

    for (const fieldName of fieldNames) {
      await expect(this.page.getByText(fieldName, { exact: true })).not.toBeVisible({ timeout: 5000 });
      console.log(`[AdminSearchMethodPage]  Field removed: ${fieldName}`);
    }
  }

  // =========================================
  // Delete Method
  // =========================================

  async deleteMethod(methodId: string): Promise<void> {
    console.log(`[AdminSearchMethodPage] Deleting method: ${methodId}`);

    await this.page.getByRoleUI5('StandardListItem', { title: 'Search Method Settings' }).first().click();
    await this.waitForBusy(2000);

    await this.searchMethod(methodId);
    await this.page.waitForTimeout(1000);

    await this.page.getByRoleUI5('OverflowToolbarButton', { text: 'Delete Method' }).click();
    await this.page.waitForTimeout(2000);

    await this.page.getByRole('checkbox', { name: 'Item Selection' }).first().click();
    await this.page.waitForTimeout(500);

    await this.page.getByRoleUI5('OverflowToolbarButton', { text: 'Confirm' }).click();
    await this.waitForBusy(2000);

    await this.page.getByRoleUI5('Button', { text: 'Yes' }).click();
    await this.page.waitForTimeout(1000);
    await this.waitForBusy(3000);
    console.log(`[AdminSearchMethodPage]  Method deleted: ${methodId}`);
  }

  // =========================================
  // Verification
  // =========================================

  async verifyMethodInList(methodName: string): Promise<boolean> {
    console.log(`[AdminSearchMethodPage] Verifying method in list: ${methodName}`);
    const item = this.page.getByRoleUI5('StandardListItem', { title: methodName });
    await expect(item).toBeVisible({ timeout: 5000 });
    return true;
  }

  async verifyMethodById(methodId: string): Promise<boolean> {
    console.log(`[AdminSearchMethodPage] Verifying method by ID: ${methodId}`);
    await this.searchMethod(methodId);
    await this.page.waitForTimeout(2000);
    return true;
  }

  async verifyFieldInList(fieldName: string): Promise<void> {
    console.log(`[AdminSearchMethodPage] Verifying field in list: ${fieldName}`);
    await expect(this.page.getByText(fieldName, { exact: true })).toBeVisible({ timeout: 5000 });
  }

  async verifyControlType(fieldName: string, controlType: string): Promise<void> {
    console.log(`[AdminSearchMethodPage] Verifying control type: ${controlType} for field: ${fieldName}`);
    const fieldRow = this.page.locator('[role="row"]')
      .filter({ has: this.page.getByText(fieldName, { exact: true }) });
    await expect(fieldRow.getByText(controlType, { exact: true })).toBeVisible({ timeout: 5000 });
  }

  async verifyMethodNotVisible(methodName: string): Promise<void> {
    console.log(`[AdminSearchMethodPage] Verifying method not visible: ${methodName}`);
    await expect(this.page.getByRoleUI5('StandardListItem', { title: methodName }).last()).not.toBeVisible({ timeout: 5000 });
  }

  async verifySuccessMessage(): Promise<void> {
    console.log('[AdminSearchMethodPage] Verifying success message...');
    // TODO: record success toast/message locator
  }

  async verifyErrorMessage(expectedText: string): Promise<void> {
    console.log(`[AdminSearchMethodPage] Verifying error: ${expectedText}`);
    await this.page.waitForTimeout(2000);
    const errorDialog = this.page.locator('.sapMDialog.sapMDialogError');
    await expect(errorDialog).toBeVisible({ timeout: 7500 });
    const msgBox = errorDialog.locator('.sapMMsgBoxText');
    await expect(msgBox).toContainText(expectedText, { timeout: 5000 });
  }

  async closeErrorDialog(): Promise<void> {
    console.log('[AdminSearchMethodPage] Closing error dialog...');
    const errorDialog = this.page.locator('.sapMDialog.sapMDialogError');
    await errorDialog.getByRoleUI5('Button', { text: 'Close' }).click();
    await this.page.waitForTimeout(1000);
  }
}
