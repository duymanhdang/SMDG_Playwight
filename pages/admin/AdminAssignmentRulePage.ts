import { Page, expect } from '@playwright/test';
import { AdminRulePage } from '../AdminRulePage';

export class AdminAssignmentRulePage extends AdminRulePage {
  constructor(page: Page) {
    super(page);
    this.LOG_PREFIX = '[AdminAssignmentRule]';
  }

  // =========================================
  // Navigation: specific to Assignment Rule
  // =========================================

  async navigateToAssignmentRule(templateName: string): Promise<void> {
    console.log(`${this.LOG_PREFIX} Navigating to Assignment Rule for template: ${templateName}`);

    await this.navigateToAdmin();
    await this.navigateToProcessDesigner();
    await this.searchTemplate(templateName);
    await this.clickTemplateLink(templateName);

    // Click Template Rules → Business Rule → Assignment Rule
    await this.page.getByRoleUI5('StandardListItem', { title: 'Template Rules' }).click();
    await this.page.waitForTimeout(1000);

    await this.page.getByRoleUI5('Select', { selectedKey: 'V' }).click();
    await this.page.waitForTimeout(500);
    await this.page.getByRoleUI5('Item', { text: 'Business Rule' }).first().click();
    await this.page.waitForTimeout(1000);

    const visibleArrows = this.page.getByRoleUI5('Icon', { src: 'sap-icon://slim-arrow-down' }).filter({ visible: true });
    await visibleArrows.last().click();
    await this.page.waitForTimeout(500);
    await this.page.getByRoleUI5('StandardListItem', { title: 'Assignment Rule' }).click();
    await this.page.waitForTimeout(2000);

    console.log(`${this.LOG_PREFIX}  Assignment Rule page loaded`);
  }

  // =========================================
  // ComboBox helpers (unique to Assignment)
  // =========================================

  private async selectComboBoxItem(placeholder: string, value: string, label: string): Promise<void> {
    console.log(`${this.LOG_PREFIX} Selecting ${label}: ${value}`);
    await expect(this.page.getByRoleUI5('Label', { text: label }).first()).toBeVisible({ timeout: 5000 });
    const combo = this.page.getByRoleUI5('ComboBox', { placeholder });
    await combo.click();
    await combo.fill(value);
    await this.page.waitForTimeout(1000);
    try {
      const opt = this.page.getByRole('option').filter({ hasText: value }).first();
      await opt.waitFor({ state: 'visible', timeout: 5000 });
      await opt.click();
      console.log(`${this.LOG_PREFIX}  ${label} option clicked`);
    } catch {
      console.log(`${this.LOG_PREFIX}  Option not found for ${label}, committing value via SAP API`);
      await this.commitComboBoxValue(combo, value);
    }
    await this.page.waitForTimeout(500);
  }

  private async commitComboBoxValue(combo: ReturnType<Page['locator']>, value: string): Promise<void> {
    await combo.evaluate((el: HTMLInputElement, val: string) => {
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      try {
        const core = (window as any).sap?.ui?.getCore();
        if (core) {
          const control = core.byId(el.id.replace('-inner', ''));
          if (control?.setValue) {
            control.setValue(val);
          }
          if (control?.fireChange) {
            control.fireChange({ value: val });
          }
        }
      } catch {}
    }, value);
  }

  async selectSourceSection(section: string): Promise<void> {
    await this.selectComboBoxItem('Enter Source Section', section, 'Source Section');
  }

  async selectSourceField(field: string): Promise<void> {
    const combo = this.page.getByRoleUI5('ComboBox', { placeholder: 'Enter Source Field' });
    for (let i = 0; i < 20; i++) {
      if (await combo.isEnabled().catch(() => false)) break;
      await this.page.waitForTimeout(500);
    }
    if (!(await combo.isEnabled().catch(() => false))) {
      console.log(`${this.LOG_PREFIX}  Source Field still disabled after 10s`);
    }
    await this.selectComboBoxItem('Enter Source Field', field, 'Source Field');
  }

  async selectTargetSection(section: string): Promise<void> {
    await this.selectComboBoxItem('Enter Target Section', section, 'Target Section');
  }

