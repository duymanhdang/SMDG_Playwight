import { Page, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { fillUI5Field, getFieldByLabelText } from '../../helpers/ui';
import { submitCRWithConfirm } from '../../helpers/workflow';

/**
 * NewRequestForm — Base class cho tất cả New Request forms
 * Chứa các fields chung: Description, Priority, Template, Notes
 * Mỗi Object Type extends class này để thêm fields đặc thù
 */
export class NewRequestForm extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  /**
   * Mở New Request dialog và chọn Object Type
   * @param objectType - vd: 'Business Partner', 'Material'
   */
  async openNewRequest(objectType: string): Promise<void> {
    console.log(`[NewRequestForm] Opening New Request — Object Type: ${objectType}`);
    await this.page.getByRoleUI5('Button', { text: 'New Request' }).click();

    // Expand object type list nếu cần
    await this.page.getByRoleUI5('Icon', { src: 'sap-icon://slim-arrow-down' }).first().click();
    await this.page.getByRoleUI5('StandardListItem', { title: objectType }).click();
    await this.page.getByRoleUI5('Button', { text: 'Next' }).click();
    console.log(`[NewRequestForm] Object Type selected: ${objectType}`);
  }

  /**
   * Chọn template bằng tên
   * @param templateName - vd: 'AUTO_BP01'
   */
  async selectTemplate(templateName: string, confirmLabel = 'Business Partner'): Promise<void> {
    console.log(`[NewRequestForm] Selecting template: ${templateName}`);
    const switchTemplatesBtn = this.page.getByRoleUI5('Button', { text: 'Switch templates' });
    await expect(switchTemplatesBtn).toBeEnabled({ timeout: 30000 });
    await switchTemplatesBtn.click();

    // Đợi dialog template search load
    await this.page.waitForTimeout(3000);

    const searchField = this.page.getByRoleUI5('SearchField').first();
    await searchField.waitFor({ state: 'visible', timeout: 15000 });
    await searchField.fill(templateName);
    await searchField.press('Enter');

    // Đợi kết quả search load trước khi click
    await this.page.waitForTimeout(3000);

    // Click row chứa đúng tên template (exact match)
    const targetRow = this.page.getByRoleUI5('ColumnListItem').filter({
      has: this.page.getByText(templateName, { exact: true }),
    });
    await targetRow.first().click();

    // Đợi template load — waitForTimeout ngắn để UI5 render
    await this.page.waitForTimeout(3000);

    // Đợi form load — Label signal (60s timeout for slow rendering)
    await expect(this.page.getByRoleUI5('Label', { text: confirmLabel }).first()).toBeVisible({
      timeout: 60000,
    });
    console.log(`[NewRequestForm] Template selected: ${templateName} — form loaded`);
  }

  /**
   * Fill Description field (bắt buộc)
   */
  async fillDescription(value: string): Promise<void> {
    console.log(`[NewRequestForm] Filling Description: "${value}"`);
    await fillUI5Field(
      this.page.getByRoleUI5('TextArea', { valueStateText: 'Please fill out Description' }),
      value
    );
  }

  /**
   * Chọn Priority (bắt buộc)
   */
  async selectPriority(priority: string): Promise<void> {
    console.log(`[NewRequestForm] Selecting Priority: ${priority}`);
    await this.page
      .getByRoleUI5('Select', {
        valueStateText: 'Please fill out Priority',
      })
      .click();
    await this.page.getByRoleUI5('Item', { text: priority }).click();
  }

  /**
   * Chọn Reason/Template type
   */
  async selectReason(reason: string): Promise<void> {
    console.log(`[NewRequestForm] Selecting Reason: ${reason}`);
    await this.page.locator('[id$="idReasonCombo"]').click();
    await this.page.getByRoleUI5('Item', { text: reason }).click();
  }

  /**
   * Fill Notes/Other reason
   */
  async fillNotes(value: string): Promise<void> {
    console.log(`[NewRequestForm] Filling Notes: "${value}"`);
    const notesField = getFieldByLabelText(this.page, 'Other reason', 'textarea');
    await expect(notesField).toBeVisible({ timeout: 10000 });
    await fillUI5Field(notesField, value);
  }

  /**
   * Submit form
   */
  async submit(comment = 'Requestor has submitted this request !'): Promise<string> {
    console.log('[NewRequestForm] Submitting new request...');

    const newCR = await submitCRWithConfirm(this.page, comment);
    console.log(`[NewRequestForm]  New request submitted: ${newCR}`);
    return newCR;
  }
}
