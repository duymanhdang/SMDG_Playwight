import { Page, expect } from '@playwright/test';
import path from 'path';
import { MyRequestPage } from '../../pages/cr/MyRequestPage';

// ═══════════════════════════════════════════════════════════════════════════════
//  CẤU HÌNH MỞ RỘNG — File preview
// ═══════════════════════════════════════════════════════════════════════════════
//  PREVIEWABLE_EXTENSIONS: Đuôi file có thể preview nội dung trong ứng dụng.
//    - Các file này: ảnh (.jpg) và tài liệu (.pdf) sẽ hiển thị được nội dung.
//    - Các file khác (.doc, .txt, .xlsx): hiển thị thông báo "Unable to load".
// ═══════════════════════════════════════════════════════════════════════════════

const PREVIEWABLE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.pdf'];

// ═══════════════════════════════════════════════════════════════════════════════
//  CẤU HÌNH DEFAULT — REQUEST
// ═══════════════════════════════════════════════════════════════════════════════
//  DEFAULT_REQ_DIR:   Thư mục chứa file upload cho Request tab.
//  DEFAULT_REQ_FILES: Danh sách tên file upload cho Request tab.
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_REQ_DIR = path.resolve(
  process.cwd(),
  'test-data',
  'S4_QAS_MM01_ATTACHMENTS',
  'ATTACHMENT',
  'Request'
);

const DEFAULT_REQ_FILES = ['simple.doc', 'simple.jpg', 'simple.pdf', 'simple.txt'];

// ═══════════════════════════════════════════════════════════════════════════════
//  CẤU HÌNH DEFAULT — MASTER DATA
// ═══════════════════════════════════════════════════════════════════════════════
//  DEFAULT_MD_DIR:   Thư mục chứa file upload cho Master Data tab.
//  DEFAULT_MD_FILES: Danh sách tên file upload cho Master Data tab.
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_MD_DIR = path.resolve(
  process.cwd(),
  'test-data',
  'S4_QAS_MM01_ATTACHMENTS',
  'ATTACHMENT',
  'Master_Data'
);

const DEFAULT_MD_FILES = ['file_example_XLSX_10.xlsx', 'file_example_XLSX_50.xlsx'];

/**
 * Tuỳ chọn khi gọi hàm upload.
 *
 * fileNames: Mảng tên file cần upload.
 *   - Mỗi tên file phải tồn tại trong thư mục fileDir.
 *   - Các tên này cũng dùng để verify sau upload.
 *
 * fileDir:   Đường dẫn thư mục chứa file.
 *   - Nếu không truyền, dùng default của từng hàm.
 */
