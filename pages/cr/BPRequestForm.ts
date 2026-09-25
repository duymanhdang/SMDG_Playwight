import { Page, expect } from '@playwright/test';
import { NewRequestForm } from './NewRequestForm';
import { fillUI5Field, getFieldByLabel, getFieldByLabelIndex, getFieldByLabelText } from '../../helpers/ui';
import { clickValueHelp, selectFromValueHelp } from '../../helpers/domain';

/**
 * BPRequestForm — Business Partner specific form fields
 *
 * General data fields:
 *   - Org. BP Name 1 (required)
 *   - Search Term1
 *
 * Address fields:
 *   - House Number / Street Name (2 inputs, 1 label)
 *   - Postal Code / City (2 inputs, 1 label)
 *   - Country (F4)
 *   - Region (F4)
 *   - Company Postal Code
 */
export class BPRequestForm extends NewRequestForm {
  constructor(page: Page) {
    super(page);
  }

  // ── General data ────────────────────────────────────────────────────────

  async goToGeneralData(): Promise<void> {
    console.log('[BPRequestForm] Navigating to General data tab...');
    await this.page.getByRoleUI5('IconTabFilter', { text: 'General data' }).first().click();
    // Đợi form load — Org. BP Name 1 là signal
    await expect(this.page.getByRoleUI5('Label', { text: 'Org. BP Name 1' }).first()).toBeVisible({
      timeout: 10000,
    });
    console.log('[BPRequestForm] General data tab loaded');
  }

  async fillBPName(value: string): Promise<void> {
    console.log(`[BPRequestForm] Filling Org. BP Name 1: "${value}"`);
    const field = await getFieldByLabel(this.page, 'Org. BP Name 1');
    await field.fill(value);
  }

  async fillSearchTerm(value: string): Promise<void> {
    console.log(`[BPRequestForm] Filling Search Term1: "${value}"`);
    const field = await getFieldByLabel(this.page, 'Search Term1');
    await field.fill(value);
  }

  // ── Address ─────────────────────────────────────────────────────────────

  async goToAddress(): Promise<void> {
    console.log('[BPRequestForm] Navigating to Address tab...');
    await this.page.getByRoleUI5('IconTabFilter', { text: 'Address' }).click();
    await expect(
      this.page.getByRoleUI5('Label', { text: 'House Number / Street Name' }).first()
    ).toBeVisible({ timeout: 10000 });
    console.log('[BPRequestForm] Address tab loaded');
  }

  async fillHouseNumber(value: string): Promise<void> {
    console.log(`[BPRequestForm] Filling House Number: "${value}"`);
    const field = await getFieldByLabelIndex(this.page, 'House Number / Street Name', 0);
    await field.fill(value);
  }

  async fillStreetName(value: string): Promise<void> {
    console.log(`[BPRequestForm] Filling Street Name: "${value}"`);
    const field = await getFieldByLabelIndex(this.page, 'House Number / Street Name', 1);
    await field.fill(value);
  }

  async fillPostalCode(value: string): Promise<void> {
    console.log(`[BPRequestForm] Filling Postal Code: "${value}"`);
    const field = await getFieldByLabelIndex(this.page, 'Postal Code / City', 0);
    await field.fill(value);
  }

  async fillCity(value: string): Promise<void> {
    console.log(`[BPRequestForm] Filling City: "${value}"`);
    const field = await getFieldByLabelIndex(this.page, 'Postal Code / City', 1);
    await field.fill(value);
  }

  async selectCountry(keyword: string, value: string): Promise<void> {
    console.log(`[BPRequestForm] Selecting Country: "${value}"`);

    await clickValueHelp(this.page, 'Country');
    await selectFromValueHelp(this.page, keyword, value);
  }

  async selectRegion(keyword: string, value: string): Promise<void> {
    console.log(`[BPRequestForm] Selecting Region: "${value}"`);

    await clickValueHelp(this.page, 'Region');
    await selectFromValueHelp(this.page, keyword, value);
  }

