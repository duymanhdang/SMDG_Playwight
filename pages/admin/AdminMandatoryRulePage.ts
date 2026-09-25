import { Page, expect } from '@playwright/test';
import { AdminRulePage } from '../AdminRulePage';

export class AdminMandatoryRulePage extends AdminRulePage {
  constructor(page: Page) {
    super(page);
    this.LOG_PREFIX = '[AdminMandatoryRule]';
  }

  // =========================================
  // Navigation: specific to Mandatory Rule
  // =========================================

  async navigateToMandatoryRule(templateName: string): Promise<void> {
    console.log(`${this.LOG_PREFIX}  Navigate to Mandatory Rule...`);
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

    console.log(`${this.LOG_PREFIX} Expand Business Rule sub-type → Mandatory Rule`);
    const visibleArrows = this.page.getByRoleUI5('Icon', { src: 'sap-icon://slim-arrow-down' }).filter({ visible: true });
    await visibleArrows.last().click();
    await this.page.waitForTimeout(500);
    await this.page.getByRoleUI5('StandardListItem', { title: 'Mandatory Rule' }).click();
    await this.page.waitForTimeout(1000);
    console.log(`${this.LOG_PREFIX}  Mandatory Rule page loaded`);
  }

  // =========================================
  // ComboBox helper (shared with Editable)
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

  async checkAcceptedAnyValue(): Promise<void> {
    console.log(`${this.LOG_PREFIX}  Check "Accepted any value"`);
    const checkbox = this.page.getByRoleUI5('CheckBox', { text: 'Accepted any value' }).first();
    await expect(checkbox).toBeVisible({ timeout: 5000 });
    await checkbox.click();
    await this.page.waitForTimeout(500);
  }

  async ensureAcceptedAnyValueUnchecked(): Promise<void> {
    console.log(`${this.LOG_PREFIX}  Ensure "Accepted any value" is UNCHECKED`);
    const result = await this.page.evaluate(() => {
      try {
        const core = (window as any).sap?.ui?.getCore();
        if (!core) return { ok: false, reason: 'sap.ui.getCore() not available' };
        const labels = document.querySelectorAll('.sapMLabel');
        for (const lbl of labels) {
          if (lbl.textContent?.includes('Accepted any value')) {
            const formEl = lbl.closest('.sapUiFormCLElement') as HTMLElement;
            if (!formEl) return { ok: false, reason: 'No form element found' };
            const cbEl = formEl.querySelector('.sapMCb') as HTMLElement;
            if (!cbEl) return { ok: false, reason: 'No .sapMCb found' };
            const cb = core.byId(cbEl.id);
            if (!cb) return { ok: false, reason: `No UI5 control for ${cbEl.id}` };
            const wasSelected = cb.getSelected();
            if (wasSelected) {
              cb.setSelected(false);
              cb.fireSelect?.({ selected: false });
              return { ok: true, action: 'unchecked via API' };
            }
            return { ok: true, action: 'already unchecked' };
          }
        }
        return { ok: false, reason: 'Label "Accepted any value" not found in DOM' };
      } catch (e: any) { return { ok: false, error: e.toString() }; }
    });
    await this.page.waitForTimeout(500);
    console.log(`${this.LOG_PREFIX}  Force uncheck result: ${JSON.stringify(result)}`);
  }

  // =========================================
  // Add Rule
  // =========================================

  async clickAddRule(): Promise<void> {
    console.log(`${this.LOG_PREFIX}  Click Add Rule`);
    const btn = this.page.getByRoleUI5('Button', { text: 'Add Rule' });
    await expect(btn).toBeVisible({ timeout: 5000 });
    await this.page.waitForTimeout(2000);
    await btn.click();
    await this.page.waitForTimeout(1000);

    // Scope to [role="alertdialog"] only — the normal "Add New" form dialog
    // itself has role="dialog" and its own info message strip legitimately
    // contains words like "required", so including [role="dialog"] here
    // false-positives on that dialog and returns early, skipping the
    // busy-wait below even on a successful Add Rule.
    const hasError = await this.page.locator('[role="alertdialog"]').first()
      .isVisible({ timeout: 1000 }).catch(() => false);
    if (hasError) {
      const errText = await this.page.locator('[role="alertdialog"]').first().textContent().catch(() => '');
      console.log(`${this.LOG_PREFIX}  Error dialog: "${errText?.trim()}"`);
      return;
    }

    await this.waitForBusy(3000);
    console.log(`${this.LOG_PREFIX}  Add Rule completed`);
  }

  async closeAlertDialog(): Promise<void> {
    console.log(`${this.LOG_PREFIX}  Close alert dialog`);
    const alertDialog = this.page.locator('[role="alertdialog"], .sapMMessageBox, .sapMDialog[aria-label="Error"]');
    const exists = await alertDialog.first().isVisible({ timeout: 1000 }).catch(() => false);
    if (!exists) { console.log(`${this.LOG_PREFIX} No alert dialog visible`); return; }
    const closeBtn = alertDialog.first().getByRoleUI5('Button', { text: 'Close' });
    const hasClose = await closeBtn.isVisible({ timeout: 1000 }).catch(() => false);
    if (hasClose) { await closeBtn.click(); await this.page.waitForTimeout(800); return; }
    const anyBtn = alertDialog.first().getByRoleUI5('Button').last();
    const hasAny = await anyBtn.isVisible({ timeout: 1000 }).catch(() => false);
    if (hasAny) { await anyBtn.click(); await this.page.waitForTimeout(800); return; }
    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(800);
  }

