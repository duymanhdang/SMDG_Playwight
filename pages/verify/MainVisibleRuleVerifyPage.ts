import { Page, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { fillUI5Field, getFieldByLabelText } from '../../helpers/ui';

const VERIFY_TIMEOUT = 15000;

export class MainVisibleRuleVerifyPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async setFieldValue(fieldLabel: string, value: string): Promise<void> {
    console.log(`[MainVisibleRule] Setting "${fieldLabel}" = "${value}"`);
    const field = getFieldByLabelText(this.page, fieldLabel, 'input');
    await expect(field).toBeVisible({ timeout: VERIFY_TIMEOUT });
    await fillUI5Field(field, value);
    await this.page.waitForTimeout(500);
    console.log(`[MainVisibleRule]  "${fieldLabel}" set to "${value}"`);
  }

  async verifyFieldVisible(fieldLabel: string): Promise<void> {
    console.log(`[MainVisibleRule] Verifying field is VISIBLE: "${fieldLabel}"`);
    const field = getFieldByLabelText(this.page, fieldLabel, 'input');
    await expect(field).toBeVisible({ timeout: VERIFY_TIMEOUT });
    console.log(`[MainVisibleRule]  "${fieldLabel}" is visible`);
  }

  async verifyFieldHidden(fieldLabel: string): Promise<void> {
    console.log(`[MainVisibleRule] Verifying field is HIDDEN: "${fieldLabel}"`);
    const field = getFieldByLabelText(this.page, fieldLabel, 'input');
    await expect(field).toBeHidden({ timeout: VERIFY_TIMEOUT });
    console.log(`[MainVisibleRule]  "${fieldLabel}" is hidden`);
  }

  async verifyFieldVisibleAtApprover(fieldLabel: string): Promise<void> {
    console.log(`[MainVisibleRule] Approver verifies field VISIBLE: "${fieldLabel}"`);
    const field = getFieldByLabelText(this.page, fieldLabel, 'input');
    await expect(field).toBeVisible({ timeout: VERIFY_TIMEOUT });
    console.log(`[MainVisibleRule]  Approver: "${fieldLabel}" is visible`);
  }

  async verifyFieldVisibleAtSteward(fieldLabel: string): Promise<void> {
    console.log(`[MainVisibleRule] Steward verifies field VISIBLE: "${fieldLabel}"`);
    const field = getFieldByLabelText(this.page, fieldLabel, 'input');
    await expect(field).toBeVisible({ timeout: VERIFY_TIMEOUT });
    console.log(`[MainVisibleRule]  Steward: "${fieldLabel}" is visible`);
  }

  // ── Generic helpers ───────────────────────────────────────────

  async verifySectionTitle(title: string): Promise<void> {
    console.log(`[MainVisibleRule] Verifying section title: "${title}"`);
    await expect(this.page.getByRoleUI5('Title', { text: title }).first()).toBeVisible({
      timeout: VERIFY_TIMEOUT,
    });
    console.log(`[MainVisibleRule]  Section title visible: "${title}"`);
  }

  async verifyFieldLabel(label: string): Promise<void> {
    console.log(`[MainVisibleRule] Verifying field label: "${label}"`);
    try {
      await expect(this.page.getByRoleUI5('Label', { text: label }).first()).toBeVisible({
        timeout: VERIFY_TIMEOUT,
      });
      console.log(`[MainVisibleRule]  Field label visible: "${label}"`);
    } catch {
      console.log(`[MainVisibleRule]  Label role not found, trying alternatives...`);
      const byText = this.page.getByText(label).first();
      if (await byText.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log(`[MainVisibleRule]  Field label text visible (non-exact): "${label}"`);
        return;
      }
      const byAria = this.page.locator(`[aria-label*="${label}"]`).first();
      if (await byAria.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log(`[MainVisibleRule]  Field label via aria-label: "${label}"`);
        return;
      }
      const byTitle = this.page.locator(`[title*="${label}"]`).first();
      if (await byTitle.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log(`[MainVisibleRule]  Field label via title: "${label}"`);
        return;
      }
      throw new Error(`Field label "${label}" not found via any locator`);
    }
  }

  async verifyHeading(heading: string): Promise<void> {
    console.log(`[MainVisibleRule] Verifying heading: "${heading}"`);
    await expect(this.page.getByRole('heading', { name: heading })).toBeVisible({
      timeout: VERIFY_TIMEOUT,
    });
    console.log(`[MainVisibleRule]  Heading visible: "${heading}"`);
  }

  async verifyText(text: string): Promise<void> {
    console.log(`[MainVisibleRule] Verifying text: "${text}"`);
    await expect(this.page.getByText(text).first()).toBeVisible({
      timeout: VERIFY_TIMEOUT,
    });
    console.log(`[MainVisibleRule]  Text visible: "${text}"`);
  }

  async verifyHeadingHidden(heading: string): Promise<void> {
    console.log(`[MainVisibleRule] Verifying heading is HIDDEN: "${heading}"`);
    await expect(this.page.getByRole('heading', { name: heading })).toBeHidden({
      timeout: VERIFY_TIMEOUT,
    });
    console.log(`[MainVisibleRule]  Heading hidden: "${heading}"`);
  }

  // ── Tab / Section navigation ──────────────────────────────────

  async clickTab(tabText: string): Promise<void> {
    console.log(`[MainVisibleRule] Clicking tab: "${tabText}"`);
    await this.page.getByRoleUI5('IconTabFilter', { text: tabText }).click();
    await this.waitForBusy(2000);
    console.log(`[MainVisibleRule]  Tab clicked: "${tabText}"`);
  }

  async clickDialogTab(tabText: string): Promise<void> {
    console.log(`[MainVisibleRule] Clicking dialog tab: "${tabText}"`);
    // Try direct visible tab first
    const tab = this.page.getByRoleUI5('IconTabFilter', { text: tabText }).first();
    const isVisible = await tab.isVisible({ timeout: 1500 }).catch(() => false);
    if (isVisible) {
      await tab.click();
      await this.waitForBusy(2000);
      console.log(`[MainVisibleRule]  Dialog tab clicked: "${tabText}"`);
      return;
    }
    // Overflow tab: click "More" to open popup, then click tab in popup
    const dlg = this.page.locator('.sapMDialogOpen').last();
    await dlg.getByRoleUI5('IconTabFilter', { text: 'More' }).first().click();
    await this.page.waitForTimeout(1500);
    // After overflow opens, select the tab from popup by text
    await this.page.getByText(tabText, { exact: true }).click();
    await this.waitForBusy(2000);
    console.log(`[MainVisibleRule]  Overflow dialog tab clicked: "${tabText}"`);
  }

  async clickOverflowTab(tabText: string): Promise<void> {
    console.log(`[MainVisibleRule] Clicking overflow tab: "${tabText}"`);
    // The popup is open; click nth(1) — the cloned item in the overflow popup
    await this.page.getByRoleUI5('IconTabFilter', { text: tabText }).nth(1).click();
    await this.waitForBusy(2000);
    console.log(`[MainVisibleRule]  Overflow tab clicked: "${tabText}"`);
  }

  // ── Open section button ────────────────────────────────────────

  async clickOpenSectionButton(nth: number): Promise<void> {
    console.log(`[MainVisibleRule] Clicking open section button nth=${nth}`);
    const btn = this.page.getByRoleUI5('Button', { icon: 'sap-icon://open-command-field' }).nth(nth);
    await expect(btn).toBeVisible({ timeout: VERIFY_TIMEOUT });
    await btn.click();
    await this.waitForBusy(3000);
    console.log(`[MainVisibleRule]  Section opened`);
  }

  // ── Add button + Dialog ───────────────────────────────────────

  async clickAddRowButton(nth: number = 0): Promise<void> {
    console.log(`[MainVisibleRule] Clicking add row button (nth=${nth})`);
    await this.page.getByRoleUI5('Button', { icon: 'sap-icon://add' }).nth(nth).click();
    await this.waitForBusy(2000);
    console.log(`[MainVisibleRule]  Add row button clicked`);
  }

  async clickCancelDialog(nth: number = 0): Promise<void> {
    console.log(`[MainVisibleRule] Clicking Cancel dialog (nth=${nth})`);
    await this.page.getByRoleUI5('Button', { text: 'Cancel' }).nth(nth).click();
    await this.waitForBusy(1000);
    console.log(`[MainVisibleRule]  Cancel dialog clicked`);
  }

  async verifyDialogTitle(title: string): Promise<void> {
    console.log(`[MainVisibleRule] Verifying dialog title: "${title}"`);
    await expect(
      this.page.getByRoleUI5('Title', { text: title }).first()
    ).toBeVisible({ timeout: VERIFY_TIMEOUT });
    console.log(`[MainVisibleRule]  Dialog title visible: "${title}"`);
  }

  // ── F4 Value Help ─────────────────────────────────────────────

  async clickF4Icon(nth: number): Promise<void> {
    console.log(`[MainVisibleRule] Clicking F4 icon nth=${nth}`);
    const icon = this.page.getByRoleUI5('Icon', { src: 'sap-icon://value-help' }).nth(nth);
    await expect(icon).toBeVisible({ timeout: VERIFY_TIMEOUT });
    await icon.click();
    await this.waitForBusy(3000);
    console.log(`[MainVisibleRule]  F4 icon nth=${nth} clicked`);
  }

  async searchAndSelectF4(searchValue: string): Promise<void> {
    console.log(`[MainVisibleRule] Search F4: "${searchValue}"`);
    const sf = this.page.getByRoleUI5('SearchField').first();
    await expect(sf).toBeVisible({ timeout: VERIFY_TIMEOUT });
    await sf.click();
    await sf.fill(searchValue);
    await sf.press('Enter');
    await this.waitForBusy(3000);
    await this.page.waitForTimeout(500);
  }

  async selectF4Text(text: string): Promise<void> {
    console.log(`[MainVisibleRule] Select F4 text: "${text}"`);
    const el = this.page.getByText(text, { exact: true }).first();
    await expect(el).toBeVisible({ timeout: 5000 });
    await el.click();
    await this.page.waitForTimeout(500);
  }

  async selectF4ValueByXPathDialog(dialogNth: number = 2): Promise<void> {
    console.log(`[MainVisibleRule] Selecting F4 value via XPath Dialog[${dialogNth}]`);
    await this.page.locateUI5(`//Dialog[${dialogNth}]/Table[1]/ColumnListItem[1]/Text[1]`).click();
    await this.waitForBusy(2000);
    console.log(`[MainVisibleRule]  F4 value selected via XPath`);
  }

  async fillF4Source(f4Nth: number, searchValue: string, selectText: string): Promise<void> {
    await this.clickF4Icon(f4Nth);
    await this.searchAndSelectF4(searchValue);
    await this.selectF4Text(selectText);
    await this.waitForBusy(2000);
  }

  async selectF4Value(value: string, nthF4: number = 0): Promise<void> {
    console.log(`[MainVisibleRule] Selecting value "${value}" via F4 (nth=${nthF4})`);
    await this.page.getByRoleUI5('Icon', { src: 'sap-icon://value-help' }).nth(nthF4).click();
    await this.waitForBusy(2000);

    const searchField = this.page.getByRoleUI5('SearchField').first();
    await searchField.click();
    await this.page.waitForTimeout(500);
    await searchField.fill(value);
    await this.page.waitForTimeout(500);
    await searchField.press('Enter');
    await this.page.waitForTimeout(1000);
    await this.waitForBusy(2000);

    await this.page.getByText(value, { exact: true }).first().click();
    await this.waitForBusy(2000);
    console.log(`[MainVisibleRule]  Value "${value}" selected via F4`);
  }

  async selectSourceValueViaF4(value: string): Promise<void> {
    console.log(`[MainVisibleRule] Selecting source value "${value}" via F4`);
    await this.page.getByRoleUI5('Icon', { src: 'sap-icon://value-help' }).first().click();
    await this.waitForBusy(2000);

    const searchField = this.page.getByRoleUI5('SearchField').first();
    await searchField.click();
    await this.page.waitForTimeout(500);
    await searchField.fill(value);
    await this.page.waitForTimeout(500);
    await searchField.press('Enter');
    await this.page.waitForTimeout(1000);
    await this.waitForBusy(2000);

    await this.page.getByText(value, { exact: true }).first().click();
    await this.waitForBusy(2000);
    console.log(`[MainVisibleRule]  Source value "${value}" selected via F4`);
  }

  async selectF4ValueByXPath(value: string): Promise<void> {
    console.log(`[MainVisibleRule] Selecting value "${value}" via F4 + XPath`);
    const searchField = this.page.getByRoleUI5('SearchField').first();
    await searchField.click();
    await this.page.waitForTimeout(500);
    await searchField.fill(value);
    await this.page.waitForTimeout(500);
    await searchField.press('Enter');
    await this.page.waitForTimeout(1000);
    await this.waitForBusy(2000);

    await this.page.locateUI5('//Dialog[2]/Table[1]/ColumnListItem[1]/Text[1]').click();
    await this.waitForBusy(2000);
    console.log(`[MainVisibleRule]  Value "${value}" selected via F4 + XPath`);
  }

  // ── Input fields ──────────────────────────────────────────────

  async fillInputByPlaceholder(placeholder: string, value: string, nth: number = 0): Promise<void> {
    console.log(`[MainVisibleRule] Filling "${placeholder}" = "${value}" (nth=${nth})`);
    const input = this.page.getByRoleUI5('Input', { placeholder }).nth(nth);
    await input.click();
    await input.fill(value);
    await input.press('Enter');
    await this.waitForBusy(1000);
    console.log(`[MainVisibleRule]  Input "${placeholder}" filled`);
  }

  async fillInputByNth(nth: number, value: string): Promise<void> {
    console.log(`[MainVisibleRule] Filling input nth=${nth} = "${value}"`);
    const input = this.page.getByRoleUI5('Input', { type: 'Text' }).nth(nth);
    await input.click();
    await input.fill(value);
    await input.press('Enter');
    await this.waitForBusy(1000);
    console.log(`[MainVisibleRule]  Input nth=${nth} filled`);
  }

  async fillTextArea(value: string): Promise<void> {
    console.log(`[MainVisibleRule] Filling textarea = "${value}"`);
    await this.page.locateUI5('//FormElement[1]/TextArea[1]').click();
    await this.page.locateUI5('//FormElement[1]/TextArea[1]').fill(value);
    await this.waitForBusy(1000);
    console.log(`[MainVisibleRule]  Textarea filled`);
  }

  // ── Checkbox ──────────────────────────────────────────────────

  async clickCheckbox(label: string): Promise<void> {
    console.log(`[MainVisibleRule] Clicking checkbox: "${label}"`);
    await this.page.getByRole('checkbox', { name: label }).click();
    await this.waitForBusy(2000);
    console.log(`[MainVisibleRule]  Checkbox clicked: "${label}"`);
  }

  // ── Dropdown / ComboBox via icon click ──────────────────────

  async clickDropdownIcon(nth: number): Promise<void> {
    console.log(`[MainVisibleRule] Clicking dropdown icon nth=${nth}`);
    await this.page.getByRoleUI5('Icon', { src: 'sap-icon://slim-arrow-down' }).nth(nth).click();
    await this.waitForBusy(2000);
    console.log(`[MainVisibleRule]  Dropdown icon clicked`);
  }

  async selectDropdownItem(title: string): Promise<void> {
    console.log(`[MainVisibleRule] Selecting dropdown item: "${title}"`);
    await this.page.getByRoleUI5('StandardListItem', { title }).click();
    await this.waitForBusy(1000);
    console.log(`[MainVisibleRule]  Dropdown item selected: "${title}"`);
  }

  // ── Input by value ──────────────────────────────────────────

  async setInputByValue(currentValue: string, newValue: string): Promise<void> {
    console.log(`[MainVisibleRule] Setting input by value "${currentValue}" = "${newValue}"`);
    const input = this.page.getByRoleUI5('Input', { value: currentValue }).first();
    await expect(input).toBeVisible({ timeout: VERIFY_TIMEOUT });
    await input.click();
    await input.fill(newValue);
    await input.press('Enter');
    await this.waitForBusy(1000);
    console.log(`[MainVisibleRule]  Input "${currentValue}" set to "${newValue}"`);
  }

  async setInputByNth(nth: number, value: string): Promise<void> {
    console.log(`[MainVisibleRule] Setting input nth=${nth} = "${value}"`);
    const input = this.page.getByRoleUI5('Input', { value: '0' }).nth(nth);
    await expect(input).toBeVisible({ timeout: VERIFY_TIMEOUT });
    await input.click();
    await input.fill(value);
    await input.press('Enter');
    await this.waitForBusy(1000);
    console.log(`[MainVisibleRule]  Input nth=${nth} set to "${value}"`);
  }

  async closeDialog(nth?: number): Promise<void> {
    console.log(`[MainVisibleRule] Close dialog${nth !== undefined ? ` nth=${nth}` : ''}`);
    if (nth !== undefined) {
      await this.page.getByRoleUI5('Button', { text: 'Cancel' }).nth(nth).click();
    } else {
      await this.page.getByRoleUI5('Button', { text: 'Cancel' }).first().click();
    }
    await this.page.waitForTimeout(500);
    console.log('[MainVisibleRule]  Dialog closed');
  }

  async updateDialog(nth?: number): Promise<void> {
    console.log(`[MainVisibleRule] Update dialog${nth !== undefined ? ` nth=${nth}` : ''}`);
    if (nth !== undefined) {
      await this.page.getByRoleUI5('Button', { text: 'Update' }).nth(nth).click();
    } else {
      await this.page.getByRoleUI5('Button', { text: 'Update' }).first().click();
    }
    await this.waitForBusy(2000);
    console.log('[MainVisibleRule]  Dialog updated');
  }

  // ── Target MultiInput ─────────────────────────────────────────

  async verifyTargetMultiInputVisible(nth: number = 5): Promise<void> {
    console.log(`[MainVisibleRule] Verifying target MultiInput (nth=${nth}) is visible`);
    await expect(
      this.page.getByRoleUI5('MultiInput', { type: 'Text' }).nth(nth)
    ).toBeVisible({ timeout: VERIFY_TIMEOUT });
    console.log(`[MainVisibleRule]  Target MultiInput (nth=${nth}) is visible`);
  }

  // ── Navigate to target area (4-strategy cascade) ─────────────

  async navigateToTargetArea(targetTab: string): Promise<void> {
    console.log(`[MainVisibleRule] Navigating to target area "${targetTab}"`);

    // Strategy 1: IconTabFilter click (exact text)
    try {
      await this.page.getByRoleUI5('IconTabFilter', { text: targetTab }).first().click({ timeout: 3000 });
      await this.waitForBusy(3000);
      console.log(`[MainVisibleRule]  Navigated via IconTabFilter "${targetTab}"`);
      return;
    } catch { /* try next */ }

    // Strategy 1b: IconTabFilter with partial text (first word)
    const firstWord = targetTab.split(' ')[0];
    if (firstWord !== targetTab) {
      try {
        await this.page.getByRoleUI5('IconTabFilter', { text: firstWord }).first().click({ timeout: 2000 });
        await this.waitForBusy(3000);
        console.log(`[MainVisibleRule]  Navigated via IconTabFilter partial "${firstWord}" → "${targetTab}"`);
        return;
      } catch { /* try next */ }
    }

    // Strategy 2: Click "More" overflow → then click target tab in overflow popup
    try {
      const moreBtn = this.page.getByRoleUI5('IconTabFilter', { text: 'More' }).first();
      await moreBtn.click({ timeout: 3000 });
      await this.page.waitForTimeout(1500);
      const tab = this.page.getByRoleUI5('IconTabFilter', { text: targetTab }).first();
      await tab.click({ timeout: 3000 });
      await this.waitForBusy(2000);
      console.log(`[MainVisibleRule]  Navigated via More → "${targetTab}"`);
      return;
    } catch {
      console.log(`[MainVisibleRule]  No "More" overflow for "${targetTab}"`);
    }

    // Strategy 3: ObjectPageSubSection title scroll
    try {
      const section = this.page.getByRoleUI5('ObjectPageSubSection', { title: targetTab });
      const exists = await section.count();
      if (exists === 0) throw new Error('not found');
      await section.scrollIntoViewIfNeeded();
      console.log(`[MainVisibleRule]  Scrolled to section "${targetTab}"`);
      return;
    } catch { /* try next */ }

    // Strategy 4: getByText scroll into view
    try {
      const el = this.page.getByText(targetTab, { exact: true }).first();
      await el.scrollIntoViewIfNeeded();
      console.log(`[MainVisibleRule]  Scrolled to text "${targetTab}"`);
      return;
    } catch { /* try next */ }

    // Strategy 5: Dialog tab click (IconTabFilter inside open dialog)
    try {
      const openDlg = this.page.locator('.sapMDialogOpen:not(.sapMTableSelectDialog)').last();
      const tabLink = openDlg.getByRoleUI5('IconTabFilter', { text: targetTab }).first();
      await tabLink.click({ timeout: 3000 });
      await this.waitForBusy(2000);
      console.log(`[MainVisibleRule]  Clicked dialog tab "${targetTab}"`);
      return;
    } catch { /* silent */ }

    console.log(`[MainVisibleRule]  Could not find target area "${targetTab}"`);
  }

  // ── Label visibility ─────────────────────────────────────────

  async verifyLabelHidden(label: string): Promise<void> {
    console.log(`[MainVisibleRule] Verifying label is HIDDEN: "${label}"`);
    await expect(this.page.getByRoleUI5('Label', { text: label }).first()).toBeHidden({
      timeout: VERIFY_TIMEOUT,
    });
    console.log(`[MainVisibleRule]  Label hidden: "${label}"`);
  }

  // ── Input by label ──────────────────────────────────────────

  async setInputByLabel(label: string, value: string): Promise<void> {
    console.log(`[MainVisibleRule] Setting input by label "${label}" = "${value}"`);
    const labelEl = this.page.getByRoleUI5('Label', { text: label }).first();
    await expect(labelEl).toBeVisible({ timeout: VERIFY_TIMEOUT });
    const forId = await labelEl.getAttribute('for').catch(() => null);
    let target: ReturnType<typeof this.page.locator>;
    if (forId) {
      target = this.page.locator(`[id="${forId}"] [id$="-inner"], [id="${forId}"] input, [id="${forId}"]`);
    } else {
      const parent = labelEl.locator('..');
      target = parent.locator('input, [id$="-inner"]').first();
    }

    const isReadonly = await target.first().getAttribute('readonly').catch(() => null);
    if (isReadonly !== null) {
      console.log(`[MainVisibleRule]  Field "${label}" is readonly (F4), using value-help dialog`);
      await this.setF4ValueByLabel(label, value);
      return;
    }

    await target.click();
    await target.press('Control+A');
    await target.fill(value);
    await target.press('Enter');
    await this.waitForBusy(1000);
    console.log(`[MainVisibleRule]  Input "${label}" set to "${value}"`);
  }

  // ── F4 Value Help by label ──────────────────────────────────

  async setF4ValueByLabel(label: string, value: string): Promise<void> {
    console.log(`[MainVisibleRule] Setting F4 value by label "${label}" = "${value}"`);

    await this.page.getByRoleUI5('Icon', { src: 'sap-icon://value-help' }).first().click();
    await this.waitForBusy(2000);

    const dialog = this.page.locator('.sapMDialog, .sapMSearchSelectDialog').last();
    await dialog.locator('[role="row"]').first().waitFor({ state: 'visible', timeout: 15000 });
    await this.page.waitForTimeout(500);

    const searchField = this.page.getByRoleUI5('SearchField').first();
    await searchField.click();
    await this.page.waitForTimeout(300);
    await searchField.fill(value);
    await searchField.press('Enter');
    await this.waitForBusy(2000);

    const result = dialog.getByText(value, { exact: true }).first();
    if (await result.isVisible({ timeout: 5000 }).catch(() => false)) {
      await result.click();
    } else {
      await this.page.locateUI5('//Dialog[2]/Table[1]/ColumnListItem[1]/Text[1]').click();
    }
    await this.waitForBusy(2000);
    console.log(`[MainVisibleRule]  F4 value "${value}" set for "${label}"`);
  }

  // ── Clear F4 value by label ─────────────────────────────────

  async clearF4ValueByLabel(label: string): Promise<void> {
    console.log(`[MainVisibleRule] Clearing F4 value by label "${label}"`);
    const labelEl = this.page.getByRoleUI5('Label', { text: label }).first();
    await expect(labelEl).toBeVisible({ timeout: VERIFY_TIMEOUT });
    const forId = await labelEl.getAttribute('for').catch(() => null);

    let tokenContainer;
    if (forId) {
      tokenContainer = this.page.locator(`[id="${forId}"]`);
    } else {
      tokenContainer = labelEl.locator('..');
    }

    const token = tokenContainer.locator('.sapMMultiInputToken, .sapMToken').first();
    if (await token.isVisible({ timeout: 3000 }).catch(() => false)) {
      const removeBtn = token.locator('.sapMTokenIcon').first();
      if (await removeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await removeBtn.click();
      } else {
        await token.click();
        await this.page.keyboard.press('Backspace');
      }
      await this.waitForBusy(1000);
      console.log(`[MainVisibleRule]  F4 token cleared for "${label}"`);
    } else {
      console.log(`[MainVisibleRule]  No F4 token found for "${label}"`);
    }
  }

  // ── Dialog operations (Pattern A rules) ─────────────────────

  async openEditDialogForSection(sectionTitle: string): Promise<void> {
    console.log(`[MainVisibleRule] Opening edit dialog for section: "${sectionTitle}"`);
    const editBtn = this.page.getByRoleUI5('Button', { icon: 'sap-icon://open-command-field' });
    // Find the edit button closest to the section title
    const section = this.page.getByText(sectionTitle, { exact: true }).first();
    const sectionParent = section.locator('xpath=ancestor::div[contains(@class,"sapMPanel") or contains(@class,"sapMObjL") or @role="form" or contains(@class,"sapUiForm")]');
    const editInScope = sectionParent.locator('[icon="sap-icon://open-command-field"]');
    if ((await editInScope.count()) > 0) {
      await editInScope.first().click();
    } else {
      // Fallback: click the edit button nearest to the title on screen
      await editBtn.last().click();
    }
    await this.waitForBusy(3000);
    console.log(`[MainVisibleRule]  Edit dialog opened for "${sectionTitle}"`);
  }

  async closeAllDialogs(): Promise<void> {
    console.log(`[MainVisibleRule] Closing all open dialogs...`);
    let closed = 0;
    for (let i = 0; i < 5; i++) {
      const dialog = this.page.locator('.sapMDialogOpen');
      const count = await dialog.count();
      if (count === 0) break;
      const cancelBtn = this.page.getByRoleUI5('Button', { text: 'Cancel' }).last();
      if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await cancelBtn.click();
        await this.waitForBusy(1500);
        closed++;
      } else {
        await this.page.keyboard.press('Escape');
        await this.waitForBusy(1000);
        closed++;
      }
    }
    console.log(`[MainVisibleRule]  Closed ${closed} dialog(s)`);
  }

  async verifyLabelInDialog(label: string): Promise<void> {
    console.log(`[MainVisibleRule] Verifying label in dialog: "${label}"`);
    await expect(this.page.getByRoleUI5('Label', { text: label }).first()).toBeVisible({
      timeout: VERIFY_TIMEOUT,
    });
    console.log(`[MainVisibleRule]  Label visible in dialog: "${label}"`);
  }

  // ── Clear input (for boundary tests) ─────────────────────────

  async clearInputByLabel(label: string): Promise<void> {
    console.log(`[MainVisibleRule] Clearing input by label "${label}"`);
    const labelEl = this.page.getByRoleUI5('Label', { text: label }).first();
    await expect(labelEl).toBeVisible({ timeout: VERIFY_TIMEOUT });
    const forId = await labelEl.getAttribute('for').catch(() => null);
    let target: ReturnType<typeof this.page.locator>;
    if (forId) {
      target = this.page.locator(`[id="${forId}"] [id$="-inner"], [id="${forId}"] input, [id="${forId}"]`);
    } else {
      target = labelEl.locator('..').locator('input, [id$="-inner"]').first();
    }

    const isReadonly = await target.first().getAttribute('readonly').catch(() => null);
    if (isReadonly !== null) {
      await this.clearF4ValueByLabel(label);
      return;
    }

    await target.click();
    await target.press('Control+A');
    await target.press('Backspace');
    await target.press('Enter');
    await this.waitForBusy(1000);
    console.log(`[MainVisibleRule]  Input "${label}" cleared`);
  }

  // ── ComboBox / Select by label ───────────────────────────────

  async selectComboBoxByLabel(label: string, value: string): Promise<void> {
    console.log(`[MainVisibleRule] Selecting combobox by label "${label}" = "${value}"`);
    const labelEl = this.page.getByRoleUI5('Label', { text: label }).first();
    await expect(labelEl).toBeVisible({ timeout: VERIFY_TIMEOUT });
    const forId = await labelEl.getAttribute('for').catch(() => null);
    let target: ReturnType<typeof this.page.locator>;
    if (forId) {
      target = this.page.locator(`[id="${forId}"] [id$="-inner"], [id="${forId}"] input, [id="${forId}"]`);
    } else {
      target = labelEl.locator('..').locator('input, [id$="-inner"]').first();
    }
    await target.click();
    await this.waitForBusy(500);
    await fillUI5Field(target, value);
    await target.press('Enter');
    await this.waitForBusy(1000);
    console.log(`[MainVisibleRule]  ComboBox "${label}" set to "${value}"`);
  }

  // ── Textarea by label ───────────────────────────────────────

  async fillTextAreaByLabel(label: string, value: string): Promise<void> {
    console.log(`[MainVisibleRule] Filling textarea by label "${label}" = "${value}"`);
    const labelEl = this.page.getByRoleUI5('Label', { text: label }).first();
    await expect(labelEl).toBeVisible({ timeout: VERIFY_TIMEOUT });
    const forId = await labelEl.getAttribute('for').catch(() => null);
    let target: ReturnType<typeof this.page.locator>;
    if (forId) {
      target = this.page.locator(`[id="${forId}"]`);
    } else {
      target = labelEl.locator('..').locator('textarea, [id$="-inner"]').first();
    }
    await target.click();
    await target.fill(value);
    await this.waitForBusy(1000);
    console.log(`[MainVisibleRule]  Textarea "${label}" filled`);
  }

  // ── Save ────────────────────────────────────────────────────

  async saveAndWaitForSave(): Promise<void> {
    console.log(`[MainVisibleRule] Clicking Save...`);
    const saveBtn = this.page.getByRoleUI5('Button', { text: 'Save' });
    await saveBtn.click();
    await this.waitForBusy(5000);
    console.log(`[MainVisibleRule]  Save completed`);
  }

  // ── Checkbox visibility ──────────────────────────────────────

  async verifyCheckboxVisible(label: string): Promise<void> {
    console.log(`[MainVisibleRule] Verifying checkbox VISIBLE: "${label}"`);
    const strategies = [
      () => this.page.getByRole('checkbox', { name: label }),
      () => this.page.getByRole('switch', { name: label }),
      () => this.page.getByRole('option', { name: label }).filter({ hasText: label }),
      () => this.page.locator(`[aria-label="${label}"]`),
      () => this.page.locator(`label:has-text("${label}") input[type="checkbox"]`),
    ];
    for (const s of strategies) {
      const el = s();
      if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log(`[MainVisibleRule]  Checkbox visible: "${label}"`);
        return;
      }
    }
    // Fallback: just check if any element contains the label text
    await expect(this.page.getByText(label).first()).toBeVisible({ timeout: VERIFY_TIMEOUT });
    console.log(`[MainVisibleRule]  Text found: "${label}"`);
  }

  async verifyCheckboxHidden(label: string): Promise<void> {
    console.log(`[MainVisibleRule] Verifying checkbox HIDDEN: "${label}"`);
    const strategies = [
      () => this.page.getByRole('checkbox', { name: label }),
      () => this.page.getByRole('switch', { name: label }),
      () => this.page.getByRole('option', { name: label }).filter({ hasText: label }),
      () => this.page.locator(`[aria-label="${label}"]`),
      () => this.page.locator(`label:has-text("${label}") input[type="checkbox"]`),
    ];
    for (const s of strategies) {
      const el = s();
      const visible = await el.isVisible({ timeout: 1000 }).catch(() => false);
      if (visible) {
        await expect(el).toBeHidden({ timeout: VERIFY_TIMEOUT });
        console.log(`[MainVisibleRule]  Checkbox hidden: "${label}"`);
        return;
      }
    }
    // Fallback: no element found at all — considered hidden
    console.log(`[MainVisibleRule]  Checkbox not found, considered hidden: "${label}"`);
  }
}