  async fillCompanyPostalCode(value: string): Promise<void> {
    console.log(`[BPRequestForm] Filling Company Postal Code: "${value}"`);
    const field = await getFieldByLabel(this.page, 'Company Postal Code');
    await field.fill(value);
  }
  async selectSupplierAccountGroup(keyword: string, value: string): Promise<void> {
    console.log(`[BPRequestForm] Selecting Supplier Account Group: "${value}"`);

    await clickValueHelp(this.page, 'Supplier Account Group');
    await selectFromValueHelp(this.page, keyword, value);
  }

  async selectCustomerAccountGroup(keyword: string, value: string): Promise<void> {
    console.log(`[BPRequestForm] Selecting Customer Account Group: "${value}"`);

    await clickValueHelp(this.page, 'Customer Account Group');
    await selectFromValueHelp(this.page, keyword, value);
  }
  /**
   * Add row vào bảng sap.ui.table.Table trong Address tab
   * Dùng toolbar pattern: [role="toolbar"] filter by span text → click Add button
   * Sau khi click Add → Dialog xuất hiện → fill value → click Add button trong dialog
   *
   * @param tableName - Title của bảng: 'Telephone', 'Mobile Phone', 'Fax Number', 'Email Address'
   * @param value     - Giá trị cần fill vào row mới
   */
  async addContactRow(tableName: string, value: string): Promise<void> {
    console.log(`[BPRequestForm] Adding ${tableName}: "${value}"`);

    // Scope vào toolbar của bảng đúng — pattern từ TC03
    const toolbar = this.page.locator('[role="toolbar"]').filter({
      has: this.page.locator('span').filter({ hasText: new RegExp(`^${tableName}$`) }),
    });
    await expect(toolbar).toBeVisible({ timeout: 10000 });

    // Click Add button (+) trong toolbar của bảng
    await toolbar.locator('button[aria-label="Add"]').first().click();

    // Dialog xuất hiện — fill value vào input đầu tiên
    const dialogInput = this.page.getByRoleUI5('Input', { type: 'Text' }).first();
    await expect(dialogInput).toBeVisible({ timeout: 10000 });
    await fillUI5Field(dialogInput, value);

    // Confirm Add
    await this.page.getByRoleUI5('Button', { text: 'Add' }).click();
    console.log(`[BPRequestForm]  ${tableName} added: "${value}"`);
  }
  /**
   * Add Vendor Company Code row
   * Flow: click + → Dialog → fill Company Code (F4) → Reconciliation Acc (F4)
   *       → Payment Transaction tab → Payment Terms (F4) → Add
   */
  async addVendorCompanyCode(
    companyCodeKeyword: string,
    companyCodeValue: string,
    reconciliationAccKeyword: string,
    reconciliationAccValue: string,
    paymentTermsKeyword: string,
    paymentTermsValue: string
  ): Promise<void> {
    console.log(`[BPRequestForm] Adding Vendor Company Code: "${companyCodeValue}"`);

    // Navigate đến tab Vendor Company Code
    // Tab có thể bị ẩn trong overflow menu khi màn hình không đủ rộng
    // Thử click trực tiếp trước, nếu không visible thì mở overflow menu
    const vendorTab = this.page
      .getByRoleUI5('IconTabFilter', { text: 'Vendor Company Code' })
      .first();

    if (!(await vendorTab.isVisible())) {
      console.log('[BPRequestForm] Vendor Company Code tab hidden — opening overflow menu...');
      // Tìm overflow button (+3, +7... tùy số tab bị ẩn)
      const overflowBtn = this.page
        .getByRoleUI5('IconTabFilter')
        .filter({
          hasText: /^\+\d+$/,
        })
        .first();
      await overflowBtn.click();
    }

    await vendorTab.click();
    await expect(this.page.getByRoleUI5('Label', { text: 'Company Code' }).first()).toBeVisible({
      timeout: 10000,
    });

    // Click Add button — scope vào toolbar của bảng Company Code
    const toolbar = this.page.locator('[role="toolbar"]').filter({
      has: this.page.locator('span').filter({ hasText: /^Company Code$/ }),
    });
    await expect(toolbar).toBeVisible({ timeout: 10000 });
    await toolbar.locator('button[aria-label="Add"]').first().click();

    // Dialog "Company Code" xuất hiện
    console.log('[BPRequestForm] Company Code dialog opened');

    // Fill Company Code (F4) — MultiInput thứ 1 trong dialog
    // Click icon value-help bên cạnh field Company Code
    await this.page.getByRoleUI5('MultiInput', { type: 'Text' }).first().click();

    // F4 dialog xuất hiện — search và select

    await selectFromValueHelp(this.page, companyCodeKeyword, companyCodeValue);
    console.log(`[BPRequestForm] Company Code selected: "${companyCodeValue}"`);

    // Fill Reconciliation Acc (F4) — trong tab Account Management (default)
    await this.page.getByRoleUI5('MultiInput', { type: 'Text' }).nth(1).click();
    await selectFromValueHelp(this.page, reconciliationAccKeyword, reconciliationAccValue);
    console.log(`[BPRequestForm] Reconciliation Acc selected: "${reconciliationAccValue}"`);

    // Navigate đến tab Payment Transaction trong dialog
    await this.page.getByRoleUI5('IconTabFilter', { text: 'Payment Transaction' }).first().click();

    // Fill Payment Terms (F4)
    await this.page.getByRoleUI5('MultiInput', { type: 'Text' }).nth(1).click();
    // Payment Terms dialog — dùng locateUI5 vì Dialog[2] unique khi đang trong dialog
    await this.page.locator('[id$="-searchField"] input').last().fill(paymentTermsKeyword);
    await this.page.locator('[id$="-searchField"] input').last().press('Enter');
    await this.page.locateUI5('//Dialog[2]/Table[1]/ColumnListItem[1]/Text[1]').click();
    console.log(`[BPRequestForm] Payment Terms selected: "${paymentTermsValue}"`);

    // Confirm Add
    await this.page.getByRoleUI5('Button', { text: 'Add' }).click();
    console.log(`[BPRequestForm]  Vendor Company Code added: "${companyCodeValue}"`);
  }
  /**
   * Add Purchasing Data row
   * Flow: click + → Dialog → fill các F4 fields → Partner Functions tab → Add
   */
  async addPurchasingData(
    purchasingOrg: string,
    purchasingGroup: string,
    currency: string,
    currencyValue: string,
    paymentTerms: string,
    incoterms: string,
    incotermsLocation: string,
    partnerBP: string
  ): Promise<void> {
    console.log(`[BPRequestForm] Adding Purchasing Data: Org="${purchasingOrg}"`);

    // Navigate đến tab Purchasing Data
    const purchasingTab = this.page
      .getByRoleUI5('IconTabFilter', { text: 'Purchasing Data' })
      .first();

    if (!(await purchasingTab.isVisible())) {
      console.log('[BPRequestForm] Purchasing Data tab hidden — opening overflow menu...');
      const overflowBtn = this.page
        .getByRoleUI5('IconTabFilter')
        .filter({
          hasText: /^\+\d+$/,
        })
        .first();
      await overflowBtn.click();
    }
    await purchasingTab.click();
    console.log('[BPRequestForm] Purchasing Data tab loaded');

    // Click Add button — scope vào toolbar bảng Purchasing Org
    const toolbar = this.page.locator('[role="toolbar"]').filter({
      has: this.page.locator('span').filter({ hasText: /^Purchasing Org$/ }),
    });
    await expect(toolbar).toBeVisible({ timeout: 10000 });
    await toolbar.locator('button[aria-label="Add"]').first().click();
    console.log('[BPRequestForm] Purchasing Data dialog opened');

    // Fill Purchasing Org (F4)

    await clickValueHelp(this.page, 'Purchasing Org');
    await selectFromValueHelp(this.page, purchasingOrg, purchasingOrg);
    console.log(`[BPRequestForm] Purchasing Org selected: "${purchasingOrg}"`);

    // Fill Purchasing Group (F4)
    await clickValueHelp(this.page, 'Purchasing Group');
    await selectFromValueHelp(this.page, purchasingGroup, purchasingGroup);
    console.log(`[BPRequestForm] Purchasing Group selected: "${purchasingGroup}"`);

    // Fill Currency (F4)
    await clickValueHelp(this.page, 'Currency');
    await selectFromValueHelp(this.page, currency, currencyValue);
    console.log(`[BPRequestForm] Currency selected: "${currencyValue}"`);

    // Fill Payment Terms (F4)
    await clickValueHelp(this.page, 'Payment Terms');
    await selectFromValueHelp(this.page, paymentTerms, paymentTerms);
    console.log(`[BPRequestForm] Payment Terms selected: "${paymentTerms}"`);

    // Fill Incoterms (F4)
    await clickValueHelp(this.page, 'Incoterms');
    await selectFromValueHelp(this.page, incoterms, incoterms);
    console.log(`[BPRequestForm] Incoterms selected: "${incoterms}"`);

    // Fill Incoterms Location 1 (plain Input)

    // Bằng — tìm Input ngay sau label "Incoterms Location 1" trong dialog
    const purchasingDialog = this.page.locator('.sapMDialog').last();
    const incotermsLocField = purchasingDialog.getByRoleUI5('Input', { type: 'Text' }).first();
    await fillUI5Field(incotermsLocField, incotermsLocation);
    console.log(`[BPRequestForm] Incoterms Location 1: "${incotermsLocation}"`);

    // Navigate đến tab Partner Functions trong dialog
    await this.page.getByRoleUI5('IconTabFilter', { text: 'Partner Functions' }).click();
    console.log('[BPRequestForm] Navigated to Partner Functions tab');

    // Đợi bảng load
    await this.page.waitForTimeout(1000);

    // Lấy tất cả >> buttons trong dialog Purchasing Org
    // Scope vào .sapMDialog để tránh match bên ngoài
    const drillDownBtns = this.page
      .locator('.sapMDialog')
      .last()
      .locator('button[aria-label="Drill down"]');

    const rowCount = await drillDownBtns.count();
    console.log(`[BPRequestForm] Partner Function rows found: ${rowCount}`);

    for (let i = 0; i < rowCount; i++) {
      console.log(`[BPRequestForm] Filling Partner Function row ${i + 1}: "${partnerBP}"`);

      // Đợi block layer biến mất
      await this.page
        .waitForSelector('.sapUiBLy', { state: 'hidden', timeout: 1000 })
        .catch(() => {});

      // Click >> button của row
      await drillDownBtns.nth(i).click();

      // Value-help icon trong row dialog
      await this.page.getByRoleUI5('Icon', { src: 'sap-icon://value-help' }).nth(1).click();

      // Search BP
      const dialogSearch = this.page.locator('[id$="-searchField"] input').last();
      await expect(dialogSearch).toBeVisible({ timeout: 10000 });
      await dialogSearch.fill(partnerBP);
      await dialogSearch.press('Enter');

      await this.page.locateUI5('//Dialog[3]/Table[1]/ColumnListItem[1]/Text[1]').click();
      await this.page.getByRoleUI5('Button', { text: 'Update' }).click();
      console.log(`[BPRequestForm]  Partner Function row ${i + 1} filled`);
    }

    // Confirm Add — CHỈ click 1 lần SAU khi fill xong tất cả rows
    await this.page.getByRoleUI5('Button', { text: 'Add' }).click();
    console.log('[BPRequestForm]  Purchasing Data added');
  }

