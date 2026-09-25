import { Page, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { fillUI5Field } from '../../helpers/ui';


export class AdminPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private BASE_URL = process.env.BASE_URL || '';
  private ADMIN_URL = `${this.BASE_URL}/admin/index.html`;

  async gotoProcessDesigner(): Promise<void> {
    console.log('[Admin] Navigating to Process Designer...');
    await this.page.goto(`${this.ADMIN_URL}#/manageAllBusinessTemplates`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.page.waitForTimeout(5000);
  }

  // Search template trong Process Designer list - dùng AUTO_BP01 (có underscore)
  async searchTemplate(templateId: string): Promise<void> {
    console.log(`[Admin] Searching template: ${templateId}`);
    // Không đợi cố định 5s, chỉ đợi element visible
    const searchField = this.page.locator('[id$="searchFieldTemplate-I"]');
    await expect(searchField).toBeVisible({ timeout: 20000 });
    await fillUI5Field(searchField, templateId);
    await this.page.waitForTimeout(1000); // Giảm từ 3000 xuống 1000
    
    const searchButton = this.page.locator('[id$="searchFieldTemplate-search"]');
    await expect(searchButton).toBeVisible({ timeout: 10000 });
    await searchButton.click();
    await this.page.waitForTimeout(3000);
    console.log(`[Admin] Search executed for template: ${templateId}`);
  }

  async openTemplate(templateId: string): Promise<void> {
    console.log(`[Admin] Opening template: ${templateId}`);
    const templateLink = this.page.locator('a').filter({ hasText: templateId }).first();
    await expect(templateLink).toBeVisible({ timeout: 20000 });
    await templateLink.click();
    await this.page.waitForTimeout(5000);
    console.log(`[Admin] Template opened: ${this.page.url()}`);
  }

  async gotoWorkflowSettings(): Promise<void> {
    console.log('[Admin] Navigating to Workflow Settings...');
    await this.page.locator('div').filter({ hasText: 'Workflow Settings' }).last().click();
    await this.page.waitForTimeout(2000);
    console.log('[Admin]  Workflow Settings tab opened');
  }

  async gotoConditionSettings(): Promise<void> {
    console.log('[Admin] Navigating to Condition Settings...');
    await this.page.locator('div').filter({ hasText: 'Condition Settings' }).last().click();
    await this.page.waitForTimeout(2000);
    console.log('[Admin]  Condition Settings tab opened');
  }

  async gotoTemplateSettings(): Promise<void> {
    console.log('[Admin] Navigating to Template Settings...');
    // Wait for page to stabilize after navigating back
    await this.page.waitForLoadState('domcontentloaded');
    await this.page.waitForTimeout(3000);

    // Try multiple strategies to find and click Template Settings tab
    const tabLocators = [
      () => this.page.locator('div').filter({ hasText: 'Template Settings' }).last(),
      () => this.page.locator("//div[contains(text(),'Template Settings')]").last(),
      () => this.page.getByRole('tab', { name: 'Template Settings' }),
      () => this.page.locator("div[id*='masterList'] div[class*='sapMSLITitleOnly']").filter({ hasText: 'Template Settings' }),
    ];

    for (const getLocator of tabLocators) {
      const tab = getLocator();
      const visible = await tab.isVisible({ timeout: 3000 }).catch(() => false);
      if (visible) {
        await tab.click();
        await this.page.waitForTimeout(2000);
        console.log('[Admin]  Template Settings tab opened');
        return;
      }
    }

    throw new Error('[Admin] Could not find Template Settings tab');
  }

  // Search trong Condition Table - dùng conditionId (default: AUTOBP01)
  async searchConditionTable(conditionId: string = 'AUTOBP01'): Promise<void> {
    console.log(`[Admin] Searching condition table: ${conditionId}`);
    // SAP UI5 pattern: id$="idSearch-I" for search field in Condition Table
    const searchField = this.page.locator('[id$="idSearch-I"]');
    if (await searchField.isVisible({ timeout: 5000 }).catch(() => false)) {
      await fillUI5Field(searchField, conditionId);
      await this.page.waitForTimeout(1000);
      await this.page.locator('[id$="idSearch-search"]').click();
    } else {
      // Fallback: use getByRoleUI5
      const searchFieldAlt = this.page.getByRoleUI5('SearchField').nth(1);
      if (await searchFieldAlt.isVisible({ timeout: 5000 }).catch(() => false)) {
        await fillUI5Field(searchFieldAlt, conditionId);
        await this.page.waitForTimeout(1000);
        await this.page.keyboard.press('Enter');
      }
    }
    await this.page.waitForTimeout(3000);
  }

  async clickEditConditionTable(conditionId: string = 'AUTOBP01'): Promise<void> {
    console.log(`[Admin] Clicking Edit Condition Table for: ${conditionId}`);
    // Pattern từ codegen: row với template name → getByLabel('Edit Condition Table')
    const editButton = this.page
      .getByRole('row', { name: new RegExp(`${conditionId}.*`, 'i') })
      .getByLabel('Edit Condition Table')
      .first();
    
    if (await editButton.isVisible({ timeout: 10000 }).catch(() => false)) {
      await editButton.click();
      await this.page.waitForTimeout(2000);
      console.log('[Admin]  Edit Condition Table clicked');
    } else {
      // Fallback: use generic button
      const genericBtn = this.page.getByRoleUI5('Button', { text: 'Edit Condition Table' }).first();
      if (await genericBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await genericBtn.click();
        await this.page.waitForTimeout(2000);
        console.log('[Admin]  Edit Condition Table clicked (fallback)');
      } else {
        console.log('[Admin]  Edit Condition Table button not found');
      }
    }
  }

  async saveTemplate(): Promise<void> {
    console.log('[Admin] Saving template...');
    const saveButton = this.page.getByRoleUI5('Button', { text: 'Save' }).first();
    await expect(saveButton).toBeVisible({ timeout: 10000 });
    await saveButton.click();
    await this.waitForBusy(30000);
    await this.page.waitForTimeout(2000);
    console.log('[Admin]  Template saved');
  }

  async activateTemplate(): Promise<void> {
    console.log('[Admin] Activating template...');
    await this.waitForBusy(60000);

    const locators = [
      () => this.page.getByRoleUI5('Button', { text: 'Activate Template' }),
      () => this.page.getByRole('button', { name: 'Activate Template' }),
      () => this.page.locator('[title="Activate Template"]'),
      () => this.page.locator('button[aria-label="Activate Template"]'),
    ];

    const startTime = Date.now();
    const maxWait = 240000;

    while (Date.now() - startTime < maxWait) {
      for (const getLocator of locators) {
        const btn = getLocator();
        if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
          await btn.click();
          await this.page.waitForTimeout(5000);
          console.log('[Admin]  Template activated');
          return;
        }
      }
      console.log('[Admin] Activate button not yet visible, waiting...');
      await this.page.waitForTimeout(3000);
    }

    throw new Error('[Admin] Could not find Activate Template button');
  }

  async navigateBack(): Promise<void> {
    console.log('[Admin] Navigating back...');
    const backButton = this.page.getByTitle('Navigate Back');
    await expect(backButton).toBeVisible({ timeout: 10000 });
    await backButton.click();
    await this.page.waitForTimeout(2000);
    console.log('[Admin]  Navigated back');
  }
}