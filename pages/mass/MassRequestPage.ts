import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { MassUploadHelper } from '../../helpers/attachment';
import { searchAndClick } from '../../helpers/search';
import { fillUI5Field, getFieldByLabelText } from '../../helpers/ui';
import { CRHeaderParams } from '../types';

/**
 * MassRequestPage — Tab My Request > Mass (Requestor view)
 *
 * ═══════════════════════════════════════════════════════════════
 * FLOW TỔNG QUAN (Mass Requestor)
 * ═══════════════════════════════════════════════════════════════
 *   goto() → uploadFile() → fillHeader() → submit() → waitForStatus()
 *
 * ═══════════════════════════════════════════════════════════════
 * SO SÁNH: Mass vs Single Requestor (MyRequestPage)
 * ═══════════════════════════════════════════════════════════════
 *   ┌────────────────┬────────────────────┬──────────────────┐
 *   │   Yếu tố       │ Mass               │ Single           │
 *   ├────────────────┼────────────────────┼──────────────────┤
 *   │ Tạo CR         │ Upload Excel       │ Copy from        │
 *   │                │ → fill header      │ template → fill  │
 *   │                │ → Submit           │ form → Submit    │
 *   ├────────────────┼────────────────────┼──────────────────┤
 *   │ Submit dialog  │ "Select Submit     │ Dialog có        │
 *   │                │  Type" (radio)     │ textarea comment │
 *   │                │ → Confirm (ko có   │ → OK (có comment)│
 *   │                │  textarea comment) │                  │
 *   ├────────────────┼────────────────────┼──────────────────┤
 *   │ Search sau     │ Enter key (ko có   │ Có search button │
 *   │ submit         │ search button)     │ riêng            │
 *   ├────────────────┼────────────────────┼──────────────────┤
 *   │ Status flow    │ IN_APPROVAL → DONE │ SUBMITTED → ...  │
 *   │                │ → IN_ACTIVATE      │                  │
 *   │                │ → ACTIVATED        │                  │
 *   └────────────────┴────────────────────┴──────────────────┘
 *
 * ═══════════════════════════════════════════════════════════════
 * LƯU Ý LOCATORS
 * ═══════════════════════════════════════════════════════════════
 *   - textarea[id$="-ipDesc-inner"]: dùng id$= (ends-with) vì
 *     IDs thay đổi mỗi session, chỉ suffix cố định
 *   - [id$="-cbPriority-arrow"]: arrow button của ComboBox
 *   - button[title="Submit"]: dùng title thay vì text vì button
 *     có thể có icon bên trong
 *   - .sapMDialog.last(): dialog cuối cùng (tránh nhầm với
 *     upload dialog nếu còn sót)
 *
 * ═══════════════════════════════════════════════════════════════
 * LƯU Ý KHI CUSTOM
 * ═══════════════════════════════════════════════════════════════
 *   - fillHeader(): các field có thể khác tuỳ object type
 *     (Product → Description/Priority/Reason/Notes)
 *     Nếu object khác (BP, Material), cần override method này
 *   - submit(): Mass dùng "Select Submit Type" dialog không có
 *     textarea — nếu project khác có textarea, cần sửa logic
 *   - searchInMassView(): Mass view search bằng Enter key,
 *     KHÔNG có search button — đây là khác biệt quan trọng
 *     với Single view có [id$="requestHistorySearchField-search"]
 *   - waitForStatus(): dùng polling 5s vì app backend cần thời
 *     gian xử lý async (SAP backend process)
 *   - verifyBothStatuses(): dùng scope trong <tr> row để tránh
 *     nhầm status của CR khác
 */
export class MassRequestPage extends BasePage {
  readonly massUpload: MassUploadHelper;
  readonly searchField: Locator;
  readonly menuButton: Locator;

  constructor(page: Page) {
    super(page);
    this.massUpload = new MassUploadHelper(page);
    this.searchField = page.locator('[id$="requestHistorySearchField-I"]');
    this.menuButton = page.getByRoleUI5('Button', { text: '...' }).first();
  }