  /**
   * Add Customer Company Code row
   * Flow: click + → Dialog → Company Code (F4) → Reconciliation Account 12 (F4)
   *       → Payment Transaction tab → Payment Terms (F4) → Add
   */
  async addCustomerCompanyCode(
    companyCodeKeyword: string,
    companyCodeValue: string,
    reconciliationAccKeyword: string,
    reconciliationAccValue: string,
    paymentTermsKeyword: string,
    paymentTermsValue: string
  ): Promise<void> {
    console.log(`[BPRequestForm] Adding Customer Company Code: "${companyCodeValue}"`);

    // Navigate đến tab Customer Company Code
    const customerCCTab = this.page
      .getByRoleUI5('IconTabFilter', { text: 'Customer Company Code' })
      .first();

    if (!(await customerCCTab.isVisible())) {
      console.log('[BPRequestForm] Customer Company Code tab hidden — opening overflow menu...');
      const overflowBtn = this.page
        .getByRoleUI5('IconTabFilter')
        .filter({
          hasText: /^\+\d+$/,
        })
        .first();
      await overflowBtn.click();
    }
    await customerCCTab.click();
    console.log('[BPRequestForm] Customer Company Code tab loaded');

    // Click Add button — scope vào toolbar bảng Company Data
    const toolbar = this.page.locator('[role="toolbar"]').filter({
      has: this.page.locator('span').filter({ hasText: /^Company Data$/ }),
    });
    await expect(toolbar).toBeVisible({ timeout: 10000 });
    await toolbar.locator('button[aria-label="Add"]').first().click();
    console.log('[BPRequestForm] Customer Company Code dialog opened');

    // Fill Company Code (F4)

    await this.page.getByRoleUI5('MultiInput', { type: 'Text' }).first().click();
    await selectFromValueHelp(this.page, companyCodeKeyword, companyCodeValue);
    console.log(`[BPRequestForm] Company Code selected: "${companyCodeValue}"`);

    // Fill Reconciliation Account 12 (F4)
    await this.page.getByRoleUI5('MultiInput', { type: 'Text' }).nth(1).click();
    await selectFromValueHelp(this.page, reconciliationAccKeyword, reconciliationAccValue);
    console.log(`[BPRequestForm] Reconciliation Account 12 selected: "${reconciliationAccValue}"`);

    // Navigate đến tab Payment Transaction
    await this.page.getByRoleUI5('IconTabFilter', { text: 'Payment Transaction' }).first().click();

    // Fill Payment Terms (F4)
    await this.page.getByRoleUI5('MultiInput', { type: 'Text' }).nth(1).click();
    await this.page.locator('[id$="-searchField"] input').last().fill(paymentTermsKeyword);
    await this.page.locator('[id$="-searchField"] input').last().press('Enter');
    await this.page.locateUI5('//Dialog[2]/Table[1]/ColumnListItem[1]/Text[1]').click();
    console.log(`[BPRequestForm] Payment Terms selected: "${paymentTermsValue}"`);

    // Confirm Add
    await this.page.getByRoleUI5('Button', { text: 'Add' }).click();
    console.log(`[BPRequestForm]  Customer Company Code added: "${companyCodeValue}"`);
  }

