import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../BasePage';
import { fillUI5Field } from '../../helpers/ui';

/**
 * MassActivationPage — Tab Activation > Mass (Steward view)
 *
 * ═══════════════════════════════════════════════════════════════
 * FLOW TỔNG QUAN (Mass Steward)
 * ═══════════════════════════════════════════════════════════════
 *   goto() → searchCR() → verifyStatus('IN_ACTIVATE')
 *   → assignToMe() → verifyInnerStatus('ASSIGNED')
 *   → approve() → waitForStatus('DONE')
 *   → verifyInnerStatus('ACTIVATED')
 *
 * ═══════════════════════════════════════════════════════════════
 * SO SÁNH: Mass vs Single Steward (ActivationPage)
 * ═══════════════════════════════════════════════════════════════
 *   ┌────────────────┬────────────────────┬──────────────────┐
 *   │   Yếu tố       │ Mass               │ Single           │
 *   ├────────────────┼────────────────────┼──────────────────┤
 *   │ Search         │ Enter key          │ Có search button │
 *   │                │ (searchField.press │ riêng            │
 *   │                │ ('Enter'))         │                  │
 *   ├────────────────┼────────────────────┼──────────────────┤
 *   │ Assign         │ ... → "Assign      │ ... → "Assign    │
 *   │                │  to me"            │  to me"          │
 *   ├────────────────┼────────────────────┼──────────────────┤
 *   │ Verify inner   │ Click info icon →  │ Click info icon │
 *   │ status         │ popover → Standard │ → popover        │
 *   │                │ ListItem           │ → StandardListItem│
 *   ├────────────────┼────────────────────┼──────────────────┤
 *   │ Approve action │ ... → "Approve"    │ ... → "Approve"  │
 *   │                │ → Processing       │ → Success dialog │
 *   │                │   dialog → OK      │   → OK           │
 *   ├────────────────┼────────────────────┼──────────────────┤
 *   │ Inner status   │ ASSIGNED →         │ (có thể khác)    │
 *   │ progression    │ ACTIVATED          │                  │
 *   └────────────────┴────────────────────┴──────────────────┘
 *
 * ═══════════════════════════════════════════════════════════════
 * LƯU Ý LOCATORS
 * ═══════════════════════════════════════════════════════════════
 *   - getByRoleUI5('SearchField'): dùng role thay vì id$ vì
 *     Activation Mass chỉ có 1 search field
 *   - getByRoleUI5('Icon', { src: 'sap-icon://information' }):
 *     info icon trong progression bar (có nhiều icon hidden
 *     trong DOM, cần filter({ visible: true }))
 *   - getByRoleUI5('StandardListItem', { title: expectedStatus }):
 *     item trong popover của info icon
 *   - .sapMPopover: chờ popover visible trước khi check
 *     StandardListItem (fix flaky)
 *
 * ═══════════════════════════════════════════════════════════════
 * LƯU Ý KHI CUSTOM
 * ═══════════════════════════════════════════════════════════════
 *   - verifyInnerStatus(): có polling retry (15s) vì popover
 *     content có thể render chậm — nếu chỉ dùng waitForTimeout
 *     sẽ flaky (đã từng gặp lỗi "hidden" với ACTIVATED status)
 *   - approve(): Mass approve tạo "Processing" dialog (không
 *     phải "Success" như Single)
 *   - searchCR(): Mass view dùng Enter key để search, không có
 *     nút search riêng — khác với Single activation view
 *   - waitForStatus(): polling 5s cho đến khi backend update
 *     status (DONE từ backend process)
 *   - menuButton: dùng .first() vì có thể có nhiều nút "..."
 *     trên trang
 */
export class MassActivationPage extends BasePage {
  readonly searchField: Locator;
  readonly menuButton: Locator;

  constructor(page: Page) {
    super(page);
    this.searchField = page.getByRoleUI5('SearchField');
    this.menuButton = page.getByRoleUI5('Button', { text: '...' }).first();
  }