  async selectTargetField(field: string): Promise<void> {
    const combo = this.page.getByRoleUI5('ComboBox', { placeholder: 'Enter Target Field' });
    for (let i = 0; i < 20; i++) {
      if (await combo.isEnabled().catch(() => false)) break;
      await this.page.waitForTimeout(500);
    }
    if (!(await combo.isEnabled().catch(() => false))) {
      console.log(`${this.LOG_PREFIX}  Target Field still disabled after 10s`);
    }
    await this.selectComboBoxItem('Enter Target Field', field, 'Target Field');
  }

  async selectSourceProperty(property: string): Promise<void> {
    console.log(`${this.LOG_PREFIX} Selecting Source Property: ${property}`);
    await this.page.waitForTimeout(1000);
    await expect(this.page.getByRoleUI5('Label', { text: 'Source Property' }).first()).toBeVisible({ timeout: 5000 });

    const sourcePropInput = this.page.locator('label:has-text("Source Property")').first();
    const forAttr = await sourcePropInput.getAttribute('for').catch(() => null);
    if (forAttr) {
      const inputId = forAttr.replace('-inner', '');
      await this.page.locator(`[id="${inputId}-vhi"]`).click();
    } else {
      const sourcePropRow = this.page.locator('[id*="vbox"]').filter({ hasText: 'Source Property' }).first();
      await sourcePropRow.locator('input[type="text"]').first().click();
    }
    await this.waitForBusy(2000);

    const dialog = this.page.locator('.sapMDialog').last();
    const searchField = dialog.locator('[id$="-searchField"]').first();
    await searchField.click();
    const searchInput = searchField.locator('input').first();
    await searchInput.fill(property);
    await searchInput.press('Enter');
    await this.waitForBusy(2000);

    const resultCell = dialog.getByText(property, { exact: true }).first();
    await expect(resultCell).toBeVisible({ timeout: 5000 });
    await resultCell.click();
    await this.waitForBusy(2000);
  }

  // =========================================
  // Add Rule
  // =========================================

  async clickAddRule(): Promise<void> {
    console.log(`${this.LOG_PREFIX} Clicking Add Rule...`);
    await this.page.getByRoleUI5('Button', { text: 'Add Rule' }).click();
    await this.page.locator('.sapUiBLy').waitFor({ state: 'hidden', timeout: 25000 }).catch(() => {});
    await this.waitForBusy(3000);
    await this.page.waitForTimeout(1000);
  }

  async cancelAddNewDialog(): Promise<void> {
    console.log(`${this.LOG_PREFIX} Canceling Add New dialog...`);
    const cancelBtn = this.page.getByRoleUI5('Button', { text: 'Cancel' }).first();
    await expect(cancelBtn).toBeVisible({ timeout: 5000 });
    await cancelBtn.click();
    await this.waitForBusy(2000);
    const dialog = this.page.locator('.sapMDialog').filter({ hasText: 'Add new Business Rule' }).last();
    await dialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    await this.page.waitForTimeout(500);
    console.log(`${this.LOG_PREFIX}  Add New dialog closed`);
  }

  // =========================================
  // Dialog / Error / Toast handling
  // =========================================

  async clickAddRuleAndExpectDialog(): Promise<void> {
    console.log(`${this.LOG_PREFIX} Clicking Add Rule (expect dialog)...`);
    await this.page.getByRoleUI5('Button', { text: 'Add Rule' }).click();
    await this.page.waitForTimeout(2000);
  }

  async dismissErrorDialogIfPresent(): Promise<boolean> {
    const errorDialog = this.page.locator('.sapMDialog.sapMDialogError').last();
    const isVisible = await errorDialog.isVisible().catch(() => false);
    if (!isVisible) return false;
    console.log(`${this.LOG_PREFIX} Error dialog present, dismissing...`);
    await errorDialog.getByRoleUI5('Button', { text: 'Close' }).last().click();
    await this.waitForBusy(2000);
    await this.cancelAddNewDialog();
    return true;
  }