  /**
   * Add Sales Data row
   * Flow: click + → Dialog → Sales tab (Sales Org, Sales District, Customer Group, Currency, Price Group)
   *       → Billing Documents tab (Payment Terms, Acct Assmt Grp Cust) → Add
   */
  async addSalesData(
    salesOrg: string,
    salesDistrict: string,
    customerGroup: string,
    currency: string,
    priceGroup: string,
    paymentTerms: string,
    acctAssmt: string
  ): Promise<void> {
    console.log(`[BPRequestForm] Adding Sales Data: Org="${salesOrg}"`);

    // Navigate đến tab Sales Data
    const salesTab = this.page.getByRoleUI5('IconTabFilter', { text: 'Sales Data' }).first();
    if (!(await salesTab.isVisible())) {
      console.log('[BPRequestForm] Sales Data tab hidden — opening overflow menu...');
      await this.page
        .getByRoleUI5('IconTabFilter')
        .filter({ hasText: /^\+\d+$/ })
        .first()
        .click();
    }
    await salesTab.click();
    console.log('[BPRequestForm] Sales Data tab loaded');

    // Click Add button — scope vào toolbar bảng Sales Area Data
    const toolbar = this.page.locator('[role="toolbar"]').filter({
      has: this.page.locator('span').filter({ hasText: /^Sales Area Data$/ }),
    });
    await expect(toolbar).toBeVisible({ timeout: 10000 });
    await toolbar.locator('button[aria-label="Add"]').first().click();
    console.log('[BPRequestForm] Sales Data dialog opened');

    // ── Tab Sales ────────────────────────────────────────────────────────────
    // Sales Organization (F4)
    await clickValueHelp(this.page, 'Sales Organization');
    await selectFromValueHelp(this.page, salesOrg, salesOrg);
    console.log(`[BPRequestForm] Sales Organization selected: "${salesOrg}"`);

    // Sales District (F4)
    await clickValueHelp(this.page, 'Sales District');
    await selectFromValueHelp(this.page, salesDistrict, salesDistrict);
    console.log(`[BPRequestForm] Sales District selected: "${salesDistrict}"`);

    // Customer Group (F4)
    await clickValueHelp(this.page, 'Customer Group');
    await selectFromValueHelp(this.page, customerGroup, customerGroup);
    console.log(`[BPRequestForm] Customer Group selected: "${customerGroup}"`);

    // Currency (F4)
    await clickValueHelp(this.page, 'Currency');
    await selectFromValueHelp(this.page, currency, currency);
    console.log(`[BPRequestForm] Currency selected: "${currency}"`);

    // Price Group (F4)
    await clickValueHelp(this.page, 'Price Group');
    await selectFromValueHelp(this.page, priceGroup, priceGroup);
    console.log(`[BPRequestForm] Price Group selected: "${priceGroup}"`);

    // ── Tab Billing Documents ────────────────────────────────────────────────
    await this.page.getByRoleUI5('IconTabFilter', { text: 'Billing Documents' }).click();
    console.log('[BPRequestForm] Navigated to Billing Documents tab');

    // Payment Terms (F4)
    await clickValueHelp(this.page, 'Payment Terms');
    await selectFromValueHelp(this.page, paymentTerms, paymentTerms);
    console.log(`[BPRequestForm] Payment Terms selected: "${paymentTerms}"`);

    // Acct Assmt Grp Cust (F4)
    await clickValueHelp(this.page, 'Acct Assmt Grp Cust.');
    await selectFromValueHelp(this.page, acctAssmt, acctAssmt);
    console.log(`[BPRequestForm] Acct Assmt Grp Cust selected: "${acctAssmt}"`);

    // Confirm Add
    await this.page.getByRoleUI5('Button', { text: 'Add' }).click();
    console.log(`[BPRequestForm]  Sales Data added`);
  }