  async goto(): Promise<void> {
    console.log('[MassActivation] Navigating to Activation > Mass...');
    await this.navigateTo('Activation');
    await this.page.getByRoleUI5('IconTabFilter', { text: 'Mass' }).click();
    await this.waitForBusy(30000);
    await expect(this.searchField).toBeVisible({ timeout: 15000 });
    console.log('[MassActivation] Mass Activation tab loaded');
  }

  async searchCR(crNumber: string): Promise<void> {
    console.log(`[MassActivation] Searching for CR: ${crNumber}`);
    await this.waitForBusy(30000);

    // Clear field first to force SAPUI5 binding change on re-search
    await this.searchField.click();
    await this.searchField.press('Control+A');
    await this.searchField.press('Backspace');
    await this.page.waitForTimeout(300);

    await fillUI5Field(this.searchField, crNumber);
    await this.searchField.press('Enter');
    await this.waitForBusy(30000);
    await expect(this.menuButton).toBeVisible({ timeout: 30000 });
  }

  async verifyStatus(status: string): Promise<void> {
    console.log(`[MassActivation] Verifying CR status: ${status}`);
    await expect(this.page.getByRoleUI5('ObjectStatus', { text: status }).first()).toBeVisible({
      timeout: 20000,
    });
    console.log(`[MassActivation] Status verified: ${status}`);
  }

  async assignToMe(): Promise<void> {
    console.log('[MassActivation] Assigning to me...');
    await this.waitForBusy(30000);
    await this.page.waitForTimeout(1000);
    await expect(this.menuButton).toBeVisible({ timeout: 5000 });
    await this.menuButton.click();
    const menuItem = this.page.getByRoleUI5('MenuItem', { text: 'Assign to me' }).first();
    await expect(menuItem).toBeVisible({ timeout: 20000 });
    await menuItem.click();
    await this.waitForBusy(30000);
    console.log('[MassActivation] Assign action completed');
  }

  async verifyInnerStatus(expectedStatus: string): Promise<void> {
    console.log(`[MassActivation] Verifying inner status: ${expectedStatus}`);

    const visibleInfoIcons = this.page
      .getByRoleUI5('Icon', { src: 'sap-icon://information' })
      .filter({ visible: true });
    const count = await visibleInfoIcons.count();
    console.log(`[MassActivation] Found ${count} visible info icons`);

    if (count === 0) {
      const allInfoIcons = this.page.getByRoleUI5('Icon', { src: 'sap-icon://information' });
      const allCount = await allInfoIcons.count();
      console.log(`[MassActivation] Total info icons (incl hidden): ${allCount}`);
      for (let i = 0; i < allCount; i++) {
        const el = allInfoIcons.nth(i);
        const hidden = await el.getAttribute('aria-hidden').catch(() => null);
        console.log(`[MassActivation]   icon[${i}] aria-hidden="${hidden}"`);
      }
    }

    const infoIcon = visibleInfoIcons.last();
    await expect(infoIcon).toBeVisible({ timeout: 15000 });
    await infoIcon.click();
    await this.page.waitForTimeout(5000);

    const startTime = Date.now();
    const maxWait = 30000;
    let found = false;
    while (Date.now() - startTime < maxWait) {
      for (const loc of [
        this.page.getByRoleUI5('StandardListItem', { title: expectedStatus }),
        this.page.getByText(expectedStatus, { exact: false }),
      ]) {
        if (
          await loc
            .filter({ visible: true })
            .first()
            .isVisible()
            .catch(() => false)
        ) {
          found = true;
          break;
        }
      }
      if (found) {
        await this.page.waitForTimeout(500);
        break;
      }
      await this.page.waitForTimeout(1000);
    }
    expect(found).toBe(true);
    console.log(`[MassActivation] Inner status verified: ${expectedStatus}`);

    await this.page.keyboard.press('Escape');
    await this.page.waitForTimeout(500);
  }

