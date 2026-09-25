import { Page, expect } from '@playwright/test';
import { NewRequestForm } from './NewRequestForm';
import { fillUI5Field, getFieldByLabel, getFieldByLabelText } from '../../helpers/ui';

/** System-enforced max length for the Language Description field */
const LANGUAGE_DESCRIPTION_MAX_LENGTH = 40;

/** System-enforced max length for the Old Material Number field */
const OLD_MATERIAL_NUMBER_MAX_LENGTH = 18;

/**
 * ProductRequestForm — Product (MM01) specific form fields
 * Extends NewRequestForm to inherit: openNewRequest, selectTemplate, fillDescription,
 * selectPriority, selectReason, fillNotes, submit
 */
export class ProductRequestForm extends NewRequestForm {
  constructor(page: Page) {
    super(page);
  }

  /**
   * Copy Language Description row → tạo duplicate → khiến submit FAILED.
   *
   * Flow:
   *   1. Click checkbox row 0 để chọn dòng Language Description gốc.
   *   2. Click button Copy (icon: copy).
   */
  async copyLanguageDescription(): Promise<void> {
    console.log('[ProductRequestForm] Copying Language Description (duplicate)...');

    const descTable = this.page.locator('.sapUiTable').filter({ has: this.page.locator('.sapMTitle').filter({ hasText: 'Description' }) });
    await descTable.locator('.sapUiTableRowSelectionCell').first().click();
    console.log('[ProductRequestForm] Clicked row 0 checkbox');

    await this.page.getByRoleUI5('Button', { icon: 'sap-icon://copy' }).first().click();
    console.log('[ProductRequestForm] Clicked Copy button');

    await this.page.waitForTimeout(1000);
  }

  _getDescriptionTable() {
    return this.page.locator('.sapUiTable').filter({ has: this.page.locator('.sapMTitle').filter({ hasText: 'Description' }) });
  }

  async updateLanguageDescriptionByRow(rowIndex: number, value: string): Promise<void> {
    if (value.length > LANGUAGE_DESCRIPTION_MAX_LENGTH) {
      console.warn(
        `[ProductRequestForm] Language Description (row ${rowIndex}) exceeds ${LANGUAGE_DESCRIPTION_MAX_LENGTH} chars (${value.length}) — truncating: "${value}"`
      );
      value = value.slice(0, LANGUAGE_DESCRIPTION_MAX_LENGTH);
    }
    console.log(`[ProductRequestForm] Updating Language Description (row ${rowIndex}): "${value}"`);
    const table = this._getDescriptionTable();
    const editBtns = table.getByRoleUI5('Button', { icon: 'sap-icon://open-command-field' });
    const editBtn = editBtns.nth(rowIndex);
    await expect(editBtn).toBeVisible({ timeout: 10000 });
    await editBtn.click();

    await this.page.waitForTimeout(1500);

    const dialogInput = this.page.locator('.sapMDialog').last().getByRoleUI5('Input').first();
    await expect(dialogInput).toBeVisible({ timeout: 10000 });
    await fillUI5Field(dialogInput, value);

    await this.page.waitForTimeout(500);

    await this.page.getByRoleUI5('Button', { text: 'Update' }).first().click();
    await this.page.waitForTimeout(800);
    console.log(`[ProductRequestForm] Updated Language Description (row ${rowIndex}): "${value}"`);
  }

  async updateLanguageDescription(value: string): Promise<void> {
    console.log(`[ProductRequestForm] Updating Language Description (row 0): "${value}"`);
    await this.updateLanguageDescriptionByRow(0, value);
    console.log(`[ProductRequestForm] Updated Language Description (row 0): "${value}"`);
  }

  async updateAllLanguageDescriptions(value: string): Promise<void> {
    if (value.length > LANGUAGE_DESCRIPTION_MAX_LENGTH) {
      console.warn(
        `[ProductRequestForm] Language Description exceeds ${LANGUAGE_DESCRIPTION_MAX_LENGTH} chars (${value.length}) — truncating: "${value}"`
      );
      value = value.slice(0, LANGUAGE_DESCRIPTION_MAX_LENGTH);
    }
    console.log(`[ProductRequestForm] Updating ALL Language Descriptions: "${value}"`);
    const table = this._getDescriptionTable();
    const drillBtns = table.locator('button[aria-label="Drill down"]');
    const count = await drillBtns.count();
    for (let i = 0; i < count; i++) {
      await this.page.waitForTimeout(500);
      await drillBtns.nth(i).click();

      await this.page.waitForTimeout(2000);

      const dialogInput = this.page.locator('.sapMDialog:visible').first().getByRoleUI5('Input').first();
      await expect(dialogInput).toBeVisible({ timeout: 10000 });
      await fillUI5Field(dialogInput, value);

      await this.page.waitForTimeout(500);

      await this.page.getByRoleUI5('Button', { text: 'Update' }).first().click();

      await this.page.waitForTimeout(1000);
    }
    console.log(`[ProductRequestForm] Updated all ${count} Language Descriptions`);
  }

  /**
   * Update Old_Material_Number by label locator.
   */
  async updateOldMaterialNumber(value: string): Promise<void> {
    if (value.length > OLD_MATERIAL_NUMBER_MAX_LENGTH) {
      // Keep the tail (where generateUniqueMMTimestamp's random suffix lives) rather
      // than the head, so truncation doesn't collapse uniqueness across parallel runs.
      const truncated = value.slice(-OLD_MATERIAL_NUMBER_MAX_LENGTH);
      console.warn(
        `[ProductRequestForm] Old_Material_Number exceeds ${OLD_MATERIAL_NUMBER_MAX_LENGTH} chars (${value.length}) — truncating: "${value}" -> "${truncated}"`
      );
      value = truncated;
    }
    console.log(`[ProductRequestForm] Updating Old_Material_Number: "${value}"`);

    const fieldByFor = this.page.getByRoleUI5('Label', { text: 'Old Material Number' }).and(this.page.locator('label[for]')).first();
    const hasForAttr = await fieldByFor.getAttribute('for').catch(() => null);

    if (hasForAttr) {
      const field = this.page.locator(`[id="${hasForAttr}"]`);
      await field.waitFor({ state: 'visible', timeout: 5000 });
      await field.click();
      await field.press('ControlOrMeta+a');
      await field.fill(value);
      console.log(`[ProductRequestForm] Filled Old_Material_Number via label[for]: "${value}"`);
    } else {
      const field = getFieldByLabelText(this.page, 'Old Material Number', 'input');
      const isVisible = await field.isVisible({ timeout: 5000 }).catch(() => false);

      if (isVisible) {
        await fillUI5Field(field, value);
        console.log(`[ProductRequestForm] Filled Old_Material_Number via label text: "${value}"`);
      } else {
        throw new Error(
          `[ProductRequestForm] Could not locate Old_Material_Number field for value: "${value}"`
        );
      }
    }

    await this.page.waitForTimeout(500);
  }

  /**
   * Update Basic Text / Language textarea using label locator.
   */
  async updateBasicTextLanguage(value: string): Promise<void> {
    console.log(`[ProductRequestForm] Updating Basic Text / Language: "${value}"`);

    const field = await getFieldByLabel(this.page, 'Basic Text / Language').catch(() => null);
    if (field) {
      await fillUI5Field(field, value);
    } else {
      const fallback = getFieldByLabelText(this.page, 'Language', 'textarea');
      await expect(fallback).toBeVisible({ timeout: 10000 });
      await fillUI5Field(fallback, value);
    }
    console.log(`[ProductRequestForm] Filled Basic Text / Language: "${value}"`);

    await this.page.waitForTimeout(500);
  }
}
