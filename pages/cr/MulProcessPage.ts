import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { fillUI5Field, getFieldByLabelText } from '../../helpers/ui';
import path from 'path';
import { CRHeaderParams } from '../types';

export class MulProcessPage extends BasePage {
  readonly myRequestSearch: Locator;
  readonly inboxSearch: Locator;

  constructor(page: Page) {
    super(page);
    this.myRequestSearch = page.locator('[id$="requestHistorySearchField-I"]');
    this.inboxSearch = page.locator('[id$="myInboxSearch-I"]');
  }

  async gotoMasterData(): Promise<void> {
    console.log('[MulProcess] Navigating to Master Data tab...');
    await this.navigateTo('Master Data');
    await this.page.waitForTimeout(1000);
    console.log('[MulProcess] Master Data tab loaded');
  }

  async selectProductObjectType(): Promise<void> {
    console.log('[MulProcess] Selecting Product object type...');
    await this.openObjectTypePicker('Product');
    // Exact match — 'Product' must not match 'Product Hierarchy'
    await this.page.getByRole('option', { name: 'Product', exact: true }).click();
    await this.page.waitForTimeout(500);
    await this.waitForBusy(15000);
    console.log('[MulProcess] Product object type selected');
  }

  async selectBPObjectType(): Promise<void> {
    console.log('[MulProcess] Selecting Business Partner object type...');
    await this.openObjectTypePicker('Business Partner');
    // Exact match — avoid picking a sibling option containing 'Business Partner'
    await this.page.getByRole('option', { name: 'Business Partner', exact: true }).click();
    await this.page.waitForTimeout(500);
    await this.waitForBusy(15000);
    console.log('[MulProcess] Business Partner object type selected');
  }