  async approve(): Promise<void> {
    console.log('[MassActivation] Approving CR...');
    await this.waitForBusy(30000);
    await this.page.waitForTimeout(1000);
    await expect(this.menuButton).toBeVisible({ timeout: 5000 });
    await this.menuButton.click();
    const menuItem = this.page.getByRoleUI5('MenuItem', { text: 'Approve' }).first();
    await expect(menuItem).toBeVisible({ timeout: 20000 });
    await menuItem.click();

    console.log('[MassActivation] Waiting for Processing dialog...');
    await expect(this.page.getByRoleUI5('Title', { text: 'Processing' }).first()).toBeVisible({
      timeout: 60000,
    });

    await this.page.getByRoleUI5('Button', { text: 'OK' }).first().click();
    await this.waitForBusy(60000);
    console.log('[MassActivation] Approve action completed');
  }

  async reject(): Promise<void> {
    console.log('[MassActivation] Rejecting CR...');
    await this.waitForBusy(30000);
    await this.page.waitForTimeout(1000);
    await expect(this.menuButton).toBeVisible({ timeout: 5000 });
    await this.menuButton.click();
    const menuItem = this.page.getByRoleUI5('MenuItem', { text: 'Reject' }).first();
    await expect(menuItem).toBeVisible({ timeout: 20000 });
    await menuItem.click();
    await this.waitForBusy(30000);
    console.log('[MassActivation] Reject action completed');
  }

  async changePriority(newPriority: string, reason = 'Steward change priority'): Promise<void> {
    console.log(`[MassActivation] Changing priority to ${newPriority}...`);
    await this.waitForBusy(30000);
    await this.page.waitForTimeout(1000);
    await expect(this.menuButton).toBeVisible({ timeout: 5000 });
    await this.menuButton.click();
    const menuItem = this.page.getByRoleUI5('MenuItem', { text: 'Change Priority' }).first();
    await expect(menuItem).toBeVisible({ timeout: 20000 });
    await menuItem.click();
    await this.waitForBusy(15000);

    await this.page.getByRoleUI5('Icon', { src: 'sap-icon://slim-arrow-down' }).first().click();
    await this.page.getByRoleUI5('StandardListItem', { title: newPriority }).click();

    await this.page.getByRoleUI5('Input', { type: 'Text' }).click();
    await this.page.getByRoleUI5('Input', { type: 'Text' }).fill(reason);

    await this.page.getByRoleUI5('Button', { text: 'Save' }).click();
    await this.waitForBusy(30000);
    console.log(`[MassActivation] Priority changed to ${newPriority}`);
  }

  async waitForStatus(crNumber: string, status: string, maxWaitMs = 240000): Promise<void> {
    const startTime = Date.now();
    console.log(`[MassActivation] Waiting for CR to reach ${status}...`);

    while (true) {
      await this.searchCR(crNumber);

      const isTarget = await this.page
        .getByRoleUI5('ObjectStatus', { text: status })
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      if (isTarget) {
        console.log(`[MassActivation] CR has reached ${status}`);
        return;
      }

      const elapsed = Date.now() - startTime;
      if (elapsed >= maxWaitMs) {
        throw new Error(`CR did not reach ${status} after ${maxWaitMs / 1000}s`);
      }

      console.log(
        `[MassActivation] Still waiting... ${Math.round((maxWaitMs - elapsed) / 1000)}s remaining`
      );
      await this.page.waitForTimeout(5000);
    }
  }

  async openCRLink(crNumber: string): Promise<void> {
    console.log(`[MassActivation] Opening CR detail: ${crNumber}`);
    await this.page.getByRoleUI5('Link', { text: crNumber }).click();

    // Wait for busy indicator to appear (loading started) then disappear (loaded)
    try {
      await this.page.waitForSelector('.sapUiLocalBusyIndicator', {
        state: 'visible',
        timeout: 5000,
      });
      await this.page.waitForSelector('.sapUiLocalBusyIndicator', {
        state: 'hidden',
        timeout: 30000,
      });
    } catch {
      // Busy indicator may not appear — view could be cached or instant
    }

    console.log('[MassActivation] CR detail page loaded');
  }

