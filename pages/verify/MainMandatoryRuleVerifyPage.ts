import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../BasePage';

export class MainMandatoryRuleVerifyPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async navigateToTargetArea(target: string): Promise<void> {
    console.log(`[MainMandatoryRuleVerify]  Navigate to target area: "${target}"`);
    await this.waitForBusy();
    const byIconTab = this.page.getByRoleUI5('IconTabFilter', { text: target });
    const byTitle = this.page.getByRoleUI5('Title', { text: target });
    const byHeading = this.page.getByRole('heading', { name: target });
    for (const loc of [byIconTab.first(), byTitle.first(), byHeading.first()]) {
      const visible = await loc.isVisible({ timeout: 2000 }).catch(() => false);
      if (visible) { console.log(`[MainMandatoryRuleVerify]  Navigated to "${target}"`); return; }
    }
    await byIconTab.first().click().catch(() => {});
    await this.waitForBusy(3000);
    console.log(`[MainMandatoryRuleVerify]  Navigated to "${target}"`);
  }

  async verifyTextVisible(text: string): Promise<void> {
    console.log(`[MainMandatoryRuleVerify]  Verify text: "${text}"`);
    await expect(this.page.getByText(text, { exact: true }).first()).toBeVisible({ timeout: 10000 });
  }

  async verifyLabelVisible(labelText: string, nth?: number): Promise<void> {
    console.log(`[MainMandatoryRuleVerify]  Verify label: "${labelText}"${nth !== undefined ? ` nth=${nth}` : ''}`);
    const label = nth !== undefined
      ? this.page.getByRoleUI5('Label', { text: labelText }).nth(nth)
      : this.page.getByRoleUI5('Label', { text: labelText }).first();
    await expect(label).toBeVisible({ timeout: 10000 });
  }

  async clickOpenSectionButton(nth: number): Promise<void> {
    console.log(`[MainMandatoryRuleVerify]  Click open section button nth=${nth}`);
    const btn = this.page.getByRoleUI5('Button', { icon: 'sap-icon://open-command-field' }).nth(nth);
    await expect(btn).toBeVisible({ timeout: 10000 });
    await btn.click();
    await this.waitForBusy(3000);
    console.log(`[MainMandatoryRuleVerify]  Section opened`);
  }

  async verifySectionTitleVisible(title: string): Promise<void> {
    console.log(`[MainMandatoryRuleVerify]  Verify section title: "${title}"`);
    await expect(this.page.getByRoleUI5('Title', { text: title }).first()).toBeVisible({ timeout: 10000 });
  }

  async switchDialogTab(text: string): Promise<void> {
    console.log(`[MainMandatoryRuleVerify]  Switch dialog tab: "${text}"`);
    await this.page.getByRoleUI5('IconTabFilter', { text }).click();
    await this.waitForBusy(2000);
    console.log(`[MainMandatoryRuleVerify]  Switched to tab "${text}"`);
  }

  async clickAddButton(): Promise<void> {
    console.log('[MainMandatoryRuleVerify]  Click Add button');
    await this.page.getByRoleUI5('Button', { icon: 'sap-icon://add' }).first().click();
    await this.waitForBusy(2000);
  }

  async clickUpdateButton(): Promise<void> {
    console.log('[MainMandatoryRuleVerify]  Click Update button');
    await this.page.getByRoleUI5('Button', { text: 'Update' }).click();
    await this.waitForBusy(2000);
  }

  async clickSubmitButton(): Promise<void> {
    console.log('[MainMandatoryRuleVerify]  Click Submit button');
    await this.page.getByRoleUI5('Button', { text: 'Submit' }).first().click();
    await this.waitForBusy(3000);
  }

  async closeDialog(nth?: number): Promise<void> {
    console.log(`[MainMandatoryRuleVerify]  Close dialog${nth !== undefined ? ` nth=${nth}` : ''}`);
    if (nth !== undefined) {
      await this.page.getByRoleUI5('Button', { text: 'Cancel' }).nth(nth).click();
    } else {
      await this.page.getByRoleUI5('Button', { text: 'Cancel' }).first().click();
    }
    await this.page.waitForTimeout(500);
    console.log('[MainMandatoryRuleVerify]  Dialog closed');
  }

  async closeErrorDialog(): Promise<void> {
    console.log('[MainMandatoryRuleVerify]  Close error dialog');
    await this.page.getByRoleUI5('Button', { text: 'Close' }).click();
    await this.page.waitForTimeout(500);
  }

  // ── Source interaction methods ──

  async clickF4Icon(nth: number): Promise<void> {
    console.log(`[MainMandatoryRuleVerify]  Click F4 icon nth=${nth}`);
    const icon = this.page.getByRoleUI5('Icon', { src: 'sap-icon://value-help' }).nth(nth);
    await expect(icon).toBeVisible({ timeout: 10000 });
    await icon.click();
    await this.waitForBusy(3000);
    console.log(`[MainMandatoryRuleVerify]  F4 icon nth=${nth} clicked`);
  }

  async searchAndSelectF4(searchValue: string): Promise<void> {
    console.log(`[MainMandatoryRuleVerify]  Search F4: "${searchValue}"`);
    const sf = this.page.getByRoleUI5('SearchField').first();
    await expect(sf).toBeVisible({ timeout: 10000 });
    await sf.click();
    await sf.fill(searchValue);
    await sf.press('Enter');
    await this.waitForBusy(3000);
    await this.page.waitForTimeout(500);
  }

  async selectF4Text(text: string): Promise<void> {
    console.log(`[MainMandatoryRuleVerify]  Select F4 text: "${text}"`);
    const el = this.page.getByText(text, { exact: true }).first();
    await expect(el).toBeVisible({ timeout: 5000 });
    await el.click();
    await this.page.waitForTimeout(500);
  }

  async fillF4AndSelect(value: string, f4Nth: number): Promise<void> {
    await this.clickF4Icon(f4Nth);
    await this.searchAndSelectF4(value);
    await this.selectF4Text(value);
  }

  async fillInputByLabel(labelText: string, value: string, options?: { pressEnter?: boolean }): Promise<void> {
    console.log(`[MainMandatoryRuleVerify]  Fill input "${labelText}" → "${value}"`);
    const label = this.page.getByRoleUI5('Label', { text: labelText }).first();
    await expect(label).toBeVisible({ timeout: 10000 });
    const forId = await label.getAttribute('for').catch(() => null);
    let target = forId
      ? this.page.locator(`[id="${forId}"] [id$="-inner"], [id="${forId}"]`)
      : this.page.getByRoleUI5('Input').first();
    const isVisible = await target.isVisible().catch(() => false);
    if (!isVisible) { target = this.page.getByRoleUI5('Input').first(); }
    await target.click();
    await target.fill(value);
    if (options?.pressEnter) { await target.press('Enter'); }
    await this.page.waitForTimeout(300);
    console.log(`[MainMandatoryRuleVerify]  Input "${labelText}" filled`);
  }

  async fillInputByIndex(index: number, value: string): Promise<void> {
    console.log(`[MainMandatoryRuleVerify]  Fill Input[${index}] → "${value}"`);
    const inp = this.page.getByRoleUI5('Input').nth(index);
    await expect(inp).toBeVisible({ timeout: 5000 });
    await inp.click();
    await inp.fill(value);
    await inp.press('Enter');
    await this.page.waitForTimeout(300);
  }

  async clickCheckbox(name: string): Promise<void> {
    console.log(`[MainMandatoryRuleVerify]  Click checkbox: "${name}"`);
    const cb = this.page.getByRole('checkbox', { name }).first();
    await expect(cb).toBeVisible({ timeout: 5000 });
    await cb.click();
    await this.page.waitForTimeout(500);
  }

  async clickCheckboxByLabel(labelText: string): Promise<void> {
    console.log(`[MainMandatoryRuleVerify]  Click checkbox by label: "${labelText}"`);
    const label = this.page.getByRoleUI5('Label', { text: labelText }).first();
    await expect(label).toBeVisible({ timeout: 10000 });
    const forId = await label.getAttribute('for').catch(() => null);
    if (forId) {
      const cb = this.page.locator(`[id="${forId}"]`).getByRole('checkbox').first();
      const cbVisible = await cb.isVisible().catch(() => false);
      if (cbVisible) { await cb.click(); await this.page.waitForTimeout(500); return; }
    }
    const cb2 = this.page.getByRole('checkbox', { name: labelText }).first();
    await cb2.click();
    await this.page.waitForTimeout(500);
    console.log(`[MainMandatoryRuleVerify]  Checkbox "${labelText}" clicked`);
  }

  async selectUserAttrValue(attrName: string, value: string): Promise<void> {
    console.log(`[MainMandatoryRuleVerify]  Select UserAttr "${attrName}" = "${value}"`);
    const label = this.page.getByRoleUI5('Label', { text: attrName }).first();
    const visible = await label.isVisible({ timeout: 3000 }).catch(() => false);
    if (!visible) {
      console.log(`[MainMandatoryRuleVerify]  UserAttr label "${attrName}" not visible, trying ComboBox by value...`);
      const cb = this.page.getByRoleUI5('ComboBox');
      const count = await cb.count();
      for (let i = 0; i < count; i++) {
        const c = cb.nth(i);
        const cVisible = await c.isVisible().catch(() => false);
        if (cVisible) { await c.click(); await c.fill(value); await c.press('Enter'); break; }
      }
      await this.page.waitForTimeout(500);
      return;
    }
    const forId = await label.getAttribute('for').catch(() => null);
    if (forId) {
      const combo = this.page.locator(`[id="${forId}"]`);
      const cVisible = await combo.isVisible().catch(() => false);
      if (cVisible) { await combo.click(); await combo.fill(value); await combo.press('Enter'); }
    }
    await this.page.waitForTimeout(500);
    console.log(`[MainMandatoryRuleVerify]  UserAttr "${attrName}" set to "${value}"`);
  }

  // ── Target verification methods ──

  async verifyMandatoryAsterisk(labelText: string, nth?: number): Promise<void> {
    console.log(`[MainMandatoryRuleVerify]  Verify mandatory asterisk on "${labelText}"${nth !== undefined ? ` nth=${nth}` : ''}`);
    const label = nth !== undefined
      ? this.page.getByRoleUI5('Label', { text: labelText }).nth(nth)
      : this.page.getByRoleUI5('Label', { text: labelText }).first();
    await expect(label).toBeVisible({ timeout: 10000 });
    const cls = await label.getAttribute('class').catch(() => '');
    const isRequired = cls?.includes('sapMLabelRequired') ?? false;
    expect(isRequired, `Expected mandatory asterisk on "${labelText}" but label lacks sapMLabelRequired class`).toBeTruthy();
    console.log(`[MainMandatoryRuleVerify]  Mandatory asterisk verified on "${labelText}"`);
  }

  async clickAddNewLineButton(): Promise<void> {
    console.log('[MainMandatoryRuleVerify]  Click "Add" text button in dialog');
    await this.page.getByRoleUI5('Button', { text: 'Add' }).click();
    await this.waitForBusy(2000);
  }

  async verifyNotMandatory(labelText: string): Promise<void> {
    console.log(`[MainMandatoryRuleVerify]  Verify NOT mandatory on "${labelText}"`);
    const label = this.page.getByRoleUI5('Label', { text: labelText }).first();
    await expect(label).toBeVisible({ timeout: 5000 });
    const cls = await label.getAttribute('class').catch(() => '');
    const isRequired = cls?.includes('sapMLabelRequired') ?? false;
    expect(isRequired, `Field "${labelText}" should NOT have mandatory asterisk but sapMLabelRequired class found`).toBeFalsy();
    console.log(`[MainMandatoryRuleVerify]  Verified NOT mandatory on "${labelText}"`);
  }

  // ── Clear field methods ──

  async clearFieldByDecline(nth: number): Promise<void> {
    console.log(`[MainMandatoryRuleVerify]  Clear field with decline icon nth=${nth}`);
    const decline = this.page.getByRoleUI5('Icon', { src: 'sap-icon://decline' }).nth(nth);
    await expect(decline).toBeVisible({ timeout: 5000 });
    await decline.click();
    await this.page.waitForTimeout(500);
  }

  async clearFieldByDeclineInDialog(): Promise<void> {
    console.log('[MainMandatoryRuleVerify]  Clear field with decline icon in topmost dialog');
    const dialog = this.page.locator('.sapMDialog').last();
    const decline = dialog.getByRoleUI5('Icon', { src: 'sap-icon://decline' }).first();
    await expect(decline).toBeVisible({ timeout: 5000 });
    await decline.click();
    await this.page.waitForTimeout(500);
  }

  async clearInputByIndex(index: number): Promise<void> {
    console.log(`[MainMandatoryRuleVerify]  Clear Input[${index}]`);
    const inp = this.page.getByRoleUI5('Input').nth(index);
    await expect(inp).toBeVisible({ timeout: 5000 });
    await inp.click();
    await inp.fill('');
    await this.page.waitForTimeout(300);
  }

  async fillInputByValue(currentValue: string, newValue: string): Promise<void> {
    console.log(`[MainMandatoryRuleVerify]  Fill Input(value="${currentValue}") → "${newValue}"`);
    const input = this.page.getByRoleUI5('Input', { value: currentValue }).first();
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.click();
    await input.fill(newValue);
    await input.press('Enter');
    await this.page.waitForTimeout(300);
  }

  async clearInputByValue(currentValue: string): Promise<void> {
    console.log(`[MainMandatoryRuleVerify]  Clear Input(value="${currentValue}")`);
    const input = this.page.getByRoleUI5('Input', { value: currentValue }).first();
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.click();
    await input.fill('');
    await this.page.waitForTimeout(300);
  }

  async clearModelProperty(miId: string, label: string): Promise<any> {
    return this.page.evaluate(({ miId, label }) => {
      try {
        // @ts-ignore
        const core = sap.ui.getCore();
        const mi = core.byId(miId);
        if (!mi) return { ok: false, reason: `MultiInput ${miId} not found` };
        // 1. Remove tokens from MultiInput
        if (mi.setTokens) mi.setTokens([]);
        if (mi.removeAllTokens) mi.removeAllTokens();
        if (mi.destroyTokens) mi.destroyTokens();
        // 2. Get binding context and clear model property
        const ctx = mi.getBindingContext();
        if (!ctx) return { ok: false, reason: 'No binding context' };
        const obj = ctx.getObject();
        if (!obj) return { ok: false, reason: 'No context object' };
        const ctxPath = ctx.getPath();
        const model = mi.getModel();
        if (!model) return { ok: false, reason: 'No model' };
        // Find matching property by label
        const labelLower = label.toLowerCase();
        const candidates = Object.keys(obj).filter(k => {
          const kl = k.toLowerCase();
          return kl.includes('weightunit') || kl.includes('weight') || kl.includes('baseunit') || kl.includes('grossweight');
        });
        const cleared: string[] = [];
        for (const prop of candidates) {
          const fullPath = ctxPath + '/' + prop;
          model.setProperty(fullPath, null);
          cleared.push(prop);
        }
        mi.invalidate?.();
        return { ok: true, ctxPath, cleared, tokenBefore: 1, tokenAfter: mi.getTokens?.()?.length || 0 };
      } catch (e: any) { return { ok: false, error: e.toString() }; }
    }, { miId, label });
  }

  async clearFieldByLabel(label: string): Promise<void> {
    console.log(`[MainMandatoryRuleVerify]  Clear field with label "${label}"`);
    const info = await this.page.evaluate((fieldLabel: string) => {
      try {
        const core = (window as any).sap?.ui?.getCore();
        if (!core) return { ok: false, reason: 'sap.ui.getCore() not available' };
        const labels = document.querySelectorAll('.sapMLabel');
        for (const lbl of labels) {
          const textEl = lbl.querySelector('.sapMLabelTextWrapper');
          if (textEl && textEl.textContent?.trim() === fieldLabel) {
            const formEl = lbl.closest('.sapUiFormCLElement') as HTMLElement;
            if (!formEl) return { ok: false, reason: 'Form element not found' };
            // Try MultiInput first (F4 with tokens)
            const miEl = formEl.querySelector('.sapMMultiInput') as HTMLElement;
            if (miEl) {
              const mi = core.byId(miEl.id);
              if (!mi) return { ok: false, reason: 'MultiInput control not found' };
              const tokens = mi.getTokens?.() || [];
              if (tokens.length > 0) {
                tokens.forEach((t: any) => { try { t.fireDelete?.(); } catch(_) {} });
                if (mi.removeAllTokens) mi.removeAllTokens();
                mi.fireEvent('tokenUpdate', {
                  added: [], removed: tokens,
                  addedKeys: [], removedKeys: tokens.map((t: any) => t.getKey?.())
                });
              }
              if (mi.setValue) mi.setValue('');
              mi.fireEvent('change', { value: '' });
              mi.invalidate?.();
              return { ok: true, type: 'MultiInput', cleared: tokens.length };
            }
            // Fallback: regular Input — return current value for codegen-style clear
            const inputOuter = formEl.querySelector('.sapMInput') as HTMLElement;
            if (inputOuter) {
              const domInput = inputOuter.querySelector('input') as HTMLInputElement;
              if (domInput) {
                return { ok: true, type: 'Input', currentValue: domInput.value };
              }
              return { ok: false, reason: 'No inner input element found' };
            }
            return { ok: false, reason: `No MultiInput or Input found for "${fieldLabel}"` };
          }
        }
        return { ok: false, reason: `Label "${fieldLabel}" not found` };
      } catch (e: any) { return { ok: false, error: e.toString() }; }
    }, label);

    if (info.ok && info.type === 'Input' && info.currentValue !== undefined) {
      const inp = this.page.getByRoleUI5('Input', { value: info.currentValue }).first();
      await inp.click();
      await inp.fill('');
      await this.page.waitForTimeout(500);
      console.log(`[MainMandatoryRuleVerify]  Clear field result:`, JSON.stringify(info));
      return;
    }

    await this.page.waitForTimeout(1000);
    console.log(`[MainMandatoryRuleVerify]  Clear field result:`, JSON.stringify(info));
  }

  async clearTokenByText(tokenText: string): Promise<void> {
    console.log(`[MainMandatoryRuleVerify]  Clear token with text "${tokenText}"`);
    const result = await this.page.evaluate((tt: string) => {
      try {
        // @ts-ignore
        const core = sap.ui.getCore();
        const tokenEls = document.querySelectorAll('.sapMToken');
        for (const el of tokenEls) {
          if (el.textContent?.includes(tt)) {
            const miEl = el.closest('.sapMMultiInput') as HTMLElement;
            if (!miEl) return { ok: false, reason: 'No MultiInput parent' };
            const mi = core.byId(miEl.id);
            if (!mi) return { ok: false, reason: `No MultiInput control for ${miEl.id}` };
            // Remove tokens
            if (mi.setTokens) mi.setTokens([]);
            if (mi.removeAllTokens) mi.removeAllTokens();
            if (mi.destroyTokens) mi.destroyTokens();
            // Clear model
            const ctx = mi.getBindingContext();
            const model = mi.getModel();
            if (ctx && model) {
              const ctxPath = ctx.getPath();
              const obj = ctx.getObject();
              if (obj) {
                const props = Object.keys(obj).filter(k => {
                  const kl = k.toLowerCase();
                  return kl.includes('weightunit') || kl.includes('weight') || (kl.includes('baseunit') && (kl.includes('weight') || kl.includes('gross')));
                });
                for (const prop of props) {
                  model.setProperty(ctxPath + '/' + prop, null);
                }
                mi.invalidate?.();
                return { ok: true, method: 'setTokens+model', id: miEl.id, props, tokenAfter: mi.getTokens?.()?.length || 0 };
              }
            }
            mi.invalidate?.();
            return { ok: true, method: 'setTokens only', id: miEl.id, tokenAfter: mi.getTokens?.()?.length || 0 };
          }
        }
        return { ok: false, reason: `No DOM token with text "${tt}"` };
      } catch (e: any) { return { ok: false, error: e.toString() }; }
    }, tokenText);
    await this.page.waitForTimeout(1000);
    console.log(`[MainMandatoryRuleVerify]  Clear result:`, JSON.stringify(result));
  }

  // ── Error verification ──

  async verifyErrorMessages(substrings: string[]): Promise<void> {
    console.log(`[MainMandatoryRuleVerify]  Verify error messages`);
    const errorTitle = this.page.getByRoleUI5('Title', { text: 'Error' }).first();
    await expect(errorTitle).toBeVisible({ timeout: 10000 });
    const topDialog = this.page.locator('.sapMDialog, .sapMMessageBox, [role="alertdialog"]').last();
    const hasDialog = await topDialog.isVisible({ timeout: 1000 }).catch(() => false);
    for (const s of substrings) {
      if (hasDialog) {
        await expect(topDialog.getByText(s).first()).toBeVisible({ timeout: 5000 });
      } else {
        await expect(this.page.getByText(s).last()).toBeVisible({ timeout: 5000 });
      }
      console.log(`[MainMandatoryRuleVerify]  Error contains: "${s}"`);
    }
  }

  // ── Submit & Verify Error ──

  async submitAndExpectFieldError(fieldError: string): Promise<void> {
    await this.clickSubmitButton();
    await this.verifyErrorMessages([
      'Please correct all the field(s) to continue',
      fieldError,
    ]);
    await this.closeErrorDialog();
  }

  async verifyRequireErrorThenClose(errMsg: string): Promise<void> {
    console.log(`[MainMandatoryRuleVerify]  Verify required error`);
    // Look for the Error title in a dialog/message box
    const errorTitle = this.page.getByRoleUI5('Title', { text: 'Error' }).first();
    await expect(errorTitle).toBeVisible({ timeout: 10000 });
    // Get the topmost dialog (error dialog)
    const topDialog = this.page.locator('.sapMDialog, .sapMMessageBox, [role="alertdialog"]').last();
    const hasDialog = await topDialog.isVisible({ timeout: 1000 }).catch(() => false);
    if (hasDialog) {
      await expect(topDialog.getByText(errMsg).first()).toBeVisible({ timeout: 5000 });
    } else {
      // Search globally excluding screen-reader hidden text
      await expect(this.page.getByText(errMsg).last()).toBeVisible({ timeout: 5000 });
    }
    console.log(`[MainMandatoryRuleVerify]  Error verified: "${errMsg}"`);
    await this.closeErrorDialog();
  }

  // ── Complex flows (from codegen) ──

  async fillF4Source(f4Nth: number, f4SearchValue: string, selectText: string): Promise<void> {
    await this.clickF4Icon(f4Nth);
    await this.searchAndSelectF4(f4SearchValue);
    await this.selectF4Text(selectText);
    await this.waitForBusy(2000);
  }

  async openRepeatableDialogAndAdd(targetTab: string): Promise<void> {
    await this.switchDialogTab(targetTab);
    await this.clickAddButton();
    await this.waitForBusy(2000);
  }
}
