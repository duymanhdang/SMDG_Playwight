import { Page, expect } from '@playwright/test';
import { BasePage } from '../BasePage';

export class MainAssignmentRuleVerifyPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // =========================================
  // Verify Assignment Rule — UnitOfMeasure Length → Width & Height
  // =========================================

  async verifyUnitsOfMeasureTableVisible(): Promise<void> {
    console.log('[MainAssignmentRuleVerify] Verifying "Units of Measure" table...');
    // The MM01 detail form renders in sections top-to-bottom; "Units of Measure"
    // is further down than the header fields and can take longer than 10s to
    // render under load — give it the same generous timeout as other
    // post-navigation renders in this codebase.
    await expect(
      this.page.getByRoleUI5('Title', { text: 'Units of Measure' }).first()
    ).toBeVisible({ timeout: 30000 });
    console.log('[MainAssignmentRuleVerify]  "Units of Measure" table visible');
  }

  async verifyRowText(rowText: string): Promise<void> {
    console.log(`[MainAssignmentRuleVerify] Verifying row text: "${rowText}"`);
    await expect(this.page.getByText(rowText, { exact: true })).toBeVisible({ timeout: 10000 });
    console.log('[MainAssignmentRuleVerify]  Row text verified');
  }

  async clickExpandRow(): Promise<void> {
    console.log('[MainAssignmentRuleVerify] Clicking expand row button...');
    await this.page.getByRoleUI5('Button', { icon: 'sap-icon://open-command-field' }).nth(1).click();
    await this.waitForBusy(3000);
    console.log('[MainAssignmentRuleVerify]  Row expanded');
  }

  async verifyUnitOfDimensionLabel(): Promise<void> {
    await expect(
      this.page.getByRoleUI5('Label', { text: 'Unit of Dimension' }).first()
    ).toBeVisible({ timeout: 10000 });
    console.log('[MainAssignmentRuleVerify]  "Unit of Dimension" label visible');
  }

  async selectUnitOfDimension(unit: string): Promise<void> {
    console.log(`[MainAssignmentRuleVerify] Selecting unit of dimension: ${unit}`);
    await this.page.getByRoleUI5('Icon', { src: 'sap-icon://value-help' }).nth(2).click();
    await this.waitForBusy(3000);

    const searchField = this.page.getByRoleUI5('SearchField').first();
    await expect(searchField).toBeVisible({ timeout: 5000 });
    await searchField.click();
    await searchField.fill(unit);
    await searchField.press('Enter');
    await this.waitForBusy(3000);

    const item = this.page.getByText(unit, { exact: true });
    await expect(item).toBeVisible({ timeout: 10000 });
    await item.click();
    await this.waitForBusy(3000);
    console.log('[MainAssignmentRuleVerify]  Unit of dimension selected');
  }

  async verifyDialogTitle(): Promise<void> {
    console.log('[MainAssignmentRuleVerify] Verifying dialog title...');
    await expect(
      this.page.getByRoleUI5('Title', { text: 'Units of Measure' }).first()
    ).toBeVisible({ timeout: 10000 });
    console.log('[MainAssignmentRuleVerify]  Dialog title verified');
  }

  async verifyLengthLabel(): Promise<void> {
    await expect(
      this.page.getByRoleUI5('Label', { text: 'Length' }).first()
    ).toBeVisible({ timeout: 10000 });
    console.log('[MainAssignmentRuleVerify]  "Length" label visible');
  }

  async verifyLengthValue(expectedValue: string): Promise<void> {
    console.log(`[MainAssignmentRuleVerify] Verifying Length shows: ${expectedValue}`);
    await expect(
      this.page.getByLabel(/^Length$/).first()
    ).toHaveValue(expectedValue, { timeout: 10000 });
    console.log('[MainAssignmentRuleVerify]  Length value matches');
  }

  async fillLengthValue(value: string): Promise<void> {
    console.log(`[MainAssignmentRuleVerify] Filling Length with: ${value}`);
    const input = this.page.getByRoleUI5('Input', { value: '0.000' }).first();
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.click();
    await input.fill(value);
    await input.press('Enter');
    await this.waitForBusy(2000);
    console.log('[MainAssignmentRuleVerify]  Length value filled');
  }

  async verifyWidthLabel(): Promise<void> {
    await expect(
      this.page.getByRoleUI5('Label', { text: 'Width' }).first()
    ).toBeVisible({ timeout: 10000 });
    console.log('[MainAssignmentRuleVerify]  "Width" label visible');
  }

  async verifyWidthValue(expectedValue: string): Promise<void> {
    console.log(`[MainAssignmentRuleVerify] Verifying Width shows: ${expectedValue}`);
    const widthInput = this.page.getByLabel(/^Width$/).first();
    await expect
      .poll(async () => {
        const val = await widthInput.inputValue();
        if (val !== expectedValue) {
          await this.page.keyboard.press('Tab');
          await this.waitForBusy(1000);
        }
        return await widthInput.inputValue();
      }, { timeout: 20000, message: `Width value should become ${expectedValue}` })
      .toBe(expectedValue);
    console.log('[MainAssignmentRuleVerify]  Width value matches');
  }

  async verifyHeightLabel(): Promise<void> {
    await expect(
      this.page.getByRoleUI5('Label', { text: 'Height' }).first()
    ).toBeVisible({ timeout: 10000 });
    console.log('[MainAssignmentRuleVerify]  "Height" label visible');
  }

  async verifyHeightValue(expectedValue: string): Promise<void> {
    console.log(`[MainAssignmentRuleVerify] Verifying Height shows: ${expectedValue}`);
    const heightInput = this.page.getByLabel(/^Height$/).first();
    await expect
      .poll(async () => {
        const val = await heightInput.inputValue();
        if (val !== expectedValue) {
          await this.page.keyboard.press('Tab');
          await this.waitForBusy(1000);
        }
        return await heightInput.inputValue();
      }, { timeout: 20000, message: `Height value should become ${expectedValue}` })
      .toBe(expectedValue);
    console.log('[MainAssignmentRuleVerify]  Height value matches');
  }

  async clickUpdate(): Promise<void> {
    console.log('[MainAssignmentRuleVerify] Clicking Update button...');
    await this.page.getByRoleUI5('Button', { text: 'Update' }).filter({ hasNotText: 'Import' }).click();
    await this.waitForBusy(3000);
    console.log('[MainAssignmentRuleVerify]  Dialog closed via Update');
  }

  async clickCancel(): Promise<void> {
    console.log('[MainAssignmentRuleVerify] Clicking Cancel button...');
    await this.page.getByRoleUI5('Button', { text: 'Cancel' }).first().click();
    await this.waitForBusy(2000);
    console.log('[MainAssignmentRuleVerify]  Dialog closed via Cancel');
  }

  // =========================================
  // High-level composite actions
  // =========================================

  /// ** For Requestor: fill Length, select Unit of Dimension, verify auto-assigned Width/Height, then Update **
  async verifyRule(lengthValue: string, unitOfDimension: string): Promise<void> {
    await this.verifyUnitsOfMeasureTableVisible();
    await this.verifyRowText('EA');
    await this.clickExpandRow();

    await this.verifyUnitOfDimensionLabel();
    await this.selectUnitOfDimension(unitOfDimension);

    await this.verifyDialogTitle();
    await this.verifyLengthLabel();
    await this.fillLengthValue(lengthValue);

    await this.verifyWidthLabel();
    await this.verifyWidthValue(lengthValue);
    await this.verifyHeightLabel();
    await this.verifyHeightValue(lengthValue);

    await this.clickUpdate();
  }

  /// ** For Approver: verify values already set by Requestor (no fill/select), then Update **
  async verifyRuleAtApprover(lengthValue: string): Promise<void> {
    await this.verifyUnitsOfMeasureTableVisible();
    await this.verifyRowText('EA');
    await this.clickExpandRow();

    await this.verifyDialogTitle();
    await this.verifyLengthLabel();
    await this.verifyLengthValue(lengthValue);
    await this.verifyWidthLabel();
    await this.verifyWidthValue(lengthValue);
    await this.verifyHeightLabel();
    await this.verifyHeightValue(lengthValue);

    await this.clickUpdate();
  }

  /// ** For Steward (post-activation read-only): verify values, then Cancel to close **
  async verifyRuleAtSteward(lengthValue: string): Promise<void> {
    await this.verifyUnitsOfMeasureTableVisible();
    await this.verifyRowText('EA');
    await this.clickExpandRow();

    await this.verifyDialogTitle();
    await this.verifyLengthLabel();
    await this.verifyLengthValue(lengthValue);
    await this.verifyWidthLabel();
    await this.verifyWidthValue(lengthValue);
    await this.verifyHeightLabel();
    await this.verifyHeightValue(lengthValue);

    await this.clickCancel();
  }
}
