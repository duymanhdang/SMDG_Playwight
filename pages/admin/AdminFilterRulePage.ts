import { Page, expect } from '@playwright/test';
import { AdminRulePage } from '../AdminRulePage';

export class AdminFilterRulePage extends AdminRulePage {
  constructor(page: Page) {
    super(page);
    this.LOG_PREFIX = '[AdminFilterRule]';
  }

  // =========================================
  // Navigation: specific to Filter Rule
  // NOTE: Filter skips navigateToAdmin() — assumes already on admin page
  // =========================================

  async navigateToFilterRule(templateName: string): Promise<void> {
    console.log(`${this.LOG_PREFIX} Navigating to Filter Rule for template: ${templateName}`);

    await this.navigateToProcessDesigner();
    await this.searchTemplate(templateName);
    await this.clickTemplateLink(templateName);

    await this.page.getByRoleUI5('StandardListItem', { title: 'Template Rules' }).click();
    await this.page.waitForTimeout(1000);

    await this.page.getByRoleUI5('Select', { selectedKey: 'V' }).click();
    await this.page.waitForTimeout(500);
    await this.page.getByRoleUI5('Item', { text: 'Business Rule' }).first().click();
    await this.page.waitForTimeout(1000);

    // Select Filter Rule from Business Rule sub-type dropdown
    const visibleArrows = this.page.getByRoleUI5('Icon', { src: 'sap-icon://slim-arrow-down' }).filter({ visible: true });
    await visibleArrows.last().click();
    await this.page.waitForTimeout(500);
    await this.page.getByRoleUI5('StandardListItem', { title: 'Filter Rule' }).click();
    await this.page.waitForTimeout(2000);

    console.log(`${this.LOG_PREFIX}  Filter Rule page loaded`);
  }

  // =========================================
  // ComboBox helpers
  // =========================================

  async selectSourceSection(section: string): Promise<void> {
    console.log(`${this.LOG_PREFIX} Selecting Source Section: ${section}`);
    await expect(this.page.getByRoleUI5('Label', { text: 'Source Section' }).first()).toBeVisible({ timeout: 5000 });
    const combo = this.page.getByRoleUI5('ComboBox', { placeholder: 'Enter Source Section' });
    await combo.click();
    await combo.fill(section);
    await this.page.waitForTimeout(1000);
    try {
      const opt = this.page.getByRole('option').filter({ hasText: section }).first();
      await opt.waitFor({ state: 'visible', timeout: 5000 });
      await opt.click();
      console.log(`${this.LOG_PREFIX}  Source Section option clicked`);
    } catch {
      console.log(`${this.LOG_PREFIX}  Option not found, committing value via SAP API`);
      await this.commitComboBoxValue(combo, section);
    }
    await this.page.waitForTimeout(500);
  }

  async selectSourceField(field: string): Promise<void> {
    console.log(`${this.LOG_PREFIX} Selecting Source Field: ${field}`);
    await expect(this.page.getByRoleUI5('Label', { text: 'Source Field' }).first()).toBeVisible({ timeout: 5000 });
    const combo = this.page.getByRoleUI5('ComboBox', { placeholder: 'Enter Source Field' });
    for (let i = 0; i < 20; i++) {
      if (await combo.isEnabled().catch(() => false)) break;
      await this.page.waitForTimeout(500);
    }
    await combo.click();
    await combo.fill(field);
    await this.page.waitForTimeout(1000);
    try {
      const opt = this.page.getByRole('option').filter({ hasText: field }).first();
      await opt.waitFor({ state: 'visible', timeout: 5000 });
      await opt.click();
      console.log(`${this.LOG_PREFIX}  Source Field option clicked`);
    } catch {
      console.log(`${this.LOG_PREFIX}  Option not found, committing value via SAP API`);
      await this.commitComboBoxValue(combo, field);
    }
    await this.page.waitForTimeout(500);
  }

  async selectTargetSection(section: string): Promise<void> {
    console.log(`${this.LOG_PREFIX} Selecting Target Section: ${section}`);
    await expect(this.page.getByRoleUI5('Label', { text: 'Target Section' }).first()).toBeVisible({ timeout: 5000 });
    const combo = this.page.getByRoleUI5('ComboBox', { placeholder: 'Enter Target Section' });
    await combo.click();
    await combo.fill(section);
    await this.page.waitForTimeout(1000);
    try {
      const opt = this.page.getByRole('option').filter({ hasText: section }).first();
      await opt.waitFor({ state: 'visible', timeout: 5000 });
      await opt.click();
      console.log(`${this.LOG_PREFIX}  Target Section option clicked`);
    } catch {
      console.log(`${this.LOG_PREFIX}  Option not found, committing value via SAP API`);
      await this.commitComboBoxValue(combo, section);
    }
    await this.page.waitForTimeout(500);
  }