  async verifyActivationCharts(expectedStatus = 'COMPLETE_APPROVED'): Promise<void> {
    const segGroup = this.page.locator('[role="listbox"][aria-roledescription="Segmented button group"]');
    await expect(segGroup.getByRole('option').filter({ hasText: 'Complete Approved (5)' })).toBeVisible({ timeout: 20000 });
    // "Activated" reflects the system finishing mass-activation of all 5 items
    // in the backend — same class of slow mass processing as the DONE waits
    // elsewhere in this file, so it gets the same generous timeout instead of 10s.
    await expect(segGroup.getByRole('option').filter({ hasText: 'Activated (5)' })).toBeVisible({ timeout: 120000 });
  }

  async verifyCRCharts(
    expectedStatus: string,
    buttonPattern: RegExp,
    buttonIndex = 0
  ): Promise<void> {
    console.log(
      `[MassActivation] Verifying CR charts: button=${buttonPattern}, index=${buttonIndex}`
    );
    const segGroup = this.page.locator('[role="listbox"][aria-roledescription="Segmented button group"]');
    await expect(segGroup.getByRole('option').filter({ hasText: buttonPattern }).nth(buttonIndex)).toBeVisible({ timeout: 10000 });
    console.log('[MassActivation] CR charts verified');
  }

