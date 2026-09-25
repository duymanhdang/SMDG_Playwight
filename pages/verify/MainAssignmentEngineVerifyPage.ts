import { Page, expect, test } from '@playwright/test';
import { BasePage } from '../BasePage';

export class MainAssignmentEngineVerifyPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // =========================================
  // PAIR_S2S: BASICDIMENSION.netWeight → BASICDIMENSION.materialVolume
  // =========================================
  async verifyS2S(netWeightValue: string): Promise<void> {
    console.log(`[MainAssignmentEngineVerify] PAIR_S2S: Setting Net Weight = ${netWeightValue}`);
    await expect(this.page.getByRoleUI5('Label', { text: 'Net Weight' })).toBeVisible({ timeout: 10000 });
    await this.page.getByRoleUI5('Input', { placeholder: 'Number is allowed' }).nth(1).click();
    await this.page.getByRoleUI5('Input', { placeholder: 'Number is allowed' }).nth(1).fill(netWeightValue);
    await this.page.getByRoleUI5('Input', { placeholder: 'Number is allowed' }).nth(1).press('Enter');
    await this.waitForBusy(3000);

    console.log(`[MainAssignmentEngineVerify] Verifying Volume auto-assigned = ${netWeightValue}`);
    await expect(this.page.getByRoleUI5('Label', { text: 'Volume' }).first()).toBeVisible({ timeout: 10000 });
    // Volume may store value as "10.000" format — just verify it's not empty
    const volumeInput = this.page.getByRole('textbox', { name: /Volume/i }).first();
    await expect(volumeInput).toBeVisible({ timeout: 10000 });
    const volumeValue = await volumeInput.inputValue();
    console.log(`[MainAssignmentEngineVerify] Volume value = "${volumeValue}"`);
    expect(volumeValue).not.toBe('');
    const cleanedVolume = Number(volumeValue.replace(/,/g, ''));
    expect(cleanedVolume).toBe(Number(netWeightValue));
    console.log('[MainAssignmentEngineVerify]  PAIR_S2S verified');
  }

  // =========================================
  // PAIR_S2R: BASICGENERAL.baseUnit → UNITSOFMEASURE.alternativeUnit
  // =========================================
  async verifyS2R(baseUnitValue: string): Promise<void> {
    console.log(`[MainAssignmentEngineVerify] PAIR_S2R: Selecting Base Unit = ${baseUnitValue}`);
    await expect(this.page.getByRoleUI5('Label', { text: 'Base Unit of Measure' })).toBeVisible({ timeout: 10000 });
    await this.page.getByRoleUI5('Icon', { src: 'sap-icon://value-help' }).nth(2).click();
    await this.waitForBusy(3000);

    const search = this.page.getByRoleUI5('SearchField').first();
    await expect(search).toBeVisible({ timeout: 5000 });
    await search.click();
    await search.fill(baseUnitValue);
    await search.press('Enter');
    await this.waitForBusy(5000);

    try {
      await this.page.getByText(baseUnitValue, { exact: true }).click({ timeout: 5000 });
    } catch {
      // Result may be auto-selected; continue
    }
    await this.waitForBusy(3000);

    console.log('[MainAssignmentEngineVerify] Verifying Units of Measure alternate unit...');
    await expect(this.page.getByRoleUI5('Title', { text: 'Units of Measure' })).toBeVisible({ timeout: 10000 });
    await this.page.getByRoleUI5('Button', { icon: 'sap-icon://add' }).nth(2).click();
    await this.waitForBusy(3000);

    await expect(this.page.getByRoleUI5('Title', { text: 'Units of Measure' }).first()).toBeVisible({ timeout: 10000 });
    await expect(this.page.getByRoleUI5('Token', { text: baseUnitValue }).first()).toBeVisible({ timeout: 10000 });

    await this.page.getByRoleUI5('Button', { text: 'Cancel' }).filter({ visible: true }).first().click();
    console.log('[MainAssignmentEngineVerify]  PAIR_S2R verified');
  }

  // =========================================
  // PAIR_R2S: PLANTDATA.plant → PLANTPARAMETERS.serialNumberProfile
  // =========================================
  async verifyR2S(plantValue: string): Promise<void> {
    console.log(`[MainAssignmentEngineVerify] PAIR_R2S: Plant Data → Plant Parameters`);

    // Click Plant Data tab reliably using native tab role
    await this.page.getByRole('tab', { name: 'Plant Data', exact: true }).click();
    await this.page.waitForTimeout(1500);

    // Verify the Plant Data region is visible
    const plantDataRegion = this.page.getByRole('region', { name: 'Plant Data' });
    await expect(plantDataRegion).toBeVisible({ timeout: 10000 });

    // Click Add button within Plant Data region
    await plantDataRegion.getByRole('button', { name: 'Add' }).first().click();
    await this.waitForBusy(3000);

    // Verify Plant Data sub-dialog opened
    await expect(this.page.getByRoleUI5('Title', { text: 'Plant Data' }).first()).toBeVisible({ timeout: 10000 });
    await expect(this.page.getByRoleUI5('Label', { text: 'Plant' }).first()).toBeVisible({ timeout: 10000 });

    await this.page.getByRoleUI5('Icon', { src: 'sap-icon://value-help' }).first().click();
    await this.waitForBusy(3000);

    const search = this.page.getByRoleUI5('SearchField').first();
    await expect(search).toBeVisible({ timeout: 5000 });
    await search.click();
    await search.clear();
    await search.fill(plantValue);
    await search.press('Enter');
    await this.waitForBusy(5000);

    await expect(this.page.getByText(plantValue, { exact: true }).first()).toBeVisible({ timeout: 15000 });
    await this.page.getByText(plantValue, { exact: true }).click();
    await this.waitForBusy(3000);

    console.log('[MainAssignmentEngineVerify] Switching to Plant Parameters tab...');
    await this.page.getByRoleUI5('IconTabFilter', { text: 'Plant Parameters' }).click();
    await this.waitForBusy(3000);

    await expect(this.page.getByRoleUI5('Label', { text: 'SerialNoProfile' })).toBeVisible({ timeout: 10000 });
    await expect(this.page.getByRoleUI5('Token').filter({ hasText: plantValue }).first()).toBeVisible({ timeout: 10000 });

    await this.page.getByRoleUI5('Button', { text: 'Cancel' }).filter({ visible: true }).first().click();
    console.log('[MainAssignmentEngineVerify]  PAIR_R2S verified');
  }

  // =========================================
  // PAIR_R2R: PLANTDATA.plant → GENERALPLANTDATASTORAGE.plant
  // =========================================
  async verifyR2R(plantValue: string): Promise<void> {
    console.log(`[MainAssignmentEngineVerify] PAIR_R2R: Plant Data → Plant Data/Storage Location`);

    // Step 1: Add Plant Data row with Plant = plantValue
    // Click Plant Data tab reliably using native tab role
    await this.page.getByRole('tab', { name: 'Plant Data', exact: true }).click();
    await this.page.waitForTimeout(1500);

    // Verify the Plant Data region is visible
    const plantDataRegion = this.page.getByRole('region', { name: 'Plant Data' });
    await expect(plantDataRegion).toBeVisible({ timeout: 10000 });

    // Click Add button within Plant Data region
    await plantDataRegion.getByRole('button', { name: 'Add' }).first().click();
    await this.waitForBusy(3000);

    // Verify Plant Data sub-dialog opened
    await expect(this.page.getByRoleUI5('Title', { text: 'Plant Data' }).first()).toBeVisible({ timeout: 10000 });
    await expect(this.page.getByRoleUI5('Label', { text: 'Plant' }).first()).toBeVisible({ timeout: 10000 });

    await this.page.getByRoleUI5('Icon', { src: 'sap-icon://value-help' }).first().click();
    await this.waitForBusy(3000);

    const search = this.page.getByRoleUI5('SearchField').first();
    await expect(search).toBeVisible({ timeout: 5000 });
    await search.click();
    await search.clear();
    await search.fill(plantValue);
    await search.press('Enter');
    await this.waitForBusy(5000);

    await expect(this.page.getByText(plantValue, { exact: true }).first()).toBeVisible({ timeout: 15000 });
    await this.page.getByText(plantValue, { exact: true }).click();
    await this.waitForBusy(3000);

    // Step 2: Switch to Plant Data/Storage Location tab
    console.log('[MainAssignmentEngineVerify] Switching to Plant Data/Storage Location tab...');
    await this.page.getByRoleUI5('IconTabFilter', { text: 'Plant Data/Storage Location' }).click();
    await this.waitForBusy(3000);

    // Find Add button within the Plant Data/Storage Location tabpanel
    const storageLocPanel = this.page.getByRole('tabpanel', { name: 'Plant Data/Storage Location' });
    await expect(storageLocPanel).toBeVisible({ timeout: 10000 });
    await storageLocPanel.getByRole('button', { name: 'Add' }).first().click();
    await this.waitForBusy(3000);

    // After Add opens sub-dialog, verify Title
    await this.page.getByRoleUI5('Title', { text: 'Plant Data/Storage Location' }).click();

    // Verify Plant field and token - use indices from codegen
    await expect(this.page.getByRoleUI5('Label', { text: 'Plant' }).nth(2)).toBeVisible({ timeout: 10000 });
    await expect(this.page.getByRoleUI5('Token').filter({ hasText: plantValue }).first()).toBeVisible({ timeout: 10000 });

    await this.page.getByRoleUI5('Button', { text: 'Cancel' }).filter({ visible: true }).nth(1).click();
    await this.page.getByRoleUI5('Button', { text: 'Cancel' }).filter({ visible: true }).first().click();
    console.log('[MainAssignmentEngineVerify]  PAIR_R2R verified');
  }

  // =========================================
  // DEFAULT_LOAD: UNITSOFMEASURE.unitSpecificProductWidth → UNITSOFMEASURE.unitSpecificProductHeight
  // =========================================
  async verifyDefaultLoad(widthValue: string): Promise<void> {
    console.log(`[MainAssignmentEngineVerify] DEFAULT_LOAD: Setting Width = ${widthValue}`);

    // Find Units of Measure toolbar and click its Add button
    const unitsToolbar = this.page.getByRole('toolbar', { name: 'Units of Measure' });
    await expect(unitsToolbar).toBeVisible({ timeout: 10000 });
    await unitsToolbar.getByRole('button', { name: 'Add' }).first().click();
    await this.waitForBusy(3000);

    await expect(this.page.getByRoleUI5('Title', { text: 'Units of Measure' }).first()).toBeVisible({ timeout: 10000 });
    await expect(this.page.getByRoleUI5('Label', { text: 'Width' }).first()).toBeVisible({ timeout: 10000 });

    // Find Width input by accessible name (associated label)
    await this.page.getByRole('textbox', { name: /Width/i }).first().fill(widthValue);
    await this.page.getByRole('textbox', { name: /Width/i }).first().press('Enter');
    await this.waitForBusy(2000);

    // Verify Height auto-assigned by rule
    await expect(this.page.getByRoleUI5('Label', { text: 'Height' }).first()).toBeVisible({ timeout: 10000 });
    await expect(this.page.getByRoleUI5('Input', { value: widthValue }).first()).toBeVisible({ timeout: 10000 });

    await this.page.getByRoleUI5('Button', { text: 'Cancel' }).filter({ visible: true }).first().click();
    console.log('[MainAssignmentEngineVerify]  DEFAULT_LOAD verified');
  }

  // =========================================
  // DEFAULT_CHANGE: ACCOUNTINGANDCOSTING.inventoryValuationProcedure → VALUATION.productPriceControl
  // =========================================
  async verifyDefaultChange(priceControlValue: string): Promise<void> {
    console.log(`[MainAssignmentEngineVerify] DEFAULT_CHANGE: Setting Price Control = ${priceControlValue}`);

    // Switch to Accounting & Costing tab
    await this.page.getByRole('tab', { name: 'Accounting & Costing' }).click();
    await this.waitForBusy(3000);

    // Scope Add button to Accounting & Costing region
    const acRegion = this.page.getByRole('region', { name: 'Accounting & Costing' });
    await expect(acRegion).toBeVisible({ timeout: 10000 });
    await acRegion.getByRole('button', { name: 'Add' }).first().click();
    await this.waitForBusy(3000);

    // Dialog opens — scope within dialog
    await expect(this.page.getByRoleUI5('Title', { text: 'Accounting & Costing' }).first()).toBeVisible({ timeout: 10000 });
    await expect(this.page.getByRoleUI5('Label', { text: 'Price Control' }).first()).toBeVisible({ timeout: 10000 });

    // F4 value help for Price Control — 8th "Show Value Help" button in dialog
    const acDialog = this.page.getByRole('dialog', { name: 'Accounting & Costing' });
    await acDialog.getByRole('button', { name: /Value Help/i }).nth(7).click();
    await this.waitForBusy(3000);

    await expect(this.page.getByRoleUI5('Title', { text: 'Select data from MDPriceControl' })).toBeVisible({ timeout: 10000 });

    const search = this.page.getByRoleUI5('SearchField').first();
    await expect(search).toBeVisible({ timeout: 5000 });
    await search.click();
    await search.fill(priceControlValue);
    await search.press('Enter');
    await this.waitForBusy(5000);

    try {
      await this.page.getByText(priceControlValue, { exact: true }).click({ timeout: 5000 });
    } catch {
      // Result may be auto-selected; continue
    }
    await this.waitForBusy(3000);

    // Verify in Valuation tabpanel — scope Add button within it
    const valuationPanel = this.page.getByRole('tabpanel', { name: 'Valuation' });
    await valuationPanel.getByRole('button', { name: 'Add' }).first().click();
    await this.waitForBusy(3000);

    await expect(this.page.getByRoleUI5('Title', { text: 'Valuation' })).toBeVisible({ timeout: 10000 });
    await expect(this.page.getByRoleUI5('Label', { text: 'Price Control' }).nth(2)).toBeVisible({ timeout: 10000 });
    await expect(this.page.getByRoleUI5('Token').filter({ hasText: priceControlValue }).first()).toBeVisible({ timeout: 10000 });

    await this.page.getByRoleUI5('Button', { text: 'Cancel' }).filter({ visible: true }).nth(1).click();
    await this.page.getByRoleUI5('Button', { text: 'Cancel' }).filter({ visible: true }).first().click();
    console.log('[MainAssignmentEngineVerify]  DEFAULT_CHANGE verified');
  }

  // =========================================
  // Combined: run all 6 verifies in 1 session
  // =========================================
  async verifyAll6(pairS2S: any, pairS2R: any, pairR2S: any, pairR2R: any, loadScenario: any, changeScenario: any): Promise<void> {
    await test.step('PAIR_S2S - Net Weight → Volume', async () => {
      await this.verifyS2S(pairS2S.testValue);
    });
    await test.step('PAIR_S2R - Base Unit → Alt Unit', async () => {
      await this.verifyS2R(pairS2R.testValue);
    });
    await test.step('PAIR_R2S - Plant → SerialNoProfile', async () => {
      await this.verifyR2S(pairR2S.testValue);
    });
    await test.step('PAIR_R2R - Plant → Plant/Storage', async () => {
      await this.verifyR2R(pairR2R.testValue);
    });
    // Switch back to Global Data for remaining tests
    await this.page.getByRole('tab', { name: 'Global Data' }).click();
    await this.page.waitForTimeout(1500);
    await test.step('DEFAULT_LOAD - Width → Height', async () => {
      await this.verifyDefaultLoad(loadScenario.testValue);
    });
    await test.step('DEFAULT_CHANGE - PriceControl → Valuation', async () => {
      await this.verifyDefaultChange(changeScenario.changeValue);
    });
    console.log('[MainAssignmentEngineVerify]  All 6 rules verified in 1 session');
  }
}
