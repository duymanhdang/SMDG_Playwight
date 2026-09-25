import { Page, expect } from '@playwright/test';
import { AdminRulePage } from '../AdminRulePage';

export class AdminVisibleRulePage extends AdminRulePage {
  constructor(page: Page) {
    super(page);
    this.LOG_PREFIX = '[AdminVisibleRule]';
  }

  // =========================================
  // Navigation: specific to Visible Rule
  // NOTE: Visible skips navigateToAdmin() — assumes already on admin page
  // =========================================

  async navigateToVisibleRule(templateName: string): Promise<void> {
    console.log(`${this.LOG_PREFIX} Navigating to Visible Rule for template: ${templateName}`);

    await this.navigateToProcessDesigner();
    await this.searchTemplate(templateName);
    await this.clickTemplateLink(templateName);

    await this.page.getByRoleUI5('StandardListItem', { title: 'Template Rules' }).click();
    await this.page.waitForTimeout(1000);

    await this.page.getByRoleUI5('Select', { selectedKey: 'V' }).click();
    await this.page.waitForTimeout(500);
    await this.page.getByRoleUI5('Item', { text: 'Business Rule' }).first().click();
    await this.page.waitForTimeout(1000);

    const visibleArrows = this.page.getByRoleUI5('Icon', { src: 'sap-icon://slim-arrow-down' }).filter({ visible: true });
    await visibleArrows.last().click();
    await this.page.waitForTimeout(500);
    await this.page.getByRoleUI5('StandardListItem', { title: 'Visible Rule' }).click();
    await this.page.waitForTimeout(2000);

    console.log(`${this.LOG_PREFIX}  Visible Rule page loaded`);
  }

  // =========================================
  // ComboBox helpers — matches AdminEditableRulePage pattern
  // =========================================

  async selectComboBox(placeholder: string, value: string, waitForEnabled = false): Promise<void> {
    console.log(`${this.LOG_PREFIX} Select ComboBox "${placeholder}" → "${value}"`);
    const combo = this.page.getByRoleUI5('ComboBox', { placeholder });
    await expect(combo).toBeVisible({ timeout: 5000 });
    if (waitForEnabled) {
      for (let i = 0; i < 20; i++) {
        if (await combo.isEnabled().catch(() => false)) break;
        await this.page.waitForTimeout(200);
      }
    }
    await combo.click();
    await combo.fill(value);
    await this.page.waitForTimeout(500);
    try {
      const opt = this.page.getByRole('option').filter({ hasText: value }).first();
      await opt.waitFor({ state: 'visible', timeout: 2000 });
      await opt.click();
      console.log(`${this.LOG_PREFIX}  Option "${value}" clicked`);
      await combo.press('Tab');
      await this.page.waitForTimeout(300);
      return;
    } catch {
      console.log(`${this.LOG_PREFIX}  No role=option for "${value}"`);
    }
    try {
      const opt = this.page.locator(`li:has-text("${value}")`).first();
      await opt.waitFor({ state: 'visible', timeout: 1000 });
      await opt.click();
      console.log(`${this.LOG_PREFIX}  List item "${value}" clicked`);
      await combo.press('Tab');
      await this.page.waitForTimeout(300);
      return;
    } catch {
      console.log(`${this.LOG_PREFIX}  No li for "${value}"`);
    }
    console.log(`${this.LOG_PREFIX}  No dropdown option for "${value}", press Tab`);
    await combo.press('Tab');
    await this.page.waitForTimeout(300);
    console.log(`${this.LOG_PREFIX}  Selected "${value}" (Tab fallback)`);
  }

  async selectSourceSection(section: string): Promise<void> {
    await this.selectComboBox('Enter Source Section', section);
  }

  async selectSourceField(field: string): Promise<void> {
    await this.selectComboBox('Enter Source Field', field, true);
  }

  async selectTargetSection(section: string): Promise<void> {
    await this.selectComboBox('Enter Target Section', section);
  }

  async selectTargetField(field: string): Promise<void> {
    await this.selectComboBox('Enter Target Field', field, true);
  }

