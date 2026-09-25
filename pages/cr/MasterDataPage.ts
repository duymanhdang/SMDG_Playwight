import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../BasePage';

/**
 * MasterDataPage — Master Data Search & Copy
 * Xử lý: search BP từ onpremise master data, copy sang CR mới
 */
export class MasterDataPage extends BasePage {
  readonly masterDataTab: Locator;
  readonly businessPartnerType: Locator;
  readonly searchField: Locator;
  readonly searchButton: Locator;
  readonly menuButton: Locator;
  readonly switchTemplatesButton: Locator;

  constructor(page: Page) {
    super(page);
    this.masterDataTab = this.page.getByRoleUI5('IconTabFilter', { text: 'Master Data' });
    this.businessPartnerType = this.page
      .getByRoleUI5('ComboBox', { withText: 'Business Partner' })
      .first();
    this.searchField = this.page.getByRoleUI5('SearchField').first();
    this.searchButton = this.page.getByRoleUI5('Button', { text: 'Search' }).first();
    this.menuButton = this.page.getByRoleUI5('Button', { text: '...' }).first();
    this.switchTemplatesButton = this.page.getByRoleUI5('Button', { text: 'Switch templates' });
  }

  /**
   * Navigate đến Master Data search
   * Click Master Data sidebar menu
   */
  async goto(): Promise<void> {
    await this.page.getByRoleUI5('IconTabFilter', { text: 'Master Data' }).click();
    await expect(this.searchField).toBeVisible({ timeout: 10000 });
  }

  async selectObjectType(objectType: string): Promise<void> {
    console.log(`[MasterDataPage] Selecting Object Type: ${objectType}`);
    await this.businessPartnerType.click();
    await this.page.getByRoleUI5('Item', { text: objectType }).click();
  }

  async searchBP(bpNumber: string): Promise<void> {
    console.log(`[MasterDataPage] Searching BP number: ${bpNumber}`);
    await this.searchField.fill(bpNumber);
    await this.searchButton.click();
    await expect(this.menuButton).toBeVisible({ timeout: 15000 });
  }

  async openCopyMenu(): Promise<void> {
    console.log('[MasterDataPage] Opening Copy menu');
    await this.menuButton.click();
    await expect(this.page.getByRoleUI5('MenuItem', { text: 'Copy' })).toBeVisible();
  }

  async copyFromMasterData(): Promise<void> {
    console.log('[MasterDataPage] Copying from Master Data');
    await this.openCopyMenu();
    await this.page.getByRoleUI5('MenuItem', { text: 'Copy' }).click();
    await expect(
      this.page.getByRoleUI5('Label', { text: 'Business Partner' }).first()
    ).toBeVisible({ timeout: 60000 });
    console.log('[MasterDataPage]  Form loaded after copy');
  }

  async clickSwitchTemplates(): Promise<void> {
    console.log('[MasterDataPage] Clicking Switch templates button');
    await expect(this.switchTemplatesButton).toBeVisible({ timeout: 15000 });
    await expect(this.switchTemplatesButton).toBeEnabled({ timeout: 10000 });
    await this.switchTemplatesButton.click();
    await expect(
      this.page.getByRoleUI5('SearchField').first()
    ).toBeVisible();
  }

  async searchTemplate(templateName: string): Promise<void> {
    console.log(`[MasterDataPage] Searching template: ${templateName}`);
    const searchField = this.page.getByRoleUI5('SearchField').first();
    await searchField.fill(templateName);
  }

  async selectTemplate(templateName: string): Promise<void> {
    console.log(`[MasterDataPage] Selecting template: ${templateName}`);
    await this.page
      .getByRoleUI5('ColumnListItem', { hasText: templateName })
      .click();
    await this.page.waitForTimeout(1000);
  }
}