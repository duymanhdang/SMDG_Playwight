import { Page, Locator, expect } from '@playwright/test';
import { fillUI5Field, closeBlockingPopup } from '../ui/ui5';
import { createDialogHelper } from '../ui/dialog';

/**
 * Submit CR và extract CR number từ toast message
 * Flow: Submit button → Confirm Dialog (fill comment) → Submit → Toast → OK
 *
 * @param confirmComment - Comment điền vào Dialog
 * @returns CR number mới (vd: 'CR0000015487')
 */
export async function submitCRWithConfirm(
  page: Page,
  confirmComment = 'Requestor has submitted this request !'
): Promise<string> {
  await page.waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);

  // The button can exist and be visible while the form is still validating
  // (esp. right after reopening a draft) — it stays disabled until validation
  // completes. A bare .click() only waits Playwright's default actionability
  // timeout, which is too short under heavier load (e.g. Automation Hub);
  // explicitly wait for it to become enabled first so this isn't a race.
  const submitButton = page.locator('[id$="submitButton"]');
  await expect(submitButton).toBeEnabled({ timeout: 30000 });
  await submitButton.click();

  // Wait for Confirm Dialog to appear
  const dialogHelper = createDialogHelper(page);
  await dialogHelper.waitForDialog(15000);
  await page.waitForTimeout(500);

  // Fill comment and click Submit (NOT clicking OK here - we need it for toast)
  const textArea = await dialogHelper.getDialogTextArea();
  const count = await textArea.count().catch(() => 0);

  if (count > 0) {
    await expect(textArea).toBeVisible({ timeout: 10000 });
    await fillUI5Field(textArea, confirmComment);
  } else {
    const legacyTextArea = await dialogHelper.getDialogTextAreaLegacy();
    await expect(legacyTextArea).toBeVisible({ timeout: 10000 });
    await fillUI5Field(legacyTextArea, confirmComment);
  }

  // Click Submit button in dialog
  await page.getByRoleUI5('Button', { text: 'Submit' }).first().click();

  // Wait for Confirm Dialog to close and CR creation to process. The busy
  // indicator is a better signal than a fixed sleep here — backend CR creation
  // can take longer than 2s under load, and a flat wait + fixed toast timeout
  // then silently produces a false "toast never appeared" failure.
  await page.waitForTimeout(1000);
  await page
    .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 30000 })
    .catch(() => {});

  const toastLocator = page.getByText(/CR\d{10}\s(is|has)/).first();
  await expect(toastLocator).toBeVisible({ timeout: 30000 });
  const toastText = (await toastLocator.textContent()) || '';
  const crMatch = toastText.match(/CR\d{10}/);
  const newCR = crMatch ? crMatch[0] : '';
  expect(newCR, 'Could not extract CR number from toast').toBeTruthy();
  console.log(`✅ New CR created: ${newCR}`);

  // Dismiss toast. The CR number was already extracted above, so a missing OK
  // button (toast auto-hid on its own) must not fail an otherwise successful
  // submit — but if the button IS there and this click fails/times out, the
  // dialog's blocklayer (#sap-ui-blocklayer-popup) can be left open and silently
  // block every click in the next phase (same root cause as the F4 SelectDialog
  // backdrop issue elsewhere in this codebase). So: try the click, then always
  // explicitly verify/force the blocklayer is gone before returning, instead of
  // best-effort-and-hope.
  const okButton = page.getByRoleUI5('Button', { text: 'OK' }).first();
  if (await okButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    await okButton.click({ timeout: 5000 }).catch(() => {});
  }
  await closeBlockingPopup(page);

  // Wait for toast to close
  await page.waitForTimeout(1000);

  return newCR;
}

/**
 * Poll và đợi CR chuyển sang status mong đợi
 *
 * Dùng cho tất cả status transition:
 *   SUBMITTING → SUBMITTED
 *   SUBMITTED  → CANCELLED
 *   SUBMITTED  → APPROVED
 *   APPROVED   → ACTIVATED
 *
 * @param maxWaitMs      - Timeout tối đa (mặc định: 240000ms)
 * @param pollIntervalMs - Khoảng cách poll (mặc định: 3000ms)
 */