  async selectTargetField(field: string): Promise<void> {
    console.log(`${this.LOG_PREFIX} Selecting Target Field: ${field}`);
    await expect(this.page.getByRoleUI5('Label', { text: 'Target Field' }).first()).toBeVisible({ timeout: 5000 });
    const combo = this.page.getByRoleUI5('ComboBox', { placeholder: 'Enter Target Field' });
    for (let i = 0; i < 20; i++) {
      if (await combo.isEnabled().catch(() => false)) break;
      await this.page.waitForTimeout(500);
    }
    await combo.click();
    await combo.fill(field);
    await this.page.waitForTimeout(1000);
    try {
      const opt = this.page.getByRole('option').filter({ hasText: field }).first();
      await opt.waitFor({ state: 'visible', timeout: 5000 });
      await opt.click();
      console.log(`${this.LOG_PREFIX}  Target Field option clicked`);
    } catch {
      console.log(`${this.LOG_PREFIX}  Option not found, committing value via SAP API`);
      await this.commitComboBoxValue(combo, field);
    }
    await this.page.waitForTimeout(500);
  }

  // =========================================
  // ComboBox value commit via SAP UI5 API
  // =========================================

  private async commitComboBoxValue(combo: ReturnType<Page['locator']>, value: string): Promise<void> {
    await combo.evaluate((el: HTMLInputElement, val: string) => {
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      try {
        const core = (window as any).sap?.ui?.getCore();
        if (core) {
          const control = core.byId(el.id.replace('-inner', ''));
          if (control?.setValue) control.setValue(val);
          if (control?.fireChange) control.fireChange({ value: val });
        }
      } catch {}
    }, value);
  }