  /**
   * Remove Relationships row
   * Flow: navigate → select first row → click remove button
   */
  async removeRelationship(): Promise<void> {
    console.log('[BPRequestForm] Removing first Relationship row...');

    // Navigate đến tab Relationships
    const relTab = this.page.getByRoleUI5('IconTabFilter', { text: 'Relationships' }).first();
    if (!(await relTab.isVisible())) {
      console.log('[BPRequestForm] Relationships tab hidden — opening overflow menu...');
      await this.page
        .getByRoleUI5('IconTabFilter')
        .filter({ hasText: /^\+\d+$/ })
        .first()
        .click();
    }
    await relTab.click();

    // Đợi bảng load
    await expect(this.page.getByRoleUI5('Label', { text: 'Business Partner' }).first())
      .toBeVisible({ timeout: 10000 })
      .catch(() => {});
    console.log('[BPRequestForm] Relationships tab loaded');

    // Select first row bằng row selector checkbox
    // id pattern: [tableId]-rowsel0
    const firstRowSel = this.page.locator('[id$="-rowsel0"]').last();
    await expect(firstRowSel).toBeVisible({ timeout: 10000 });
    await firstRowSel.click();
    console.log('[BPRequestForm] First row selected');

    // Click Remove button — scope vào toolbar của bảng Relationships
    // Button dùng icon sap-icon://less (minus)
    const toolbar = this.page.locator('[role="toolbar"]').filter({
      has: this.page.locator('span').filter({ hasText: /^Relationships$/ }),
    });

    // Nếu không tìm được toolbar → dùng DOM selector trực tiếp
    const removeBtn = toolbar.locator('button[aria-label="Remove"]').first();
    const removeBtnAlt = this.page.getByRoleUI5('Button', { icon: 'sap-icon://less' }).last();

    if (await removeBtn.isVisible()) {
      await removeBtn.click();
    } else {
      await removeBtnAlt.click();
    }

    console.log('[BPRequestForm]  Relationship row removed');
  }
}