  /**
   * Opens the Object Type picker on the Master Data page.
   * The Master Data view loads its data (Templates/SearchMethods/Requests) shortly
   * after the tab renders; when that data arrives the view re-renders and closes an
   * already-open picker popup. So we retry until the target option is actually visible.
   */
  private async openObjectTypePicker(targetOption: string): Promise<void> {
    const objectTypeSelector = this.page.locator('.sapMSlt:not(.sapMSltMinWidth)').first();
    // Scope to the *visible* target option — a bare '[role="option"]' first() could
    // resolve to a hidden option from another control's popup (was flaky).
    const option = this.page
      .getByRole('option', { name: targetOption, exact: true })
      .filter({ visible: true })
      .first();

    await expect(objectTypeSelector).toBeVisible({ timeout: 10000 });
    await this.waitForBusy(15000);

    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= 4; attempt++) {
      // Only click if the picker is not already open (an open click would close it)
      if (!(await option.isVisible().catch(() => false))) {
        await objectTypeSelector.click();
        await this.page.waitForTimeout(1000);
      }
      try {
        await expect(option).toBeVisible({ timeout: 5000 });
        return;
      } catch (e) {
        lastError = e as Error;
        // The view may still be loading its data; wait for it to settle and retry
        await this.waitForBusy(15000);
        await this.page.waitForTimeout(1500);
      }
    }
    throw new Error(
      `[MulProcess] Could not open Object Type picker after 4 attempts: ${lastError?.message}`
    );
  }

  async startMassRequest(): Promise<void> {
    console.log('[MulProcess] Starting Mass Request flow...');
    const createBtn = this.page.getByRoleUI5('Button', { text: 'Create' });
    await expect(createBtn).toBeVisible({ timeout: 10000 });
    await createBtn.click();
    await this.page.waitForTimeout(500);

    await this.page.getByRoleUI5('MenuItem', { text: 'Mass Request' }).click();
    await this.page.waitForTimeout(500);

    await this.page.getByRoleUI5('MenuItem', { text: 'Normal' }).click();
    await this.page.waitForTimeout(1000);
    console.log('[MulProcess] Mass Request flow started - template dialog opened');
  }

  async searchAndSelectTemplate(templateName: string): Promise<void> {
    console.log(`[MulProcess] Searching for template: ${templateName}`);
    const searchField = this.page.getByRoleUI5('SearchField');
    await expect(searchField).toBeVisible({ timeout: 10000 });
    await fillUI5Field(searchField, templateName);
    await searchField.press('Enter');
    await this.page.waitForTimeout(2000);
    await this.page.locator('tr').filter({ has: this.page.getByText(templateName, { exact: true }) }).first().click();
    await this.page.waitForTimeout(2000);
    console.log(`[MulProcess] Template selected: ${templateName}`);
  }

  async uploadFile(filePath: string): Promise<void> {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(process.cwd(), filePath);
    console.log(`[MulProcess] Uploading file: ${absolutePath}`);

    // Click Upload button (main page) to open upload dialog
    await this.page.getByRoleUI5('Button', { text: 'Upload' }).click();
    console.log('[MulProcess] Upload button clicked, opening upload dialog...');
    await this.page.waitForTimeout(1500);

    // Attach file to the file input in the dialog
    const fileInput = this.page.locator('input[type="file"]').first();
    await expect(fileInput).toBeVisible({ timeout: 10000 });
    await fileInput.setInputFiles(absolutePath);
    console.log('[MulProcess] File attached to input[type="file"]');

    await this.page.waitForTimeout(2000);

    // Click Upload button in dialog to confirm
    const uploadDialog = this.page.locator('.sapMDialog').last();
    await expect(uploadDialog).toBeVisible({ timeout: 10000 });
    const uploadBtnInDialog = uploadDialog.getByRoleUI5('Button', { text: 'Upload' }).first();
    await expect(uploadBtnInDialog).toBeVisible({ timeout: 10000 });
    await expect(uploadBtnInDialog).toBeEnabled({ timeout: 10000 });
    await uploadBtnInDialog.click();
    console.log('[MulProcess] Upload button in dialog clicked');

    await this.page.waitForTimeout(2000);

    // Wait for Processing dialog, then OK
    await expect(
      this.page.getByRoleUI5('Title', { text: 'Processing' }).first()
    ).toBeVisible({ timeout: 30000 });
    const okBtn = this.page.getByRoleUI5('Button', { text: 'OK' }).first();
    await expect(okBtn).toBeVisible({ timeout: 30000 });
    await okBtn.click();
    console.log('[MulProcess] Upload completed - Processing OK clicked');

    // Wait for the upload processing to fully settle before proceeding —
    // a fixed waitForTimeout raced the backend (file upload + parse + CR creation).
    await this.waitForBusy(60000);
    await this.waitForPopupClosed(60000);
  }

  async fillHeader(params: CRHeaderParams): Promise<void> {
    console.log('[MulProcess] Filling header fields...');

    const descInput = this.page.locator('textarea[id$="--ipDesc-inner"]');
    await expect(descInput).toBeVisible({ timeout: 10000 });
    await fillUI5Field(descInput, params.description);
    console.log(`[MulProcess] Filled Description: "${params.description}"`);

    const priorityArrow = this.page.locator('[id$="--cbPriority-arrow"]');
    await expect(priorityArrow).toBeVisible({ timeout: 10000 });
    await priorityArrow.click();
    await this.page.waitForTimeout(500);
    await this.page.getByRole('option', { name: params.priority }).click();
    console.log(`[MulProcess] Selected Priority: ${params.priority}`);

    if (params.reason) {
      const reasonArrow = this.page.locator('[id$="--cbReason-arrow"]');
      await expect(reasonArrow).toBeVisible({ timeout: 10000 });
      await reasonArrow.click();
      await this.page.waitForTimeout(500);
      await this.page.getByRole('option', { name: params.reason }).click();
      console.log(`[MulProcess] Selected Reason: ${params.reason}`);
    }

    const notesField = getFieldByLabelText(this.page, 'Other reason', 'textarea');
    await expect(notesField).toBeVisible({ timeout: 10000 });
    await fillUI5Field(notesField, params.notes);
    console.log(`[MulProcess] Filled Notes: "${params.notes}"`);
  }

  async submitMultipleSingle(comment: string): Promise<void> {
    console.log('[MulProcess] Submitting with Multiple Single Requests...');

    const submitBtn = this.page.locator('button[title="Submit"]');
    await expect(submitBtn).toBeVisible({ timeout: 15000 });
    await submitBtn.click();
    await this.page.waitForTimeout(2000);

    await this.page.getByRoleUI5('RadioButton', { text: 'Multiple Single Requests' }).click();
    await this.page.waitForTimeout(500);

    const commentTextarea = this.page.getByRoleUI5('TextArea', { placeholder: 'Comment' });
    await expect(commentTextarea).toBeVisible({ timeout: 10000 });
    await fillUI5Field(commentTextarea, comment);

    const confirmBtn = this.page.getByRoleUI5('Button', { text: 'Confirm' });
    await expect(confirmBtn).toBeVisible({ timeout: 10000 });
    await confirmBtn.click();
    console.log('[MulProcess] Confirm button clicked');

    await this.page.waitForTimeout(3000);

    await expect(
      this.page.getByRoleUI5('Title', { text: 'Processing' }).first()
    ).toBeVisible({ timeout: 30000 });

    const okBtn = this.page.getByRoleUI5('Button', { text: 'OK' }).first();
    await expect(okBtn).toBeVisible({ timeout: 30000 });
    await okBtn.click();
    console.log('[MulProcess] Processing dialog OK clicked');

    await this.page.waitForTimeout(2000);
  }

  async searchAfterSubmit(timestamp: string): Promise<void> {
    console.log(`[MulProcess] Searching by timestamp after submit: ${timestamp}`);
    await this.page.waitForTimeout(2000);
    await fillUI5Field(this.myRequestSearch, timestamp);
    await this.page.locator('[id$="requestHistorySearchField-search"]').click();
    await this.page.waitForTimeout(3000);
    await this.page
      .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 })
      .catch(() => {});
  }

  async verifyStatusButton(buttonText: string): Promise<void> {
    console.log(`[MulProcess] Verifying button: ${buttonText}`);
    const btn = this.page.getByRoleUI5('Button', { text: buttonText }).first();
    await btn.scrollIntoViewIfNeeded({ timeout: 10000 }).catch(() => {});
    // Backend updates statuses asynchronously — poll instead of a single-shot
    // expect (was flaky when a status button appeared after a re-render).
    const startTime = Date.now();
    const maxWait = 120000;
    while (true) {
      const visible = await btn.isVisible({ timeout: 5000 }).catch(() => false);
      if (visible) {
        console.log(`[MulProcess] Verified button: ${buttonText}`);
        return;
      }
      const elapsed = Date.now() - startTime;
      if (elapsed >= maxWait) {
        throw new Error(
          `[MulProcess] Button "${buttonText}" did not appear after ${maxWait / 1000}s`
        );
      }
      console.log(
        `[MulProcess] Still waiting for button "${buttonText}"... ${Math.round((maxWait - elapsed) / 1000)}s remaining`
      );
      await this.page.waitForTimeout(5000);
    }
  }

  async verifyStatusButtonInMainView(buttonText: string): Promise<void> {
    console.log(`[MulProcess] Verifying button in main view: ${buttonText}`);
    const btn = this.page.locator('.sapMIBar.sapMHeaderBar, .sapMBar').first()
      .getByRoleUI5('Button', { text: buttonText });
    await expect(btn).toBeVisible({ timeout: 30000 });
  }

  async verifyButtonsAfterSubmit(timestamp: string): Promise<void> {
    console.log('[MulProcess] Verifying All(5) and Submitted(5) buttons...');
    // Backend processes the uploaded rows asynchronously — the status buttons
    // only show "(5)" once all 5 CRs are ready, so poll + re-search instead of
    // a single-shot expect (was flaky).
    const startTime = Date.now();
    const maxWait = 120000;

    while (true) {
      await this.searchAfterSubmit(timestamp);

      const allVisible = await this.page
        .getByRoleUI5('Button', { text: 'All (5)' })
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);
      const submittedVisible = await this.page
        .getByRoleUI5('Button', { text: 'Submitted (5)' })
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      if (allVisible && submittedVisible) {
        console.log('[MulProcess] Verified All(5) and Submitted(5) buttons');
        return;
      }

      const elapsed = Date.now() - startTime;
      if (elapsed >= maxWait) {
        throw new Error(
          `[MulProcess] Submitted(5) did not appear after ${maxWait / 1000}s`
        );
      }
      console.log(
        `[MulProcess] Still waiting for Submitted(5)... ${Math.round((maxWait - elapsed) / 1000)}s remaining`
      );
      await this.page.waitForTimeout(5000);
    }
  }

  async gotoMyRequest(): Promise<void> {
    console.log('[MulProcess] Navigating to My Request tab...');
    await this.navigateTo('My Request');
    await this.page.waitForTimeout(1000);
    await expect(this.myRequestSearch).toBeVisible({ timeout: 15000 });
    console.log('[MulProcess] My Request tab loaded');
  }

  async searchInMyRequest(timestamp: string): Promise<void> {
    console.log(`[MulProcess] Searching My Request by timestamp: ${timestamp}`);
    // Clear field first to force SAPUI5 binding change on re-search
    await this.myRequestSearch.click();
    await this.myRequestSearch.press('Control+A');
    await this.myRequestSearch.press('Backspace');
    await this.page.waitForTimeout(300);

    await fillUI5Field(this.myRequestSearch, timestamp);
    await this.page.locator('[id$="requestHistorySearchField-search"]').click();
    await this.page.waitForTimeout(2000);
    await this.page
      .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 })
      .catch(() => {});
  }

  async verifyCompletelyApproved(count: number = 5): Promise<void> {
    console.log(`[MulProcess] Verifying Completely Approved (${count})...`);
    await expect(
      this.page.getByRoleUI5('Button', { text: `Completely Approved (${count})` }).first()
    ).toBeVisible({ timeout: 30000 });
    console.log(`[MulProcess] Verified Completely Approved (${count})`);
  }

  async gotoMyInbox(): Promise<void> {
    console.log('[MulProcess] Navigating to My Inbox tab...');
    await this.navigateTo('My Inbox');
    await this.page.waitForTimeout(2000);
    await expect(this.inboxSearch).toBeVisible({ timeout: 15000 });
    console.log('[MulProcess] My Inbox tab loaded');
  }

  async searchInInbox(timestamp: string): Promise<void> {
    console.log(`[MulProcess] Searching Inbox by timestamp: ${timestamp}`);
    // Clear field first to force SAPUI5 binding change on re-search
    await this.inboxSearch.click();
    await this.inboxSearch.press('Control+A');
    await this.inboxSearch.press('Backspace');
    await this.page.waitForTimeout(300);

    await fillUI5Field(this.inboxSearch, timestamp);
    // Press Enter instead of clicking the search icon — that icon re-renders
    // right after fill() (empty -> clear icon), which is flaky under headless/CI load.
    await this.inboxSearch.press('Enter');
    await this.page.waitForTimeout(3000);
    await this.page
      .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 })
      .catch(() => {});
  }

  async verifyInboxButtons(): Promise<void> {
    console.log('[MulProcess] Verifying inbox buttons...');
    // Backend delivers CRs to the approver inbox asynchronously — poll instead of
    // a single-shot expect (was flaky).
    const startTime = Date.now();
    const maxWait = 120000;
    while (true) {
      const waitingVisible = await this.page
        .getByRoleUI5('Button', { text: 'Waiting for Approval (5)' })
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);
      if (waitingVisible) {
        console.log('[MulProcess] Verified Waiting for Approval(5)');
        return;
      }
      const elapsed = Date.now() - startTime;
      if (elapsed >= maxWait) {
        throw new Error(
          `[MulProcess] Waiting for Approval (5) did not appear after ${maxWait / 1000}s`
        );
      }
      console.log(
        `[MulProcess] Still waiting for Waiting for Approval (5)... ${Math.round((maxWait - elapsed) / 1000)}s remaining`
      );
      await this.page.waitForTimeout(5000);
    }
  }

  async selectAllAndApprove(comment: string): Promise<void> {
    console.log('[MulProcess] Selecting all and approving...');

    // Wait until all 5 CRs are actually present in the inbox before selecting —
    // selecting too early approves a partial set (was flaky).
    const startTime = Date.now();
    const maxWait = 120000;
    while (true) {
      const waitingVisible = await this.page
        .getByRoleUI5('Button', { text: 'Waiting for Approval (5)' })
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);
      if (waitingVisible) {
        break;
      }
      const elapsed = Date.now() - startTime;
      if (elapsed >= maxWait) {
        throw new Error(
          `[MulProcess] Waiting for Approval (5) did not appear after ${maxWait / 1000}s`
        );
      }
      console.log(
        `[MulProcess] Still waiting for Waiting for Approval (5)... ${Math.round((maxWait - elapsed) / 1000)}s remaining`
      );
      await this.page.waitForTimeout(5000);
    }

    const selectAll = this.page.getByRole('checkbox', { name: 'Select All' });
    await expect(selectAll).toBeVisible({ timeout: 10000 });
    await selectAll.click();
    await this.page.waitForTimeout(500);

    const approveBtn = this.page.getByRoleUI5('Button', { text: 'Approve' });
    await expect(approveBtn).toBeVisible({ timeout: 10000 });
    await approveBtn.click();
    await this.page.waitForTimeout(1000);

    await expect(
      this.page.getByRoleUI5('Title', { text: 'Confirmation' })
    ).toBeVisible({ timeout: 10000 });

    const confirmBtn = this.page.getByRoleUI5('Button', { text: 'Confirm' });
    await expect(confirmBtn).toBeVisible({ timeout: 10000 });
    await confirmBtn.click();

    await this.page.waitForTimeout(2000);

    const textarea = this.page.locateUI5('//Dialog[1]/TextArea[1]');
    await expect(textarea).toBeVisible({ timeout: 10000 });
    await fillUI5Field(textarea, comment);

    const approveDialogBtn = this.page.getByRoleUI5('Button', { text: 'Approve' }).first();
    await expect(approveDialogBtn).toBeVisible({ timeout: 10000 });
    await approveDialogBtn.click();

    console.log('[MulProcess] Approve action completed');
  }

  async waitForInboxClear(): Promise<void> {
    console.log('[MulProcess] Waiting for inbox to clear...');
    // Backend removes CRs from the inbox asynchronously after Approve — poll for
    // the inbox table to show "No data" instead of a single-shot nth(2) expect
    // (the hard-coded index was fragile).
    const startTime = Date.now();
    const maxWait = 180000;
    while (true) {
      const cleared = await this.page
        .getByRoleUI5('Table', { noDataText: 'No data' })
        .filter({ visible: true })
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);
      if (cleared) {
        console.log('[MulProcess] Inbox cleared - No data');
        return;
      }
      const elapsed = Date.now() - startTime;
      if (elapsed >= maxWait) {
        throw new Error(`[MulProcess] Inbox did not clear after ${maxWait / 1000}s`);
      }
      console.log(
        `[MulProcess] Still waiting for inbox to clear... ${Math.round((maxWait - elapsed) / 1000)}s remaining`
      );
      await this.page.waitForTimeout(5000);
    }
  }

  async gotoActivation(): Promise<void> {
    console.log('[MulProcess] Navigating to Activation tab...');
    await this.navigateTo('Activation');
    await this.page.waitForTimeout(1000);
    await expect(this.page.locator('[id$="activateRequestSearchFields-I"]')).toBeVisible({ timeout: 15000 });
    console.log('[MulProcess] Activation tab loaded');
  }

  async searchInActivation(timestamp: string): Promise<void> {
    console.log(`[MulProcess] Searching Activation by timestamp: ${timestamp}`);
    await this.page.waitForTimeout(2000);
    // Stable id suffix — getByRoleUI5('SearchField').nth(2) was order-dependent
    // and sometimes resolved to a hidden SearchField from another view.
    const searchField = this.page.locator('[id$="activateRequestSearchFields-I"]');

    // Clear field first to force SAPUI5 binding change on re-search
    await searchField.click();
    await searchField.press('Control+A');
    await searchField.press('Backspace');
    await this.page.waitForTimeout(300);

    await fillUI5Field(searchField, timestamp);
    await this.page.locator('[id$="activateRequestSearchFields-search"]').click();
    await this.page.waitForTimeout(3000);
    await this.page
      .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 })
      .catch(() => {});
  }

  async verifyActivationInitialButtons(timestamp: string): Promise<void> {
    console.log('[MulProcess] Verifying activation initial buttons...');
    const startTime = Date.now();
    const maxWait = 180000;

    while (true) {
      const unassignedVisible = await this.page
        .getByRoleUI5('Button', { text: 'Unassigned (5)' })
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      if (unassignedVisible) {
        console.log('[MulProcess] Verified Unassigned(5)');
        return;
      }

      const elapsed = Date.now() - startTime;
      if (elapsed >= maxWait) {
        throw new Error(`[MulProcess] Unassigned(5) did not appear after ${maxWait / 1000}s`);
      }
      console.log(
        `[MulProcess] Unassigned(5) not ready yet, re-searching... ${Math.round((maxWait - elapsed) / 1000)}s remaining`
      );
      await this.page.waitForTimeout(5000);
      await this.searchInActivation(timestamp);
    }
  }

  async selectAllAndAssign(stewardUser: string, comment: string): Promise<void> {
    console.log(`[MulProcess] Selecting all and assigning to: ${stewardUser}`);

    await this.page.waitForTimeout(3000);
    await this.page.waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 }).catch(() => {});

    const selectAll = this.page.getByRole('checkbox', { name: 'Select All' });
    await expect(selectAll).toBeVisible({ timeout: 20000 });
    await selectAll.click();

    // Wait for Assign button to be enabled after selection
    const assignBtn = this.page.getByRoleUI5('Button', { text: 'Assign' }).nth(1);
    await expect(assignBtn).toBeEnabled({ timeout: 15000 });
    console.log('[MulProcess] Assign button enabled');

    await assignBtn.click();
    await this.page.waitForTimeout(2000);

    console.log('[MulProcess] Assign dialog opened');

    const valueHelp = this.page.getByRoleUI5('Icon', { src: 'sap-icon://value-help' }).first();
    await expect(valueHelp).toBeVisible({ timeout: 10000 });
    await valueHelp.click();
    await this.page.waitForTimeout(1000);

    const userSearch = this.page.getByRoleUI5('SearchField').first();
    await expect(userSearch).toBeVisible({ timeout: 10000 });
    await fillUI5Field(userSearch, stewardUser);
    await userSearch.press('Enter');
    await this.page.waitForTimeout(1000);

    await this.page.getByText(stewardUser).click();
    await this.page.waitForTimeout(500);

    const commentInput = this.page.getByRoleUI5('Input', { type: 'Text' }).nth(1);
    await expect(commentInput).toBeVisible({ timeout: 10000 });
    await commentInput.click();
    await commentInput.fill(comment);

    const assignDialogBtn = this.page.getByRoleUI5('Button', { text: 'Assign' }).first();
    await expect(assignDialogBtn).toBeVisible({ timeout: 10000 });
    await assignDialogBtn.click();
    console.log('[MulProcess] Assign action completed');

    await this.page.waitForTimeout(3000);
    await this.page
      .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 })
      .catch(() => {});
  }

  async verifyAssignedButtons(): Promise<void> {
    console.log('[MulProcess] Verifying assigned buttons...');
    await expect(
      this.page.getByRoleUI5('Button', { text: 'Assigned (5)' }).first()
    ).toBeVisible({ timeout: 30000 });
    console.log('[MulProcess] Verified Assigned(5)');
  }

  async selectAllAndActivate(): Promise<void> {
    console.log('[MulProcess] Selecting all and activating...');
    const selectAll = this.page.getByRole('checkbox', { name: 'Select All' });
    await expect(selectAll).toBeVisible({ timeout: 10000 });
    await selectAll.click();

    const approveBtn = this.page.getByRoleUI5('Button', { text: 'Approve' }).last();
    await expect(approveBtn).toBeEnabled({ timeout: 10000 });
    await approveBtn.click();
    await this.page.waitForTimeout(1000);

    await expect(
      this.page.getByRoleUI5('Title', { text: 'Confirmation' })
    ).toBeVisible({ timeout: 10000 });

    const confirmBtn = this.page.getByRoleUI5('Button', { text: 'Confirm' });
    await expect(confirmBtn).toBeVisible({ timeout: 10000 });
    await confirmBtn.click();

    console.log('[MulProcess] Activate action completed');
    await this.page.waitForTimeout(3000);
    await this.page
      .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 60000 })
      .catch(() => {});
  }

  async verifyActivatedButtons(): Promise<void> {
    console.log('[MulProcess] Verifying activated buttons...');
    await expect(
      this.page.getByRoleUI5('Button', { text: 'Activated (5)' }).first()
    ).toBeVisible({ timeout: 30000 });
    console.log('[MulProcess] Verified Activated(5)');
  }

  // ── My Inbox: Rework (Approver reworks) ──

  async selectAllAndReworkInInbox(timestamp: string, comment: string): Promise<void> {
    console.log('[MulProcess] Selecting all and reworking in Inbox...');

    // Wait until all 5 CRs are actually present in the inbox before selecting —
    // selecting too early reworks a partial set (was flaky).
    const startTime = Date.now();
    const maxWait = 120000;
    while (true) {
      await this.searchInInbox(timestamp);
      const waitingVisible = await this.page
        .getByRoleUI5('Button', { text: 'Waiting for Approval (5)' })
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);
      if (waitingVisible) {
        break;
      }
      const elapsed = Date.now() - startTime;
      if (elapsed >= maxWait) {
        throw new Error(
          `[MulProcess] Waiting for Approval (5) did not appear after ${maxWait / 1000}s`
        );
      }
      console.log(
        `[MulProcess] Still waiting for Waiting for Approval (5)... ${Math.round((maxWait - elapsed) / 1000)}s remaining`
      );
      await this.page.waitForTimeout(5000);
    }

    // Select All
    await this.page.getByRole('checkbox', { name: 'Select All' }).click();
    await this.page.waitForTimeout(500);

    // Click Rework (enabled)
    await expect(
      this.page.getByRoleUI5('Button', { text: 'Rework' })
    ).toBeEnabled({ timeout: 15000 });
    await this.page.getByRoleUI5('Button', { text: 'Rework' }).click();
    await this.page.waitForTimeout(1000);

    // Dialog 1: Confirmation → Confirm
    await expect(
      this.page.getByRoleUI5('Title', { text: 'Confirmation' })
    ).toBeVisible({ timeout: 10000 });
    await this.page.getByRoleUI5('Button', { text: 'Confirm' }).click();
    await this.page.waitForTimeout(2000);

    // Dialog 2: RadioButton → TextArea → Confirm
    await this.page.getByRoleUI5('RadioButton', { text: 'Requestor' }).click();
    await this.page.waitForTimeout(500);
    const textarea = this.page.locator('.sapMDialog:visible textarea.sapMTextAreaInner');
    await textarea.click();
    await textarea.fill(comment);
    await this.page.getByRoleUI5('Button', { text: 'Confirm' }).click();

    // Wait for No data (items left My Inbox)
    await expect(
      this.page.getByRoleUI5('Table', { noDataText: 'No data' }).nth(2)
    ).toBeVisible({ timeout: 90000 });
    console.log('[MulProcess] Inbox Rework completed - Inbox cleared');
  }

  // ── My Inbox: Reject (Approver rejects) ──

  async selectAllAndRejectInInbox(comment: string): Promise<void> {
    console.log('[MulProcess] Selecting all and rejecting in Inbox...');

    // Wait until all 5 CRs are actually present in the inbox before selecting —
    // selecting too early rejects a partial set (was flaky). CRs arrive either as
    // fresh submissions ("Waiting for Approval (5)") or after a steward rework to
    // approver ("Rework (5)"), so accept either status button.
    const startTime = Date.now();
    const maxWait = 120000;
    while (true) {
      const waitingForApproval = await this.page
        .getByRoleUI5('Button', { text: 'Waiting for Approval (5)' })
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);
      const rework = await this.page
        .getByRoleUI5('Button', { text: 'Rework (5)' })
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);
      if (waitingForApproval || rework) {
        break;
      }
      const elapsed = Date.now() - startTime;
      if (elapsed >= maxWait) {
        throw new Error(
          `[MulProcess] Inbox did not show all 5 CRs after ${maxWait / 1000}s`
        );
      }
      console.log(
        `[MulProcess] Still waiting for all 5 CRs in inbox... ${Math.round((maxWait - elapsed) / 1000)}s remaining`
      );
      await this.page.waitForTimeout(5000);
    }

    const selectAll = this.page.getByRole('checkbox', { name: 'Select All' });
    await expect(selectAll).toBeVisible({ timeout: 10000 });
    await selectAll.click();

    const rejectBtn = this.page.getByRoleUI5('Button', { text: 'Reject' }).first();
    await expect(rejectBtn).toBeEnabled({ timeout: 15000 });
    await rejectBtn.click();
    await this.page.waitForTimeout(1000);

    await expect(
      this.page.getByRoleUI5('Title', { text: 'Confirmation' })
    ).toBeVisible({ timeout: 10000 });
    const confirmBtn = this.page.getByRoleUI5('Button', { text: 'Confirm' });
    await expect(confirmBtn).toBeVisible({ timeout: 10000 });
    await confirmBtn.click();
    await this.page.waitForTimeout(2000);

    const textarea = this.page.locator('.sapMDialog:visible textarea.sapMTextAreaInner');
    await expect(textarea).toBeVisible({ timeout: 10000 });
    await textarea.click();
    await textarea.fill(comment);

    const rejectDialogBtn = this.page.getByRoleUI5('Button', { text: 'Reject' }).first();
    await expect(rejectDialogBtn).toBeVisible({ timeout: 10000 });
    await rejectDialogBtn.click();

    // Wait for reject dialogs to close and processing to finish before navigating away
    await this.page.waitForTimeout(2000);
    await this.page
      .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 })
      .catch(() => {});
    await this.waitForPopupClosed(30000);
    console.log('[MulProcess] Inbox Reject action completed');
  }

  // ── Activation: Rework to Requestor (Steward reworks) ──

  async selectAllAndReworkToRequestor(comment: string): Promise<void> {
    console.log('[MulProcess] Selecting all and reworking to Requestor in Activation...');
    await this.page.waitForTimeout(2000);
    await this.page
      .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 })
      .catch(() => {});

    const selectAll = this.page.getByRole('checkbox', { name: 'Select All' });
    await expect(selectAll).toBeVisible({ timeout: 20000 });
    await selectAll.click();

    const reworkBtn = this.page.getByRoleUI5('Button', { text: 'Rework' }).last();
    await expect(reworkBtn).toBeEnabled({ timeout: 20000 });
    await reworkBtn.click();
    await this.page.waitForTimeout(2000);

    // Dialog 1: Confirmation → Confirm
    await expect(
      this.page.getByRoleUI5('Title', { text: 'Confirmation' })
    ).toBeVisible({ timeout: 15000 });
    await this.page.getByRoleUI5('Button', { text: 'Confirm' }).click();
    await this.page.waitForTimeout(2000);

    // Dialog 2: Select person → RadioButton → TextArea → Confirm
    await this.page.getByRoleUI5('RadioButton', { text: 'Requestor' }).click();
    await this.page.waitForTimeout(500);
    const textarea = this.page.locator('.sapMDialog:visible textarea.sapMTextAreaInner');
    await expect(textarea).toBeVisible({ timeout: 10000 });
    await textarea.click();
    await textarea.fill(comment);
    await this.page.getByRoleUI5('Button', { text: 'Confirm' }).click();

    // Wait for processing
    await this.page.waitForTimeout(3000);
    await this.page
      .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 })
      .catch(() => {});

    console.log('[MulProcess] Activation Rework to Requestor completed');
  }

  // ── Activation: Rework to Approver (Steward reworks) ──

  async selectAllAndReworkToApprover(comment: string): Promise<void> {
    console.log('[MulProcess] Selecting all and reworking to Approver in Activation...');
    await this.page.waitForTimeout(2000);
    await this.page
      .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 })
      .catch(() => {});

    const selectAll = this.page.getByRole('checkbox', { name: 'Select All' });
    await expect(selectAll).toBeVisible({ timeout: 20000 });
    await selectAll.click();

    const reworkBtn = this.page.getByRoleUI5('Button', { text: 'Rework' }).last();
    await expect(reworkBtn).toBeEnabled({ timeout: 20000 });
    await reworkBtn.click();
    await this.page.waitForTimeout(2000);

    // Dialog 1: Confirmation → Confirm
    await expect(
      this.page.getByRoleUI5('Title', { text: 'Confirmation' })
    ).toBeVisible({ timeout: 15000 });
    await this.page.getByRoleUI5('Button', { text: 'Confirm' }).click();
    await this.page.waitForTimeout(2000);

    // Dialog 2: Select person → RadioButton "Approver" → TextArea → Confirm
    await this.page.getByRoleUI5('RadioButton', { text: 'Approver' }).click();
    await this.page.waitForTimeout(500);
    const textarea = this.page.locator('.sapMDialog:visible textarea.sapMTextAreaInner');
    await expect(textarea).toBeVisible({ timeout: 10000 });
    await textarea.click();
    await textarea.fill(comment);
    await this.page.getByRoleUI5('Button', { text: 'Confirm' }).click();

    // Wait for processing
    await this.page.waitForTimeout(3000);
    await this.page
      .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 })
      .catch(() => {});

    console.log('[MulProcess] Activation Rework to Approver completed');
  }

  // ── Activation: Reject (Steward rejects after assign) ──

  async selectAllAndRejectInActivation(comment: string): Promise<void> {
    console.log('[MulProcess] Selecting all and rejecting in Activation...');
    await this.page.waitForTimeout(2000);
    await this.page
      .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 })
      .catch(() => {});

    const selectAll = this.page.getByRole('checkbox', { name: 'Select All' });
    await expect(selectAll).toBeVisible({ timeout: 20000 });
    await selectAll.click();

    const rejectBtn = this.page.getByRoleUI5('Button', { text: 'Reject' }).last();
    await expect(rejectBtn).toBeEnabled({ timeout: 20000 });
    await rejectBtn.click();
    await this.page.waitForTimeout(2000);

    // Dialog 1: Confirmation → Confirm
    await expect(
      this.page.getByRoleUI5('Title', { text: 'Confirmation' })
    ).toBeVisible({ timeout: 10000 });
    const confirmBtn = this.page.getByRoleUI5('Button', { text: 'Confirm' });
    await expect(confirmBtn).toBeVisible({ timeout: 10000 });
    await confirmBtn.click();
    await this.page.waitForTimeout(2000);

    // Dialog 2: TextArea → Reject button
    const textarea = this.page.locator('.sapMDialog:visible textarea.sapMTextAreaInner');
    await textarea.click();
    await textarea.fill(comment);
    await this.page.getByRoleUI5('Button', { text: 'Reject' }).first().click();

    // Wait for processing
    await this.page.waitForTimeout(3000);
    await this.page
      .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 })
      .catch(() => {});

    console.log('[MulProcess] Activation Reject completed');
  }

  // ── Wait & Verify: My Request status polling ──

  async waitForStatusInMyRequest(
    timestamp: string,
    statusText: string,
    count: number = 5
  ): Promise<void> {
    console.log(`[MulProcess] Waiting for status "${statusText} (${count})" in My Request...`);
    const startTime = Date.now();
    const maxWait = 240000;

    while (true) {
      await this.gotoMyRequest();
      await this.searchInMyRequest(timestamp);

      const statusVisible = await this.page
        .getByRoleUI5('Button', { text: `${statusText} (${count})` })
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      if (statusVisible) {
        console.log(`[MulProcess] Verified ${statusText}(${count}) in My Request`);
        return;
      }

      const elapsed = Date.now() - startTime;
      if (elapsed >= maxWait) {
        throw new Error(
          `[MulProcess] Status "${statusText}" did not appear after ${maxWait / 1000}s`
        );
      }
      console.log(`[MulProcess] Still waiting for "${statusText}"... ${Math.round((maxWait - elapsed) / 1000)}s remaining`);
      await this.page.waitForTimeout(5000);
    }
  }

  async verifyReworkedInMyRequest(count: number = 5): Promise<void> {
    console.log(`[MulProcess] Verifying Reworked (${count}) in My Request...`);
    await expect(
      this.page.getByRoleUI5('Button', { text: `Rework (${count})` }).first()
    ).toBeVisible({ timeout: 30000 });
    await expect(
      this.page.getByRoleUI5('Button', { text: `All (${count})` }).first()
    ).toBeVisible({ timeout: 30000 });
    console.log(`[MulProcess] Verified Rework(${count}) and All(${count})`);
  }

  async verifyRejectedInMyRequest(count: number = 5): Promise<void> {
    console.log(`[MulProcess] Verifying Rejected (${count}) in My Request...`);
    await expect(
      this.page.getByRoleUI5('Button', { text: `Rejected (${count})` }).first()
    ).toBeVisible({ timeout: 30000 });
    await expect(
      this.page.getByRoleUI5('Button', { text: `All (${count})` }).first()
    ).toBeVisible({ timeout: 30000 });
    console.log(`[MulProcess] Verified Rejected(${count}) and All(${count})`);
  }

  async waitForProcessingAndVerifyStatuses(
    timestamp: string,
    phase: 'afterAssign' | 'afterActivate'
  ): Promise<void> {
    console.log(`[MulProcess] Waiting for processing and verifying ${phase}...`);
    const startTime = Date.now();
    const maxWait = 240000;

    while (true) {
      await this.searchInActivation(timestamp);

      if (phase === 'afterAssign') {
        const assignedVisible = await this.page
          .getByRoleUI5('Button', { text: 'Assigned (5)' })
          .first()
          .isVisible({ timeout: 5000 })
          .catch(() => false);
        if (assignedVisible) {
          await this.verifyAssignedButtons();
          return;
        }
      } else {
        const activatedVisible = await this.page
          .getByRoleUI5('Button', { text: 'Activated (5)' })
          .first()
          .isVisible({ timeout: 5000 })
          .catch(() => false);
        if (activatedVisible) {
          await this.verifyActivatedButtons();
          return;
        }
      }

      const elapsed = Date.now() - startTime;
      if (elapsed >= maxWait) {
        throw new Error(`[MulProcess] ${phase} did not complete after ${maxWait / 1000}s`);
      }
      console.log(`[MulProcess] Still waiting for ${phase}... ${Math.round((maxWait - elapsed) / 1000)}s remaining`);
      await this.page.waitForTimeout(5000);
    }
  }
}