  async fillSourceValueViaF4(value: string): Promise<void> {
    console.log(`${this.LOG_PREFIX}  Fill Source Value: "${value}"`);

    const vhi = this.page.locator('[id$="-ConfigValue-vhi"]');
    const hasVhi = await vhi.isVisible({ timeout: 1000 }).catch(() => false);

    if (hasVhi) {
      console.log(`${this.LOG_PREFIX}  Source Value has F4 — using dialog selection`);
      await vhi.click();
      await this.page.waitForTimeout(500);

      const searchField = this.page.getByRoleUI5('SearchField').first();
      await expect(searchField).toBeVisible({ timeout: 3000 });
      await searchField.click();
      await searchField.fill(value);
      await searchField.press('Enter');
      await this.page.waitForTimeout(500);

      const row = this.page.locator('.sapMTableTBody > tr.sapMListTblRow').first();
      const hasRow = await row.isVisible({ timeout: 2000 }).catch(() => false);
      if (hasRow) {
        console.log(`${this.LOG_PREFIX}  Select first F4 row`);
        await row.click();
      } else {
        const result = this.page.getByText(value, { exact: true }).first();
        if (await result.isVisible({ timeout: 1000 }).catch(() => false)) {
          await result.click();
        } else {
          await searchField.press('Enter');
        }
      }
      // Wait for the F4 select dialog's modal backdrop to actually finish
      // closing instead of a flat 300ms sleep — under load the close
      // animation/backdrop can outlast that, and the next action (Add Rule)
      // can fire before the selected value has actually committed, submitting
      // an empty Source Value ("Please enter all required fields").
      await this.page.locator('.sapMTableSelectDialog').first().waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
      await this.page.locator('.sapUiBLy').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
      await this.page.waitForTimeout(300);
    } else {
      console.log(`${this.LOG_PREFIX}  Source Value is text — typing directly`);
      const input = this.page.locator('[id$="-ConfigValue-inner"]');
      for (let i = 0; i < 20; i++) {
        if (await input.isEnabled().catch(() => false)) break;
        await this.page.waitForTimeout(500);
      }
      await input.click();
      await input.fill(value);
      await this.page.waitForTimeout(500);
    }
    console.log(`${this.LOG_PREFIX}  Source Value set`);
  }

  // =========================================
  // Add Rule
  // =========================================

  async clickAddRule(): Promise<void> {
    console.log(`${this.LOG_PREFIX} Clicking Add Rule...`);
    await this.page.getByRoleUI5('Button', { text: 'Add Rule' }).click();
    await this.waitForBusy(3000);
    await this.page.waitForTimeout(1000);
  }

  async cancelAddNewDialog(): Promise<void> {
    console.log(`${this.LOG_PREFIX} Canceling Add New dialog...`);
    const cancelBtn = this.page.getByRoleUI5('Button', { text: 'Cancel' }).first();
    await expect(cancelBtn).toBeVisible({ timeout: 5000 });
    await cancelBtn.click();
    await this.waitForBusy(2000);
    console.log(`${this.LOG_PREFIX}  Dialog closed`);
  }

  // =========================================
  // Toast
  // =========================================

  async verifyToast(expectedMessage: string): Promise<void> {
    console.log(`${this.LOG_PREFIX} Verifying toast: "${expectedMessage}"`);
    await expect(this.page.getByText(expectedMessage).first()).toBeVisible({ timeout: 10000 });
    console.log(`${this.LOG_PREFIX}  Toast verified`);
  }

  // =========================================
  // High-level composite actions
  // =========================================

  async checkAcceptedAnyValue(): Promise<void> {
    console.log(`${this.LOG_PREFIX}  Check "Accepted any value"`);
    const checkbox = this.page.getByRoleUI5('CheckBox', { text: 'Accepted any value' }).first();
    await expect(checkbox).toBeVisible({ timeout: 5000 });
    await checkbox.click();
    await this.page.waitForTimeout(500);
  }

  async createVisibleRule(params: {
    sourceSection: string;
    sourceField: string;
    targetSection: string;
    targetField: string;
    sourceValue?: string;
    acceptedAnyValue?: boolean;
  }): Promise<void> {
    await this.clickAddNew();
    await this.verifyAddNewDialogVisible();

    await this.selectSourceSection(params.sourceSection);
    await this.selectSourceField(params.sourceField);
    await this.selectTargetSection(params.targetSection);
    await this.selectTargetField(params.targetField);
    if (params.acceptedAnyValue) {
      await this.checkAcceptedAnyValue();
    } else if (params.sourceValue) {
      await this.fillSourceValueViaF4(params.sourceValue);
    }
    await this.clickAddRule();

    await this.searchRuleBySourceSection(params.sourceSection);
    await this.verifyRuleRowVisible();
  }

  async selectUserAttribute(attributeValue: string): Promise<void> {
    console.log(`${this.LOG_PREFIX} Selecting User Attribute: ${attributeValue}`);
    const displayMap: Record<string, string> = {
      userID: 'User ID',
      userGroupID: 'User Group',
    };
    const displayValue = displayMap[attributeValue] || attributeValue;
    await this.selectComboBox('Enter User Attribute', displayValue);
  }

