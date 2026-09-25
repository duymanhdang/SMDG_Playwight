import { Page, expect } from '@playwright/test';
import path from 'path';

export interface MassUploadOptions {
  filePath: string;
  templateName: string;
  objectType?: string;
}

/**
 * MassUploadHelper — Xử lý upload file Excel cho Mass Request
 *
 * ═══════════════════════════════════════════════════════════════
 * FLOW TỔNG QUAN (Mass Upload)
 * ═══════════════════════════════════════════════════════════════
 *   1. Navigate đến My Request > Mass tab
 *   2. Click "Mass Request" > Chọn object type (Product)
 *   3. Search và chọn template (MASS_MM01) qua ObjectIdentifier
 *   4. Click Upload > gắn file vào input[type="file"] bằng setInputFiles()
 *   5. Click Upload (confirm) > chờ success dialog > OK
 *
 * ═══════════════════════════════════════════════════════════════
 * SO SÁNH: Mass vs Single
 * ═══════════════════════════════════════════════════════════════
 *   - Mass: Upload Excel → fill header → Submit (tạo nhiều CR cùng lúc)
 *   - Single: Copy from template → fill form → Submit (tạo 1 CR)
 *   - Mass cần chọn template (MASS_MM01) trước khi upload
 *   - Single không cần upload file, fill trực tiếp vào form fields
 *
 * ═══════════════════════════════════════════════════════════════
 * LƯU Ý KHI CUSTOM CHO DỰ ÁN KHÁC
 * ═══════════════════════════════════════════════════════════════
 *   - templateName: thay đổi theo object type (MASS_MM01, MASS_BP01, ...)
 *   - setInputFiles(): hoạt động trên headless (GitHub Actions)
 *   - KHÔNG dùng fileChooser event (dễ fail trên CI)
 *   - Đường dẫn file Excel phải absolute (dùng path.join + process.cwd())
 *   - File Excel phải được commit vào repo (test-data/...)
 *   - Upload button trong dialog: dùng uploadDialog.getByRoleUI5('Button')
 *     để tránh nhầm với Upload button trên form chính
 *   - Sau upload, Description/Priority/Notes được fill riêng qua
 *     MassRequestPage.fillHeader() — không fill trong helper này
 *
 * ═══════════════════════════════════════════════════════════════
 * NOTES:
 *   - uploadFileViaFileChooser() là fallback (dùng filechooser event)
 *     nhưng không khuyến khích dùng trên CI
 *   - @playwright-sap/test (SAP fork) có setInputFiles() hoạt động tốt
 *   - Cần timeout đủ lớn cho upload dialog (30s cho OK button)
 */
export class MassUploadHelper {
  constructor(private page: Page) {}

  async uploadFile(options: MassUploadOptions): Promise<void> {
    const { filePath, templateName } = options;

    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(process.cwd(), filePath);

    console.log(`[MassUpload] Uploading file: ${absolutePath}`);

    await this.page.getByRoleUI5('IconTabFilter', { text: 'My Request' }).click();
    await this.page.waitForTimeout(1000);
    await this.page.getByRoleUI5('IconTabFilter', { text: 'Mass' }).click();
    await this.page.waitForTimeout(1000);

    console.log('[MassUpload] Navigated to Mass tab');

    await this.page.getByRoleUI5('Button', { text: 'Mass Request' }).click();
    await this.page.waitForTimeout(500);

    await this.page.getByRoleUI5('Icon', { src: 'sap-icon://slim-arrow-down' }).first().click();
    await this.page.waitForTimeout(500);
    const objectType = options.objectType || 'Product';
    await this.page.getByRoleUI5('StandardListItem', { title: objectType }).click();
    await this.page.waitForTimeout(500);

    await this.page.getByRoleUI5('Button', { text: 'Next' }).click();
    await this.page.waitForTimeout(1000);

    console.log(`[MassUpload] Searching for template: ${templateName}`);

    const searchField = this.page.getByRoleUI5('SearchField').first();
    await this.page
      .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 15000 })
      .catch(() => {});
    await searchField.click();
    await searchField.fill(templateName);
    await searchField.press('Enter');
    await this.page
      .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 15000 })
      .catch(() => {});
    await this.page.waitForTimeout(2000);

    await this.page.getByText(templateName).first().waitFor({ state: 'visible', timeout: 15000 });
    await this.page.getByText(templateName).first().click();
    await this.page.waitForTimeout(1000);

    console.log('[MassUpload] Template selected, opening upload dialog');

    await this.page.getByRoleUI5('Button', { text: 'Upload' }).click();
    await this.page.waitForTimeout(1500);

    const fileInput = this.page.locator('input[type="file"]').first();
    await expect(fileInput).toBeVisible({ timeout: 15000 });
    await fileInput.setInputFiles(absolutePath);
    console.log('[MassUpload] File attached to input[type="file"]');

    await this.page.waitForTimeout(2000);

    console.log('[MassUpload] Clicking Upload button in dialog');

    const uploadDialog = this.page.locator('.sapMDialog').last();
    await expect(uploadDialog).toBeVisible({ timeout: 10000 });

    const uploadBtnInDialog = uploadDialog.getByRoleUI5('Button', { text: 'Upload' }).first();
    await expect(uploadBtnInDialog).toBeVisible({ timeout: 10000 });
    await expect(uploadBtnInDialog).toBeEnabled({ timeout: 10000 });
    await uploadBtnInDialog.click();
    console.log('[MassUpload] Upload button clicked');

    await this.page.waitForTimeout(2000);

    console.log('[MassUpload] Waiting for success dialog with OK button');

    const okBtn = this.page.getByRole('button', { name: 'OK' });
    await expect(okBtn).toBeVisible({ timeout: 30000 });
    await okBtn.click();
    console.log('[MassUpload] OK button clicked');

    await this.page.waitForTimeout(2000);

    console.log('[MassUpload] Upload flow completed');
  }

  async uploadFileViaFileChooser(filePath: string): Promise<void> {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(process.cwd(), filePath);

    console.log('[MassUpload] Using filechooser fallback method');

    const [fileChooser] = await Promise.all([
      this.page.waitForEvent('filechooser', { timeout: 15000 }),
      this.page.getByRoleUI5('Button', { text: 'Browse...' }).click(),
    ]);
    await fileChooser.setFiles(absolutePath);
    console.log('[MassUpload] File attached via filechooser');
  }
}