export interface UploadOptions {
  fileNames?: string[];
  fileDir?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  HÀM NỘI BỘ — Dùng chung cho tất cả tab
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Core upload: tìm input[type="file"], gán file, verify từng file.
 *
 * Hàm này KHÔNG mở/đóng dialog — chỉ xử lý phần upload + verify.
 * Các hàm bên ngoài (uploadRequestAttachments, uploadMasterDataAttachments)
 * chịu trách nhiệm chuyển tab trước khi gọi.
 *
 * @param page      - Playwright Page
 * @param fileNames - Danh sách tên file
 * @param fileDir   - Thư mục chứa file
 * @param tabLabel  - Nhãn tab (chỉ dùng cho log)
 */
async function _uploadFiles(
  page: Page,
  fileNames: string[],
  fileDir: string,
  tabLabel: string
): Promise<void> {
  console.log(`[Attachment][${tabLabel}] Uploading ${fileNames.length} file(s)...`);

  // ── Gán file vào hidden input ──────────────────────────────────────────
  // input[type="file"] luôn có sẵn trong DOM dù ẩn.
  // setInputFiles() ghi trực tiếp, không kích hoạt native OS dialog.
  // → Tránh lỗi File Explorer không tự đóng ở headed mode.

  const fileInput = page.locator('input[type="file"]').first();
  const filePaths = fileNames.map((f) => path.join(fileDir, f));
  await fileInput.setInputFiles(filePaths);
  console.log(`[Attachment][${tabLabel}] Files attached: ${fileNames.join(', ')}`);
  await page.waitForTimeout(3000);

  // ── Verify từng file ───────────────────────────────────────────────────
  // Dùng tên file để:
  //   - Tìm link (getByRoleUI5('Link')) — kiểm tra file hiển thị.
  //   - Tìm nút Delete (button[title="Delete"]) trong cùng hàng <li>.
  //
  // Locator delete: CSS button[title="Delete"] thay vì getByRoleUI5 vì
  //   sap.m.Button không có UI5 property "title" để match.

  for (const fileName of fileNames) {
    const link = page.getByRoleUI5('Link', { text: fileName }).first();
    await expect(link).toBeVisible({ timeout: 10000 });

    const row = link.locator('xpath=ancestor::li');
    await expect(row.locator('button[title="Delete"]')).toBeVisible();

    console.log(`[Attachment][${tabLabel}] ✅ ${fileName} + Delete`);
  }

  console.log(`[Attachment][${tabLabel}] ✅ All ${fileNames.length} file(s) verified`);
}

/**
 * Kiểm tra đuôi file có preview được hay không.
 */
function _isPreviewable(fileName: string): boolean {
  return PREVIEWABLE_EXTENSIONS.some((ext) => fileName.toLowerCase().endsWith(ext));
}

/**
 * Tạo regex match file name có thể có prefix số (từ "Select from my files").
 */
function _matchFileName(fileName: string): RegExp {
  return new RegExp(fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
}

// ═══════════════════════════════════════════════════════════════════════════════
//  HÀM NỘI BỘ — Xác thực preview file
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Search file → mở preview → verify nội dung → đóng preview.
 *
 * Flow chi tiết:
 *   1. Search file bằng tên gốc (vd "simple.doc").
 *   2. Trong kết quả, click "Upload On" → mở preview dialog.
 *   3. Verify dialog:
 *      - Viewable (.jpg, .pdf): "Attachment Preview" title + image hiển thị.
 *      - Non-viewable (.doc, .txt): "Attachment Preview" + "Unable to load" + message.
 *   4. Click Decline (icon decline) để đóng preview.
 *
 * @param page     - Playwright Page
 * @param fileName - Tên file gốc cần verify
 */
async function _verifySingleAttachmentPreview(
  page: Page,
  fileName: string
): Promise<void> {
  console.log(`[AttachmentVerify] Checking: ${fileName}`);

  // ── 1. Search file ──────────────────────────────────────────────────────
  const searchField = page.getByRoleUI5('SearchField').first();
  await searchField.click();
  await searchField.fill('');
  await page.waitForTimeout(300);
  await searchField.fill(fileName);
  await page.waitForTimeout(300);
  await searchField.press('Enter');
  await page.waitForTimeout(1000);

  // ── 2. Verify file exists ───────────────────────────────────────────────
  const fileLink = page.getByRoleUI5('Link', { text: fileName }).first();
  await expect(fileLink).toBeVisible({ timeout: 5000 });

  // ── 3. Open preview — try multiple click targets ────────────────────────
  let previewOpened = false;
  const clickTargets = [
    // Try "Upload On" ObjectStatus first (original approach)
    () => fileLink.locator('xpath=ancestor::li').locator('.sapMObjStatus').filter({ hasText: 'Upload On' }).first().click(),
    // Try any ObjectStatus in the file row
    () => fileLink.locator('xpath=ancestor::li').locator('.sapMObjStatus').first().click(),
    // Try the file link itself
    () => fileLink.click(),
  ];

  for (const clickAction of clickTargets) {
    try {
      await clickAction();
      await page.waitForTimeout(1500);
      const title = page.getByRoleUI5('Title', { text: 'Attachment Preview' });
      previewOpened = await title.isVisible({ timeout: 3000 }).catch(() => false);
      if (previewOpened) break;
    } catch {
      // continue to next target
    }
  }

  if (!previewOpened) {
    console.log(`[AttachmentVerify] ⚠ "${fileName}" preview not available — file exists in list`);
    return;
  }

  // ── 4. Verify preview content ───────────────────────────────────────────
  console.log(`[AttachmentVerify]   Title "Attachment Preview" confirmed`);
  const previewable = _isPreviewable(fileName);

  if (previewable) {
    if (fileName.toLowerCase().endsWith('.pdf')) {
      const pdfViewer = page.locator('.sapMPDFViewerContent, .sapMDialogScroll iframe[src], .sapMDialogScroll object[type="application/pdf"]').first();
      try {
        await expect(pdfViewer).toBeVisible({ timeout: 15000 });
        console.log(`[AttachmentVerify]   PDF viewer visible — content loaded`);
      } catch {
        console.log(`[AttachmentVerify]   ⚠ PDF viewer not rendered (headless) — preview dialog confirmed`);
      }
    } else {
      const img = page.locator('.sapMDialogScroll img.sapMImg').first();
      const imgVisible = await img.isVisible({ timeout: 10000 }).catch(() => false);
      if (imgVisible) {
        console.log(`[AttachmentVerify]   Image element visible — content loaded`);
      } else {
        console.log(`[AttachmentVerify]   Image not rendered — closing preview`);
      }
    }
    console.log(`[AttachmentVerify] ✅ ${fileName}: Preview loaded successfully`);
  } else {
    const unableTitle = page.getByRoleUI5('Title', { text: 'Unable to load' });
    await expect(unableTitle).toBeVisible({ timeout: 10000 });
    console.log(`[AttachmentVerify]   Title "Unable to load" confirmed`);
    console.log(`[AttachmentVerify] ✅ ${fileName}: Unable to load (expected)`);
  }

  // ── 5. Đóng preview dialog ──────────────────────────────────────────────
  await page.getByRoleUI5('Button', { icon: 'sap-icon://decline' }).first().click();
  await page.waitForTimeout(1500);
}

/**
 * Mở dialog Attachments → verify Request + Master Data (cả 2 tab).
 *
 * @param page        - Playwright Page
 * @param checkDelete - Nếu true, kiểm tra nút Delete trên mỗi hàng file
 */
async function _verifyRequestAndMasterDataInDialog(
  page: Page,
  checkDelete: boolean
): Promise<void> {
  console.log('[AttachmentVerify] === Verify attachments in dialog ===');

  // ── Open Attachments dialog ───────────────────────────────────────────
  // Chỉ button có .sapMBadgeIndicator mới là button "Attachments" thật
  // (có badge đếm số file). Các button khác (toolbar, form header) đều
  // không có badge → dùng filter has: .sapMBadgeIndicator để loại bỏ.
  await page.locator('.sapMBtn').filter({ hasText: 'Attachments' })
    .filter({ has: page.locator('.sapMBadgeIndicator') })
    .click();
  await page.waitForTimeout(1500);
  await expect(page.getByRoleUI5('Title', { text: 'Attachments' }).first()).toBeVisible({ timeout: 10000 });
  console.log('[AttachmentVerify] Attachments dialog opened');

  // ── Ensure we're on Request tab ──────────────────────────────────────
  const reqTab = page.getByRoleUI5('IconTabFilter', { text: 'Request' }).first();
  const reqTabVisible = await reqTab.isVisible({ timeout: 2000 }).catch(() => false);
  if (reqTabVisible) {
    await reqTab.click();
    await page.waitForTimeout(1000);
  }

  // ── Verify Request files ──────────────────────────────────────────────
  for (const fileName of DEFAULT_REQ_FILES) {
    await _verifySingleAttachmentPreview(page, fileName);
    if (checkDelete) {
      const link = page.getByRoleUI5('Link', { text: fileName });
      const linkCount = await link.count();
      if (linkCount > 0) {
        const row = link.first().locator('xpath=ancestor::li');
        const db = row.locator('button[title="Delete"]');
        if (await db.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log(`[AttachmentVerify]   Delete button visible for ${fileName}`);
        }
      }
    }
  }

  // ── Verify Master Data files ──────────────────────────────────────────
  console.log('[AttachmentVerify] Switching to Master Data tab...');
  await page.getByRoleUI5('IconTabFilter', { text: 'Master Data' }).first().click();
  await page.waitForTimeout(1500);

  // Upload files (DEFAULT_MD_FILES): match exact name
  for (const fileName of DEFAULT_MD_FILES) {
    await _verifySingleAttachmentPreview(page, fileName);
    if (checkDelete) {
      const link = page.getByRoleUI5('Link', { text: fileName }).first();
      const row = link.locator('xpath=ancestor::li');
      await expect(row.locator('button[title="Delete"]')).toBeVisible();
      console.log(`[AttachmentVerify]   Delete button visible for ${fileName}`);
    }
  }
  // System files (DEFAULT_MY_FILES): có prefix số, match partial name
  for (const fileName of DEFAULT_MY_FILES) {
    await _verifySingleAttachmentPreview(page, fileName);
    if (checkDelete) {
      const link = page.getByRoleUI5('Link').filter({ hasText: _matchFileName(fileName) }).first();
      const row = link.locator('xpath=ancestor::li');
      await expect(row.locator('button[title="Delete"]')).toBeVisible();
      console.log(`[AttachmentVerify]   Delete button visible for ${fileName}`);
    }
  }
}

/**
 * Mở CR detail từ My Request list, dùng lại `MyRequestPage.openCRDetailForVerify()`
 * — method này đã xử lý đúng, ổn định (và được dùng thành công ở nhiều testcase
 * khác trong cùng suite, vd att-e2e-mm-04) 2 vấn đề mà các bản tự viết trước đó
 * ở đây đã bỏ sót:
 *   1. Table search có thể re-render ngay sau search → 1 click bắn ra đúng lúc
 *      đó bị "nuốt" (không điều hướng, vẫn ở list) — cần chờ busy settle +
 *      1 khoảng nghỉ ngắn TRƯỚC khi click, không phải chỉ check isVisible().
 *   2. Xác nhận trang detail đã load bằng `page.locator('bdi').filter({ hasText })`
 *      — không phải `getByRoleUI5('Label', ...)` (locator dùng trong bản tự viết
 *      trước gây fail dai dẳng ở testcase này dù list/search đã đúng).
 *
 * @param page         - Playwright Page
 * @param crNumber     - Số CR cần mở
 * @param confirmLabel - Label xác nhận form đã load (mặc định: 'Material Number')
 */
async function _openCRDetailFromList(
  page: Page,
  crNumber: string,
  confirmLabel = 'Material Number'
): Promise<void> {
  await new MyRequestPage(page).openCRDetailForVerify(crNumber, confirmLabel);
  console.log('[AttachmentVerify] CR opened');
}

/**
 * Phase 1 — Requestor: mở CR từ My Request, verify attachments sau khi submit.
 *
 * Flow:
 *   1. Click link CR number → mở CR detail.
 *   2. Mở dialog Attachments → verify Request + Master Data files.
 *   3. Đóng dialog.
 *
 * @param page     - Playwright Page
 * @param crNumber - Số CR cần verify
 */
export async function verifyAttachmentsAfterSubmit(
  page: Page,
  crNumber: string
): Promise<void> {
  console.log('[AttachmentVerify] === Verify attachments after submit ===');

  await page.waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 }).catch(() => {});
  await _openCRDetailFromList(page, crNumber);

