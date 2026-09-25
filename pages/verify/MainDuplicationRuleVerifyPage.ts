import { Page, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { clickValueHelp } from '../../helpers/domain';
import { fillUI5Field } from '../../helpers/ui';

/**
 * MainDuplicationRuleVerifyPage — Page Object for main-page duplication rule verification.
 * Handles:
 *   - UI-blocking (same section): inline error on submit
 *   - Backend-async (cross-section): submit -> FAILED -> System Log
 */
export class MainDuplicationRuleVerifyPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async selectTab(tabText: string): Promise<void> {
    console.log(`[MainDuplicationRuleVerify] Clicking tab: "${tabText}"`);
    // First try: IconTabFilter click
    const tabFilter = this.page.getByRoleUI5('IconTabFilter', { text: tabText });
    const tabCount = await tabFilter.count();
    if (tabCount > 0) {
      await tabFilter.first().click();
      await this.waitForBusy(3000);
      console.log(`[MainDuplicationRuleVerify] Tab "${tabText}" selected`);
      return;
    }
    // Fallback: scroll generic text into view
    const el = this.page.getByText(tabText, { exact: true }).first();
    if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
      await el.scrollIntoViewIfNeeded();
      await this.waitForBusy(2000);
      console.log(`[MainDuplicationRuleVerify] Tab "${tabText}" scrolled into view`);
      return;
    }
    throw new Error(`Cannot find tab "${tabText}"`);
  }

  async navigateToTargetArea(targetTab: string): Promise<void> {
    console.log(`[MainDuplicationRuleVerify] Navigating to target area: "${targetTab}"`);
    // Strategy 1: IconTabFilter click
    const tabFilter = this.page.getByRoleUI5('IconTabFilter', { text: targetTab });
    const tabCount = await tabFilter.count();
    if (tabCount > 0) {
      await tabFilter.first().click({ timeout: 3000 }).catch(() => {});
      await this.waitForBusy(3000);
      console.log(`[MainDuplicationRuleVerify] Target area "${targetTab}" (IconTabFilter)`);
      return;
    }
    // Strategy 2: Generic text scroll
    const el = this.page.getByText(targetTab, { exact: true }).first();
    if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
      await el.scrollIntoViewIfNeeded();
      await this.waitForBusy(2000);
      console.log(`[MainDuplicationRuleVerify] Target area "${targetTab}" (scroll)`);
      return;
    }
    console.log(`[MainDuplicationRuleVerify] Target area "${targetTab}" not found, continuing anyway`);
  }

  async waitForSection(sectionTitle: string): Promise<void> {
    console.log(`[MainDuplicationRuleVerify] Waiting for section: "${sectionTitle}"`);
    await expect(this.page.getByRoleUI5('Title', { text: sectionTitle }).first()).toBeVisible({ timeout: 15000 });
    console.log(`[MainDuplicationRuleVerify] Section "${sectionTitle}" visible`);
  }

  async clickAddButtonInSection(sectionTitle: string): Promise<void> {
    console.log(`[MainDuplicationRuleVerify] Clicking Add in section "${sectionTitle}"`);
    const section = this.page.getByRoleUI5('ObjectPageSubSection', { title: sectionTitle });
    await expect(section).toBeVisible({ timeout: 10000 });
    const addBtn = section.locator('button[aria-label="Add"]').first();
    await expect(addBtn).toBeVisible({ timeout: 5000 });
    await addBtn.click();
    await this.waitForBusy(3000);
    console.log(`[MainDuplicationRuleVerify] Add button clicked in section "${sectionTitle}"`);
  }

  async clickAddButtonBySectionTitle(sectionTitle: string): Promise<void> {
    console.log(`[MainDuplicationRuleVerify] Clicking Add in section "${sectionTitle}"`);
    try {
      const section = this.page.getByRoleUI5('ObjectPageSubSection', { title: sectionTitle });
      const addBtn = section.locator('button[aria-label="Add"]').first();
      await addBtn.waitFor({ state: 'visible', timeout: 3000 });
      await addBtn.click();
      await this.waitForBusy(3000);
      console.log(`[MainDuplicationRuleVerify] Add clicked (ObjectPageSubSection)`);
      return;
    } catch {
    }
    try {
      const titleEl = this.page.locator('span.sapMTitle, span[id$="-inner"]')
        .filter({ hasText: sectionTitle })
        .first();
      if (await titleEl.count() === 0) throw new Error('not found');
      await titleEl.scrollIntoViewIfNeeded({ timeout: 2000 });
      await this.page.waitForTimeout(200);
      const toolbar = titleEl.locator('xpath=ancestor::div[contains(@class,"sapMTB") or contains(@class,"sapMIBar")]').first();
      const addBtn = toolbar.locator('button[aria-label="Add"]').first();
      await addBtn.waitFor({ state: 'visible', timeout: 5000 });
      await addBtn.click();
      await this.waitForBusy(3000);
      console.log(`[MainDuplicationRuleVerify] Add clicked (toolbar: "${sectionTitle}")`);
      return;
    } catch (e) {
      console.log(`[MainDuplicationRuleVerify] Toolbar approach failed: ${e}`);
    }
    const addBtns = this.page.getByRoleUI5('Button', { icon: 'sap-icon://add' });
    const btnCount = await addBtns.count();
    for (let i = 0; i < btnCount; i++) {
      const btn = addBtns.nth(i);
      const parentText = await btn.locator('xpath=ancestor::*[position()<4]').last().innerText().catch(() => '');
      if (parentText.includes(sectionTitle)) {
        await btn.click();
        await this.waitForBusy(3000);
        console.log(`[MainDuplicationRuleVerify] Add clicked (parent text match: "${sectionTitle}")`);
        return;
      }
    }
    throw new Error(`Cannot find Add button for section "${sectionTitle}"`);
  }

  async clickF4Icon(index: number): Promise<void> {
    console.log(`[MainDuplicationRuleVerify] Clicking F4 icon [nth=${index}]`);
    await this.page.getByRoleUI5('Icon', { src: 'sap-icon://value-help' }).nth(index).click();
    await this.waitForBusy(3000);
    console.log(`[MainDuplicationRuleVerify] F4 icon clicked, waiting for dialog...`);
  }

  async clickF4ByLabel(labelText: string): Promise<void> {
    console.log(`[MainDuplicationRuleVerify] Clicking F4 for label "${labelText}"`);
    try {
      const dialogs = this.page.locator('.sapMDialogOpen');
      const dlgCount = await dialogs.count();
      for (let d = dlgCount - 1; d >= 0; d--) {
        const dlg = dialogs.nth(d);
        const label = dlg.locator('label').filter({ hasText: new RegExp('^' + labelText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }).first();
        const labelVisible = await label.isVisible().catch(() => false);
        if (labelVisible) {
          const forId = await label.getAttribute('for');
          if (forId) {
            const inputId = forId.replace(/-inner$/, '');
            const vhi = this.page.locator('#' + inputId + '-vhi');
            await vhi.waitFor({ state: 'visible', timeout: 5000 });
            await vhi.click();
            await this.waitForBusy(3000);
            console.log(`[MainDuplicationRuleVerify] F4 clicked (dialog label: "${labelText}")`);
            return;
          }
        }
      }
    } catch {
    }
    try {
      await clickValueHelp(this.page, labelText);
      await this.waitForBusy(3000);
      console.log(`[MainDuplicationRuleVerify] F4 clicked (valueHelp: "${labelText}")`);
      return;
    } catch {
    }
    try {
      const formEl = this.page.locator('.sapUiFormElement')
        .filter({ has: this.page.getByText(labelText, { exact: true }).first() })
        .first();
      await formEl.waitFor({ state: 'visible', timeout: 5000 });
      const icon = formEl.locator('span[src="sap-icon://value-help"]').first();
      await icon.click();
      await this.waitForBusy(3000);
      console.log(`[MainDuplicationRuleVerify] F4 clicked (formElement: "${labelText}")`);
      return;
    } catch {
    }
    const icon = this.page.locator('span[src="sap-icon://value-help"]');
    const iconCount = await icon.count();
    for (let i = 0; i < iconCount; i++) {
      const thisIcon = icon.nth(i);
      const nearbyText = await thisIcon.locator('xpath=ancestor::*[contains(@class,"sapUiFormElement") or contains(@class,"sapMInputBase")]').last().innerText().catch(() => '');
      if (nearbyText.includes(labelText)) {
        await thisIcon.click();
        await this.waitForBusy(3000);
        console.log(`[MainDuplicationRuleVerify] F4 clicked (generic: "${labelText}")`);
        return;
      }
    }
    throw new Error(`Cannot find F4 icon for label "${labelText}"`);
  }

  async selectF4Value(value: string): Promise<void> {
    console.log(`[MainDuplicationRuleVerify] Searching F4 value: "${value}"`);
    const searchField = this.page.getByRoleUI5('SearchField').first();
    await expect(searchField).toBeVisible({ timeout: 10000 });
    await searchField.click();
    await searchField.fill(value);
    await searchField.press('Enter');
    await this.waitForBusy(3000);
    console.log(`[MainDuplicationRuleVerify] Search "${value}" executed`);
  }

  async selectFirstRowInDialog(): Promise<void> {
    console.log(`[MainDuplicationRuleVerify] Selecting first row in F4 dialog`);
    try {
      const f4Dialog = this.page.locator('.sapMTableSelectDialog.sapMDialogOpen').last();
      await f4Dialog.waitFor({ state: 'visible', timeout: 5000 });
      const firstCell = f4Dialog.locator('.sapMTableTBody > tr.sapMListTblRow .sapMListTblCell').first();
      await firstCell.waitFor({ state: 'visible', timeout: 5000 });
      await firstCell.click();
      await this.waitForBusy(3000);
      const dialogStillOpen = await f4Dialog.isVisible().catch(() => false);
      if (!dialogStillOpen) {
        console.log(`[MainDuplicationRuleVerify] Row selected (cell click, dialog closed)`);
        return;
      }
      console.log(`[MainDuplicationRuleVerify] Cell click didn't close dialog, trying text click...`);
      const firstText = f4Dialog.locator('.sapMTableTBody > tr.sapMListTblRow .sapMText').first();
      await firstText.click();
      await this.waitForBusy(3000);
      console.log(`[MainDuplicationRuleVerify] Row selected (text click)`);
      return;
    } catch {
    }
    try {
      const dialog = this.page.locator('[role="dialog"]').last();
      const rows = dialog.locator('.sapMTableTBody > tr.sapMListTblRow');
      if ((await rows.count()) > 0) {
        await rows.first().locator('.sapMListTblCell').first().click();
        await this.waitForBusy(3000);
        console.log(`[MainDuplicationRuleVerify] Row selected (fallback cell click)`);
        return;
      }
    } catch {
    }
    const firstRow = this.page.locator('.sapMDialogOpen .sapMListTblRow').first();
    await firstRow.waitFor({ state: 'visible', timeout: 5000 });
    await firstRow.locator('td').first().click();
    await this.waitForBusy(3000);
    console.log(`[MainDuplicationRuleVerify] Row selected (last resort)`);
  }

  async selectRowByTextInDialog(text: string): Promise<void> {
    console.log(`[MainDuplicationRuleVerify] Selecting row with text "${text}" in F4 dialog`);
    const f4Dialog = this.page.locator('.sapMTableSelectDialog.sapMDialogOpen').last();
    await f4Dialog.waitFor({ state: 'visible', timeout: 10000 });
    await f4Dialog.getByText(text, { exact: true }).first().click();
    await this.waitForBusy(3000);
    console.log(`[MainDuplicationRuleVerify] Row with text "${text}" selected`);
  }

  async closeF4Dialog(): Promise<void> {
    console.log(`[MainDuplicationRuleVerify] Closing F4 dialog...`);
    const dialog = this.page.locator('.sapMTableSelectDialog.sapMDialogOpen').last();
    if (await dialog.isVisible().catch(() => false)) {
      await dialog.locator('button[aria-label="Cancel"]').click().catch(() => {});
      await this.waitForBusy(2000);
      console.log(`[MainDuplicationRuleVerify] F4 dialog closed`);
    }
  }

  async closeAddDialog(): Promise<void> {
    console.log(`[MainDuplicationRuleVerify] Closing Add dialog...`);
    const dialog = this.page.locator('.sapMDialogOpen:not(.sapMTableSelectDialog)').last();
    if (await dialog.isVisible().catch(() => false)) {
      await dialog.locator('button[aria-label="Cancel"]').click().catch(() => {});
      await this.waitForBusy(2000);
      console.log(`[MainDuplicationRuleVerify] Add dialog closed`);
    }
  }

  async closeAddDialogEscape(): Promise<void> {
    console.log(`[MainDuplicationRuleVerify] Closing Add dialog via Escape...`);
    const dialog = this.page.locator('.sapMDialogOpen:not(.sapMTableSelectDialog)').last();
    if (await dialog.isVisible().catch(() => false)) {
      await dialog.press('Escape');
      await this.waitForBusy(2000);
      console.log(`[MainDuplicationRuleVerify] Add dialog closed via Escape`);
    }
  }

  async setInputValue(labelText: string, value: string): Promise<void> {
    console.log(`[MainDuplicationRuleVerify] Setting "${labelText}" = "${value}"`);
    const label = this.page.locator('label').filter({ hasText: new RegExp('^' + labelText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }).first();
    await expect(label).toBeVisible({ timeout: 5000 });
    const forId = await label.getAttribute('for');
    if (forId) {
      const input = this.page.locator('#' + forId);
      await input.click();
      await input.fill(value);
      console.log(`[MainDuplicationRuleVerify] Input "${labelText}" set to "${value}"`);
      return;
    }
    const fallback = this.page.getByRoleUI5('Input', { placeholder: labelText });
    if (await fallback.isVisible().catch(() => false)) {
      await fallback.click();
      await fallback.fill(value);
      console.log(`[MainDuplicationRuleVerify] Input "${labelText}" set via placeholder`);
      return;
    }
    const textArea = this.page.locator('textarea').filter({ has: this.page.getByText(labelText) }).first();
    if (await textArea.isVisible().catch(() => false)) {
      await textArea.click();
      await textArea.fill(value);
      console.log(`[MainDuplicationRuleVerify] TextArea "${labelText}" set`);
      return;
    }
    throw new Error(`Cannot find input field for label "${labelText}"`);
  }

  async setInputFieldValue(fieldLabel: string, value: string): Promise<void> {
    console.log(`[MainDuplicationRuleVerify] Setting field "${fieldLabel}" = "${value}"`);
    const label = this.page.locator('label').filter({ hasText: new RegExp('^' + fieldLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }).first();
    await expect(label).toBeVisible({ timeout: 5000 });
    const forId = await label.getAttribute('for');
    if (forId) {
      const input = this.page.locator('#' + forId);
      await input.click();
      await input.fill(value);
      console.log(`[MainDuplicationRuleVerify] Field "${fieldLabel}" set to "${value}"`);
      return;
    }
    const field = this.page.getByLabel(new RegExp('^' + fieldLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$')).first();
    await field.click();
    await field.fill(value);
    console.log(`[MainDuplicationRuleVerify] Field "${fieldLabel}" set via getByLabel`);
  }

  async verifyErrorDialog(expectedText: string): Promise<void> {
    console.log(`[MainDuplicationRuleVerify] Verifying error dialog: "${expectedText}"`);
    // Pattern 1: role="alertdialog"
    const alertDialog = this.page.locator('[role="alertdialog"]').last();
    if (await alertDialog.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(alertDialog.getByText(expectedText)).toBeVisible({ timeout: 5000 });
      console.log(`[MainDuplicationRuleVerify] Error dialog verified (alertdialog)`);
      return;
    }
    // Pattern 2: Title 'Error' + error text
    const errorTitle = this.page.getByRoleUI5('Title', { text: 'Error' });
    await expect(errorTitle).toBeVisible({ timeout: 10000 });
    await expect(this.page.getByText(expectedText)).toBeVisible({ timeout: 5000 });
    console.log(`[MainDuplicationRuleVerify] Error dialog verified (Title 'Error')`);
  }

  async dismissErrorDialog(): Promise<void> {
    console.log('[MainDuplicationRuleVerify] Dismissing error dialog...');
    const closeBtn = this.page.getByRoleUI5('Button', { text: 'Close' });
    if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeBtn.click();
    } else {
      await this.page.keyboard.press('Escape');
    }
    await this.waitForBusy(2000);
    console.log('[MainDuplicationRuleVerify] Error dialog dismissed');
  }

  async clickSubmitButton(): Promise<void> {
    console.log('[MainDuplicationRuleVerify] Clicking Submit button...');
    await this.page.locator('#sap-ui-blocklayer-popup').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    await this.page.getByRoleUI5('Button', { text: 'Submit' }).first().click();
    await this.waitForBusy(3000);
    console.log('[MainDuplicationRuleVerify] Submit clicked');
  }

  async clickEditBySectionTitle(sectionTitle: string): Promise<void> {
    console.log(`[MainDuplicationRuleVerify] Clicking Edit button for section "${sectionTitle}"`);
    const section = this.page.getByRoleUI5('ObjectPageSubSection', { title: sectionTitle });
    let editBtn = section.getByRoleUI5('Button', { icon: 'sap-icon://open-command-field' }).first();
    if (!(await editBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      // Fallback for sections that don't render as an ObjectPageSubSection at all
      // (e.g. "Units of Measure" is a repeatable table, not an ObjectPageSubSection)
      // or where the Edit icon sits just outside its boundary (e.g. header toolbar).
      console.log(`[MainDuplicationRuleVerify] Edit icon not found in section "${sectionTitle}", falling back to nth(1) on page`);
      editBtn = this.page.getByRoleUI5('Button', { icon: 'sap-icon://open-command-field' }).nth(1);
    }
    await editBtn.waitFor({ state: 'visible', timeout: 5000 });
    await editBtn.click();
    await this.waitForBusy(3000);
    console.log(`[MainDuplicationRuleVerify] Edit button clicked for section "${sectionTitle}"`);
  }

  async clickUpdateDialog(): Promise<void> {
    console.log('[MainDuplicationRuleVerify] Clicking Update button...');
    await this.page.getByRoleUI5('Button', { text: 'Update' }).click();
    await this.waitForBusy(3000);
    console.log('[MainDuplicationRuleVerify] Update clicked');
  }

  async verifyLabelVisible(labelText: string): Promise<void> {
    await expect(this.page.getByRoleUI5('Label', { text: labelText }).first()).toBeVisible({
      timeout: 5000,
    });
  }

  async waitForCRStatusInList(crNumber: string, status: string): Promise<void> {
    console.log(`[MainDuplicationRuleVerify] Waiting for CR ${crNumber} status = ${status}`);
    const searchField = this.page.getByRoleUI5('SearchField').first();
    const startTime = Date.now();
    const maxWaitMs = 180000;
    while (true) {
      await searchField.click();
      await searchField.fill('');
      await searchField.fill(crNumber);
      await searchField.press('Enter');
      await this.waitForBusy(5000);
      const crRow = this.page.getByRoleUI5('ColumnListItem').filter({ hasText: crNumber });
      const found = await crRow.getByRoleUI5('ObjectStatus', { text: status }).first().isVisible().catch(() => false);
      if (found) {
        console.log(`[MainDuplicationRuleVerify] CR ${crNumber} reached status ${status}`);
        return;
      }
      if (Date.now() - startTime >= maxWaitMs) {
        throw new Error(`CR ${crNumber} did not reach ${status} after ${maxWaitMs / 1000}s`);
      }
      console.log(`[MainDuplicationRuleVerify] Still waiting for ${status}...`);
      await this.page.waitForTimeout(5000);
    }
  }

  async openCRDetail(crNumber: string): Promise<void> {
    console.log(`[MainDuplicationRuleVerify] Opening CR detail: ${crNumber}`);
    const crLink = this.page.getByRoleUI5('Link', { text: crNumber }).first();
    await expect(crLink).toBeVisible({ timeout: 15000 });
    await crLink.click();
    await this.waitForBusy(5000);
    console.log(`[MainDuplicationRuleVerify] CR ${crNumber} detail opened`);
  }

  async verifySystemLogContains(expectedText: string): Promise<void> {
    console.log(`[MainDuplicationRuleVerify] Verifying System Log contains: "${expectedText}"`);
    const logSection = this.page.locator('[id*="systemLog"]').first();
    if (await logSection.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(logSection).toContainText(expectedText, { timeout: 10000 });
      console.log(`[MainDuplicationRuleVerify] System Log verified`);
      return;
    }
    const logTabs = this.page.getByRoleUI5('IconTabFilter');
    const logTabCount = await logTabs.count();
    let logTab = logTabs.first();
    for (let i = 0; i < logTabCount; i++) {
      const t = await logTabs.nth(i).textContent().catch(() => '');
      if (t && /log/i.test(t)) { logTab = logTabs.nth(i); break; }
    }
    if (await logTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await logTab.click();
      await this.waitForBusy(3000);
      await expect(this.page.locator('[id*="systemLog"]').first()).toContainText(expectedText, { timeout: 10000 });
      console.log(`[MainDuplicationRuleVerify] System Log verified via tab`);
      return;
    }
    const pageText = await this.page.locator('.sapMDialogOpen, .sapMPanelContent').last().innerText().catch(() => '');
    if (pageText.includes(expectedText)) {
      console.log(`[MainDuplicationRuleVerify] System Log text found in page content`);
      return;
    }
    console.log(`[MainDuplicationRuleVerify] System Log section not found, checking full page...`);
    await expect(this.page.locator('body')).toContainText(expectedText, { timeout: 10000 });
    console.log(`[MainDuplicationRuleVerify] System Log text found in page`);
  }

  async selectExactTextInDialog(text: string): Promise<void> {
    console.log(`[MainDuplicationRuleVerify] Selecting exact text "${text}" in dialog...`);
    const dialog = this.page.locator('.sapMTableSelectDialog.sapMDialogOpen').last();
    await dialog.waitFor({ state: 'visible', timeout: 5000 });
    await dialog.getByText(text, { exact: true }).click();
    await this.waitForBusy(2000);
    console.log(`[MainDuplicationRuleVerify] Exact text "${text}" selected`);
  }

  async clickAddButton(index: number): Promise<void> {
    console.log(`[MainDuplicationRuleVerify] Clicking Add button [nth=${index}]...`);
    await this.page.getByRoleUI5('Button', { icon: 'sap-icon://add' }).nth(index).click();
    await this.waitForBusy(3000);
    console.log(`[MainDuplicationRuleVerify] Add button nth(${index}) clicked`);
  }

  async selectTabInDialog(tabText: string): Promise<void> {
    console.log(`[MainDuplicationRuleVerify] Selecting tab "${tabText}" in dialog...`);
    const dialog = this.page.locator('.sapMDialogOpen').last();
    await dialog.waitFor({ state: 'visible', timeout: 5000 });
    await dialog.getByRoleUI5('IconTabFilter', { text: tabText }).click();
    await this.waitForBusy(3000);
    console.log(`[MainDuplicationRuleVerify] Tab "${tabText}" selected in dialog`);
  }

  async fillRepeatableDialog(dialogConfig: any): Promise<void> {
    console.log('[MainDuplicationRuleVerify] Filling repeatable dialog fields...');
    const dialog = this.page.locator('.sapMDialogOpen:not(.sapMTableSelectDialog)').last();
    await dialog.waitFor({ state: 'visible', timeout: 10000 });

    // Fill main dialog fields
    for (const field of dialogConfig.fields || []) {
      console.log(`  Dialog field: "${field.label}" (F4 nth(${field.f4Index}), search="${field.searchValue}")`);
      const f4Icon = dialog.getByRoleUI5('Icon', { src: 'sap-icon://value-help' }).nth(field.f4Index);
      await f4Icon.waitFor({ state: 'visible', timeout: 5000 });
      await f4Icon.click();
      await this.waitForBusy(2000);
      await this.page.getByRoleUI5('SearchField').first().click();
      await this.page.getByRoleUI5('SearchField').first().fill(field.searchValue);
      await this.page.getByRoleUI5('SearchField').first().press('Enter');
      await this.waitForBusy(2000);
      if (field.selectMethod === 'text') {
        const openDialog = this.page.locator('.sapMTableSelectDialog.sapMDialogOpen').last();
        await openDialog.getByText(field.searchValue, { exact: true }).first().click();
      } else {
        await this.page.locateUI5('//Dialog[2]/Table[1]/ColumnListItem[1]/Text[1]').click().catch(async () => {
          // Fallback: click first row
          const f4Dialog = this.page.locator('.sapMTableSelectDialog.sapMDialogOpen').last();
          await f4Dialog.locator('.sapMListTblRow').first().click();
        });
      }
      await this.waitForBusy(2000);
    }

    // Switch sub-tab if configured
    if (dialogConfig.subTab) {
      console.log(`  Switching to sub-tab: "${dialogConfig.subTab}"`);
      await this.selectTabInDialog(dialogConfig.subTab);
    }

    // Fill additional fields
    for (const field of dialogConfig.additionalFields || []) {
      console.log(`  Additional field: "${field.label}" (F4 nth(${field.f4Index}), search="${field.searchValue}")`);
      const f4Icon = dialog.getByRoleUI5('Icon', { src: 'sap-icon://value-help' }).nth(field.f4Index);
      await f4Icon.waitFor({ state: 'visible', timeout: 5000 });
      await f4Icon.click();
      await this.waitForBusy(2000);
      await this.page.getByRoleUI5('SearchField').first().click();
      await this.page.getByRoleUI5('SearchField').first().fill(field.searchValue);
      await this.page.getByRoleUI5('SearchField').first().press('Enter');
      await this.waitForBusy(2000);
      if (field.selectMethod === 'text') {
        const openDialog = this.page.locator('.sapMTableSelectDialog.sapMDialogOpen').last();
        await openDialog.getByText(field.searchValue, { exact: true }).first().click();
      } else {
        await this.page.locateUI5('//Dialog[2]/Table[1]/ColumnListItem[1]/Text[1]').click().catch(async () => {
          const f4Dialog = this.page.locator('.sapMTableSelectDialog.sapMDialogOpen').last();
          await f4Dialog.locator('.sapMListTblRow').first().click();
        });
      }
      await this.waitForBusy(2000);
    }

    console.log('[MainDuplicationRuleVerify] Repeatable dialog fields filled');
  }

  async fillTextArea(labelText: string, value: string): Promise<void> {
    console.log(`[MainDuplicationRuleVerify] Setting TextArea "${labelText}" = "${value}"`);
    // Strategy 1: Find label → get `for` attribute → target that textarea
    const label = this.page.locator('label').filter({ hasText: new RegExp('^' + labelText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }).first();
    if (await label.isVisible({ timeout: 3000 }).catch(() => false)) {
      const forId = await label.getAttribute('for');
      if (forId) {
        const textarea = this.page.locator('textarea#' + forId);
        if (await textarea.isVisible({ timeout: 2000 }).catch(() => false)) {
          await textarea.click();
          await textarea.fill(value);
          console.log(`[MainDuplicationRuleVerify] TextArea set via label→for`);
          return;
        }
      }
    }
    // Strategy 2: getByLabel locator
    const byLabel = this.page.getByLabel(labelText);
    if (await byLabel.isVisible({ timeout: 2000 }).catch(() => false)) {
      await byLabel.click();
      await byLabel.fill(value);
      console.log(`[MainDuplicationRuleVerify] TextArea set via getByLabel`);
      return;
    }
    // Strategy 3: Fallback — first visible TextArea
    const textAreaByRole = this.page.getByRoleUI5('TextArea').first();
    if (await textAreaByRole.isVisible({ timeout: 2000 }).catch(() => false)) {
      await textAreaByRole.click();
      await textAreaByRole.fill(value);
      console.log(`[MainDuplicationRuleVerify] TextArea set via role (fallback)`);
      return;
    }
    throw new Error(`Cannot find TextArea with label "${labelText}"`);
  }
}