export async function waitForCRStatus(
  page: Page,
  searchField: Locator,
  crNumber: string,
  targetStatus: string,
  maxWaitMs = 240000,
  pollIntervalMs = 3000,
  options?: { onDuplicate?: (crNumber: string) => Promise<void> }
): Promise<void> {
  const startTime = Date.now();
  console.log(`⏳ Waiting for CR ${crNumber} to reach ${targetStatus}...`);

  // Resolve the real <input> of the SAPUI5 SearchField so Enter / value checks
  // always target the editable element — works whether searchField is the
  // .sapMSF wrapper or the inner input itself.
  const searchInput = searchField.locator('input').first().or(searchField);

  const waitForTableSettled = async (): Promise<void> => {
    await page
      .waitForSelector('.sapUiLocalBusyIndicator', { state: 'hidden', timeout: 15000 })
      .catch(() => {});
  };

  // Find a visible row containing the CR. Prefer an exact text match, fall back
  // to any visible row containing the number, so hidden/stale duplicate tables
  // never produce a false "not found".
  const findTargetRowStatus = async (): Promise<{
    rowCount: number;
    statusTexts: string[];
    isTarget: boolean;
  }> => {
    let crRow: Locator | null = null;
    const exactRows = page.locator('tr').filter({ has: page.getByText(crNumber, { exact: true }) });
    const exactCount = await exactRows.count();
    for (let i = 0; i < exactCount; i++) {
      if (await exactRows.nth(i).isVisible()) {
        crRow = exactRows.nth(i);
        break;
      }
    }
    if (!crRow) {
      const hasTextRows = page.locator('tr').filter({ hasText: crNumber });
      const hasTextCount = await hasTextRows.count();
      for (let i = 0; i < hasTextCount; i++) {
        if (await hasTextRows.nth(i).isVisible()) {
          crRow = hasTextRows.nth(i);
          break;
        }
      }
    }
    if (!crRow) return { rowCount: 0, statusTexts: [], isTarget: false };

    const statusEls = crRow.locator('.sapMObjStatus');
    const statusTexts: string[] = [];
    const statusCount = await statusEls.count();
    let isTarget = false;
    for (let i = 0; i < statusCount; i++) {
      const el = statusEls.nth(i);
      const text = (await el.textContent()) || '';
      statusTexts.push(text);
      if (text.includes(targetStatus) && (await el.isVisible())) {
        isTarget = true;
        break;
      }
    }
    return { rowCount: 1, statusTexts, isTarget };
  };

  // Re-trigger the search via the SAPUI5 SearchField search button (id suffix
  // "-search") as a fallback when Enter alone did not apply the filter.
  const clickSearchButton = async (): Promise<boolean> => {
    try {
      const inputId = await searchInput.getAttribute('id');
      if (!inputId || !inputId.endsWith('-I')) return false;
      const base = inputId.slice(0, -2);
      const btn = page.locator(`[id$="${base}-search"]`).last();
      if ((await btn.count()) === 0) return false;
      await btn.click();
      return true;
    } catch {
      return false;
    }
  };

  let dupHandled = false;

  while (true) {
    // Clear field first to force SAPUI5 binding change, then re-fill
    await searchField.click();
    await searchField.press('Control+A');
    await searchField.press('Backspace');
    await page.waitForTimeout(300);

    await fillUI5Field(searchField, crNumber);

    // Only trigger the search once the value is actually present in the input;
    // this prevents Enter from firing with a stale/empty value when the app is
    // slow to process the fill.
    let valueApplied = false;
    try {
      await expect
        .poll(async () => {
          try {
            return await searchInput.inputValue();
          } catch {
            return '';
          }
        }, { timeout: 3000 })
        .toContain(crNumber);
      valueApplied = true;
    } catch {
      console.warn(`[workflow] ⚠️ Could not verify search value "${crNumber}" in input; pressing Enter anyway`);
    }
    await page.waitForTimeout(200);
    await searchInput.press('Enter');

    // Fast path: row is already rendered
    let row = await findTargetRowStatus();
    if (!row.isTarget) {
      // Give the table time to reload
      await waitForTableSettled();
      await page.waitForTimeout(800);
      row = await findTargetRowStatus();
    }
    // Fallback: Enter may not have fired the search in this state — click the
    // search button explicitly (battle-tested pattern used by searchAndClick).
    if (!row.isTarget && valueApplied) {
      if (await clickSearchButton()) {
        await waitForTableSettled();
        await page.waitForTimeout(800);
        row = await findTargetRowStatus();
      }
    }

    if (!row.isTarget && !dupHandled && targetStatus !== 'DUPLICATE' && options?.onDuplicate &&
        row.statusTexts.some(t => t.includes('DUPLICATE'))) {
      console.log(`⚠️ CR ${crNumber} is DUPLICATE — accepting duplication...`);
      await options.onDuplicate(crNumber);
      dupHandled = true;
      await page.waitForTimeout(2000);
      continue;
    }

    if (row.isTarget) {
      console.log(`✅ CR ${crNumber} has reached ${targetStatus}`);
      return;
    }

    const elapsed = Date.now() - startTime;
    if (elapsed >= maxWaitMs) {
      throw new Error(`CR ${crNumber} did not reach ${targetStatus} after ${maxWaitMs / 1000}s`);
    }

    console.log(`⏳ Still waiting... ${Math.round((maxWaitMs - elapsed) / 1000)}s remaining`);
    await page.waitForTimeout(pollIntervalMs);
  }
}

/**
 * Verify CR row trong bảng có đúng status
 * Dùng sau waitForCRStatus để assert lần cuối
 */
export async function verifyCRStatus(page: Page, crNumber: string, status: string): Promise<void> {
  const crRow = page.locator('tr').filter({ has: page.getByText(crNumber, { exact: true }) }).first();
  await expect(crRow).toBeVisible({ timeout: 10000 });
  const statusEls = crRow.locator('.sapMObjStatus');
  let found = false;
  const count = await statusEls.count();
  for (let i = 0; i < count; i++) {
    const el = statusEls.nth(i);
    const text = await el.textContent();
    const visible = await el.isVisible();
    if (text?.includes(status) && visible) {
      found = true;
      break;
    }
  }
  expect(found).toBe(true);
  console.log(`✅ Verified: CR ${crNumber} has status ${status}`);
}
