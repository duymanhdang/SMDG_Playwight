import { Page, Locator } from '@playwright/test';

/**
 * Dismiss SAP UI5 blocking overlay (sap-ui-blocklayer-popup) nếu đang hiển thị
 */
export async function closeBlockingPopup(page: Page): Promise<void> {
  const overlay = page.locator('#sap-ui-blocklayer-popup');
  const visible = await overlay.isVisible({ timeout: 500 }).catch(() => false);
  if (!visible) return;
  console.log('[UI5] ⚠️ Blocking overlay detected — pressing Escape');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const stillVisible = await overlay.isVisible({ timeout: 500 }).catch(() => false);
  if (stillVisible) {
    console.log('[UI5] ⚠️ Escape did not close overlay — clicking first button to dismiss');
    const anyBtn = page.locator('.sapMDialog:visible .sapMBtn, [role="alertdialog"] .sapMBtn').first();
    if (await anyBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await anyBtn.click();
      await page.waitForTimeout(500);
    }
  }
}

/**
 * Fill giá trị vào SAP UI5 Input hoặc TextArea
 *
 * SAP UI5 pattern chuẩn:
 *   <div id="__input7">           ← SAP wrapper
 *     <input id="__input7-inner"> ← input THẬT (suffix "-inner")
 *   </div>
 */
export async function fillUI5Field(locator: Locator, value: string): Promise<void> {
  await locator.waitFor({ state: 'visible' });

  const innerById = locator.locator('[id$="-inner"]');
  const innerTextarea = locator.locator('textarea');
  const innerInput = locator.locator('input');

  if ((await innerById.count()) > 0) {
    await innerById.first().click();
    await innerById.first().press('Control+A');
    await innerById.first().fill(value);
  } else if ((await innerTextarea.count()) > 0) {
    await innerTextarea.first().click();
    await innerTextarea.first().press('Control+A');
    await innerTextarea.first().fill(value);
  } else if ((await innerInput.count()) > 0) {
    await innerInput.first().click();
    await innerInput.first().press('Control+A');
    await innerInput.first().fill(value);
  } else {
    await locator.click();
    await locator.press('Control+A');
    await locator.fill(value);
  }
}

/**
 * Locate input thật trong SAP form bằng label text
 * Dùng khi Label có attribute "for" trỏ đến input
 */
export async function getFieldByLabel(page: Page, labelText: string): Promise<Locator> {
  const label = page
    .getByRoleUI5('Label', { text: labelText })
    .and(page.locator('label[for]'))
    .first();

  const forAttr = await label.getAttribute('for');
  if (!forAttr) {
    throw new Error(
      `Label "${labelText}" không có attribute "for". ` + `Dùng getFieldByLabelText() thay thế.`
    );
  }
  return page.locator(`[id="${forAttr}"]`);
}

/**
 * Locate input/textarea trong SAP form bằng label text — dành cho label dạng <bdi>
 * Dùng khi Label render như <bdi> tag, không có "for" attribute
 *
 * Strategy: Find the label element → navigate to the nearest sapMVBox ancestor
 * (each form section has its own VBox container) → find the field within that
 * specific container only. This avoids matching fields in sibling containers
 * (e.g. Description textarea when looking for "Other reason" textarea on Product forms).
 *
 * @param fieldType - 'input' hoặc 'textarea' (mặc định: 'input')
 */
export function getFieldByLabelText(
  page: Page,
  labelText: string,
  fieldType: 'input' | 'textarea' = 'input'
): Locator {
  const xpath = `//*[contains(@class,'sapMLabel') or name()='label' or name()='bdi'][contains(.,'${labelText}')]/ancestor::*[contains(@class,'sapMVBox')][1]//${fieldType}[1]`;
  return page.locator(`xpath=${xpath}`);
}

/**
 * Locate input thứ N trong FormElement có cùng label
 * Dùng cho label có nhiều input (vd: House Number / Street Name)
 *
 * @param inputIndex - Index của input (0-based)
 */
export async function getFieldByLabelIndex(
  page: Page,
  labelText: string,
  inputIndex: number
): Promise<Locator> {
  const label = page
    .getByRoleUI5('Label', { text: labelText })
    .and(page.locator('label[for]'))
    .first();

  const forAttr = await label.getAttribute('for');
  if (!forAttr) throw new Error(`Label "${labelText}" không có attribute "for"`);

  const inputId = forAttr.replace('-inner', '');
  const formElement = page.locator(`[id="${inputId}"]`).locator('xpath=../..');
  return formElement.locator('input').nth(inputIndex);
}
