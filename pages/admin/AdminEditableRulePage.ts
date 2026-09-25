import { Page, expect } from '@playwright/test';
import { AdminRulePage } from '../AdminRulePage';

export class AdminEditableRulePage extends AdminRulePage {
  constructor(page: Page) {
    super(page);
    this.LOG_PREFIX = '[AdminEditableRule]';
  }

  // =========================================
  // Navigation: specific to Editable Rule
  // =========================================

  async navigateToEditableRule(templateName: string): Promise<void> {
    console.log(`${this.LOG_PREFIX} Navigate to Editable Rule...`);
    await this.navigateToAdmin();
    await this.navigateToProcessDesigner();
    await this.searchTemplate(templateName);
    await this.clickTemplateLink(templateName);

    console.log(`${this.LOG_PREFIX} Click Template Rules`);
    await this.page.getByRoleUI5('StandardListItem', { title: 'Template Rules' }).click();
    await this.page.waitForTimeout(500);

    console.log(`${this.LOG_PREFIX} Select Business Rule type`);
    await this.page.getByRoleUI5('Select', { selectedKey: 'V' }).click();
    await this.page.waitForTimeout(500);
    await this.page.getByRoleUI5('Item', { text: 'Business Rule' }).first().click();
    await this.page.waitForTimeout(500);

    console.log(`${this.LOG_PREFIX} Expand Business Rule sub-type → Editable Rule`);
    const visibleArrows = this.page.getByRoleUI5('Icon', { src: 'sap-icon://slim-arrow-down' }).filter({ visible: true });
    await visibleArrows.last().click();
    await this.page.waitForTimeout(500);
    await this.page.getByRoleUI5('StandardListItem', { title: 'Editable Rule' }).click();
    await this.page.waitForTimeout(1000);
    console.log(`${this.LOG_PREFIX}  Editable Rule page loaded`);
  }

  // =========================================
  // ComboBox helper (unique to Editable/Mandatory)
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