  async goto(): Promise<void> {
    await this.navigateTo('My Request');
    await this.page.getByRoleUI5('IconTabFilter', { text: 'Mass' }).click();
    await this.page.waitForTimeout(1000);
    await expect(this.searchField).toBeVisible();
  }

  async gotoMassListView(): Promise<void> {
    console.log('[MassRequest] Returning to Mass list view...');
    await this.page.getByRoleUI5('IconTabFilter', { text: 'My Request' }).click();
    await this.page.waitForTimeout(500);
    await this.page.getByRoleUI5('IconTabFilter', { text: 'Mass' }).click();
    await this.page.waitForTimeout(1000);
    await expect(this.searchField).toBeVisible();
  }

  async searchCR(crNumber: string): Promise<void> {
    await searchAndClick(this.page, this.searchField, crNumber);
    await expect(this.menuButton).toBeVisible({ timeout: 15000 });
  }

  async fillHeader(params: CRHeaderParams): Promise<void> {
    console.log('[MassRequest] Filling header fields...');

    const descField = getFieldByLabelText(this.page, 'Description', 'textarea');
    await expect(descField).toBeVisible({ timeout: 10000 });
    await fillUI5Field(descField, params.description);
    console.log(`[MassRequest] Filled Description: "${params.description}"`);

    const priorityArrow = this.page.locator('[id$="cbPriority-arrow"]');
    await expect(priorityArrow).toBeVisible({ timeout: 10000 });
    await priorityArrow.click();
    await this.page.waitForTimeout(500);
    await this.page.getByRole('option', { name: params.priority }).click();
    console.log(`[MassRequest] Selected Priority: ${params.priority}`);

    if (params.reason) {
      const reasonArrow = this.page.locator('[id$="cbReason-arrow"]');
      await expect(reasonArrow).toBeVisible({ timeout: 10000 });
      await reasonArrow.click();
      await this.page.waitForTimeout(500);
      await this.page.getByRole('option', { name: params.reason }).click();
      console.log(`[MassRequest] Selected Reason: ${params.reason}`);
    }

    const notesField = getFieldByLabelText(this.page, 'Other reason', 'textarea');
    await expect(notesField).toBeVisible({ timeout: 10000 });
    await fillUI5Field(notesField, params.notes);
    console.log(`[MassRequest] Filled Notes: "${params.notes}"`);
  }

  async submit(comment = 'Requestor has submitted this mass request !'): Promise<string> {
    console.log('[MassRequest] Submitting CR...');

    const submitBtn = this.page.locator('button[title="Submit"]');
    await expect(submitBtn).toBeVisible({ timeout: 15000 });
    await submitBtn.click();
    await this.page.waitForTimeout(2000);

    console.log('[MassRequest] Waiting for Select Submit Type dialog...');
    const dialog = this.page.locator('.sapMDialog').last();
    await expect(dialog).toBeVisible({ timeout: 15000 });

    const dialogTitle = await dialog.locator('[id$="-title-inner"]').textContent();
    console.log(`[MassRequest] Dialog title: ${dialogTitle}`);

    const confirmBtn = dialog.locator('[id$="-btnConfirm"]');
    await expect(confirmBtn).toBeVisible({ timeout: 10000 });
    await expect(confirmBtn).toBeEnabled({ timeout: 10000 });
    await confirmBtn.click();
    console.log('[MassRequest] Confirm button clicked');

    await this.page.waitForTimeout(3000);

    const toast = this.page.getByText(/CR\d{10} is being/);
    await expect(toast).toBeVisible({ timeout: 30000 });
    const toastText = (await toast.textContent()) || '';
    const crMatch = toastText.match(/CR\d{10}/);
    const newCR = crMatch ? crMatch[0] : '';
    console.log(`[MassRequest] CR created: ${newCR}`);

    await this.page.getByRoleUI5('Button', { text: 'OK' }).first().click();
    await this.page.waitForTimeout(1000);

    return newCR;
  }