  async verifyErrorMessage(expectedMessage: string): Promise<void> {
    console.log(`${this.LOG_PREFIX} Verifying error message: "${expectedMessage}"`);
    const dialog = this.page.locator('.sapMDialog').last();
    await expect(dialog).toBeVisible({ timeout: 10000 });
    const msgBox = dialog.locator('.sapMMsgBoxText');
    await expect(msgBox).toContainText(expectedMessage, { timeout: 5000 });
    console.log(`${this.LOG_PREFIX}  Error message verified`);
  }

  async closeErrorDialog(): Promise<void> {
    console.log(`${this.LOG_PREFIX} Closing error dialog...`);
    await this.page.getByRoleUI5('Button', { text: 'Close' }).last().click();
    await this.waitForBusy(2000);
    console.log(`${this.LOG_PREFIX}  Error dialog closed`);
  }

  async verifyToast(expectedMessage: string): Promise<void> {
    console.log(`${this.LOG_PREFIX} Verifying toast: "${expectedMessage}"`);
    await expect(this.page.getByText(expectedMessage).first()).toBeVisible({ timeout: 10000 });
    console.log(`${this.LOG_PREFIX}  Toast verified`);
  }

  // =========================================
  // Rule State ON/OFF Toggle (Assignment-specific)
  // =========================================

  private getRowSwitch(targetField: string) {
    const tableBody = this.page.locator('[id*="ruleFieldsConfig"][id$="-tblBody"]');
    const row = tableBody.locator('[role="row"]').filter({ hasText: targetField }).first();
    return row.locator('[role="switch"]');
  }

  async getRuleState(targetField: string, sourceSection?: string): Promise<boolean> {
    if (sourceSection) {
      await this.searchRuleBySourceSection(sourceSection);
    }
    const sw = this.getRowSwitch(targetField);
    await expect(sw).toBeVisible({ timeout: 5000 });
    const checked = await sw.getAttribute('aria-checked');
    return checked === 'true';
  }

  async toggleRuleState(targetField: string, targetState?: boolean, sourceSection?: string): Promise<void> {
    console.log(`${this.LOG_PREFIX} Toggling rule state for target: ${targetField}${targetState !== undefined ? ` to ${targetState ? 'ON' : 'OFF'}` : ''}`);
    if (sourceSection) {
      await this.searchRuleBySourceSection(sourceSection);
    }
    const sw = this.getRowSwitch(targetField);
    await expect(sw).toBeVisible({ timeout: 5000 });

    if (targetState !== undefined) {
      const current = await sw.getAttribute('aria-checked');
      if (current === String(targetState)) {
        console.log(`${this.LOG_PREFIX}  Already ${targetState ? 'ON' : 'OFF'}, skipping`);
        return;
      }
    }

    await sw.click();
    await this.waitForBusy(3000);
    if (targetState !== undefined) {
      await expect(sw).toHaveAttribute('aria-checked', String(targetState), { timeout: 8000 });
      console.log(`${this.LOG_PREFIX}  Rule state is now ${targetState ? 'ON' : 'OFF'}`);
    }
  }

  // =========================================
  // High-level composite actions
  // =========================================

  async createAssignmentRule(params: {
    sourceSection: string;
    sourceField: string;
    targetSection: string;
    targetField: string;
    sourceProperty?: string;
  }): Promise<void> {
    await this.clickAddNew();
    await this.verifyAddNewDialogVisible();

    await this.selectSourceSection(params.sourceSection);
    await this.selectSourceField(params.sourceField);
    await this.selectTargetSection(params.targetSection);
    await this.selectTargetField(params.targetField);
    if (params.sourceProperty && params.sourceProperty !== 'current') {
      await this.selectSourceProperty(params.sourceProperty);
    }
    await this.clickAddRule();

    await this.searchRuleBySourceSection(params.sourceSection);
    await this.verifyRuleRowVisible();
  }

  async deleteAssignmentRule(sourceSection: string, targetField?: string): Promise<void> {
    await this.searchRuleBySourceSection(sourceSection);
    await this.verifyRuleRowVisible();
    await this.clickDeleteRule(targetField);
    await this.verifyConfirmationDialog();
    await this.confirmDelete();
  }
}