  async cancelAddNewDialog(): Promise<void> {
    console.log(`${this.LOG_PREFIX}  Cancel Add New dialog`);
    const cancelBtn = this.page.getByRoleUI5('Button', { text: 'Cancel' }).first();
    const hasOverlay = await this.page.locator('#sap-ui-blocklayer-popup').isVisible({ timeout: 500 }).catch(() => false);
    if (hasOverlay) {
      console.log(`${this.LOG_PREFIX}  Blocking overlay detected — closing it first`);
      await this.closeAlertDialog();
    }
    await cancelBtn.click();
    await this.waitForBusy(2000);
    await this.page.waitForTimeout(500);
  }

  // =========================================
  // Toast / Error
  // =========================================

  async verifyToast(expectedMessage: string): Promise<void> {
    console.log(`${this.LOG_PREFIX}  Verify toast: "${expectedMessage}"`);
    await expect(this.page.getByText(expectedMessage).first()).toBeVisible({ timeout: 10000 });
  }

  async verifyErrorDialog(expectedText?: string): Promise<void> {
    console.log(`${this.LOG_PREFIX}  Verify error dialog`);
    let dialog = this.page.locator('[role="alertdialog"]');
    let isVisible = await dialog.isVisible({ timeout: 3000 }).catch(() => false);
    if (!isVisible) {
      dialog = this.page.locator('[role="dialog"]').filter({ hasText: /error|required/i });
      isVisible = await dialog.isVisible({ timeout: 5000 }).catch(() => false);
    }
    expect(isVisible, 'Error dialog not found').toBeTruthy();
    if (expectedText) {
      await expect(dialog.getByText(expectedText).first()).toBeVisible({ timeout: 5000 });
    }
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
  // Toggle / Delete (different signatures from base)
  // =========================================

  async toggleRuleState(index: number = 0): Promise<void> {
    console.log(`${this.LOG_PREFIX}  Toggle rule state (index=${index})`);
    const switches = this.page.locator('[role="switch"]');
    await expect(switches.nth(index)).toBeVisible({ timeout: 5000 });
    await switches.nth(index).click();
    await this.waitForBusy(2000);
  }

  async clickSourceFieldRadio(): Promise<void> {
    console.log(`${this.LOG_PREFIX}  Click Source Field radio`);
    const radio = this.page.getByRoleUI5('RadioButton', { text: 'Source Field' });
    await expect(radio).toBeVisible({ timeout: 5000 });
    await radio.click();
    await this.page.waitForTimeout(300);
  }

  async clickUserAttributeRadio(): Promise<void> {
    console.log(`${this.LOG_PREFIX}  Click User Attribute radio`);
    const radio = this.page.getByRoleUI5('RadioButton', { text: 'User Attribute' });
    await expect(radio).toBeVisible({ timeout: 5000 });
    await radio.click();
    await this.page.waitForTimeout(300);
  }

  async isSourceSectionVisible(): Promise<boolean> {
    return this.page.getByRoleUI5('ComboBox', { placeholder: 'Enter Source Section' })
      .isVisible({ timeout: 1000 }).catch(() => false);
  }

  async isUserAttributeVisible(): Promise<boolean> {
    return this.page.getByRoleUI5('ComboBox', { placeholder: 'Enter User Attribute' })
      .isVisible({ timeout: 1000 }).catch(() => false);
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

  async confirmDelete(): Promise<void> {
    console.log(`${this.LOG_PREFIX}  Confirm Delete`);
    const buttons = [
      this.page.getByRoleUI5('Button', { text: 'Ok' }),
      this.page.getByRoleUI5('Button', { text: 'OK' }),
      this.page.getByRoleUI5('Button', { text: 'Yes' }),
      this.page.getByRoleUI5('Button', { text: 'Confirm' }),
    ];
    for (const btn of buttons) {
      if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await btn.click();
        await this.waitForBusy(3000);
        return;
      }
    }
    console.log(`${this.LOG_PREFIX}  No confirm button found, pressing Enter`);
    await this.page.keyboard.press('Enter');
    await this.waitForBusy(3000);
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

  // =========================================
  // Verify methods
  // =========================================

  async verifyRulePageLoaded(): Promise<void> {
    console.log(`${this.LOG_PREFIX}  Verify Mandatory Rule page loaded`);
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

  async verifyRuleInList(targetField: string): Promise<void> {
    console.log(`${this.LOG_PREFIX}  Verify rule "${targetField}" in list`);
    await expect(this.page.locator('[role="row"]').filter({ hasText: targetField }).first()).toBeVisible({ timeout: 5000 });
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
    console.log(`  ${this.LOG_PREFIX}  Create Mandatory Rule`);
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
    console.log(`  ${this.LOG_PREFIX}  Create Mandatory Rule (User Attribute)`);
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
}