  async createUserAttributeRule(params: {
    userAttribute: string;
    targetSection: string;
    targetField: string;
    sourceValue?: string;
  }): Promise<void> {
    console.log(`${this.LOG_PREFIX} Creating User Attribute rule: ${params.userAttribute} → ${params.targetSection}.${params.targetField}`);

    await this.clickAddNew();
    await this.verifyAddNewDialogVisible();

    await this.selectUserAttribute(params.userAttribute);
    await this.selectTargetSection(params.targetSection);
    await this.selectTargetField(params.targetField);
    if (params.sourceValue) {
      await this.fillSourceValueViaF4(params.sourceValue);
    }
    await this.clickAddRule();
  }

  async deleteVisibleRule(sourceSection: string, targetField?: string): Promise<void> {
    await this.searchRuleBySourceSection(sourceSection);
    await this.verifyRuleRowVisible();
    await this.page.keyboard.press('Escape');
    await this.waitForBusy(1000);
    await this.clickDeleteRule(targetField);
    const errorDialog = this.page.locator('[role="alertdialog"]').filter({ hasText: /Please enter/i });
    if (await errorDialog.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log(`${this.LOG_PREFIX} Error dialog dismissed, retrying...`);
      await this.page.keyboard.press('Escape');
      await this.waitForBusy(1000);
      await expect(errorDialog).toBeHidden({ timeout: 3000 });
      await this.clickDeleteRule(targetField);
    }
    await this.verifyConfirmationDialog();
    await this.confirmDelete();
  }

  async safeDeleteVisibleRule(sourceSection: string, targetField?: string): Promise<void> {
    try {
      await this.searchRuleBySourceSection(sourceSection);

      const tableBody = this.page.locator('[id*="ruleFieldsConfig"][id$="-tblBody"]');
      if (!(await tableBody.isVisible({ timeout: 3000 }).catch(() => false))) {
        console.log(`${this.LOG_PREFIX} No rule rows for "${sourceSection}" — skipping delete`);
        return;
      }
      const rows = tableBody.locator('[role="row"]');
      if ((await rows.count()) === 0) {
        console.log(`${this.LOG_PREFIX} No rule rows for "${sourceSection}" — skipping delete`);
        return;
      }

      await this.verifyRuleRowVisible();
      await this.page.keyboard.press('Escape');
      await this.waitForBusy(1000);
      await this.clickDeleteRule(targetField);
      const errorDialog = this.page.locator('[role="alertdialog"]').filter({ hasText: /Please enter/i });
      if (await errorDialog.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log(`${this.LOG_PREFIX} Error dialog dismissed, retrying...`);
        await this.page.keyboard.press('Escape');
        await this.waitForBusy(1000);
        await expect(errorDialog).toBeHidden({ timeout: 3000 });
        await this.clickDeleteRule(targetField);
      }
      await this.verifyConfirmationDialog();
      await this.confirmDelete();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`${this.LOG_PREFIX} Safe delete skipped: ${msg}`);
    }
  }

  async safeDeleteUserAttributeRule(targetField: string): Promise<void> {
    try {
      const searchField = this.page.getByRoleUI5('SearchField').nth(1);
      await searchField.click({ force: true });
      await searchField.fill(targetField);
      await searchField.press('Enter');
      await this.waitForBusy(3000);

      const tableBody = this.page.locator('[id*="ruleFieldsConfig"][id$="-tblBody"]');
      if (!(await tableBody.isVisible({ timeout: 3000 }).catch(() => false))) {
        console.log(`${this.LOG_PREFIX} No rule rows for targetField "${targetField}" — skipping delete`);
        return;
      }
      const rows = tableBody.locator('[role="row"]');
      if ((await rows.count()) === 0) {
        console.log(`${this.LOG_PREFIX} No rule rows for targetField "${targetField}" — skipping delete`);
        return;
      }

      await this.verifyRuleRowVisible();
      await this.page.keyboard.press('Escape');
      await this.waitForBusy(1000);
      await this.clickDeleteRule(targetField);
      const errorDialog = this.page.locator('[role="alertdialog"]').filter({ hasText: /Please enter/i });
      if (await errorDialog.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log(`${this.LOG_PREFIX} Error dialog dismissed, retrying...`);
        await this.page.keyboard.press('Escape');
        await this.waitForBusy(1000);
        await expect(errorDialog).toBeHidden({ timeout: 3000 });
        await this.clickDeleteRule(targetField);
      }
      await this.verifyConfirmationDialog();
      await this.confirmDelete();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`${this.LOG_PREFIX} Safe delete userAttribute skipped: ${msg}`);
    }
  }
}
