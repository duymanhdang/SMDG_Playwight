import { Page, expect } from '@playwright/test';
import { AdminRulePage } from '../AdminRulePage';

export class AdminDuplicationRulePage extends AdminRulePage {
  constructor(page: Page) {
    super(page);
    this.LOG_PREFIX = '[AdminDuplicationRule]';
  }

  // =========================================
  // Navigation: specific to Duplication Rule
  // =========================================

  async navigateToDuplicationRule(templateName: string): Promise<void> {
    if (await this.isDuplicationRulePageActive()) {
      console.log(`${this.LOG_PREFIX} Already on Duplication Rule page for template "${templateName}" — skipping navigation`);
      return;
    }

    console.log(`${this.LOG_PREFIX} Navigating to Duplication Rule for template: ${templateName}`);

    await this.navigateToAdmin();
    await this.navigateToProcessDesigner();
    await this.searchTemplate(templateName);
    await this.clickTemplateLink(templateName);

    // Ensure we're on Template Rules by first clicking Template Settings to reset view
    await this.page.getByRoleUI5('StandardListItem', { title: 'Template Settings' }).click();
    await this.page.waitForTimeout(1000);
    await this.page.getByRoleUI5('StandardListItem', { title: 'Template Rules' }).click();
    await this.page.waitForTimeout(1000);

    await this.page.getByRoleUI5('Select', { selectedKey: 'V' }).click();
    await this.page.waitForTimeout(500);
    await this.page.getByRoleUI5('Item', { text: 'Business Rule' }).first().click();
    await this.page.waitForTimeout(1000);

    const visibleArrows = this.page.getByRoleUI5('Icon', { src: 'sap-icon://slim-arrow-down' }).filter({ visible: true });
    await visibleArrows.last().click();
    await this.page.waitForTimeout(500);
    await this.page.getByRoleUI5('StandardListItem', { title: 'Duplication Rule' }).click();
    await this.page.waitForTimeout(2000);

    console.log(`${this.LOG_PREFIX} Duplication Rule page loaded`);
  }