  async searchInMassView(crNumber: string): Promise<void> {
    // Clear field first to force SAPUI5 binding change on re-search
    await this.page
      .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 15000 })
      .catch(() => {});
    await this.searchField.click();
    await this.searchField.press('Control+A');
    await this.searchField.press('Backspace');
    await this.page.waitForTimeout(300);

    await fillUI5Field(this.searchField, crNumber);
    await this.searchField.press('Enter');
    await this.page.waitForTimeout(2000);
    await this.page
      .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 15000 })
      .catch(() => {});
  }

  /**
   * Wait for CR to reach a status in Mass view
   * Mass view searches via Enter key (no separate search button)
   */
  async waitForStatus(crNumber: string, status: string, maxWaitMs = 240000): Promise<void> {
    const startTime = Date.now();
    console.log(`[MassRequest] Waiting for CR ${crNumber} to reach ${status}...`);

    while (true) {
      await this.searchInMassView(crNumber);

      const isTarget = await this.page
        .getByRoleUI5('ObjectStatus', { text: status })
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      if (isTarget) {
        console.log(`[MassRequest] CR ${crNumber} has reached ${status}`);
        return;
      }

      const elapsed = Date.now() - startTime;
      if (elapsed >= maxWaitMs) {
        throw new Error(`CR ${crNumber} did not reach ${status} after ${maxWaitMs / 1000}s`);
      }

      console.log(`[MassRequest] Still waiting... ${Math.round((maxWaitMs - elapsed) / 1000)}s remaining`);
      await this.page.waitForTimeout(5000);
    }
  }

  async verifyStatus(crNumber: string, status: string): Promise<void> {
    await this.searchInMassView(crNumber);
    await expect(
      this.page.getByRoleUI5('ObjectStatus', { text: status }).first()
    ).toBeVisible({ timeout: 60000 });
    console.log(`[MassRequest] Verified CR ${crNumber} status: ${status}`);
  }

  async cancelCR(crNumber: string): Promise<void> {
    console.log(`[MassRequest] Cancelling CR ${crNumber}...`);
    await this.searchInMassView(crNumber);
    await this.menuButton.click();
    await this.page.waitForTimeout(500);
    await this.page.getByRoleUI5('MenuItem', { text: 'Cancel request' }).click();
    await this.page.waitForTimeout(1000);
    // New flow: Comments dialog → Fill reason → Confirm
    const dialog = this.page.locator('.sapMDialog').last();
    await expect(dialog).toBeVisible({ timeout: 10000 });
    const reasonTextarea = dialog.locator('textarea');
    await expect(reasonTextarea).toBeVisible({ timeout: 5000 });
    await reasonTextarea.click();
    await reasonTextarea.fill(`Cancel CR ${crNumber}`);
    await dialog.getByRoleUI5('Button', { text: 'Confirm' }).click();
    await this.page.waitForTimeout(2000);
    await this.page
      .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 15000 })
      .catch(() => {});
    console.log(`[MassRequest] CR ${crNumber} cancelled`);
  }

  async verifyBothStatuses(
    crNumber: string,
    status: string,
    activationStatus: string
  ): Promise<void> {
    console.log(
      `[MassRequest] Verifying CR ${crNumber} — Status: ${status}, Activation Status: ${activationStatus}`
    );

    await this.searchInMassView(crNumber);

    const crRow = this.page.locator('tr').filter({ has: this.page.getByText(crNumber, { exact: true }) });
    await crRow.first().waitFor({ state: 'visible', timeout: 15000 });

    const allStatusInRow = crRow.first().locator('.sapMObjStatus');
    const statusCount = await allStatusInRow.count();
    console.log(`[MassRequest] Found ${statusCount} status elements in row`);

    await this.page.waitForTimeout(1000);

    let foundStatus = false;
    for (let i = 0; i < statusCount; i++) {
      const el = allStatusInRow.nth(i);
      const text = await el.textContent();
      const isVisible = await el.isVisible();
      console.log(`[MassRequest] Checking status[${i}]: "${text}" visible=${isVisible}`);
      if (text?.includes(status) && isVisible) {
        console.log(`[MassRequest] Verified Status: ${status} at index ${i}`);
        foundStatus = true;
        break;
      }
    }
    expect(foundStatus).toBe(true);

    let foundActivationStatus = false;
    for (let i = 0; i < statusCount; i++) {
      const el = allStatusInRow.nth(i);
      const text = await el.textContent();
      const isVisible = await el.isVisible();
      console.log(`[MassRequest] Checking activationStatus[${i}]: "${text}" visible=${isVisible}`);
      if (text?.includes(activationStatus) && isVisible) {
        console.log(`[MassRequest] Verified Activation Status: ${activationStatus} at index ${i}`);
        foundActivationStatus = true;
        break;
      }
    }
    expect(foundActivationStatus).toBe(true);

    console.log(
      `[MassRequest] CR ${crNumber} — Status: ${status}  Activation Status: ${activationStatus}`
    );
  }

  async openCRLink(crNumber: string): Promise<void> {
    console.log(`[MassRequest] Opening CR detail: ${crNumber}`);
    // Scope to the table row rather than a page-wide Link match — see the
    // clone-element note in acceptDuplicateRequestor() above.
    const crRow = this.page
      .locator('tr')
      .filter({ has: this.page.getByText(crNumber, { exact: true }) })
      .first();
    await crRow.waitFor({ state: 'visible', timeout: 15000 });
    const crLink = crRow.getByRoleUI5('Link', { text: crNumber }).first();
    await expect(crLink).toBeEnabled({ timeout: 20000 });
    await crLink.click();

    // Wait for busy indicator to appear (loading started) then disappear (loaded)
    try {
      await this.page
        .waitForSelector('.sapUiLocalBusyIndicator', { state: 'visible', timeout: 5000 });
      await this.page
        .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 15000 });
    } catch {
      // Busy indicator may not appear — view could be cached or instant
    }

    console.log('[MassRequest] CR detail page loaded');
  }

  async verifyActivationCharts(expectedStatus = 'COMPLETE_APPROVED'): Promise<void> {
    const segGroup = this.page.locator('[role="listbox"][aria-roledescription="Segmented button group"]');
    await expect(segGroup.getByRole('option').filter({ hasText: 'Complete Approved (5)' })).toBeVisible({ timeout: 20000 });
    // "Activated" reflects the system finishing mass-activation of all 5 items
    // in the backend — same class of slow mass processing as the DONE/Submitted
    // waits above, so it gets the same generous timeout instead of 10s.
    await expect(segGroup.getByRole('option').filter({ hasText: 'Activated (5)' })).toBeVisible({ timeout: 120000 });
  }

  async verifyCRCharts(expectedStatus: string, buttonPattern: RegExp): Promise<void> {
    console.log(`[MassRequest] Verifying CR charts: button=${buttonPattern}`);
    const segGroup = this.page.locator('[role="listbox"][aria-roledescription="Segmented button group"]');
    await expect(segGroup.getByRole('option').filter({ hasText: buttonPattern }).first()).toBeVisible({ timeout: 20000 });
    console.log('[MassRequest] CR charts verified');
  }

  async acceptDuplicateRequestor(crNumber: string, expectedStatus = 'IN_APPROVAL'): Promise<void> {
    console.log(`[MassRequest] Accepting duplicate as Requestor for CR: ${crNumber}`);

    await this.page.waitForTimeout(2000);
    await this.searchInMassView(crNumber);

    // A page-wide getByRoleUI5('Link', { text: crNumber }) can resolve to a UI5
    // "clone" element (id suffix like "-__clone841") — an inert duplicate UI5
    // keeps in the DOM for internal rendering/measurement, exposed with the
    // same accessible role+text but permanently aria-disabled. Scoping to the
    // actual table row (same pattern as verifyBothStatuses() above) and
    // waiting for the link to be enabled avoids ever resolving to that clone.
    const crRow = this.page
      .locator('tr')
      .filter({ has: this.page.getByText(crNumber, { exact: true }) })
      .first();
    await crRow.waitFor({ state: 'visible', timeout: 15000 });
    const crLink = crRow.getByRoleUI5('Link', { text: crNumber }).first();
    await expect(crLink).toBeEnabled({ timeout: 20000 });
    await crLink.click();

    const segGroup = this.page.locator('[role="listbox"][aria-roledescription="Segmented button group"]');
    await expect(segGroup.getByRole('option').filter({ hasText: /Duplicate \(\d+\)/ })).toBeVisible({ timeout: 20000 });

    await this.page.waitForTimeout(3000);
    await segGroup.getByRole('option').filter({ hasText: 'Duplicate (5)' }).click();
    await this.page.getByRoleUI5('Button', { text: 'Accept & Submit' }).click();
    await this.page.getByRoleUI5('MenuItem', { text: 'All Items' }).click();

    await expect(
      this.page.getByRoleUI5('Title', { text: 'Processing' }).first()
    ).toBeVisible({ timeout: 30000 });
    await this.page.getByRoleUI5('Button', { text: 'OK' }).click({ timeout: 30000 });
    await this.page.waitForTimeout(2000);

    if (expectedStatus === 'DONE') {
      console.log('[MassRequest] Waiting for auto-approve + auto-activate on charts page...');
      await expect(
        this.page.getByRoleUI5('ObjectStatus', { text: 'DONE' }).first()
      ).toBeVisible({ timeout: 120000 });
      await expect(
        this.page.getByRoleUI5('ObjectStatus', { text: 'DONE' }).nth(1)
      ).toBeVisible({ timeout: 120000 });
      await expect(segGroup.getByRole('option').filter({ hasText: /Complete Approved \(\d+\)/ })).toBeVisible({ timeout: 10000 });
    } else {
      // Same post-accept-duplicate backend processing as the DONE branch above
      // (Accept & Submit -> Processing dialog -> chart update) — give it the
      // same generous timeout instead of the much shorter 10s this branch had.
      await expect(segGroup.getByRole('option').filter({ hasText: /Submitted \(\d+\)/ })).toBeVisible({ timeout: 120000 });
    }

    await this.gotoMassListView();
    await this.searchInMassView(crNumber);

    if (expectedStatus === 'DONE') {
      const crRow = this.page.locator('tr').filter({ has: this.page.getByText(crNumber, { exact: true }) });
      await crRow.first().waitFor({ state: 'visible', timeout: 15000 });
      await expect(
        crRow.first().locator('.sapMObjStatus').filter({ hasText: 'DONE' }).first()
      ).toBeVisible({ timeout: 30000 });
      const statuses = crRow.first().locator('.sapMObjStatus');
      const statusCount = await statuses.count();
      let doneFound = 0;
      for (let i = 0; i < statusCount; i++) {
        const isVisible = await statuses.nth(i).isVisible();
        const text = await statuses.nth(i).textContent();
        console.log(`[MassRequest] status[${i}]: "${text}" visible=${isVisible}`);
        if (isVisible && text?.includes('DONE')) {
          doneFound++;
        }
      }
      console.log(`[MassRequest] Found ${doneFound} visible DONE statuses in row`);
      expect(doneFound).toBeGreaterThanOrEqual(2);
    } else {
      await expect(
        this.page.getByRoleUI5('ObjectStatus', { text: expectedStatus }).filter({ visible: true }).first()
      ).toBeVisible({ timeout: 15000 });
    }

    console.log(`[MassRequest] Duplicate accepted for CR ${crNumber} — verified ${expectedStatus}`);
  }
}