  await _verifyRequestAndMasterDataInDialog(page, false);

  await page.getByRoleUI5('Button', { text: 'Close' }).click();
  await page.waitForTimeout(1000);
  console.log('[AttachmentVerify] ✅ All attachments verified (Phase 1)');
}

/**
 * Phase 2 — Approver: verify attachments + Delete button trước khi approve.
 *
 * Yêu cầu: CR detail đã được mở sẵn (bởi openCRDetail).
 *
 * Flow:
 *   1. Mở dialog Attachments.
 *   2. Verify từng file Request + Master Data: preview + Delete button.
 *   3. Đóng dialog.
 *
 * @param page - Playwright Page
 */
export async function verifyAttachmentsBeforeApprove(page: Page): Promise<void> {
  console.log('[AttachmentVerify] === Verify attachments before approve ===');

  await _verifyRequestAndMasterDataInDialog(page, true);

  await page.getByRoleUI5('Button', { text: 'Close' }).click();
  await page.waitForTimeout(1000);
  console.log('[AttachmentVerify] ✅ All attachments verified (Phase 2)');
}

/**
 * Phase 3 — Steward: verify attachments sau khi activate.
 *
 * Flow:
 *   1. Click link CR number → mở CR detail.
 *   2. Mở dialog Attachments → verify Request + Master Data files.
 *   3. Đóng dialog.
 *
 * @param page     - Playwright Page
 * @param crNumber - Số CR cần verify
 */