  /**
   * Poll for the "DONE" ObjectStatus on the ACT detail page — backend
   * reprocessing of all duplicate items after accepting can take well over a
   * minute under load, longer than any single busy-wait should assume.
   *
   * Deliberately does NOT reload(): the live view already reflects backend
   * status updates on its own once processing finishes, and reload() was
   * tried here before — under repeated polling it eventually broke this app
   * into a permanently blank page (same SPA-bootstrap fragility noted in
   * helpers/attachment/attachment.ts), which then never recovers, making the
   * status un-checkable for the rest of the wait regardless of the real
   * backend state. Plain polling on the current DOM is both lighter and more
   * reliable here.
   */
  async waitForDoneStatus(crNumber: string, maxWaitMs = 240000): Promise<void> {
    const startTime = Date.now();
    let isDone = await this.page
      .getByRoleUI5('ObjectStatus', { text: 'DONE' })
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    while (!isDone) {
      const elapsed = Date.now() - startTime;
      if (elapsed >= maxWaitMs) {
        throw new Error(`[MassActivation] CR ${crNumber} did not reach DONE after ${maxWaitMs / 1000}s`);
      }
      console.log(
        `[MassActivation] DONE not yet visible, waiting... ${Math.round((maxWaitMs - elapsed) / 1000)}s remaining`
      );
      await this.page.waitForTimeout(5000);
      isDone = await this.page
        .getByRoleUI5('ObjectStatus', { text: 'DONE' })
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);
    }
    console.log(`[MassActivation] CR ${crNumber} has reached DONE`);
  }

  async acceptDuplicateSteward(crNumber: string): Promise<void> {
    console.log(`[MassActivation] Accepting duplicate as Steward for CR: ${crNumber}`);

    // ── Round 1: Normal activation (same as mass-mm-01 Phase 3) ──
    console.log('[MassActivation] Round 1: search → verify IN_ACTIVATE → Assign → Approve...');
    await this.searchCR(crNumber);
    await this.verifyStatus('IN_ACTIVATE');
    await this.assignToMe();
    await this.verifyInnerStatus('ASSIGNED');
    await this.approve();

    // Navigate back to Activation > Mass list view (CR still IN_ACTIVATE due to duplicates)
    await this.goto();
    await this.searchCR(crNumber);

    // ── Round 2: Accept duplicate (reused) ──
    await this.acceptDuplicateStewardRound2(crNumber);

    console.log(`[MassActivation] Duplicate accepted for CR ${crNumber} — DONE`);
  }

  async acceptDuplicateStewardRound2(crNumber: string, maxWaitMs = 90000): Promise<void> {
    console.log(`[MassActivation] Round 2: Accepting duplicate for CR: ${crNumber}`);

    // 1. Poll: verify IN_ACTIVATE — re-search if not found
    const startTime = Date.now();
    let found = await this.page.getByRoleUI5('ObjectStatus', { text: 'IN_ACTIVATE' }).first().isVisible().catch(() => false);

    while (!found) {
      const elapsed = Date.now() - startTime;
      if (elapsed >= maxWaitMs) {
        throw new Error(`[MassActivation] IN_ACTIVATE not found after ${maxWaitMs / 1000}s for CR ${crNumber}`);
      }
      console.log(`[MassActivation] IN_ACTIVATE not yet visible, re-searching... ${Math.round((maxWaitMs - elapsed) / 1000)}s remaining`);
      await this.page.waitForTimeout(3000);
      await this.searchCR(crNumber);
      found = await this.page.getByRoleUI5('ObjectStatus', { text: 'IN_ACTIVATE' }).first().isVisible().catch(() => false);
    }
    console.log('[MassActivation] Status verified: IN_ACTIVATE');

    // 2. Extract ACT number from table row containing CR (first column = ACT link)
    const crRow = this.page
      .locator('tr')
      .filter({ has: this.page.getByText(crNumber) })
      .first();
    const actLink = crRow.locator('a').first();
    const actNumber = await actLink.textContent();
    console.log(`[MassActivation] Found ACT number: ${actNumber?.trim()}`);

    // 3. Click info icon → DUPLICATE popover
    const visInfoIcons = this.page
      .getByRoleUI5('Icon', { src: 'sap-icon://information' })
      .filter({ visible: true });
    const visIconCount = await visInfoIcons.count();
    console.log(`[MassActivation] Round 2: Found ${visIconCount} visible info icons`);
    const infoIconSt = visIconCount >= 2 ? visInfoIcons.nth(1) : visInfoIcons.last();
    await expect(infoIconSt).toBeVisible({ timeout: 10000 });
    await infoIconSt.click();
    await this.page.waitForTimeout(500);
    await expect(this.page.getByRoleUI5('StandardListItem', { title: 'DUPLICATE' })).toBeVisible({
      timeout: 10000,
    });

    // 4. Click ACT link → activation detail view
    await this.page.getByRoleUI5('Link', { text: (actNumber ?? '').trim() }).click();
    await this.waitForBusy(30000);

    // 5. Verify IN_ACTIVATE in detail view
    await expect(
      this.page.getByRoleUI5('ObjectStatus', { text: 'IN_ACTIVATE' }).nth(1)
    ).toBeVisible({ timeout: 10000 });

    // 6. Duplicate(5) segmented button → click
    const segGroup = this.page.locator('[role="listbox"][aria-roledescription="Segmented button group"]');
    await this.page.waitForTimeout(3000);
    await segGroup.getByRole('option').filter({ hasText: 'Duplicate (5)' }).click();

    // 7. OverflowToolbarButton → Warning dialog → OK
    await this.page
      .getByRoleUI5('OverflowToolbarButton', { icon: 'sap-icon://bbyd-active-sales' })
      .click();
    await expect(this.page.getByRoleUI5('Title', { text: 'Warning' })).toBeVisible({
      timeout: 10000,
    });
    await this.page.getByRoleUI5('Button', { text: 'OK' }).click();
    await this.waitForBusy(60000);

    // 8. Verify DONE + Activated(5) segmented button. Backend reprocessing of
    // all N duplicate items after accepting can take much longer than a single
    // busy-wait (seen in practice: still 0/N items processed 90s in) — poll
    // the live view with a longer timeout instead of one fixed-timeout check.
    await this.waitForDoneStatus(crNumber);
    await expect(segGroup.getByRole('option').filter({ hasText: /Activated \(\d+\)/ })).toBeVisible({ timeout: 10000 });

    // 9. Activation tab → verify DONE
    await this.page.getByRoleUI5('IconTabFilter', { text: 'Activation' }).first().click();
    await this.waitForBusy(30000);
    await expect(this.page.getByRoleUI5('ObjectStatus', { text: 'DONE' }).first()).toBeVisible({
      timeout: 10000,
    });

    console.log(`[MassActivation] DUP accept Round 2 complete for CR ${crNumber}`);
  }
}