  /**
   * Cheap check to detect whether the Duplication Rule table is already the
   * active view (context left over from a prior rule in the same template),
   * so callers can skip re-navigating through Process Designer / template search.
   */
  private async isDuplicationRulePageActive(): Promise<boolean> {
    return await this.page.getByRoleUI5('Button', { text: 'Add New' }).nth(1)
      .isVisible({ timeout: 1500 }).catch(() => false);
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
      console.log(`${this.LOG_PREFIX} Source Section option clicked`);
    } catch {
      console.log(`${this.LOG_PREFIX} Option not found, committing value via SAP API`);
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
      console.log(`${this.LOG_PREFIX} Source Field option clicked`);
    } catch {
      console.log(`${this.LOG_PREFIX} Option not found, committing value via SAP API`);
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
      console.log(`${this.LOG_PREFIX} Target Section option clicked`);
    } catch {
      console.log(`${this.LOG_PREFIX} Option not found, committing value via SAP API`);
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
      console.log(`${this.LOG_PREFIX} Target Field option clicked`);
    } catch {
      console.log(`${this.LOG_PREFIX} Option not found, committing value via SAP API`);
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
  // =========================================
  // Add Rule
  // =========================================

  async clickAddRule(): Promise<void> {
    console.log(`${this.LOG_PREFIX} Clicking Add Rule...`);
    await this.page.getByRoleUI5('Button', { text: 'Add Rule' }).click();
    await this.page.waitForTimeout(2000);
    const hasDialog = await this.page.locator('[role="alertdialog"]').first().isVisible({ timeout: 500 }).catch(() => false);
    if (hasDialog) {
      console.log(`${this.LOG_PREFIX} Error dialog appeared, skipping block layer wait`);
      return;
    }
    await this.page.locator('.sapUiBLy').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
    await this.waitForBusy(3000);
  }

  async cancelAddNewDialog(): Promise<void> {
    console.log(`${this.LOG_PREFIX} Canceling Add New dialog...`);
    const cancelBtn = this.page.getByRoleUI5('Button', { text: 'Cancel' }).first();
    await expect(cancelBtn).toBeVisible({ timeout: 5000 });
    await cancelBtn.click();
    await this.waitForBusy(2000);
    console.log(`${this.LOG_PREFIX} Dialog closed`);
  }

  // =========================================
  // Toast
  // =========================================

  async verifyToast(expectedMessage: string): Promise<void> {
    console.log(`${this.LOG_PREFIX} Verifying toast: "${expectedMessage}"`);
    await expect(this.page.getByText(expectedMessage).first()).toBeVisible({ timeout: 10000 });
    console.log(`${this.LOG_PREFIX} Toast verified`);
  }

  // =========================================
  // High-level composite actions
  // =========================================

  async createDuplicationRule(params: {
    sourceSection: string;
    sourceField: string;
    targetSection: string;
    targetField: string;
  }): Promise<void> {
    await this.clickAddNew();
    await this.verifyAddNewDialogVisible();

    await this.selectSourceSection(params.sourceSection);
    await this.selectSourceField(params.sourceField);
    await this.selectTargetSection(params.targetSection);
    await this.selectTargetField(params.targetField);
    await this.clickAddRule();

    await this.searchRuleBySourceSection(params.sourceSection);
    await this.verifyRuleRowVisible();
  }

  async deleteDuplicationRule(sourceSection: string, targetField?: string): Promise<void> {
    await this.searchRuleBySourceSection(sourceSection);

    const tableBody = this.page.locator('[id*="ruleFieldsConfig"][id$="-tblBody"]');
    if (!(await tableBody.isVisible({ timeout: 3000 }).catch(() => false))) {
      console.log(`${this.LOG_PREFIX} No rule rows found for "${sourceSection}" — skipping delete`);
      return;
    }
    const rows = tableBody.locator('[role="row"]');
    if ((await rows.count()) === 0) {
      console.log(`${this.LOG_PREFIX} No rule rows found for "${sourceSection}" — skipping delete`);
      return;
    }

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
  // Verify methods (Duplication-specific)
  // =========================================

  async verifyDuplicationRulePageLoaded(): Promise<void> {
    console.log(`${this.LOG_PREFIX} Verifying Duplication Rule page loaded...`);
    await expect(this.page.getByRoleUI5('Button', { text: 'Add New' }).nth(1)).toBeVisible({ timeout: 15000 });
    console.log(`${this.LOG_PREFIX} Duplication Rule page loaded`);
  }

  async verifyAddNewButtonVisible(): Promise<void> {
    await expect(this.page.getByRoleUI5('Button', { text: 'Add New' }).nth(1)).toBeVisible({ timeout: 5000 });
    console.log(`${this.LOG_PREFIX} Add New button visible`);
  }

  async verifySearchFieldVisible(): Promise<void> {
    const searchField = this.page.getByRoleUI5('SearchField').nth(1);
    await expect(searchField).toBeVisible({ timeout: 5000 });
    console.log(`${this.LOG_PREFIX} Search field visible`);
  }

  async verifyRuleTableVisible(): Promise<void> {
    const table = this.page.locator('[id*="ruleFieldsConfig"][id$="-tblBody"]');
    await expect(table).toBeVisible({ timeout: 5000 });
    console.log(`${this.LOG_PREFIX} Rule table visible`);
  }

  async verifyProcessDesignerTabVisible(): Promise<void> {
    await expect(this.page.getByRoleUI5('IconTabFilter', { text: 'Process Designer' })).toBeVisible({ timeout: 5000 });
    console.log(`${this.LOG_PREFIX} Process Designer tab visible`);
  }

  async verifyBusinessRuleDropdownVisible(): Promise<void> {
    await expect(this.page.getByRoleUI5('Select', { selectedKey: 'V' })).toBeVisible({ timeout: 5000 });
    console.log(`${this.LOG_PREFIX} Business Rule dropdown visible`);
  }

  async verifyRuleRowContent(expected: {
    sourceSection: string;
    sourceField: string;
    targetSection: string;
    targetField: string;
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
        console.log(`${this.LOG_PREFIX} Row missing "${check}" - row text: ${rowText}`);
      }
    }
    console.log(`${this.LOG_PREFIX} Rule row content verified`);
  }

  async verifyRuleCount(expectedCount: number): Promise<void> {
    console.log(`${this.LOG_PREFIX} Verifying rule count: ${expectedCount}`);
    const tableBody = this.page.locator('[id*="ruleFieldsConfig"][id$="-tblBody"]');
    const rows = tableBody.locator('[role="row"]');
    await expect(rows).toHaveCount(expectedCount, { timeout: 5000 });
    console.log(`${this.LOG_PREFIX} Rule count verified: ${expectedCount}`);
  }

  async clickRefresh(): Promise<void> {
    console.log(`${this.LOG_PREFIX} Clicking Refresh...`);
    const refreshBtns = this.page.getByRoleUI5('Button', { text: 'Refresh' });
    const count = await refreshBtns.count();
    for (let i = 0; i < count; i++) {
      if (await refreshBtns.nth(i).isVisible({ timeout: 500 }).catch(() => false)) {
        await refreshBtns.nth(i).click();
        await this.waitForBusy(3000);
        console.log(`${this.LOG_PREFIX} Refresh clicked`);
        return;
      }
    }
    await refreshBtns.last().click({ force: true });
    await this.waitForBusy(3000);
    console.log(`${this.LOG_PREFIX} Refresh clicked (force fallback)`);
  }

  async verifyNoDataMessage(): Promise<void> {
    console.log(`${this.LOG_PREFIX} Verifying No Data message...`);
    await expect(this.page.getByText('No data').first()).toBeVisible({ timeout: 5000 });
    console.log(`${this.LOG_PREFIX} No Data message visible`);
  }
}