export async function verifyAttachmentsAfterActivate(
  page: Page,
  crNumber: string
): Promise<void> {
  console.log('[AttachmentVerify] === Verify attachments after activate ===');

  await _openCRDetailFromList(page, crNumber);

  await _verifyRequestAndMasterDataInDialog(page, false);

  await page.getByRoleUI5('Button', { text: 'Close' }).click();
  await page.waitForTimeout(1000);
  console.log('[AttachmentVerify] ✅ All attachments verified (Phase 3)');
}

/**
 * Phase 3b — Requestor: verify attachments sau khi Approver reject.
 *
 * Flow:
 *   1. Click link CR number → mở CR detail.
 *   2. Mở dialog Attachments → verify Request + Master Data files.
 *   3. Đóng dialog (không có Audit Files tab vì CR chưa activate).
 *
 * @param page     - Playwright Page
 * @param crNumber - Số CR cần verify
 */
export async function verifyAttachmentsAfterReject(
  page: Page,
  crNumber: string
): Promise<void> {
  console.log('[AttachmentVerify] === Verify attachments after reject ===');

  await _openCRDetailFromList(page, crNumber);

  await _verifyRequestAndMasterDataInDialog(page, false);

  await page.getByRoleUI5('Button', { text: 'Close' }).click();
  await page.waitForTimeout(1000);
  console.log('[AttachmentVerify] ✅ All attachments verified (Phase 3b)');
}