  async selectUserAttribute(attributeValue: string): Promise<void> {
    await this.selectComboBox('Enter User Attribute', attributeValue);
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

  async fillSourceValue(value: string): Promise<void> {
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
        console.log(`${this.LOG_PREFIX} Select first F4 row`);
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
      // animation/backdrop can outlast that, leaving it to intercept pointer
      // events on later clicks (e.g. "Add Rule", many steps downstream).
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

  async clickSourceValueF4(): Promise<void> {
    console.log(`${this.LOG_PREFIX}  Click Source Value F4`);
    const f4Icon = this.page.locator('[id$="-ConfigValue-vhi"]');
    await expect(f4Icon).toBeVisible({ timeout: 5000 });
    await f4Icon.click();
    await this.page.waitForTimeout(1000);
  }

  async checkAcceptedAnyValue(): Promise<void> {
    console.log(`${this.LOG_PREFIX}  Check "Accepted any value"`);
    const checkbox = this.page.getByRoleUI5('CheckBox', { text: 'Accepted any value' }).first();
    await expect(checkbox).toBeVisible({ timeout: 5000 });
    await checkbox.click();
    await this.page.waitForTimeout(500);
  }

  // =========================================
  // Add Rule
  // =========================================

  async clickAddRule(): Promise<void> {
    console.log(`${this.LOG_PREFIX}  Click Add Rule`);
    const btn = this.page.getByRoleUI5('Button', { text: 'Add Rule' });
    await expect(btn).toBeVisible({ timeout: 5000 });
    await btn.click();
    await this.page.waitForTimeout(1000);

    const hasError = await this.page.locator('[role="alertdialog"]').first()
      .isVisible({ timeout: 1000 }).catch(() => false);
    if (hasError) {
      const errText = await this.page.locator('[role="alertdialog"]').textContent().catch(() => '');
      console.log(`${this.LOG_PREFIX}  Error dialog: "${errText?.trim()}"`);
      return;
    }

    await this.waitForBusy(3000);
    console.log(`${this.LOG_PREFIX}  Add Rule completed`);
  }

  async cancelAddNewDialog(): Promise<void> {
    console.log(`${this.LOG_PREFIX}  Cancel Add New dialog`);
    await this.page.getByRoleUI5('Button', { text: 'Cancel' }).first().click();
    await this.waitForBusy(2000);
    await this.page.waitForTimeout(500);
  }

  // =========================================
  // Search (different name from base)
  // =========================================

  async searchRule(keyword: string): Promise<void> {
    console.log(`${this.LOG_PREFIX}  Search rule: "${keyword}"`);
    await this.waitForBusy(3000);
    await this.page.waitForTimeout(800);
    const searchField = this.page.getByRoleUI5('SearchField').nth(1);
    await searchField.click({ force: true });
    await searchField.fill(keyword);
    await searchField.press('Enter');
    await this.waitForBusy(2000);
  }

  // =========================================
  // Toast
  // =========================================

  async verifyToast(expectedMessage: string): Promise<void> {
    console.log(`${this.LOG_PREFIX}  Verify toast: "${expectedMessage}"`);
    await expect(this.page.getByText(expectedMessage).first()).toBeVisible({ timeout: 10000 });
  }

  // =========================================
  // Toggle / Delete (different signatures from base)
  // =========================================

  async toggleRuleState(index: number = 0): Promise<void> {
    console.log(`${this.LOG_PREFIX}  Toggle rule state (index=${index})`);
    const switches = this.page.locator('[role="switch"]');
    await expect(switches.nth(index)).toBeVisible({ timeout: 5000 });
    await switches.nth(index).click();
    await this.waitForBusy(2000);
  }

  async clickDeleteRule(index: number = 0): Promise<void> {
    console.log(`${this.LOG_PREFIX}  Click Delete (index=${index})`);
    const deleteBtns = this.page.locator('[title="Delete Rule"], [title="Delete"], [aria-label="Delete"]');
    await expect(deleteBtns.nth(index)).toBeVisible({ timeout: 5000 });
    await deleteBtns.nth(index).click({ force: true });
    await this.waitForBusy(2000);
  }

  async confirmDelete(): Promise<void> {
    console.log(`${this.LOG_PREFIX}  Confirm Delete`);
    await this.page.getByRoleUI5('Button', { text: 'Ok' }).click();
    await this.waitForBusy(3000);
  }

  async cancelDelete(): Promise<void> {
    const cancelBtn = this.page.getByRoleUI5('Button', { text: 'Cancel' }).last();
    if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cancelBtn.click();
    }
  }

  // =========================================
  // Verify methods
  // =========================================

  async verifyRulePageLoaded(): Promise<void> {
    console.log(`${this.LOG_PREFIX}  Verify Editable Rule page loaded`);
    await expect(this.page.getByRoleUI5('Button', { text: 'Add New' }).nth(1)).toBeVisible({ timeout: 15000 });
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

  async verifyRuleInList(targetField: string): Promise<void> {
    console.log(`${this.LOG_PREFIX}  Verify rule "${targetField}" in list`);
    await expect(this.page.locator('[role="row"]').filter({ hasText: targetField }).first()).toBeVisible({ timeout: 5000 });
  }

  async verifyErrorDialog(expectedText?: string): Promise<void> {
    console.log(`${this.LOG_PREFIX}  Verify error dialog`);
    const dialog = this.page.locator('[role="alertdialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    if (expectedText) {
      await expect(dialog.getByText(expectedText).first()).toBeVisible({ timeout: 5000 });
    }
  }

  async isUserAttributeVisible(): Promise<boolean> {
    return this.page.getByRoleUI5('ComboBox', { placeholder: 'Enter User Attribute' })
      .isVisible({ timeout: 1000 }).catch(() => false);
  }

  async isSourceSectionVisible(): Promise<boolean> {
    return this.page.getByRoleUI5('ComboBox', { placeholder: 'Enter Source Section' })
      .isVisible({ timeout: 1000 }).catch(() => false);
  }

  async verifyUserAttributeHidden(): Promise<void> {
    await expect(this.page.getByRoleUI5('ComboBox', { placeholder: 'Enter User Attribute' }))
      .not.toBeVisible({ timeout: 2000 });
  }

  async verifySourceSectionHidden(): Promise<void> {
    await expect(this.page.getByRoleUI5('ComboBox', { placeholder: 'Enter Source Section' }))
      .not.toBeVisible({ timeout: 2000 });
  }

  async dismissErrorDialog(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(500);
  }

  // =========================================
  // High-level composite actions
  // =========================================

  async createRuleBySourceField(
    sourceSection: string,
    sourceField: string,
    targetSection: string,
    targetField: string,
    sourceValue: string,
    acceptedAnyValue?: boolean,
  ): Promise<void> {
    console.log(`\n══════════════════════════════════════`);
    console.log(`  ${this.LOG_PREFIX}  Create Editable Rule`);
    console.log(`  Source: ${sourceSection}.${sourceField}`);
    console.log(`  Target: ${targetSection}.${targetField}`);
    console.log(`  Value:  ${sourceValue} ${acceptedAnyValue ? '(Accepted Any Value)' : ''}`);
    console.log(`══════════════════════════════════════\n`);

    await this.clickAddNew();
    await this.verifyAddNewDialogVisible();
    await this.selectSourceSection(sourceSection);
    await this.selectSourceField(sourceField);
    await this.selectTargetSection(targetSection);
    await this.selectTargetField(targetField);
    if (acceptedAnyValue) {
      await this.checkAcceptedAnyValue();
    } else {
      await this.fillSourceValue(sourceValue);
    }
    await this.clickAddRule();
  }

  async createRuleByUserAttribute(
    attributeType: string,
    targetSection: string,
    targetField: string,
    sourceValue?: string,
    acceptedAnyValue?: boolean,
  ): Promise<void> {
    console.log(`\n══════════════════════════════════════`);
    console.log(`  ${this.LOG_PREFIX}  Create Editable Rule (User Attribute)`);
    console.log(`  Attribute: ${attributeType}`);
    console.log(`  Target: ${targetSection}.${targetField}`);
    console.log(`  Value:  ${sourceValue ?? '-'} ${acceptedAnyValue ? '(Accepted Any Value)' : ''}`);
    console.log(`══════════════════════════════════════\n`);

    await this.clickAddNew();
    await this.verifyAddNewDialogVisible();
    await this.selectUserAttribute(attributeType);
    await this.selectTargetSection(targetSection);
    await this.selectTargetField(targetField);
    if (acceptedAnyValue) {
      await this.checkAcceptedAnyValue();
    } else if (sourceValue) {
      await this.fillSourceValue(sourceValue);
    }
    await this.clickAddRule();
  }

  async deleteRule(targetField: string): Promise<void> {
    console.log(`${this.LOG_PREFIX}  Delete rule for target "${targetField}"`);
    const row = this.page.locator('[role="row"]').filter({ hasText: targetField }).first();
    await expect(row).toBeVisible({ timeout: 5000 });
    const deleteBtn = row.locator('[title="Delete Rule"], [title="Delete"], [aria-label="Delete"]');
    await deleteBtn.click({ force: true });
    await this.waitForBusy(2000);
    await this.confirmDelete();
  }

  async safeDeleteRule(targetField: string): Promise<void> {
    try {
      const row = this.page.locator('[role="row"]').filter({ hasText: targetField });
      if (await row.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        await this.deleteRule(targetField);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`${this.LOG_PREFIX}  Safe delete skipped: ${msg}`);
    }
  }
}