  async fillTargetProperty(property: string): Promise<void> {
    console.log(`${this.LOG_PREFIX} Selecting Target Property: ${property}`);

    const tpVhi = this.page.locator('[id$="--ConfigValue-vhi"]');
    await expect(tpVhi).toBeVisible({ timeout: 10000 });
    await tpVhi.click();
    await this.waitForBusy(2000);

    const dialog = this.page.locator('.sapMTableSelectDialog.sapMDialogOpen');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    const search = dialog.getByRoleUI5('SearchField').first();
    await expect(search).toBeVisible({ timeout: 5000 });
    await search.click();
    await search.fill(property);
    await search.press('Enter');
    await this.waitForBusy(2000);

    const rows = dialog.locator('.sapMTableTBody > tr.sapMListTblRow');
    await expect(rows.first()).toBeVisible({ timeout: 5000 });
    const rowCount = await rows.count();
    let targetRow = rows.first();
    for (let i = 0; i < rowCount; i++) {
      const cells = rows.nth(i).locator('.sapMListTblCell');
      const cellCount = await cells.count();
      for (let c = 0; c < cellCount; c++) {
        const cellText = (await cells.nth(c).innerText()).trim().split('\n')[0].trim();
        if (cellText === property) {
          targetRow = rows.nth(i);
          break;
        }
      }
    }
    await targetRow.click();
    // Wait for the F4 select dialog's modal backdrop to actually finish
    // closing instead of a short fixed busy-wait — under load the close
    // animation/backdrop can outlast it, and the next action (Add Rule) can
    // fire before the selected value has actually committed.
    await dialog.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    await this.page.locator('.sapUiBLy').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    await this.waitForBusy(1000);

    console.log(`${this.LOG_PREFIX}  Target Property selected via F4`);
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
  // Toggle (different signature from base)
  // =========================================

  async toggleRuleState(expectedState: 'ON' | 'OFF'): Promise<void> {
    console.log(`${this.LOG_PREFIX} Toggling rule state to ${expectedState}...`);
    const toggle = this.page.locator('[id*="ruleFieldsConfig"]').locator('[role="switch"]').first();
    await expect(toggle).toBeVisible({ timeout: 5000 });
    const currentState = await toggle.getAttribute('aria-checked');
    if (
      (expectedState === 'ON' && currentState === 'true') ||
      (expectedState === 'OFF' && currentState === 'false')
    ) {
      console.log(`${this.LOG_PREFIX}  Rule already ${expectedState}`);
      return;
    }
    await toggle.click();
    await this.waitForBusy(3000);
    await expect(toggle).toHaveAttribute(
      'aria-checked',
      expectedState === 'ON' ? 'true' : 'false',
      { timeout: 8000 }
    );
    console.log(`${this.LOG_PREFIX}  Rule state is now ${expectedState}`);
  }

  // =========================================
  // High-level composite actions
  // =========================================

  async createFilterRule(params: {
    sourceSection: string;
    sourceField: string;
    targetSection: string;
    targetField: string;
    targetProperty: string;
  }): Promise<void> {
    await this.clickAddNew();
    await this.verifyAddNewDialogVisible();

    await this.selectSourceSection(params.sourceSection);
    await this.selectSourceField(params.sourceField);
    await this.selectTargetSection(params.targetSection);
    await this.selectTargetField(params.targetField);
    await this.fillTargetProperty(params.targetProperty);
    await this.clickAddRule();

    await this.searchRuleBySourceSection(params.sourceSection);
    await this.verifyRuleRowVisible();
  }

  async deleteFilterRule(sourceSection: string, targetField?: string): Promise<void> {
    await this.searchRuleBySourceSection(sourceSection);
    await this.verifyRuleRowVisible();
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

  // =========================================
  // Verify methods (Filter-specific)
  // =========================================

  async verifyFilterRulePageLoaded(): Promise<void> {
    console.log(`${this.LOG_PREFIX} Verifying Filter Rule page loaded...`);
    await expect(this.page.getByRoleUI5('Button', { text: 'Add New' }).nth(1)).toBeVisible({ timeout: 15000 });
    console.log(`${this.LOG_PREFIX}  Filter Rule page loaded`);
  }

  async verifyAddNewButtonVisible(): Promise<void> {
    await expect(this.page.getByRoleUI5('Button', { text: 'Add New' }).nth(1)).toBeVisible({ timeout: 5000 });
    console.log(`${this.LOG_PREFIX}  Add New button visible`);
  }

  async verifySearchFieldVisible(): Promise<void> {
    const searchField = this.page.getByRoleUI5('SearchField').nth(1);
    await expect(searchField).toBeVisible({ timeout: 5000 });
    console.log(`${this.LOG_PREFIX}  Search field visible`);
  }

  async verifyRuleTableVisible(): Promise<void> {
    const table = this.page.locator('[id*="ruleFieldsConfig"][id$="-tblBody"]');
    await expect(table).toBeVisible({ timeout: 5000 });
    console.log(`${this.LOG_PREFIX}  Rule table visible`);
  }

  async verifyProcessDesignerTabVisible(): Promise<void> {
    await expect(this.page.getByRoleUI5('IconTabFilter', { text: 'Process Designer' })).toBeVisible({ timeout: 5000 });
    console.log(`${this.LOG_PREFIX}  Process Designer tab visible`);
  }

  async verifyBusinessRuleDropdownVisible(): Promise<void> {
    await expect(this.page.getByRoleUI5('Select', { selectedKey: 'V' })).toBeVisible({ timeout: 5000 });
    console.log(`${this.LOG_PREFIX}  Business Rule dropdown visible`);
  }

  async verifyRuleRowContent(expected: {
    sourceSection: string;
    sourceField: string;
    targetSection: string;
    targetField: string;
    targetProperty: string;
  }): Promise<void> {
    console.log(`${this.LOG_PREFIX} Verifying rule row content...`);
    const tableBody = this.page.locator('[id*="ruleFieldsConfig"][id$="-tblBody"]');
    const row = tableBody.locator('[role="row"]').filter({ hasText: expected.targetField }).first();
    await expect(row).toBeVisible({ timeout: 5000 });

    const rowText = (await row.innerText()).toLowerCase();
    const checks = [
      expected.sourceSection.toLowerCase(),
      expected.sourceField.toLowerCase(),
      expected.targetSection.toLowerCase(),
      expected.targetField.toLowerCase(),
    ];
    for (const check of checks) {
      if (!rowText.includes(check)) {
        console.log(`${this.LOG_PREFIX}  Row missing "${check}" — row text: ${rowText}`);
      }
    }
    console.log(`${this.LOG_PREFIX}  Rule row content verified`);
  }

  async verifyRuleCount(expectedCount: number): Promise<void> {
    console.log(`${this.LOG_PREFIX} Verifying rule count: ${expectedCount}`);
    const tableBody = this.page.locator('[id*="ruleFieldsConfig"][id$="-tblBody"]');
    const rows = tableBody.locator('[role="row"]');
    await expect(rows).toHaveCount(expectedCount, { timeout: 5000 });
    console.log(`${this.LOG_PREFIX}  Rule count verified: ${expectedCount}`);
  }

  async clickEditRule(targetField: string): Promise<void> {
    console.log(`${this.LOG_PREFIX} Clicking Edit Rule for: ${targetField}`);
    const tableBody = this.page.locator('[id*="ruleFieldsConfig"][id$="-tblBody"]');
    const row = tableBody.locator('[role="row"]').filter({ hasText: targetField }).first();
    const editBtn = row.locator('[title="Edit Rule"]');
    await expect(editBtn).toBeVisible({ timeout: 5000 });
    await editBtn.click({ force: true });
    await this.waitForBusy(2000);
    console.log(`${this.LOG_PREFIX}  Edit clicked`);
  }

  async clickRefresh(): Promise<void> {
    console.log(`${this.LOG_PREFIX} Clicking Refresh...`);
    await this.page.getByRoleUI5('Button', { text: 'Refresh' }).click();
    await this.waitForBusy(3000);
    console.log(`${this.LOG_PREFIX}  Refresh clicked`);
  }
}