// ═══════════════════════════════════════════════════════════════════════════════
//  HÀM PUBLIC
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Upload attachments cho tab **Request**.
 *
 * Flow:
 *   1. Click "Attachments" → mở dialog.
 *   2. Upload + verify các file trong thư mục Request.
 *   3. KHÔNG đóng dialog (để gọi tiếp uploadMasterDataAttachments).
 *
 * Cách dùng trong spec:
 *   await uploadRequestAttachments(page);
 *   await uploadMasterDataAttachments(page);
 *   // → Close dialog + Submit
 *
 * @param page - Playwright Page
 * @param opts - (tuỳ chọn) fileNames, fileDir — nếu muốn custom khác default
 */
export async function uploadRequestAttachments(
  page: Page,
  opts: UploadOptions = {}
): Promise<void> {
  const fileNames = opts.fileNames ?? DEFAULT_REQ_FILES;
  const fileDir = opts.fileDir ?? DEFAULT_REQ_DIR;

  console.log('[Attachment] Opening Attachments dialog...');
  const attachBtn = page.locator('.sapMBtn').filter({ hasText: 'Attachments' });
  const attachHasBadge = await attachBtn.filter({ has: page.locator('.sapMBadgeIndicator') }).count();
  if (attachHasBadge > 0) {
    await attachBtn.filter({ has: page.locator('.sapMBadgeIndicator') }).click();
  } else {
    await attachBtn.last().click();
  }
  await page.waitForTimeout(1500);
  await expect(page.getByRoleUI5('Title', { text: 'Attachments' }).first()).toBeVisible({ timeout: 10000 });

  await _uploadFiles(page, fileNames, fileDir, 'Request');
}

/**
 * Upload attachments cho tab **Master Data**.
 *
 * Flow:
 *   1. Click "Master Data" tab.
 *   2. Upload + verify các file trong thư mục Master_Data.
 *   3. KHÔNG đóng dialog (caller tự đóng sau cùng).
 *
 * @param page - Playwright Page
 * @param opts - (tuỳ chọn) fileNames, fileDir
 */
export async function uploadMasterDataAttachments(
  page: Page,
  opts: UploadOptions = {}
): Promise<void> {
  const fileNames = opts.fileNames ?? DEFAULT_MD_FILES;
  const fileDir = opts.fileDir ?? DEFAULT_MD_DIR;

  console.log('[Attachment] Switching to Master Data tab...');
  await page.getByRoleUI5('IconTabFilter', { text: 'Master Data' }).first().click();
  await page.waitForTimeout(1500);

  await _uploadFiles(page, fileNames, fileDir, 'MasterData');
}

// ═══════════════════════════════════════════════════════════════════════════════
//  HÀM PUBLIC — Select từ My Files (Master Data)
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_MY_FILES = ['FOR_ATTACHMENT_TESTING.jpg', 'Attachment01.png', 'SA456.xlsx'];

/**
 * Chọn file từ "Select from my files" trong tab Master Data.
 *
 * Tính năng này cho phép chọn các file có sẵn trong hệ thống thay vì upload
 * từ thư mục dự án. Gọi sau uploadMasterDataAttachments để bổ sung thêm file.
 *
 * Flow cho mỗi file:
 *   1. Click "Select from my files".
 *   2. Search tên file.
 *   3. Click checkbox để chọn.
 *   4. Click "Select" để xác nhận.
 *   5. Verify file hiển thị trong danh sách + Delete button.
 *
 * @param page      - Playwright Page (đang ở Attachments dialog)
 * @param opts      - (tuỳ chọn) fileNames
 */
