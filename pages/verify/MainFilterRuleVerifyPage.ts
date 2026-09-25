import { Page, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { clickValueHelp } from '../../helpers/domain';

export class MainFilterRuleVerifyPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async selectTab(tabText: string): Promise<void> {
    console.log(`[MainFilterRule]  Clicking tab: "${tabText}"`);
    await this.page.getByRoleUI5('IconTabFilter', { text: tabText }).click();
    await this.waitForBusy(3000);
    console.log(`[MainFilterRule]  Tab "${tabText}" selected`);
  }

  async waitForSection(sectionTitle: string): Promise<void> {
    console.log(`[MainFilterRule]  Waiting for section: "${sectionTitle}"`);
    await expect(this.page.getByRoleUI5('Title', { text: sectionTitle }).first()).toBeVisible({ timeout: 15000 });
    console.log(`[MainFilterRule]  Section "${sectionTitle}" visible`);
  }

  /** Click Add button within a section (found by ObjectPageSubSection title) */
  async clickAddButtonInSection(sectionTitle: string): Promise<void> {
    console.log(`[MainFilterRule]  Clicking Add in section "${sectionTitle}"`);
    // Find the ObjectPageSubSection by its title
    const section = this.page.getByRoleUI5('ObjectPageSubSection', { title: sectionTitle });
    await expect(section).toBeVisible({ timeout: 10000 });

    // Scope to section using CSS locator (getByRoleUI5 doesn't scope within parent)
    const addBtn = section.locator('button[aria-label="Add"]').first();
    await expect(addBtn).toBeVisible({ timeout: 5000 });
    await addBtn.click();
    await this.waitForBusy(3000);
    console.log(`[MainFilterRule]  Add button clicked in section "${sectionTitle}"`);
  }

  /** Click "Add" button inside the open dialog to confirm */
  async clickAddButtonInDialog(): Promise<void> {
    console.log(`[MainFilterRule]  Clicking "Add" in dialog to confirm`);
    const dialog = this.page.locator('.sapMDialogOpen:not(.sapMTableSelectDialog)');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    const addBtn = dialog.getByRoleUI5('Button', { text: 'Add' });
    await expect(addBtn).toBeVisible({ timeout: 5000 });
    await addBtn.click();
    await this.waitForBusy(5000);
    console.log(`[MainFilterRule]  Dialog confirmed (Add clicked)`);
  }

  /** Click Add icon button inside the open dialog (e.g., for adding sub-entries) */
  async clickAddIconInDialog(): Promise<void> {
    console.log(`[MainFilterRule]  Clicking Add icon in dialog`);
    const dialog = this.page.locator('.sapMDialogOpen:not(.sapMTableSelectDialog)');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    const addIcon = dialog.getByRoleUI5('Button', { icon: 'sap-icon://add' }).first();
    await expect(addIcon).toBeVisible({ timeout: 5000 });
    await addIcon.click();
    await this.waitForBusy(3000);
    console.log(`[MainFilterRule]  Add icon clicked in dialog`);
  }

  /** Click Add button by its nth-index in the page (fallback) */
  async clickAddButton(index: number): Promise<void> {
    console.log(`[MainFilterRule]  Clicking Add button [nth=${index}]`);
    await this.page.getByRoleUI5('Button', { icon: 'sap-icon://add' }).nth(index).click();
    await this.waitForBusy(3000);
    console.log(`[MainFilterRule]  Add button clicked`);
  }

  /**
   * Click Add button by section title (e.g., "Plant Data", "Basic Data").
   * Works for both ObjectPageLayout (Copy Request) and BlockLayout (New Request).
   * Finds the toolbar containing the section title + Add button.
   */
  async clickAddButtonBySectionTitle(sectionTitle: string): Promise<void> {
    console.log(`[MainFilterRule]  Clicking Add in section "${sectionTitle}"`);

    // Strategy 1: ObjectPageSubSection title (ObjectPageLayout / Copy Request)
    try {
      const section = this.page.getByRoleUI5('ObjectPageSubSection', { title: sectionTitle });
      const addBtn = section.locator('button[aria-label="Add"]').first();
      await addBtn.waitFor({ state: 'visible', timeout: 3000 });
      await addBtn.click();
      await this.waitForBusy(3000);
      console.log(`[MainFilterRule]  Add clicked (ObjectPageSubSection)`);
      return;
    } catch {
      // silent
    }

    // Strategy 2: Find section title → scroll into view → click Add in its toolbar (BlockLayout / New Request)
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
      console.log(`[MainFilterRule]  Add clicked (toolbar: "${sectionTitle}")`);
      return;
    } catch (e) {
      console.log(`[MainFilterRule]  Toolbar approach failed: ${e}`);
    }

    // Strategy 3: Filter Add buttons by checking parent text
    const addBtns = this.page.getByRoleUI5('Button', { icon: 'sap-icon://add' });
    const btnCount = await addBtns.count();
    for (let i = 0; i < btnCount; i++) {
      const btn = addBtns.nth(i);
      const parentText = await btn.locator('xpath=ancestor::*[position()<4]').last().innerText().catch(() => '');
      if (parentText.includes(sectionTitle)) {
        await btn.click();
        await this.waitForBusy(3000);
        console.log(`[MainFilterRule]  Add clicked (parent text match: "${sectionTitle}")`);
        return;
      }
    }

    // Strategy 4: Inside open dialog — click first Add button by icon (for dialog tabs)
    try {
      const dlg = this.page.locator('.sapMDialogOpen:not(.sapMTableSelectDialog)').last();
      const addBtn = dlg.getByRoleUI5('Button', { icon: 'sap-icon://add' }).first();
      await addBtn.click({ timeout: 5000 });
      await this.waitForBusy(3000);
      console.log(`[MainFilterRule]  Add clicked (dialog tab icon)`);
      return;
    } catch { /* silent */ }

    throw new Error(`Cannot find Add button for section "${sectionTitle}"`);
  }

  /** Click F4 (value-help) icon by its nth-index */
  async clickF4Icon(index: number): Promise<void> {
    console.log(`[MainFilterRule]  Clicking F4 icon [nth=${index}]`);
    await this.page.getByRoleUI5('Icon', { src: 'sap-icon://value-help' }).nth(index).click();
    await this.waitForBusy(3000);
    console.log(`[MainFilterRule]  F4 icon clicked, waiting for dialog...`);
  }

  /**
   * Click F4 (value-help) icon by the field's label text (e.g., "Plant", "Storage Costs Code").
   * Tries: dialog-scoped → valueHelp.ts → formElement scope → generic search
   */
  async clickF4ByLabel(labelText: string): Promise<void> {
    console.log(`[MainFilterRule]  Clicking F4 for label "${labelText}"`);

    // Strategy 1: Dialog-scoped exact label → for → vhi (handles "Class" vs "Class Type" ambiguity)
    try {
      const dialogs = this.page.locator('.sapMDialogOpen');
      const dlgCount = await dialogs.count();
      for (let d = dlgCount - 1; d >= 0; d--) {
        const dlg = dialogs.nth(d);
        const label = dlg.locator('label').filter({ hasText: new RegExp(`^${labelText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).first();
        const labelVisible = await label.isVisible().catch(() => false);
        if (labelVisible) {
          const forId = await label.getAttribute('for');
          if (forId) {
            const inputId = forId.replace(/-inner$/, '');
            const vhi = this.page.locator(`#${inputId}-vhi`);
            await vhi.waitFor({ state: 'visible', timeout: 5000 });
            await vhi.click();
            await this.waitForBusy(3000);
            console.log(`[MainFilterRule]  F4 clicked (dialog label for→vhi: "${labelText}")`);
            return;
          }
        }
      }
    } catch {
      console.log(`[MainFilterRule]  dialog label for→vhi failed, trying page label...`);
    }

    // Strategy 2: clickValueHelp from valueHelp.ts (label for → -vhi icon)
    try {
      await clickValueHelp(this.page, labelText);
      await this.waitForBusy(3000);
      console.log(`[MainFilterRule]  F4 clicked (valueHelp: "${labelText}")`);
      return;
    } catch {
      console.log(`[MainFilterRule]  valueHelp failed, trying formElement scope...`);
    }

    // Strategy 3: Find value-help icon inside the form element containing this label
    try {
      const formEl = this.page.locator('.sapUiFormElement')
        .filter({ has: this.page.getByText(labelText, { exact: true }).first() })
        .first();
      await formEl.waitFor({ state: 'visible', timeout: 5000 });
      const icon = formEl.locator('span[src="sap-icon://value-help"]').first();
      await icon.click();
      await this.waitForBusy(3000);
      console.log(`[MainFilterRule]  F4 clicked (formElement scope: "${labelText}")`);
      return;
    } catch {
      console.log(`[MainFilterRule]  formElement scope failed, trying generic search...`);
    }

    // Strategy 4: Find any value-help icon on the page (codegen fallback)
    const icon = this.page.locator('span[src="sap-icon://value-help"]');
    const iconCount = await icon.count();
    for (let i = 0; i < iconCount; i++) {
      const thisIcon = icon.nth(i);
      const nearbyText = await thisIcon.locator('xpath=ancestor::*[contains(@class,"sapUiFormElement") or contains(@class,"sapMInputBase")]').last().innerText().catch(() => '');
      if (nearbyText.includes(labelText)) {
        await thisIcon.click();
        await this.waitForBusy(3000);
        console.log(`[MainFilterRule]  F4 clicked (generic search: "${labelText}")`);
        return;
      }
    }

    // Strategy 5: Label `for` attribute → exact vhi ID (e.g. label for="__input371-inner" → #__input371-vhi)
    try {
      const label = this.page.locator('label').filter({ hasText: labelText }).filter({ hasText: new RegExp(`^${labelText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).first();
      await label.waitFor({ state: 'visible', timeout: 3000 });
      const forId = await label.getAttribute('for');
      if (forId) {
        const inputId = forId.replace(/-inner$/, '');
        const vhiId = `#${inputId}-vhi`;
        const vhi = this.page.locator(vhiId);
        await vhi.waitFor({ state: 'visible', timeout: 3000 });
        await vhi.click();
        await this.waitForBusy(3000);
        console.log(`[MainFilterRule]  F4 clicked (label for→vhi: "${labelText}")`);
        return;
      }
    } catch {
      console.log(`[MainFilterRule]  label for→vhi failed, trying aria-label VHI...`);
    }

    // Strategy 6: aria-label="Show Value Help" — find in form element containing this label
    try {
      const formEl = this.page.locator('.sapUiFormCLElement, .sapUiFormElement')
        .filter({ has: this.page.getByText(labelText, { exact: true }).first() })
        .first();
      await formEl.waitFor({ state: 'visible', timeout: 3000 });
      const vhi = formEl.locator('[aria-label="Show Value Help"]').first();
      await vhi.waitFor({ state: 'visible', timeout: 3000 });
      await vhi.click();
      await this.waitForBusy(3000);
      console.log(`[MainFilterRule]  F4 clicked (aria-label VHI: "${labelText}")`);
      return;
    } catch {
      console.log(`[MainFilterRule]  aria-label VHI failed, trying page-wide VHI...`);
    }

    // Strategy 7: Page-wide [aria-label="Show Value Help"] (last resort)
    try {
      const vhiIcons = this.page.locator('[aria-label="Show Value Help"]');
      const vhiCount = await vhiIcons.count();
      for (let i = 0; i < vhiCount; i++) {
        const vhi = vhiIcons.nth(i);
        const nearbyText = await vhi.locator('xpath=ancestor::*[contains(@class,"sapUiFormCLElement") or contains(@class,"sapUiFormElement") or contains(@class,"sapMInputBase")]').last().innerText().catch(() => '');
        if (nearbyText.includes(labelText)) {
          await vhi.click();
          await this.waitForBusy(3000);
          console.log(`[MainFilterRule]  F4 clicked (page VHI match: "${labelText}")`);
          return;
        }
      }
    } catch {
      // silent
    }

    throw new Error(`Cannot find F4 icon for label "${labelText}"`);
  }

  /** Search and select a value in the last F4 dialog */
  async selectF4Value(value: string): Promise<void> {
    console.log(`[MainFilterRule]  Searching F4 value: "${value}"`);
    const searchField = this.page.getByRoleUI5('SearchField').first();
    await expect(searchField).toBeVisible({ timeout: 10000 });
    await searchField.click();
    await searchField.fill(value);
    await searchField.press('Enter');
    await this.waitForBusy(3000);
    console.log(`[MainFilterRule]  Search "${value}" executed`);
  }

  /** Select first data row in the open F4 dialog. Optional `value` for text-based selection. */
  async selectFirstRowInDialog(value?: string): Promise<void> {
    console.log(`[MainFilterRule]  Selecting first row in F4 dialog${value ? ` (value="${value}")` : ''}`);

    // Strategy 0: TableSelectDialog → find row containing value → Enter
    // Falls back to first row if value not provided or not found
    try {
      const f4Dialog = this.page.locator('.sapMTableSelectDialog.sapMDialogOpen');
      const f4Count = await f4Dialog.count();
      if (f4Count > 0) {
        const f4 = f4Dialog.first();
        const rows = f4.locator('.sapMTableTBody > tr.sapMListTblRow');
        const rowCount = await rows.count();
        if (rowCount > 0) {
          let targetRow = rows.first();
          if (value) {
            const matchingRow = rows.filter({ hasText: value }).first();
            if (await matchingRow.count() > 0) {
              targetRow = matchingRow;
            }
          }
          await targetRow.focus();
          await this.page.keyboard.press('Enter');
          await this.waitForBusy(2000);
          const stillOpen = await f4.isVisible().catch(() => false);
          if (!stillOpen) {
            console.log(`[MainFilterRule]  First row selected (TableSelectDialog "${value ?? 'first'}")`);
            return;
          }
        }
      }
    } catch { /* silent */ }

    // Strategy 1: locateUI5 Dialog[1]
    try {
      const text = this.page.locateUI5('//Dialog[1]/Table[1]/ColumnListItem[1]/Text[1]');
      await text.waitFor({ state: 'visible', timeout: 2000 });
      await text.click();
      await this.waitForBusy(2000);
      console.log(`[MainFilterRule]  First row selected (locateUI5 Dialog[1])`);
      return;
    } catch { /* silent */ }

    // Strategy 2: locateUI5 Dialog[2] — click cell containing value (e.g. "FOOD" in Text[4]/Class column)
    try {
      if (value) {
        for (let t = 1; t <= 20; t++) {
          const textEl = this.page.locateUI5(`//Dialog[2]/Table[1]/ColumnListItem[1]/Text[${t}]`);
          if (!(await textEl.isVisible().catch(() => false))) break;
          const content = (await textEl.innerText().catch(() => '')).trim();
          if (content === value) {
            await textEl.click();
            await this.waitForBusy(2000);
            console.log(`[MainFilterRule]  First row selected (locateUI5 Dialog[2] Text[${t}]="${value}")`);
            return;
          }
        }
      }
      // Fallback: click Text[1]
      const text = this.page.locateUI5('//Dialog[2]/Table[1]/ColumnListItem[1]/Text[1]');
      await text.waitFor({ state: 'visible', timeout: 2000 });
      await text.click();
      await this.waitForBusy(2000);
      console.log(`[MainFilterRule]  First row selected (locateUI5 Dialog[2])`);
      return;
    } catch {
      console.log(`[MainFilterRule]  locateUI5 not found, trying bottom-up dialog scan...`);
    }

    // Strategy 3: Bottom-up dialog iteration over TableSelectDialogs (robust for nested dialogs)
    try {
      const f4Dialogs = this.page.locator('.sapMTableSelectDialog.sapMDialogOpen');
      const count = await f4Dialogs.count();
      for (let d = count - 1; d >= 0; d--) {
        const f4 = f4Dialogs.nth(d);
        const rows = f4.locator('.sapMTableTBody > tr.sapMListTblRow');
        const rowCount = await rows.count();
        if (rowCount > 0) {
          await rows.first().focus();
          await this.page.keyboard.press('Enter');
          await this.waitForBusy(2000);
          const stillOpen = await f4.isVisible().catch(() => false);
          if (!stillOpen) {
            console.log(`[MainFilterRule]  First row selected (bottom-up F4 Enter)`);
            return;
          }
        }
      }
    } catch { /* silent */ }

    // Strategy 4: TableSelectDialog with click fallback
    const dialog = this.page.locator('.sapMTableSelectDialog.sapMDialogOpen');
    await expect(dialog).toBeVisible({ timeout: 10000 });
    const dataRows = dialog.locator('.sapMTableTBody > tr.sapMListTblRow');
    await expect(dataRows.first()).toBeVisible({ timeout: 15000 });
    try {
      await dataRows.first().click();
      await this.waitForBusy(2000);
      const stillOpen = await dialog.isVisible().catch(() => false);
      if (!stillOpen) {
        console.log(`[MainFilterRule]  First row selected (TableSelectDialog click)`);
        return;
      }
      console.log(`[MainFilterRule]  Click didn't close, pressing Enter...`);
      await this.page.keyboard.press('Enter');
      await this.waitForBusy(2000);
      const stillOpen2 = await dialog.isVisible().catch(() => false);
      if (!stillOpen2) {
        console.log(`[MainFilterRule]  First row selected (click + Enter)`);
        return;
      }
    } catch {
      console.log(`[MainFilterRule]  Click failed, trying text match...`);
    }

    // Strategy 5: Exact text match
    if (value) {
      try {
        const textEl = dialog.getByText(value, { exact: true }).first();
        await textEl.waitFor({ state: 'visible', timeout: 5000 });
        await textEl.click();
        await this.waitForBusy(2000);
        console.log(`[MainFilterRule]  First row selected (text: "${value}")`);
        return;
      } catch {
        console.log(`[MainFilterRule]  Text "${value}" not found, trying td click...`);
      }
    }

    // Strategy 6: td cell click (last resort)
    const firstCell = dataRows.first().locator('td.sapMListTblCell').first();
    await expect(firstCell).toBeVisible({ timeout: 10000 });
    await firstCell.click();
    await this.waitForBusy(2000);
    const stillOpen = await dialog.isVisible().catch(() => false);
    if (stillOpen) {
      console.log(`[MainFilterRule]  td click didn't close — trying Enter`);
      await this.page.keyboard.press('Enter');
      await this.waitForBusy(2000);
    }
    console.log(`[MainFilterRule]  First row selected (td click)`);
  }

  /** Select exact text in the open F4 dialog */
  async selectExactTextInDialog(text: string): Promise<void> {
    console.log(`[MainFilterRule]  Selecting exact text "${text}" in dialog`);
    const dialog = this.page.locator('.sapMTableSelectDialog.sapMDialogOpen');
    await expect(dialog).toBeVisible({ timeout: 10000 });
    const target = dialog.getByText(text, { exact: true }).first();
    await expect(target).toBeVisible({ timeout: 10000 });
    await target.click();
    await this.waitForBusy(2000);
    console.log(`[MainFilterRule]  Text "${text}" selected`);
  }

  /**
   * Trigger F4 search by pressing Enter in the search field,
   * then wait for data to load and verify ALL visible rows
   * have the expected value in the column matching columnHeaderText.
   */
  async verifyColumnValuesInF4Dialog(columnHeaderText: string, expectedValue: string): Promise<void> {
    console.log(`[MainFilterRule]  Verifying F4: column="${columnHeaderText}" expected="${expectedValue}"`);
    const dialog = this.page.locator('.sapMTableSelectDialog.sapMDialogOpen');
    await expect(dialog).toBeVisible({ timeout: 15000 });
    console.log(`[MainFilterRule]  F4 dialog visible`);

    await this.waitForBusy(3000);
    console.log(`[MainFilterRule]  Busy indicator cleared`);

    // Click search field, brief pause, then Enter — SAPUI5 SearchField needs readiness
    const searchField = dialog.getByRoleUI5('SearchField').first();
    await expect(searchField).toBeVisible({ timeout: 10000 });
    await searchField.click();
    await this.page.waitForTimeout(300);
    await searchField.press('Enter');
    console.log(`[MainFilterRule]  Load data (Enter, no search term) — filter rule active`);
    await this.waitForBusy(3000);

    // Wait for actual data rows
    const dataRows = dialog.locator('.sapMTableTBody > tr.sapMListTblRow');
    await expect(async () => {
      const count = await dataRows.count();
      expect(count).toBeGreaterThan(0);
    }).toPass({ timeout: 15000, intervals: [1000] });

    // Wait for first row cells to be populated (not empty)
    await expect(async () => {
      const firstCell = dataRows.first().locator('td.sapMListTblCell').first();
      const text = (await firstCell.innerText()).trim();
      expect(text.length).toBeGreaterThan(0);
    }).toPass({ timeout: 10000, intervals: [500] });

    const rowCount = await dataRows.count();
    console.log(`[MainFilterRule]  ${rowCount} data row(s) loaded`);

    // Load all data: click GrowingList trigger if present
    for (let attempt = 0; attempt < 5; attempt++) {
      const more = dialog.locator('.sapMGrowingListTrigger').first();
      if (!(await more.isVisible().catch(() => false))) break;
      console.log(`[MainFilterRule]  Loading more data (attempt ${attempt + 1})`);
      await more.click();
      await this.page.waitForTimeout(500);
      await this.waitForBusy(2000);
    }

    // Extract column index (only count VISIBLE header cells — data rows exclude hidden columns)
    const headerCells = dialog.locator('.sapMListTblHeader .sapMListTblCell');
    const headerCount = await headerCells.count();
    let columnIndex = -1;
    let visibleColIdx = 0;
    const visibleHeaders: string[] = [];
    for (let i = 0; i < headerCount; i++) {
      const cell = headerCells.nth(i);
      if (!(await cell.isVisible().catch(() => false))) {
        continue; // skip hidden columns (e.g. internal keys not rendered in body)
      }
      const text = (await cell.innerText()).trim();
      const firstLine = text.split('\n')[0].trim();
      visibleHeaders.push(text.replace(/\n/g, ' '));
      if (firstLine === columnHeaderText || firstLine.startsWith(columnHeaderText + ' ') || firstLine.startsWith(columnHeaderText + ':')) {
        columnIndex = visibleColIdx;
        break;
      }
      visibleColIdx++;
    }
    if (columnIndex < 0) {
      console.log(`[MainFilterRule]  ⚠️ Column "${columnHeaderText}" NOT FOUND. Visible headers: [${visibleHeaders.join(', ')}]`);
    }
    expect(columnIndex).toBeGreaterThanOrEqual(0, `Column "${columnHeaderText}" not found in F4 dialog headers. Visible: [${visibleHeaders.join(', ')}]`);

    const cellTexts: string[] = [];
    for (let i = 0; i < rowCount; i++) {
      const cellText = (await dataRows.nth(i).locator('td.sapMListTblCell').nth(columnIndex).innerText()).trim();
      cellTexts.push(cellText);
    }

    for (let i = 0; i < cellTexts.length; i++) {
      expect(cellTexts[i]).toBe(expectedValue);
      console.log(`[MainFilterRule]   Row ${i + 1}: "${cellTexts[i]}" `);
    }

    console.log(`[MainFilterRule]  "${columnHeaderText}": all ${cellTexts.length} rows = "${expectedValue}"`);
  }

  /** Close the F4 (TableSelectDialog) by clicking Cancel inside the dialog */
  async closeF4Dialog(): Promise<void> {
    const f4Dialog = this.page.locator('.sapMTableSelectDialog.sapMDialogOpen');
    if (await f4Dialog.count() === 0) {
      console.log(`[MainFilterRule]  No F4 dialog open to close`);
      return;
    }
    const btn = f4Dialog.getByRoleUI5('Button', { text: 'Cancel' }).first();
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log(`[MainFilterRule]  Closing F4 dialog (Cancel)`);
      try {
        await btn.click({ timeout: 5000 });
      } catch {
        // Blocklayer from underlying dialog may intercept → force click
        console.log(`[MainFilterRule]  Blocklayer detected — force-clicking Cancel`);
        await btn.click({ force: true, timeout: 5000 });
      }
      await this.waitForBusy(2000);
      console.log(`[MainFilterRule]  F4 dialog closed`);
    }
  }

  /** Confirm the Add dialog (click "Add"/"OK" to commit the source value into the form) */
  async confirmAddDialog(): Promise<void> {
    console.log(`[MainFilterRule]  Confirming Add dialog (OK/Add) — committing source value`);
    const dialog = this.page.locator('.sapMDialogOpen:not(.sapMTableSelectDialog)');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    const okBtn = dialog.getByRoleUI5('Button', { text: 'Add' }).first()
                .or(dialog.getByRoleUI5('Button', { text: 'OK' }).first())
                .or(dialog.getByRoleUI5('Button', { text: 'Confirm' }).first());
    await expect(okBtn).toBeVisible({ timeout: 5000 });
    await okBtn.click();
    await this.waitForBusy(5000);
    await this.page.waitForTimeout(1000);
    const stillOpen = await dialog.isVisible().catch(() => false);
    if (!stillOpen) {
      console.log(`[MainFilterRule]  Add dialog confirmed and closed — source committed`);
    } else {
      console.log(`[MainFilterRule]  Add dialog still open after confirm`);
    }
    // Dismiss any error/info dialog that may have appeared after commit
    await this.dismissMessageDialog();
  }

  /** Dismiss error/info message dialogs (e.g. validation errors after commit) */
  async dismissMessageDialog(): Promise<void> {
    const msgDlg = this.page.locator('.sapMMessageDialog.sapMDialogOpen, .sapMMessageBox.sapMDialogOpen');
    const count = await msgDlg.count();
    if (count === 0) return;
    console.log(`[MainFilterRule]  Message dialog detected — dismissing`);
    try {
      const msgText = await msgDlg.locator('.sapMMessageBoxText, .sapMDialogScrollCont').first().innerText().catch(() => '(unknown)');
      console.log(`[MainFilterRule]  Message: "${msgText}"`);
    } catch { /* ignore */ }
    const closeBtn = msgDlg.getByRoleUI5('Button', { text: 'Close' }).first()
                     .or(msgDlg.getByRoleUI5('Button', { text: 'OK' }).first())
                     .or(msgDlg.locator('button[aria-label="Close"]').first());
    await closeBtn.click();
    await this.waitForBusy(3000);
    console.log(`[MainFilterRule]  Message dialog dismissed`);
  }

  /** Navigate to a target area — try IconTabFilter first (ObjectPageLayout), fall back to section scroll (BlockLayout) */
  async navigateToTargetArea(targetTab: string): Promise<void> {
    console.log(`[MainFilterRule]  Navigating to target area "${targetTab}"`);

    // Strategy 1: IconTabFilter — fail fast (2000ms) if element doesn't exist
    try {
      await this.page.getByRoleUI5('IconTabFilter', { text: targetTab }).click({ timeout: 2000 });
      await this.waitForBusy(3000);
      console.log(`[MainFilterRule]  Navigated via IconTabFilter "${targetTab}"`);
      return;
    } catch { /* silent — try next strategy */ }

    // Strategy 2: ObjectPageSubSection title (scroll into view) — fail fast
    try {
      const section = this.page.getByRoleUI5('ObjectPageSubSection', { title: targetTab });
      const exists = await section.count();
      if (exists === 0) throw new Error('not found');
      await section.scrollIntoViewIfNeeded();
      console.log(`[MainFilterRule]  Scrolled to section "${targetTab}"`);
      return;
    } catch { /* silent — try next strategy */ }

    // Strategy 3: Any element with matching text, scroll into view
    try {
      const el = this.page.getByText(targetTab, { exact: true }).first();
      await el.scrollIntoViewIfNeeded();
      console.log(`[MainFilterRule]  Scrolled to text "${targetTab}"`);
      return;
    } catch { /* silent */ }

    // Strategy 4: Dialog tab — click tab text within an open dialog
    try {
      const openDlg = this.page.locator('.sapMDialogOpen:not(.sapMTableSelectDialog)').last();
      const tabLink = openDlg.getByText(targetTab, { exact: true }).first();
      await tabLink.click({ timeout: 3000 });
      await this.waitForBusy(2000);
      console.log(`[MainFilterRule]  Clicked dialog tab "${targetTab}"`);
      return;
    } catch { /* silent */ }

    console.log(`[MainFilterRule]  Could not navigate to "${targetTab}"`);
  }

  /** Close the open Add dialog (non-F4 dialog, e.g. Plant Data dialog) */
  async closeAddDialog(): Promise<void> {
    const openDialog = this.page.locator('.sapMDialogOpen:not(.sapMTableSelectDialog)');
    if (await openDialog.count() === 0) {
      console.log(`[MainFilterRule] No Add dialog to close`);
      return;
    }
    console.log(`[MainFilterRule]  Closing Add dialog (Cancel)`);

    // Dismiss blocklayer overlay if present
    const blocklayer = this.page.locator('#sap-ui-blocklayer-popup');
    if (await blocklayer.isVisible().catch(() => false)) {
      await this.page.keyboard.press('Escape');
      await this.page.waitForTimeout(200);
    }

    const cancelBtn = this.page.getByRoleUI5('Button', { text: 'Cancel' }).first();
    try {
      await cancelBtn.click({ timeout: 5000 });
    } catch {
      await cancelBtn.click({ force: true });
    }
    await this.waitForBusy(2000);
    console.log(`[MainFilterRule]  Add dialog closed`);
  }

  /** Verify a label is visible (for section labels or dialog field labels) */
  async verifyLabelVisible(labelText: string): Promise<void> {
    console.log(`[MainFilterRule]  Verifying label: "${labelText}"`);
    await expect(this.page.getByRoleUI5('Label', { text: labelText }).first()).toBeVisible({ timeout: 15000 });
    console.log(`[MainFilterRule]  Label "${labelText}" visible`);
  }

  /** Verify exact text is visible anywhere on page */
  async verifyTextVisible(text: string): Promise<void> {
    console.log(`[MainFilterRule]  Verifying text: "${text}"`);
    await expect(this.page.getByText(text, { exact: true }).first()).toBeVisible({ timeout: 10000 });
    console.log(`[MainFilterRule]  Text "${text}" visible`);
  }

  /** Wait for dialog title to be visible (confirms dialog opened) */
  async verifyDialogTitle(title: string): Promise<void> {
    console.log(`[MainFilterRule] 🪟 Waiting for dialog title: "${title}"`);
    await expect(this.page.getByRoleUI5('Title', { text: title }).first()).toBeVisible({ timeout: 15000 });
    console.log(`[MainFilterRule]  Dialog "${title}" visible`);
  }

  /** Get the number of data rows in the currently open F4 dialog (returns 0 if no rows) */
  async getF4DataRowCount(): Promise<number> {
    const dialog = this.page.locator('.sapMTableSelectDialog.sapMDialogOpen');
    const tableItems = dialog.locator('.sapMListItems .sapMListTblRow.sapMLIB');
    const count = await tableItems.count().catch(() => 0);
    console.log(`[MainFilterRule]  F4 data row count: ${count}`);
    return count;
  }

  /** Verify F4 dialog has more than 1 row (used for State OFF verification — no filter applied) */
  async verifyF4HasMultipleRows(): Promise<void> {
    console.log(`[MainFilterRule]  Verifying F4 has multiple rows (unfiltered)...`);
    const dialog = this.page.locator('.sapMTableSelectDialog.sapMDialogOpen');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await this.waitForBusy(2000);
    // Load all data
    const search = dialog.getByRoleUI5('SearchField').first();
    await search.click();
    await search.press('Enter');
    await this.waitForBusy(3000);
    const count = await this.getF4DataRowCount();
    if (count <= 1) {
      console.log(`[MainFilterRule]  Only ${count} row(s) found, expected multiple`);
    } else {
      console.log(`[MainFilterRule]  F4 has ${count} rows (unfiltered)`);
    }
  }

  /** Get current value of a field by its label */
  async getFieldValue(label: string): Promise<string> {
    console.log(`[MainFilterRule]  Getting field value for label: "${label}"`);
    const field = this.page.getByRoleUI5('Label', { text: label }).first();
    await expect(field).toBeVisible({ timeout: 10000 });
    // Find the input associated with this label
    const input = field.locator('..').locator('input').first();
    const value = (await input.inputValue().catch(() => ''));
    console.log(`[MainFilterRule]  Field "${label}" value: "${value}"`);
    return value;
  }

  /** Close the current Add dialog by pressing Escape (for non-modal dialogs) */
  async closeAddDialogEscape(): Promise<void> {
    console.log(`[MainFilterRule]  Closing Add dialog (Escape)...`);
    await this.page.keyboard.press('Escape');
    await this.waitForBusy(2000);
    console.log(`[MainFilterRule]  Add dialog closed`);
  }

  /** Verify a read-only/display field value by its label (post-activation CR detail) */
  async verifyReadOnlyFieldValue(label: string, expectedValue: string): Promise<string> {
    console.log(`[MainFilterRule]  Verifying read-only field "${label}" = "${expectedValue}"`);
    const fieldLabel = this.page.getByRoleUI5('Label', { text: label }).first();
    await expect(fieldLabel).toBeVisible({ timeout: 10000 });
    // Read-only field uses sapMToken (multi-input) — locate inside the form row (sapUiFormCLElement)
    const formRow = fieldLabel.locator('../..');
    const tokenText = formRow.locator('.sapMTokenText').first();
    await expect(tokenText).toBeVisible({ timeout: 5000 });
    const actual = (await tokenText.textContent()) || '';
    expect(actual.trim()).toBe(expectedValue);
    console.log(`[MainFilterRule]  Read-only field "${label}" = "${actual.trim()}"`);
    return actual.trim();
  }
}
