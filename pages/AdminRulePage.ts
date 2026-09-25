import { Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { fillUI5Field } from '../helpers/ui';

/**
 * AdminRulePage — Base class cho tất cả Admin Rule pages
 * Extract navigation chung: Admin → Process Designer → Search Template → Click Template → Select Rule Type
 *
 * Subclass chỉ cần implement navigateToRule() và các rule-specific methods
 */
export class AdminRulePage extends BasePage {
  protected BASE_URL = process.env.BASE_URL || '';
  protected LOG_PREFIX = '[AdminRule]';

  constructor(page: Page) {
    super(page);
  }

  // =========================================
  // Navigation chung
  // =========================================

  async navigateToAdmin(): Promise<void> {
    console.log(`${this.LOG_PREFIX} Navigating to admin...`);
    await this.page.goto(`${this.BASE_URL}/admin/index.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    // A flat 2s sleep isn't enough for the admin SPA to bootstrap and render
    // its top nav tabs under load — wait for the busy indicator to clear
    // instead of assuming a fixed duration.
    await this.page
      .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 })
      .catch(() => {});
    await this.page.waitForTimeout(1000);
    console.log(`${this.LOG_PREFIX} Admin page loaded`);
  }

  async navigateToProcessDesigner(): Promise<void> {
    console.log(`${this.LOG_PREFIX} Navigating to Process Designer...`);
    const tab = this.page.getByRoleUI5('IconTabFilter', { text: 'Process Designer' });
    // The nav tab bar can still be rendering after navigateToAdmin() returns —
    // wait explicitly instead of relying on click()'s default 10s actionability
    // timeout, which is too short for a slow admin bootstrap under load.
    await expect(tab).toBeVisible({ timeout: 30000 });
    await tab.click();
    await this.page.waitForTimeout(2000);
    console.log(`${this.LOG_PREFIX} Process Designer tab selected`);
  }

  async searchTemplate(templateName: string): Promise<void> {
    console.log(`${this.LOG_PREFIX} Searching template: "${templateName}"`);
    const searchField = this.page.locator('[id$="searchFieldTemplate-I"]');
    await expect(searchField).toBeVisible({ timeout: 20000 });
    await fillUI5Field(searchField, templateName);
    await this.page.waitForTimeout(1000);

    const searchButton = this.page.locator('[id$="searchFieldTemplate-search"]');
    await expect(searchButton).toBeVisible({ timeout: 5000 });
    await searchButton.click();
    await this.page.waitForTimeout(2000);
    console.log(`${this.LOG_PREFIX} Template search done`);
  }

  async clickTemplateLink(templateName: string): Promise<void> {
    console.log(`${this.LOG_PREFIX} Clicking template link: "${templateName}"`);
    const escaped = templateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const templateLink = this.page
      .getByRoleUI5('Link')
      .filter({ hasText: new RegExp('^' + escaped + '$') });
    await expect(templateLink.first()).toBeVisible({ timeout: 20000 });
    await templateLink.first().click();
    await this.page.waitForTimeout(2000);
    console.log(`${this.LOG_PREFIX} Template opened`);
  }

  /**
   * Navigate đến rule type cụ thể — subclass PHẢI override method này
   * Default implementation: navigate cơ bản + click Template Rules + Business Rule
   */
  async navigateToRule(templateName: string): Promise<void> {
    console.log(`${this.LOG_PREFIX} navigateToRule() — base implementation`);
    await this.navigateToAdmin();
    await this.navigateToProcessDesigner();
    await this.searchTemplate(templateName);
    await this.clickTemplateLink(templateName);

    // Click Template Rules → Business Rule (common for all rule types)
    await this.page.getByRoleUI5('StandardListItem', { title: 'Template Rules' }).click();
    await this.page.waitForTimeout(500);

    await this.page.getByRoleUI5('Select', { selectedKey: 'V' }).click();
    await this.page.waitForTimeout(500);
    await this.page.getByRoleUI5('Item', { text: 'Business Rule' }).first().click();
    await this.page.waitForTimeout(500);

    // Select rule type from sub-type dropdown — use visible filter to avoid hidden arrows
    const visibleArrows = this.page.getByRoleUI5('Icon', { src: 'sap-icon://slim-arrow-down' }).filter({ visible: true });
    await visibleArrows.last().click();
    await this.page.waitForTimeout(500);
  }

  // =========================================
  // CRUD chung
  // =========================================

  async clickAddNew(): Promise<void> {
    console.log(`${this.LOG_PREFIX} Clicking Add New...`);
    await this.page.getByRoleUI5('Button', { text: 'Add New' }).nth(1).click({ force: true });
    await this.waitForBusy(3000);
  }

  async verifyAddNewDialogVisible(): Promise<void> {
    const dialog = this.page.locator('.sapMDialog').filter({ hasText: 'Add new Business Rule' }).last();
    await expect(dialog).toBeVisible({ timeout: 10000 });
    console.log(`${this.LOG_PREFIX} Add New dialog visible`);
  }

  // =========================================
  // Search & Verify (rule table)
  // =========================================

  async searchRuleBySourceSection(section: string): Promise<void> {
    console.log(`${this.LOG_PREFIX} Searching rule by Source Section: ${section}`);
    await this.waitForBusy(5000);
    await this.page.waitForTimeout(1500);
    const searchField = this.page.getByRoleUI5('SearchField').nth(1);
    await searchField.click({ force: true });
    await searchField.fill(section);
    await searchField.press('Enter');
    await this.waitForBusy(3000);
  }

  async verifyRuleRowVisible(): Promise<void> {
    console.log(`${this.LOG_PREFIX} Verifying rule row is visible...`);
    const tableBody = this.page.locator('[id*="ruleFieldsConfig"][id$="-tblBody"]');
    await expect(tableBody).toBeVisible({ timeout: 5000 });
    const rows = tableBody.locator('[role="row"]');
    await expect(rows.first()).toBeVisible({ timeout: 5000 });
    console.log(`${this.LOG_PREFIX} Rule row verified`);
  }

  // =========================================
  // Delete
  // =========================================

  async clickDeleteRule(targetField?: string): Promise<void> {
    console.log(`${this.LOG_PREFIX} Clicking Delete Rule${targetField ? ' for: ' + targetField : ''}`);
    await this.page.locator('.sapUiBLy').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    await this.waitForBusy(2000);
    const tableBody = this.page.locator('[id*="ruleFieldsConfig"][id$="-tblBody"]');
    let row;
    if (targetField) {
      row = tableBody.locator('[role="row"]').filter({ hasText: targetField }).first();
      const rowVisible = await row.isVisible({ timeout: 3000 }).catch(() => false);
      if (!rowVisible) {
        console.log(`${this.LOG_PREFIX} Target row not found, falling back to first row`);
        row = tableBody.locator('[role="row"]').first();
      }
    } else {
      row = tableBody.locator('[role="row"]').first();
    }

    await row.scrollIntoViewIfNeeded().catch(() => {});
    await this.page.waitForTimeout(500);

    const deleteBtn = row.locator('[title="Delete Rule"]');
    if (await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await deleteBtn.click();
      await this.waitForBusy(2000);
      console.log(`${this.LOG_PREFIX} Delete clicked`);
      return;
    }

    const iconBtn = row.getByRoleUI5('Icon', { src: 'sap-icon://delete' });
    if (await iconBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await iconBtn.click({ force: true });
      await this.waitForBusy(2000);
      console.log(`${this.LOG_PREFIX} Delete clicked (icon)`);
      return;
    }

    console.log(`${this.LOG_PREFIX} No delete button found in row`);
  }

  async verifyConfirmationDialog(): Promise<void> {
    console.log(`${this.LOG_PREFIX} Verifying Confirmation dialog...`);
    const alertDialog = this.page.locator('[role="alertdialog"]').last();
    if (await alertDialog.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(alertDialog.getByText(/delete/i)).toBeVisible({ timeout: 5000 });
      console.log(`${this.LOG_PREFIX} Confirmation dialog verified`);
      return;
    }
    const confirmTitle = this.page.getByRoleUI5('Title', { text: 'Confirmation' });
    await expect(confirmTitle).toBeVisible({ timeout: 5000 });
    await expect(this.page.getByText(/delete/i).first()).toBeVisible({ timeout: 5000 });
    console.log(`${this.LOG_PREFIX} Confirmation dialog verified`);
  }

  async confirmDelete(): Promise<void> {
    console.log(`${this.LOG_PREFIX} Confirming delete...`);
    await this.page.getByRoleUI5('Button', { text: 'Ok' }).click();
    await this.waitForBusy(3000);
    await this.page.waitForTimeout(1000);
    console.log(`${this.LOG_PREFIX} Rule deleted`);
  }
}