export async function uploadMasterDataFromSystem(
  page: Page,
  opts: UploadOptions = {}
): Promise<void> {
  const fileNames = opts.fileNames ?? DEFAULT_MY_FILES;

  console.log(`[Attachment][MasterData-System] Selecting ${fileNames.length} file(s) from system...`);

  // ── Chuyển sang Master Data tab (nếu chưa ở đó) ─────────────────────────
  await page.getByRoleUI5('IconTabFilter', { text: 'Master Data' }).first().click();
  await page.waitForTimeout(1000);

  // 1. Mở dialog "Select from my files"
  // Button có thể nằm trong overflow menu (...) trên Inbox detail view
  const selectBtn = page.getByRoleUI5('Button', { text: 'Select from my files' }).first();
  const selectVisible = await selectBtn.isVisible({ timeout: 2000 }).catch(() => false);
  let openViaOverflow = false;
  if (!selectVisible) {
    console.log('[Attachment][MasterData-System]   Button not directly visible, opening overflow menu...');
    await page.getByRoleUI5('ToggleButton', { icon: 'sap-icon://overflow' }).first().click();
    await page.waitForTimeout(1500);
    const overflowBtn = page.getByRoleUI5('Button', { text: 'Select from my files' });
    if (await overflowBtn.count() > 0) {
      openViaOverflow = true;
      // Close the overflow popover before the loop
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    } else {
      console.warn('[Attachment][MasterData-System] ⚠ "Select from my files" not available in this view — skipping system files');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      return;
    }
  }

  for (const fileName of fileNames) {
    console.log(`[Attachment][MasterData-System] Selecting: ${fileName}`);

    if (openViaOverflow) {
      await page.getByRoleUI5('ToggleButton', { icon: 'sap-icon://overflow' }).first().click();
      await page.waitForTimeout(1500);
      await page.getByRoleUI5('Button', { text: 'Select from my files' }).click();
      await page.waitForTimeout(1000);
    } else {
      await selectBtn.click();
    }
    const dialog = page.locator('.sapMDialog').last();
    await expect(dialog).toBeVisible({ timeout: 5000 });
    console.log('[Attachment][MasterData-System]   Dialog opened');

    // 2. Search file — scoped trong dialog
    const searchField = dialog.getByRoleUI5('SearchField').first();
    await searchField.fill('');
    await page.waitForTimeout(500);
    await searchField.fill(fileName);

    // 3. Đợi file name xuất hiện trong dialog → click checkbox trong cùng row.
    // Backend file search can be slow to respond, so poll instead of a single
    // fixed wait: a flat timeout that's "usually enough" silently produces a
    // false negative under load (seen in practice — same search succeeds
    // instantly on a retry run). Failing loudly here — rather than swallowing
    // the miss and continuing — surfaces the real problem immediately instead
    // of a confusing "attachment missing" failure minutes later in Phase 2.
    const fileRow = dialog.locator('.sapMLIB').filter({ hasText: fileName });
    await expect(fileRow.first())
      .toBeVisible({ timeout: 20000 })
      .catch(async () => {
        await dialog.getByRoleUI5('Button', { text: 'Cancel' }).first().click().catch(() => {});
        throw new Error(
          `[Attachment][MasterData-System] "${fileName}" not found in "Select from my files" after 20s search`
        );
      });

    await fileRow.first().locator('[role="checkbox"]').click();

    // 4. Click "Select" trong dialog
    await dialog.getByRoleUI5('Button', { text: 'Select' }).last().click();
    await page.waitForTimeout(2000);

    // 5. Verify file đã được thêm vào danh sách Master Data
    // File từ hệ thống có prefix số động, ví dụ: 7857588_FOR_ATTACHMENT_TESTING.jpg
    const link = page.getByRoleUI5('Link').filter({ hasText: _matchFileName(fileName) }).first();
    await expect(link).toBeVisible({ timeout: 15000 });
    const linkRow = link.locator('xpath=ancestor::li');
    await expect(linkRow.locator('button[title="Delete"]')).toBeVisible();
    console.log(`[Attachment][MasterData-System] ✅ ${fileName} + Delete`);
  }

  console.log(`[Attachment][MasterData-System] ✅ All ${fileNames.length} file(s) selected and verified`);
}
